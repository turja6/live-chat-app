"""
IdlyCall Pro - FastAPI Server
Production-ready for Render.com
Database: Neon.tech (PostgreSQL)
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import json
import os
import uuid
import asyncio
import logging
from datetime import datetime

# ============================================================
# CONFIGURATION & LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="IdlyCall Pro API",
    version="2.1.0",
    description="Real-time chat with WebRTC calling"
)

# CORS Middleware (important for WebRTC)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# DATABASE CONNECTION (Neon.tech)
# ============================================================

try:
    import asyncpg
    from databases import Database
    
    # Get database URL from environment (Render/Neon sets this automatically)
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/idlycall")
    
    # For Neon.tech, we use asyncpg directly for better performance
    DATABASE_URL_ASYNC = os.getenv("DATABASE_URL_ASYNC", DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://").replace("postgres://", "postgresql+asyncpg://"))
    
    logger.info(f"✅ Database configured")
    
except ImportError:
    logger.warning("⚠️  Database libraries not installed. Using in-memory storage.")
    DATABASE_URL = None

# ============================================================
# IN-MEMORY STORAGE (Fallback if no DB)
# ============================================================

class MemoryStorage:
    """In-memory storage for development/fallback"""
    
    def __init__(self):
        self.users = {}  # username -> {ws, profile_pic, online}
        self.chat_history = {}  # (user1, user2) -> [messages]
        self.active_calls = {}  # call_id -> {participants, type}
    
    def user_connect(self, username: str, ws: WebSocket, pic: str = None):
        self.users[username] = {
            "ws": ws,
            "profile_pic": pic or "",
            "online": True,
            "last_seen": datetime.now()
        }
    
    def user_disconnect(self, username: str):
        if username in self.users:
            self.users[username]["online"] = False
            self.users[username]["ws"] = None
            del self.users[username]
    
    def get_online_users(self) -> List[Dict]:
        return [
            {"username": u, "profile_pic": d["profile_pic"], "online": d["online"]}
            for u, d in self.users.items()
            if d.get("online", False)
        ]
    
    def save_message(self, sender: str, receiver: str, message: str, pic: str = None):
        key = tuple(sorted([sender, receiver]))
        if key not in self.chat_history:
            self.chat_history[key] = []
        
        msg = {
            "id": str(uuid.uuid4()),
            "sender": sender,
            "receiver": receiver,
            "message": message,
            "profile_pic": pic or "",
            "timestamp": datetime.now().strftime("%H:%M"),
            "created_at": datetime.now().isoformat()
        }
        self.chat_history[key].append(msg)
        return msg
    
    def get_history(self, user1: str, user2: str) -> List[Dict]:
        key = tuple(sorted([user1, user2]))
        return self.chat_history.get(key [], [])

# Initialize storage
storage = MemoryStorage()

# Templates
templates = Jinja2Templates(directory="templates")

# ============================================================
# DATA MODELS (Pydantic)
# ============================================================

class Message(BaseModel):
    message: str
    sender: Optional[str] = None
    profile_pic: Optional[str] = None
    timestamp: Optional[str] = None

class CallSignal(BaseModel):
    type: str  # start_call, accept_call, decline_call, offer, answer, ice_candidate, call_end
    target: Optional[str] = None
    caller_name: Optional[str] = None
    caller_pic: Optional[str] = None
    is_video: Optional[bool] = False
    offer: Optional[Dict] = None
    answer: Optional[Dict] = None
    candidate: Optional[Dict] = None
    ended_by: Optional[str] = None
    reason: Optional[str] = None
    accepted_by: Optional[str] = None
    from_user: Optional[str] = None

# ============================================================
# HEALTH CHECK ENDPOINT (Render requires this)
# ============================================================

@app.get("/health")
async def health_check():
    """Health check endpoint for Render.com"""
    return {
        "status": "healthy",
        "service": "IdlyCall Pro",
        "version": "2.1.0",
        "timestamp": datetime.now().isoformat(),
        "active_users": len(storage.get_online_users())
    }

# ============================================================
# ROOT ENDPOINT - Serve Index
# ============================================================

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Serve the main HTML page"""
    return templates.TemplateResponse("index.html", {"request": request})

# ============================================================
# STATIC FILES MOUNT
# ============================================================

