from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import json
from datetime import datetime

app = FastAPI()

# Mount the static directory for images/assets if needed
app.mount("/static", StaticFiles(directory="static"), name="static")

class ConnectionManager:
    def __init__(self):
        # Stores active users: {"Username": <WebSocket_Object>}
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections[username] = websocket
        await self.broadcast_user_list()

    def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]

    async def broadcast_user_list(self):
        # Always keep the Public Server at the top of the list
        users = [{"username": "Public Server", "status": "Online"}]
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
    # Serves the monolithic HTML file
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(websocket, username)
    try:
        while True:
            # 1. Receive data from the frontend
            data = await websocket.receive_text()
            parsed_data = json.loads(data)
            msg_type = parsed_data.get("type")
            
            # Default to Public Server if no specific receiver is targeted
            target = parsed_data.get("receiver", "Public Server")
            
            # Inject trusted server-side data before routing
            parsed_data["sender"] = username
            parsed_data["timestamp"] = datetime.now().strftime("%I:%M %p")

            # 2. Route Standard Chat Messages
            if msg_type == "chat":
                payload = json.dumps(parsed_data)
                # If target is Public, broadcast to everyone
                if target == "Public Server":
                    await manager.broadcast(payload)
                else:
                    # If target is private, send to receiver AND back to sender
                    await manager.send_personal_message(payload, target)
                    if target != username:
                        await manager.send_personal_message(payload, username)
                        
            # 3. Route Silent Background Events (Typing & WebRTC Calling)
            # These should NEVER be broadcast to the Public Server.
            elif msg_type in [
                "typing", 
                "call_offer", 
                "call_answer", 
                "ice_candidate", 
                "call_end", 
                "call_declined"
            ]:
                payload = json.dumps(parsed_data)
                if target != "Public Server":
                    await manager.send_personal_message(payload, target)

    except WebSocketDisconnect:
        manager.disconnect(username)
        # Broadcast updated list when someone closes the app
        await manager.broadcast_user_list()