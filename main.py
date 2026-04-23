import json
import re
import urllib.request
import asyncio
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
from fastapi.staticfiles import StaticFiles
import cloudinary
import cloudinary.uploader
import database

# ==========================================
# 1. CONFIGURATION
# ==========================================
cloudinary.config( 
    cloud_name = "dvdfjknil", 
    api_key = "452245293533251", 
    api_secret = "WPLiRjhMyG4GVKFBDjrz0zFrEf4",
    secure = True
)

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

database.init_db()

# ==========================================
# 2. PERFORMANCE UTILS
# ==========================================

# Run link scraping in a separate thread so it doesn't freeze the chat
async def get_link_preview_async(url):
    try:
        # Run the blocking urllib call in a thread pool
        return await asyncio.to_thread(scrape_link_preview_sync, url)
    except:
        return None

def scrape_link_preview_sync(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=1.5) as response: # Reduced timeout for speed
            html = response.read().decode('utf-8', errors='ignore')
            title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
            image_match = re.search(r'<meta property="og:image" content="(.*?)"', html, re.IGNORECASE)
            if title_match:
                return {
                    "url": url,
                    "title": title_match.group(1),
                    "image": image_match.group(1) if image_match else "",
                    "description": ""
                }
    except:
        pass
    return None

def edit_message_in_db(msg_id, new_text):
    db = database.SessionLocal()
    try:
        msg = db.query(database.Message).filter(database.Message.msg_id == msg_id).first()
        if msg:
            msg.message = new_text
            db.commit()
    finally:
        db.close()

def delete_message_in_db(msg_id):
    db = database.SessionLocal()
    try:
        msg = db.query(database.Message).filter(database.Message.msg_id == msg_id).first()
        if msg:
            db.delete(msg)
            db.commit()
    finally:
        db.close()

# ==========================================
# 3. WEBSOCKET MANAGER
# ==========================================
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections[username] = websocket

    def disconnect(self, username: str):
        self.active_connections.pop(username, None)

    async def broadcast(self, message: dict):
        # Efficient broadcasting
        message_str = json.dumps(message)
        for connection in list(self.active_connections.values()):
            try:
                await connection.send_text(message_str)
            except:
                pass

    async def send_personal_message(self, message: dict, username: str):
        if username in self.active_connections:
            try:
                await self.active_connections[username].send_text(json.dumps(message))
            except:
                pass

manager = ConnectionManager()

# ==========================================
# 4. ROUTES
# ==========================================
@app.get("/")
async def get(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(websocket, username)
    
    try:
        # 1. Setup
        setup_data = await websocket.receive_text()
        setup_json = json.loads(setup_data)
        pic = setup_json.get("pic", "/static/IC.png")

        database.update_user(username, pic, "Online")
        
        # Send initial data
        history = database.get_history(username, "Public")
        await websocket.send_text(json.dumps({"type": "history", "target": "Public", "data": history}))
        
        users = database.get_all_users()
        await manager.broadcast({"type": "user_list", "data": users})
        
        # 2. Main Loop
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            msg_type = data.get("type")
            
            if msg_type == "chat":
                msg_id = data.get("msg_id")
                receiver = data["receiver"]
                msg_text = data["message"]
                
                # Cloudinary Upload (Non-blocking using to_thread)
                if msg_text.startswith("data:"):
                    upload_result = await asyncio.to_thread(cloudinary.uploader.upload, msg_text)
                    msg_text = upload_result.get("secure_url")
                
                # Save to DB
                database.save_message(msg_id, username, receiver, pic, msg_text)
                
                payload = {
                    "type": "chat", 
                    "msg_id": msg_id, "sender": username, 
                    "receiver": receiver, "profile_pic": pic, 
                    "message": msg_text, 
                    "timestamp": datetime.now().strftime("%I:%M %p")
                }
                
                # Send message immediately
                if receiver == "Public":
                    await manager.broadcast(payload)
                else:
                    await manager.send_personal_message(payload, receiver)
                    if username != receiver:
                        await manager.send_personal_message(payload, username)

                # Fetch link preview asynchronously (Background Task) to not block sending
                if msg_text.startswith("http"):
                    preview = await get_link_preview_async(msg_text)
                    if preview:
                        update_payload = {"type": "link_preview", "msg_id": msg_id, "preview": preview, "receiver": receiver}
                        if receiver == "Public": await manager.broadcast(update_payload)
                        else: await manager.send_personal_message(update_payload, receiver)

            elif msg_type == "update_settings":
                database.update_user(data.get("new_name", username), data["pic"], "Online")
                users = database.get_all_users()
                await manager.broadcast({"type": "user_list", "data": users})
            
            elif msg_type == "get_history":
                history = database.get_history(username, data["target"])
                await manager.send_personal_message({"type": "history", "target": data["target"], "data": history}, username)

            # WebRTC Signaling
            elif msg_type in ["call_offer", "call_answer", "ice_candidate", "call_end"]:
                target_user = data["target"]
                data["sender"] = username 
                await manager.send_personal_message(data, target_user)

    except WebSocketDisconnect:
        manager.disconnect(username)
        database.update_status_only(username, "Offline")
        users = database.get_all_users()
        await manager.broadcast({"type": "user_list", "data": users})