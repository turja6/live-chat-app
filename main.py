"""
IdlyCall Pro v2.1 - FastAPI Server
Render.com + Neon.tech Compatible
Pydantic v1.10.x (No Rust Required)
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import json
import os
import uuid
import logging
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="IdlyCall Pro",
    version="2.1.0",
    description="Real-time chat with WebRTC calling"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# STORAGE
# ============================================================

class MemoryStorage:
    """In-memory storage for development"""
    
    def __init__(self):
        self.users = {}      # username -> {ws, profile_pic, online}
        self.chat_history = {} # (user1, user2) -> [messages]
    
    def connect_user(self, username, websocket, pic=None):
        self.users[username] = {
            "ws": websocket,
            "profile_pic": pic or "",
            "online": True,
            "last_seen": datetime.now()
        }
    
    def disconnect_user(self, username):
        if username in self.users:
            del self.users[username]
    
    def get_online_users(self) -> List[Dict]:
        return [
            {"username": u, "profile_pic": d["profile_pic"], "online": True}
            for u, d in self.users.items()
            if d.get("online")
        ]
    
    def save_message(self, sender, receiver, message, pic=None) -> Dict:
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
    
    def get_messages(self, user1, user2) -> List[Dict]:
        key = tuple(sorted([user1, user2]))
        return self.chat_history.get(key, [])

storage = MemoryStorage()

templates = Jinja2Templates(directory="templates")

app.mount("/static", StaticFiles(directory="static"), name="static")

# ============================================================
# DATA MODELS (Pydantic v1 Style)
# ============================================================

class MessageModel(BaseModel):
    message: str
    sender: Optional[str] = None
    profile_pic: Optional[str] = None
    timestamp: Optional[str] = None

class CallSignalModel(BaseModel):
    type: str
    target: Optional[str] = None
    caller_name: Optional[str] = None
    caller_pic: Optional[str] = None
    is_video: Optional[bool] = False
    offer: Optional[dict] = None
    answer: Optional[dict] = None
    candidate: Optional[dict] = None
    ended_by: Optional[str] = None
    reason: Optional[str] = None
    accepted_by: Optional[str] = None
    from_user: Optional[str] = None

# ============================================================
# ROUTES
# ============================================================

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "IdlyCall Pro",
        "version": "2.1.0",
        "active_users": len(storage.get_online_users())
    }

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# ============================================================
# WEBSOCKET ENDPOINT
# ============================================================

@app.websocket("/ws/{username}")
async def websocket_handler(websocket: WebSocket, username: str):
    await websocket.accept()
    logger.info(f"[WS] Connected: {username}")
    
    storage.connect_user(username, websocket)
    await broadcast_user_list()
    
    try:
        while True:
            raw_data = await websocket.receive_text()
            
            try:
                data = json.loads(raw_data)
                msg_type = data.get("type", "")
                
                logger.debug(f"[WS] {username}: {msg_type}")
                
                # Route to appropriate handler
                if msg_type == "chat":
                    await handle_chat_message(username, data, websocket)
                
                elif msg_type == "get_history":
                    await handle_get_history(username, data, websocket)
                
                elif msg_type == "start_call":
                    await handle_start_call(username, data, websocket)
                
                elif msg_type == "accept_call":
                    await handle_accept_call(username, data, websocket)
                
                elif msg_type == "decline_call":
                    await handle_decline_call(username, data, websocket)
                
                elif msg_type == "offer":
                    await handle_offer_relay(username, data)
                
                elif msg_type == "answer":
                    await handle_answer_relay(username, data)
                
                elif msg_type == "ice_candidate":
                    await handle_ice_candidate_relay(username, data)
                
                elif msg_type in ["call_end", "call_ended"]:
                    await handle_end_call(username, data, websocket)
                
                elif msg_type == "profile_update":
                    await handle_profile_update(username, data)
                
                else:
                    logger.warning(f"[WS] Unknown type: {msg_type}")
                    
            except json.JSONDecodeError:
                logger.error("[WS] Invalid JSON received")
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
    
    except WebSocketDisconnect:
        logger.info(f"[WS] Disconnected: {username}")
        storage.disconnect_user(username)
        await broadcast_user_list()
    
    except Exception as e:
        logger.error(f"[WS] Error: {e}", exc_info=True)
        storage.disconnect_user(username)

# ============================================================
# MESSAGE HANDLERS
# ============================================================

async def handle_chat_message(sender: str, data: dict, ws: WebSocket):
    """Handle incoming chat message"""
    
    receiver = data.get("receiver", "Public")
    text = data.get("message", "").strip()
    pic = data.get("pic") or storage.users.get(sender, {}).get("profile_pic", "")
    
    if not text:
        return
    
    # Save message
    saved_msg = storage.save_message(sender, receiver, text, pic)
    
    # Build response
    response = {
        "type": "chat",
        "message": text,
        "sender": sender,
        "profile_pic": pic,
        "timestamp": saved_msg.get("timestamp"),
        "id": saved_msg.get("id")
    }
    
    # Send to receiver if online and not public
    if receiver != "Public" and receiver in storage.users:
        target_ws = storage.users[receiver].get("ws")
        if target_ws:
            try:
                await target_ws.send_json(response)
            except Exception as e:
                logger.error(f"[MSG] Failed to send to {receiver}: {e}")
    
    # Echo back to sender
    await ws.send_json(response)

async def handle_get_history(user: str, data: dict, ws: WebSocket):
    """Send chat history between two users"""
    
    target = data.get("target", "Public")
    messages = storage.get_messages(user, target)
    
    await ws.send_json({
        "type": "history",
        "messages": messages,
        "target": target
    })

async def handle_profile_update(user: str, data: dict, ws: WebSocket):
    """Update user's profile picture"""
    
    pic = data.get("pic")
    if user in storage.users:
        storage.users[user]["profile_pic"] = pic or ""
    
    # Broadcast updated list
    await broadcast_user_list()

