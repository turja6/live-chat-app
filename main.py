import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.templating import Jinja2Templates
import cloudinary
import cloudinary.uploader
import database

cloudinary.config( 
  cloud_name = "dvdfjknil", api_key = "452245293533251", 
  api_secret = "WPLiRjhMyG4GVKFBDjrz0zFrEf4", secure = True
)

app = FastAPI()
templates = Jinja2Templates(directory="templates")
database.init_db()

class ConnectionManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections[username] = websocket

    async def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]
            await asyncio.to_thread(database.update_user, username, None, "Offline")
            await self.broadcast_user_list()

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections.values()):
            try: await connection.send_text(json.dumps(message))
            except: pass

    async def send_personal(self, message: dict, username: str):
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
    await manager.connect(websocket, username)
    try:
        init_data = await websocket.receive_text()
        init_json = json.loads(init_data)
        await asyncio.to_thread(database.update_user, username, init_json.get("pic", ""), "Online")
        await manager.broadcast_user_list()
        
        while True:
            data = json.loads(await websocket.receive_text())
            m_type = data.get("type")

            if m_type == "chat":
                receiver = data.get("receiver")
                content = data.get("content")
                if content.startswith("data:image/"):
                    content = (await asyncio.to_thread(cloudinary.uploader.upload, content)).get("secure_url")
                
                ts = await asyncio.to_thread(database.save_message, username, receiver, data.get("pic"), content)
                payload = {"type": "chat", "sender": username, "receiver": receiver, "content": content, "timestamp": ts, "profile_pic": data.get("pic")}
                
                if receiver == "Public": await manager.broadcast(payload)
                else:
                    await manager.send_personal(payload, receiver)
                    await manager.send_personal(payload, username)

            elif m_type in ["call_offer", "call_answer", "ice_candidate", "call_end"]:
                # ROUTE SIGNALING DATA TO THE TARGET USER
                target = data.get("target")
                data["sender"] = username
                await manager.send_personal(data, target)

            elif m_type == "get_history":
                hist = await asyncio.to_thread(database.get_chat_history, username, data.get("target"))
                await websocket.send_text(json.dumps({"type": "history", "target": data.get("target"), "data": hist}))

    except WebSocketDisconnect: await manager.disconnect(username)