app.mount("/static", StaticFiles(directory="static"), name="static")

# ============================================================
# WEBSOCKET ENDPOINT - Main Chat & Signaling
# ============================================================

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    """
    Main WebSocket handler for:
    - Chat messaging
    - User presence
    - WebRTC signaling
    """
    
    await websocket.accept()
    logger.info(f"🔌 WebSocket connected: {username}")
    
    # Register user
    storage.user_connect(username, websocket)
    
    # Send current user list to everyone
    await broadcast_user_list()
    
    try:
        while True:
            data = await websocket.receive_text()
            
            try:
                payload = json.loads(data)
                msg_type = payload.get("type", "")
                
                logger.debug(f"📨 [{username}] {msg_type}: {str(payload)[:100]}...")
                
                # Handle different message types
                if msg_type == "chat":
                    await handle_chat_message(username, payload, websocket)
                
                elif msg_type == "get_history":
                    await handle_get_history(username, payload, websocket)
                
                elif msg_type in ["start_call", "incoming_call"]:
                    await handle_call_initiation(username, payload, websocket)
                
                elif msg_type == "accept_call":
                    await handle_call_acceptance(username, payload, websocket)
                
                elif msg_type == "decline_call":
                    await handle_call_decline(username, payload, websocket)
                
                elif msg_type == "offer":
                    await relay_signal(username, payload, "offer")
                
                elif msg_type == "answer":
                    await relay_signal(username, payload, "answer")
                
                elif msg_type == "ice_candidate":
                    await relay_signal(username, payload, "ice_candidate")
                
                elif msg_type in ["call_end", "call_ended"]:
                    await handle_call_end(username, payload, websocket)
                
                elif msg_type == "profile_update":
                    await handle_profile_update(username, payload, websocket)
                
                else:
                    logger.warning(f"Unknown message type: {msg_type}")
                    
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON from {username}")
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
    
    except WebSocketDisconnect:
        logger.info(f"❌ WebSocket disconnected: {username}")
        storage.user_disconnect(username)
        await broadcast_user_list()
    
    except Exception as e:
        logger.error(f"WebSocket error for {username}: {e}")
        storage.user_disconnect(username)

# ============================================================
# MESSAGE HANDLERS
# ============================================================

async def handle_chat_message(sender: str, payload: Dict, ws: WebSocket):
    """Handle incoming chat message"""
    
    receiver = payload.get("receiver", "Public")
    message_text = payload.get("message", "").strip()
    pic = payload.get("pic") or storage.users.get(sender, {}).get("profile_pic", "")
    
    if not message_text:
        return
    
    # Save to storage
    saved_msg = storage.save_message(sender, receiver, message_text, pic)
    
    # Create response message
    response = {
        "type": "chat",
        "message": message_text,
        "sender": sender,
        "profile_pic": pic,
        "timestamp": saved_msg.get("timestamp", ""),
        "id": saved_msg.get("id", "")
    }
    
    # Send to receiver if online and not Public channel
    if receiver != "Public" and receiver in storage.users:
        target_ws = storage.users.get(receiver, {}).get("ws")
        if target_ws:
            try:
                await target_ws.send_json(response)
            except Exception as e:
                logger.error(f"Failed to send to {receiver}: {e}")
    
    # Echo back to sender (for consistency)
    await ws.send_json(response)

async def handle_get_history(user: str, payload: Dict, ws: WebSocket):
    """Send chat history between two users"""
    
    target = payload.get("target", "Public")
    
    messages = storage.get_history(user, target)
    
    await ws.send_json({
        "type": "history",
        "messages": messages,
        "target": target
    })

async def handle_profile_update(user: str, payload: Dict, ws: WebSocket):
    """Update user's profile picture"""
    
    pic = payload.get("pic")
    if user in storage.users:
        storage.users[user]["profile_pic"] = pic or ""
    
    # Broadcast updated user list
    await broadcast_user_list()

# ============================================================
# CALL SIGNALING HANDLERS
# ============================================================