# ============================================================
# CALL SIGNALING HANDLERS
# ============================================================

async def handle_start_call(caller: str, data: dict, ws: WebSocket):
    """Initiate an outgoing call"""
    
    target = data.get("target")
    is_video = data.get("is_video", False)
    caller_name = data.get("caller_name", caller)
    caller_pic = data.get("caller_pic") or storage.users.get(caller, {}).get("profile_pic", "")
    
    if not target or target.lower() == "public":
        await ws.send_json({
            "type": "error",
            "message": "Cannot call Public channel. Select a private chat."
        })
        return
    
    if target not in storage.users:
        await ws.send_json({
            "type": "call_declined",
            "reason": "User offline"
        })
        return
    
    # Send incoming_call notification to target
    target_ws = storage.users[target].get("ws")
    if target_ws:
        await target_ws.send_json({
            "type": "incoming_call",
            "caller": caller,
            "caller_name": caller_name,
            "caller_pic": caller_pic,
            "is_video": is_video
        })
        
        logger.info(f"[CALL] 📞 {caller} → {target} ({'Video' if is_video else 'Voice'})")

async def handle_accept_call(callee: str, data: dict, ws: WebSocket):
    """Handle call acceptance"""
    
    caller = data.get("target")
    
    if caller and caller in storage.users:
        caller_ws = storage.users[caller].get("ws")
        if caller_ws:
            await caller_ws.send_json({
                "type": "call_accepted",
                "accepted_by": callee
            })

async def handle_decline_call(decliner: str, data: dict, ws: WebSocket):
    """Handle call decline"""
    
    caller = data.get("target")
    
    if caller and caller in storage.users:
        caller_ws = storage.users[caller].get("ws")
        if caller_ws:
            await caller_ws.send_json({
                "type": "call_declined",
                "declined_by": decliner
            })

async def handle_offer_relay(sender: str, data: dict):
    """Relay SDP offer to callee"""
    
    target = data.get("target")
    
    if target and target in storage.users:
        target_ws = storage.users[target].get("ws")
        if target_ws:
            forward_data = data.copy()
            forward_data["from"] = sender
            await target_ws.send_json(forward_data)

async def handle_answer_relay(sender: str, data: dict):
    """Relay SDP answer to caller"""
    
    target = data.get("target")
    
    if target and target in storage.users:
        target_ws = storage.users[target].get("ws")
        if target_ws:
            forward_data = data.copy()
            forward_data["from"] = sender
            await target_ws.send_json(forward_data)

async def handle_ice_candidate_relay(sender: str, data: dict):
    """Relay ICE candidate"""
    
    target = data.get("target")
    
    if target and target in storage.users:
        target_ws = storage.users[target].get("ws")
        if target_ws:
            forward_data = data.copy()
            forward_data["from"] = sender
            await target_ws.send_json(forward_data)

async def handle_end_call(ender: str, data: dict, ws: WebSocket):
    """Handle call termination"""
    
    target = data.get("target")
    
    # Notify other party
    if target and target in storage.users:
        target_ws = storage.users[target].get("ws")
        if target_ws:
            await target_ws.send_json({
                "type": "call_ended",
                "ended_by": ender,
                "reason": data.get("reason", "unknown")
            })
    
    logger.info(f"[CALL] Ended by {ender}")

# ============================================================
# BROADCAST HELPERS
# ============================================================

async def broadcast_user_list():
    """Broadcast online users to all connected clients"""
    
    users = storage.get_online_users()
    payload = {"type": "user_list", "data": users}
    
    disconnected = []
    
    for username, udata in list(storage.users.items()):
        ws = udata.get("ws")
        if ws:
            try:
                await ws.send_json(payload)
            except Exception:
                disconnected.append(username)
    
    # Clean up failed connections
    for username in disconnected:
        storage.disconnect_user(username)

# ============================================================
# RUN SERVER
# ============================================================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    
    print("""
╔════════════════════════════════════════╗
║     🔥 IdlyCall Pro v2.1                 ║
║     Pydantic v1 | Neon.tech | Render       ║
╚════════════════════════════════════════╝
""")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )