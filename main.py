import json
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
import database

app = FastAPI()
templates = Jinja2Templates(directory="templates")

database.init_db()

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
            await connection.send_text(json.dumps(message))

    async def send_personal_message(self, message: dict, username: str):
        if username in self.active_connections:
            await self.active_connections[username].send_text(json.dumps(message))

manager = ConnectionManager()

@app.get("/")
async def get(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(websocket, username)
    
    try:
        setup_data = await websocket.receive_text()
        setup_json = json.loads(setup_data)
        pic = setup_json.get("pic", "")

        database.update_user(username, pic, "Online")
        
        history = database.get_history(username, "Public")
        await websocket.send_text(json.dumps({"type": "history", "target": "Public", "data": history}))
        
        users = database.get_all_users()
        await manager.broadcast({"type": "user_list", "data": users})
        
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            
            # 1. Handle Standard Chat Messages
            if data["type"] == "chat":
                receiver = data["receiver"]
                msg_text = data["message"]
                
                database.save_message(username, receiver, pic, msg_text)
                
                payload = {
                    "type": "chat", "sender": username, "receiver": receiver, 
                    "profile_pic": pic, "message": msg_text, "timestamp": datetime.now().strftime("%I:%M %p")
                }
                
                if receiver == "Public":
                    await manager.broadcast(payload)
                else:
                    await manager.send_personal_message(payload, receiver)
                    if username != receiver:
                        await manager.send_personal_message(payload, username)
            
            # 2. Handle History Requests
            elif data["type"] == "get_history":
                target = data["target"]
                history = database.get_history(username, target)
                await manager.send_personal_message({"type": "history", "target": target, "data": history}, username)
            
            # 3. Handle WebRTC Call Signaling (The Telephone Operator)
            elif data["type"] in ["call_offer", "call_answer", "ice_candidate"]:
                # Simply route the connection data to the target user
                target_user = data["target"]
                data["sender"] = username # Let the receiver know who the signal is from
                await manager.send_personal_message(data, target_user)

    except WebSocketDisconnect:
        manager.disconnect(username)
        database.update_status_only(username, "Offline")
        users = database.get_all_users()
        await manager.broadcast({"type": "user_list", "data": users})