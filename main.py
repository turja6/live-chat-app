import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
import database

app = FastAPI()
templates = Jinja2Templates(directory="templates")
database.init_db()

class ConnectionManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections[username] = websocket
        await self.broadcast_user_list() # Tell everyone someone logged in

    async def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]
            await self.broadcast_user_list() # Update sidebar for everyone

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections.values()):
            try: await connection.send_text(json.dumps(message))
            except: pass

    async def send_personal_message(self, message: dict, username: str):
        if username in self.active_connections:
            try: await self.active_connections[username].send_text(json.dumps(message))
            except: pass

    async def broadcast_user_list(self):
        users = list(self.active_connections.keys())
        await self.broadcast({"type": "user_list", "users": users})

manager = ConnectionManager()

@app.get("/")
async def get(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(websocket, username)
    
    # Send Public history immediately
    history = await asyncio.to_thread(database.get_chat_history, username, "Public")
    await websocket.send_text(json.dumps({"type": "history", "target": "Public", "data": history}))
    
    try:
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            msg_type = data.get("type")
            
            if msg_type == "ping": continue
                
            if msg_type == "chat":
                content = data.get("content")
                receiver = data.get("receiver", "Public") # Defaults to Public
                
                await asyncio.to_thread(database.save_message, username, receiver, content)
                payload = {"type": "chat", "sender": username, "receiver": receiver, "content": content}
                
                if receiver == "Public":
                    await manager.broadcast(payload)
                else:
                    await manager.send_personal_message(payload, receiver)
                    # Send a copy to the sender so they see their own message
                    if username != receiver: 
                        await manager.send_personal_message(payload, username)

            elif msg_type == "get_history":
                target = data.get("target")
                hist = await asyncio.to_thread(database.get_chat_history, username, target)
                await websocket.send_text(json.dumps({"type": "history", "target": target, "data": hist}))

    except WebSocketDisconnect:
        await manager.disconnect(username)
    except Exception as e:
        await manager.disconnect(username)
        print(f"Socket Error: {e}")