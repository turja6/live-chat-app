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

manager = ConnectionManager()

@app.get("/")
async def get(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(websocket, username)
    
    try:
        # 1. Wait for the user to send their profile picture via JSON
        setup_data = await websocket.receive_text()
        setup_json = json.loads(setup_data)
        pic = setup_json.get("pic", "")

        # 2. Log them in and send history
        database.update_user(username, pic, "Online")
        history = database.get_history()
        await websocket.send_text(json.dumps({"type": "history", "data": history}))
        
        # 3. Update everyone's sidebar
        users = database.get_all_users()
        await manager.broadcast({"type": "user_list", "data": users})
        
        while True:
            # 4. Handle normal chat messages
            data = await websocket.receive_text()
            timestamp = datetime.now().strftime("%I:%M %p") # 12-hour AM/PM format
            database.save_message(username, pic, data)
            await manager.broadcast({
                "type": "chat", "sender": username, "profile_pic": pic, 
                "message": data, "timestamp": timestamp
            })
            
    except WebSocketDisconnect:
        manager.disconnect(username)
        database.update_status_only(username, "Offline")
        users = database.get_all_users()
        await manager.broadcast({"type": "user_list", "data": users})