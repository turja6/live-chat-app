# main.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Dict
import cloudinary
import cloudinary.uploader
import json
import asyncio
from datetime import datetime

import database

app = FastAPI()

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cloudinary Configuration (Replace with your credentials if needed, or use defaults if env set)
cloudinary.config( 
    cloud_name = "dvwec2kgx", # Example cloud name, replace with yours
    api_key = "YOUR_API_KEY", 
    api_secret = "YOUR_API_SECRET",
    secure=True
)

# Dependency
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- HTTP Routes ---

@app.post("/login")
async def login(username: str = None, file: UploadFile = File(None), db: Session = Depends(get_db)):
    if not username:
        raise HTTPException(status_code=400, detail="Username required")
    
    user = db.query(database.User).filter(database.User.username == username).first()
    
    pic_url = "https://via.placeholder.com/150" # Default avatar
    
    if file:
        # Upload avatar to Cloudinary
        contents = await file.read()
        res = cloudinary.uploader.upload(contents, folder="avatars")
        pic_url = res['secure_url']
    
    if not user:
        # Create new user
        user = database.User(username=username, profile_pic=pic_url, status="online")
        db.add(user)
    else:
        # Update existing user
        user.profile_pic = pic_url if file else user.profile_pic
        user.status = "online"
    
    db.commit()
    db.refresh(user)
    return {"username": user.username, "profile_pic": user.profile_pic}

@app.get("/users")
def get_users(db: Session = Depends(get_db)):
    users = db.query(database.User).all()
    return users

@app.get("/messages/{receiver}")
def get_messages(receiver: str, db: Session = Depends(get_db)):
    # Get chat history for Public Channel or DMs
    if receiver == "public":
        messages = db.query(database.Message).filter(database.Message.receiver == "public").order_by(database.Message.timestamp.asc()).all()
    else:
        # DMs: Get messages where (sender=me & receiver=them) OR (sender=them & receiver=me)
        # Note: For simplicity, this endpoint expects the client to request history for a specific user.
        # We assume the client passes the 'other' user as receiver, but we need the current user context.
        # Ideally, pass current_user in header. Here we will return all messages involving 'receiver' for demo.
        messages = db.query(database.Message).filter(
            ((database.Message.sender == receiver) | (database.Message.receiver == receiver))
        ).order_by(database.Message.timestamp.asc()).all()
    
    return messages

# --- WebSocket Manager ---

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, username: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[username] = websocket

    def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]

    async def send_personal_message(self, message: dict, username: str):
        if username in self.active_connections:
            await self.active_connections[username].send_text(json.dumps(message))

    async def broadcast(self, message: dict, exclude: str = None):
        for user, connection in self.active_connections.items():
            if user != exclude:
                await connection.send_text(json.dumps(message))

manager = ConnectionManager()

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str, db: Session = Depends(get_db)):
    await manager.connect(username, websocket)
    
    # Heartbeat Task
    async def heartbeat():
        while True:
            await asyncio.sleep(20) # Ping every 20 seconds
            try:
                await websocket.send_text(json.dumps({"type": "ping"}))
            except:
                break

    asyncio.create_task(heartbeat())

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")

            if msg_type == "chat_message":
                content = message.get("content")
                receiver = message.get("receiver")
                sender = message.get("sender")
                
                # Image Upload Check
                if content.startswith("data:image"):
                    res = cloudinary.uploader.upload(content, folder="chat_images")
                    content = res['secure_url']

                # Save to DB
                user_obj = db.query(database.User).filter(database.User.username == sender).first()
                new_msg = database.Message(
                    sender=sender, 
                    receiver=receiver, 
                    content=content, 
                    profile_pic=user_obj.profile_pic if user_obj else None,
                    timestamp=datetime.utcnow()
                )
                db.add(new_msg)
                db.commit()

                # Prepare payload
                payload = {
                    "type": "chat_message",
                    "sender": sender,
                    "receiver": receiver,
                    "content": content,
                    "profile_pic": user_obj.profile_pic if user_obj else None,
                    "timestamp": new_msg.timestamp.isoformat()
                }

                # Route Message
                if receiver == "public":
                    await manager.broadcast(payload)
                else:
                    # DM: Send to receiver and back to sender (for echo/multi-device)
                    await manager.send_personal_message(payload, receiver)
                    await manager.send_personal_message(payload, sender)

            elif msg_type == "typing":
                # Relay typing indicator
                target = message.get("receiver")
                await manager.send_personal_message({"type": "typing", "sender": username}, target)

            elif msg_type in ["call_offer", "call_answer", "ice_candidate", "call_hangup"]:
                # WebRTC Signaling Relay
                target = message.get("target")
                if target:
                    payload = message
                    payload["sender"] = username
                    await manager.send_personal_message(payload, target)

    except WebSocketDisconnect:
        manager.disconnect(username)
        user = db.query(database.User).filter(database.User.username == username).first()
        if user:
            user.status = "offline"
            db.commit()
        await manager.broadcast({"type": "user_update", "username": username, "status": "offline"})