async def handle_call_initiation(caller: str, payload: Dict, ws: WebSocket):
    """Handle incoming/outgoing call initiation"""
    
    target = payload.get("target")
    is_video = payload.get("is_video", False)
    caller_name = payload.get("caller_name", caller)
    caller_pic = payload.get("caller_pic") or storage.users.get(caller, {}).get("profile_pic", "")
    
    if not target or target == "Public":
        await ws.send_json({
            "type": "error",
            "message": "Cannot call Public channel. Select a private chat."
        })
        return
    
    # Check if target is online
    if target not in storage.users or not storage.users[target].get("online"):
        await ws.send_json({
            "type": "call_declined",
            "reason": "User offline"
        })
        return
    
    # Check if target is already in a call
    # (You can implement call state tracking here)
    
    # Send incoming_call notification to target
    target_ws = storage.users.get(target, {}).get("ws")
    if target_ws:
        await target_ws.send_json({
            "type": "incoming_call",
            "caller": caller,
            "caller_name": caller_name,
            "caller_pic": caller_pic,
            "is_video": is_video
        })
        
        logger.info(f"📞 Call from {caller} → {target} ({'Video' if 'Video' else 'Voice'})")

async def handle_call_acceptance(callee: str, payload: Dict, ws: WebSocket):
    """Handle call acceptance"""
    
    caller = payload.get("target")  # The person who initiated
    
    # Notify caller that call was accepted
    if caller in storage.users:
        caller_ws = storage.users[caller].get("ws")
        if caller_ws:
            await caller_ws.send_json({
                "type": "call_accepted",
                "accepted_by": callee
            })

async def handle_call_decline(decliner: str, payload: Dict, ws: WebSocket):
    """Handle call decline"""
    
    caller = payload.get("target")
    
    if caller in storage.users:
        caller_ws = storage.users[caller].get("ws")
        if caller_ws:
            await caller_ws.send_json({
                "type": "call_declined",
                "declined_by": decliner
            })

async def relay_signal(sender: str, payload: Dict, signal_type: str):
    """Relay WebRTC signaling messages between peers"""
    
    target = payload.get("target")
    
    if target and target in storage.users:
        target_ws = storage.users[target].get("ws")
        if target_ws:
            # Forward the signal to target with sender info
            forward_payload = payload.copy()
            forward_payload["from"] = sender
            
            await target_ws.send_json(forward_payload)
            logger.debug(f"🔄 Relayed {signal_type}: {sender} → {target}")

async def handle_call_end(ender: str, payload: Dict, ws: WebSocket):
    """Handle call termination"""
    
    target = payload.get("target")
    
    # Notify other party
    if target and target in storage.users:
        target_ws = storage.users[target].get("ws")
        if target_ws:
            await target_ws.send_json({
                "type": "call_ended",
                "ended_by": ender,
                "reason": payload.get("reason", "unknown")
            })
    
    logger.info(f"📞 Call ended by {ender}")

# ============================================================
# BROADCAST HELPERS
# ============================================================

async def broadcast_user_list():
    """Broadcast updated user list to all connected users"""
    
    users = storage.get_online_users()
    broadcast_payload = {
        "type": "user_list",
        "data": users
    }
    
    for username, data in list(storage.users.items()):
        ws = data.get("ws")
        if ws:
            try:
                await ws.send_json(broadcast_payload)
            except Exception:
                pass  # User may have disconnected

# ============================================================
# API ENDPOINTS (REST - for future mobile app etc.)
# ============================================================

@app.get("/api/users")
async def get_users_api():
    """Get all online users"""
    return {"users": storage.get_online_users()}

@app.post("/api/messages")
async def save_message_api(msg: Message):
    """Save a message via REST API"""
    saved = storage.save_message(
        msg.sender or "anonymous",
        "Public",
        msg.message,
        msg.profile_pic
    )
    return {"status": "ok", "message_id": saved["id"]}

# ============================================================
# RENDER.COM DEPLOYMENT CONFIGURATION
# ============================================================

# Render sets these environment variables automatically:
# - PORT (usually 10000)
# - DATABASE_URL (if you add Neon addon)

# If you need to run locally:
if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get("PORT", 8000))
    
    print("""
    ╔════════════════════════════════════════╗
    ║     🔥 IdlyCall Pro Server v2.1         ║
    ║                                        ║
    ║   Running on: http://localhost:{}      ║
    ║   Database: Neon.tech (PostgreSQL)      ║
    ║   Platform: Render.com                  ║
    ╚══════════════════════════════════════╝
    """.format(port))
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,  # Enable hot reload in development
        log_level="info"
    )