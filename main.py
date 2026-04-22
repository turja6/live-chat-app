from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import json
from datetime import datetime

# Import your secure database connection
import database

app = FastAPI()

# Mount the static folder so CSS and JS can load
app.mount("/static", StaticFiles(directory="static"), name="static")

class ConnectionManager:
    def __init__(self):
        # Stores active users: {"Turja": <WebSocket>}
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections[username] = websocket
        await self.broadcast_user_list()

    def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]

    async def broadcast_user_list(self):
        # Send updated user list to everyone
        users = [{"username": "Public", "status": "Online"}]
        users += [{"username": u, "status": "Online"} for u in self.active_connections.keys()]
        
        message = json.dumps({"type": "user_list", "data": users})
        for connection in self.active_connections.values():
            await connection.send_text(message)

    async def send_personal_message(self, message: str, receiver: str):
        if receiver in self.active_connections:
            await self.active_connections[receiver].send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections.values():
            await connection.send_text(message)

manager = ConnectionManager()

@app.get("/")
async def get_chat_app():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(websocket, username)
    try:
        while True:
            data = await websocket.receive_text()
            parsed_data = json.loads(data)
            msg_type = parsed_data.get("type")
            target = parsed_data.get("receiver", "Public")
            
            # Add sender info and timestamp to all incoming messages
            parsed_data["sender"] = username
            parsed_data["timestamp"] = datetime.now().strftime("%I:%M %p")

            # Route standard chat messages
            if msg_type == "chat":
                payload = json.dumps(parsed_data)
                if target == "Public":
                    await manager.broadcast(payload)
                else:
                    await manager.send_personal_message(payload, target)
                    if target != username:
                        await manager.send_personal_message(payload, username)
                        
            # Route silent events (Typing, Calls, Reactions)
            elif msg_type in ["typing", "reaction", "call_end"]:
                payload = json.dumps(parsed_data)
                if target != "Public":
                    await manager.send_personal_message(payload, target)

    except WebSocketDisconnect:
        manager.disconnect(username)
        await manager.broadcast_user_list()