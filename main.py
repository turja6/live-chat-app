# main.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.templating import Jinja2Templates
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

# Cloudinary Configuration
cloudinary.config(
    cloud_name="dvwec2kgx",  # replace with your own if needed
    api_key="YOUR_API_KEY",
    api_secret="YOUR_API_SECRET",
    secure=True
)

# Templates
templates = Jinja2Templates(directory="templates")

# Dependency
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ----- HTTP ROUTES -----

@app.get("/")
async def read_root():
    # Serve the single-page frontend
    return templates.TemplateResponse("index.html", {"request": {}})


@app.post("/login")
async def login(username: str = None, file: UploadFile = File(None), db: Session = Depends(get_db)):
    if not username:
        raise HTTPException(status_code=400, detail="Username required")

    user = db.query(database.User).filter(database.User.username == username).first()

    pic_url = "https://via.placeholder.com/150"  # default avatar

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
    users = db.query(database.User).all()
    return users


@app.get("/messages/{receiver}")
def get_messages(receiver: str, db: Session = Depends(get_db)):
    if receiver == "public":
        messages = (
            db.query(database.Message)
            .filter(database.Message.receiver == "public")
            .order_by(database.Message.timestamp.asc())
            .all()
        )
    else:
        messages = (
            db.query(database.Message)
            .filter(
                ((database.Message.sender == receiver) | (database.Message.receiver == receiver))
            )
            .order_by(database.Message.timestamp.asc())
            .all()
        )
    return messages


# ----- WEBSOCKET MANAGER -----

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
            await asyncio.sleep(20)  # Ping every 20 seconds
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
                    # DM: Send to receiver and back to sender
                    await manager.send_personal_message(payload, receiver)
                    await manager.send_personal_message(payload, sender)

            elif msg_type == "typing":
                target = message.get("receiver")
                await manager.send_personal_message({"type": "typing", "sender": username}, target)

            elif msg_type in ["call_offer", "call_answer", "ice_candidate", "call_hangup"]:
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