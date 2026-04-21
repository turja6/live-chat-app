import json
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
import database # Import the file we just made!

app = FastAPI()
templates = Jinja2Templates(directory="templates")

# Start the database
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
        for connection in self.active_connections.values():
            await connection.send_text(json.dumps(message))

manager = ConnectionManager()

@app.get("/")
async def get(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str, pic: str = ""):
    # 1. Connect the user
    await manager.connect(websocket, username)
    database.update_user(username, pic, "Online")
    
    # 2. Send them the chat history privately
    history = database.get_history()
    await websocket.send_text(json.dumps({"type": "history", "data": history}))
    
    # 3. Tell everyone to update their online user list
    users = database.get_all_users()
    await manager.broadcast({"type": "user_list", "data": users})
    
    try:
        while True:
            # Wait for a new message
            data = await websocket.receive_text()
            timestamp = datetime.now().strftime("%H:%M")
            
            # Save it to the database
            database.save_message(username, pic, data)
            
            # Send the message to everyone
            await manager.broadcast({
                "type": "chat", 
                "sender": username, 
                "profile_pic": pic, 
                "message": data,
                "timestamp": timestamp
            })
    except WebSocketDisconnect:
        # If they close the browser, mark them offline
        manager.disconnect(username)
        database.update_user(username, pic, "Offline")
        users = database.get_all_users()
        await manager.broadcast({"type": "user_list", "data": users})