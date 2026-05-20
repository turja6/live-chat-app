import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request 
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
import cloudinary
import cloudinary.uploader
import database

# ==========================================
# 1. CLOUDINARY CONFIGURATION
# ==========================================
cloudinary.config( 
  cloud_name = "dvdfjknil", 
  api_key = "452245293533251", 
  api_secret = "WPLiRjhMyG4GVKFBDjrz0zFrEf4",
  secure = True
)

app = FastAPI()
templates = Jinja2Templates(directory="templates")
database.init_db()

class ConnectionManager:
    def __init__(self):
        self.active_connections = {}

    async def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]
            await asyncio.to_thread(database.update_user, username, None, "Offline")
            await self.broadcast_user_list()

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections.values()):
            try: await connection.send_text(json.dumps(message))
            except: pass

    async def send_personal_message(self, message: dict, username: str):
        if username in self.active_connections:
            try: await self.active_connections[username].send_text(json.dumps(message))
            except: pass

    async def broadcast_user_list(self):
        users = await asyncio.to_thread(database.get_all_users)
        await self.broadcast({"type": "user_list", "users": users})

manager = ConnectionManager()

@app.get("/")
async def get(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await websocket.accept()
    
    # Wait for the frontend to send the profile picture before fully connecting
    init_data = await websocket.receive_text()
    init_json = json.loads(init_data)
    pic = init_json.get("pic", "")
    target_chat = init_json.get("target", "Public") # Let frontend request initial chat

    manager.active_connections[username] = websocket
    await asyncio.to_thread(database.update_user, username, pic, "Online")
    await manager.broadcast_user_list()
    
    # Send history for the requested chat immediately upon connection
    history = await asyncio.to_thread(database.get_chat_history, username, target_chat)
    await websocket.send_text(json.dumps({"type": "history", "target": target_chat, "data": history}))
    
    try:
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            msg_type = data.get("type")
            
            if msg_type == "ping": continue
            
            # --- NEW: Handle Typing Indicator ---
            if msg_type == "typing":
                receiver = data.get("receiver", "Public")
                payload = {"type": "typing", "sender": username, "receiver": receiver}
                if receiver == "Public":
                    # Broadcast typing to everyone in Public (except sender)
                    for user, conn in manager.active_connections.items():
                        if user != username:
                            try: await conn.send_text(json.dumps(payload))
                            except: pass
                else:
                    await manager.send_personal_message(payload, receiver)
                continue # Skip the rest of the loop for typing events
                
            if msg_type == "chat":
                content = data.get("content")
                receiver = data.get("receiver", "Public")
                current_pic = data.get("pic", pic)
                
                if content.startswith("data:image/"):
                    upload_result = await asyncio.to_thread(cloudinary.uploader.upload, content)
                    content = upload_result.get("secure_url")
                
                ts = await asyncio.to_thread(database.save_message, username, receiver, current_pic, content)
                
                payload = {
                    "type": "chat", "sender": username, "receiver": receiver, 
                    "profile_pic": current_pic, "content": content, "timestamp": ts
                }
                
                if receiver == "Public":
                    await manager.broadcast(payload)
                else:
                    await manager.send_personal_message(payload, receiver)
                    if username != receiver: 
                        await manager.send_personal_message(payload, username)

            elif msg_type == "get_history":
                target = data.get("target")
                hist = await asyncio.to_thread(database.get_chat_history, username, target)
                await websocket.send_text(json.dumps({"type": "history", "target": target, "data": hist}))

            elif msg_type == "update_profile":
                new_pic = data.get("pic")
                pic = new_pic
                await asyncio.to_thread(database.update_user, username, new_pic, "Online")
                await manager.broadcast_user_list()

            # --- NEW: The Universal Plugin Hook ---
            else:
                # Route any unknown message types (like WebRTC signals) directly to the receiver
                receiver = data.get("receiver")
                if receiver and receiver != "Public":
                    data["sender"] = username  # Stamp with sender identity for security
                    await manager.send_personal_message(data, receiver)

    except WebSocketDisconnect:
        await manager.disconnect(username)
    except Exception as e:
        await manager.disconnect(username)
        print(f"Socket Error: {e}")