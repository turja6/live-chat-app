# main.py
import json
import asyncio
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

import cloudinary
import cloudinary.uploader
import database

# --- Config ---
app = FastAPI()
cloudinary.config( 
    cloud_name = "dvdfjknil", 
    api_key = "452245293533251", 
    api_secret = "WPLiRjhMyG4GVKFBDjrz0zFrEf4",
    secure=True
)

# --- Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database Dependency ---
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- HTTP Routes ---

@app.get("/")
async def read_root():
    return FileResponse("templates/index.html")

@app.post("/login")
async def login(username: str = Form(...), file: UploadFile = File(None), db: Session = Depends(get_db)):
    user = db.query(database.User).filter(database.User.username == username).first()
    pic_url = "https://via.placeholder.com/150"
    
    if file:
        contents = await file.read()
        res = cloudinary.uploader.upload(contents, folder="avatars")
        pic_url = res['secure_url']
    
    if not user:
        user = database.User(username=username, profile_pic=pic_url, status="online")
        db.add(user)
    else:
        user.profile_pic = pic_url if file else user.profile_pic
        user.status = "online"
    
    db.commit()
    db.refresh(user)
    return {"username": user.username, "profile_pic": user.profile_pic}

@app.get("/users")
def get_users(db: Session = Depends(get_db)):
    return db.query(database.User).all()

@app.get("/messages/{target}")
def get_messages(target: str, user: str = Query(None), db: Session = Depends(get_db)):
    """Fetch chat history. 'target' is the other user. 'user' is current user."""
    if target == "public":
        messages = db.query(database.Message).filter(database.Message.receiver == "public").order_by(database.Message.timestamp.asc()).all()
    else:
        # Crucial Fix: Query specific conversation between User A and User B
        messages = db.query(database.Message).filter(
            or_(
                and_(database.Message.sender == user, database.Message.receiver == target),
                and_(database.Message.sender == target, database.Message.receiver == user)
            )
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
        self.active_connections.pop(username, None)

    async def send_personal(self, message: dict, username: str):
        if username in self.active_connections:
            await self.active_connections[username].send_text(json.dumps(message))

    async def broadcast(self, message: dict, exclude: str = None):
        for user, conn in self.active_connections.items():
            if user != exclude:
                await conn.send_text(json.dumps(message))

manager = ConnectionManager()

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str, db: Session = Depends(get_db)):
    await manager.connect(username, websocket)
    
    # Heartbeat
    asyncio.create_task(heartbeat(websocket))

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type")

            if msg_type == "chat_message":
                sender = msg.get("sender")
                receiver = msg.get("receiver")
                content = msg.get("content")

                # Handle Image
                if content.startswith("data:image"):
                    res = cloudinary.uploader.upload(content, folder="chat_images")
                    content = res['secure_url']

                # Save to DB
                user_obj = db.query(database.User).filter(database.User.username == sender).first()
                new_msg = database.Message(
                    sender=sender, receiver=receiver, content=content,
                    profile_pic=user_obj.profile_pic if user_obj else None,
                    timestamp=datetime.utcnow()
                )
                db.add(new_msg)
                db.commit()

                payload = {
                    "type": "chat_message", "sender": sender, "receiver": receiver,
                    "content": content, "profile_pic": user_obj.profile_pic if user_obj else None,
                    "timestamp": new_msg.timestamp.isoformat()
                }

                if receiver == "public":
                    await manager.broadcast(payload)
                else:
                    await manager.send_personal(payload, receiver)
                    await manager.send_personal(payload, sender) # Echo back

            elif msg_type == "typing":
                await manager.send_personal({"type": "typing", "sender": username}, msg.get("receiver"))

            elif msg_type in ["call_offer", "call_answer", "ice_candidate", "call_hangup"]:
                target = msg.get("target")
                msg["sender"] = username
                await manager.send_personal(msg, target)

    except WebSocketDisconnect:
        manager.disconnect(username)
        user = db.query(database.User).filter(database.User.username == username).first()
        if user:
            user.status = "offline"
            db.commit()
        await manager.broadcast({"type": "user_update", "username": username, "status": "offline"})

async def heartbeat(ws):
    while True:
        await asyncio.sleep(20)
        try:
            await ws.send_text(json.dumps({"type": "ping"}))
        except:
            break