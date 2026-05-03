import json
import re
import urllib.request
import asyncio
import os
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
from fastapi.staticfiles import StaticFiles
import cloudinary
import cloudinary.uploader
import database

os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)

cloudinary.config( 
  cloud_name = "dvdfjknil", api_key = "452245293533251", 
  api_secret = "WPLiRjhMyG4GVKFBDjrz0zFrEf4", secure = True
)

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

database.init_db()

def scrape_link_preview(text: str):
    urls = re.findall(r'(https?://[^\s]+)', text)
    if not urls: return None
    url = urls[0]
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=2) as response:
            html = response.read().decode('utf-8', errors='ignore')
            title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
            if title_match:
                return { "url": url, "title": title_match.group(1) }
    except: pass
    return None

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections[username] = websocket

    def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections.values()):
            try: await connection.send_text(json.dumps(message))
            except: pass

    async def send_personal_message(self, message: dict, username: str):
        if username in self.active_connections:
            try: await self.active_connections[username].send_text(json.dumps(message))
            except: pass

manager = ConnectionManager()

@app.get("/")
async def get(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(websocket, username)
    try:
        setup_data = await websocket.receive_text()
        setup_json = json.loads(setup_data)
        pic = setup_json.get("pic", "/static/IC.png")

        await asyncio.to_thread(database.update_user, username, pic, "Online")
        
        history = await asyncio.to_thread(database.get_history, username, "Public")
        await websocket.send_text(json.dumps({"type": "history", "target": "Public", "data": history}))
        
        users = await asyncio.to_thread(database.get_all_users)
        await manager.broadcast({"type": "user_list", "data": users})
        
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            msg_type = data.get("type")

            # Ignore Render heartbeat pings
            if msg_type == "ping":
                continue
            
            if msg_type == "chat":
                msg_id = data.get("msg_id")
                receiver = data["receiver"]
                msg_text = data["message"]
                
                preview = None
                if msg_text.startswith("data:image/"):
                    upload_result = await asyncio.to_thread(cloudinary.uploader.upload, msg_text)
                    msg_text = upload_result.get("secure_url") 
                else:
                    preview = await asyncio.to_thread(scrape_link_preview, msg_text)

                await asyncio.to_thread(database.save_message, msg_id, username, receiver, pic, msg_text)
                
                payload = {
                    "type": "chat", "msg_id": msg_id, "sender": username, 
                    "receiver": receiver, "profile_pic": pic, "message": msg_text, 
                    "timestamp": datetime.now().strftime("%I:%M %p"), "reactions": {}, "preview": preview
                }
                
                if receiver == "Public": await manager.broadcast(payload)
                else:
                    await manager.send_personal_message(payload, receiver)
                    if username != receiver: await manager.send_personal_message(payload, username)

            elif msg_type == "get_history":
                history = await asyncio.to_thread(database.get_history, username, data["target"])
                await manager.send_personal_message({"type": "history", "target": data["target"], "data": history}, username)
            
            elif msg_type == "update_settings":
                await asyncio.to_thread(database.update_user, data.get("new_name", username), data["pic"], "Online")
                users = await asyncio.to_thread(database.get_all_users)
                await manager.broadcast({"type": "user_list", "data": users})

            elif msg_type in ["call_offer", "call_answer", "ice_candidate", "call_end"]:
                target_user = data["target"]
                data["sender"] = username 
                await manager.send_personal_message(data, target_user)

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(username)
        await asyncio.to_thread(database.update_status_only, username, "Offline")
        users = await asyncio.to_thread(database.get_all_users)
        await manager.broadcast({"type": "user_list", "data": users})