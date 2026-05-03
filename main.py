import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
import database

app = FastAPI()
templates = Jinja2Templates(directory="templates")

# Initialize the simple database table
database.init_db()

class ConnectionManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections[username] = websocket

    def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections.values()):
            try:
                await connection.send_text(json.dumps(message))
            except:
                pass

manager = ConnectionManager()

@app.get("/")
async def get(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(websocket, username)
    
    # 1. Send chat history immediately upon connection
    history = await asyncio.to_thread(database.get_recent_messages)
    await websocket.send_text(json.dumps({"type": "history", "data": history}))
    
    # 2. Tell everyone someone joined
    await manager.broadcast({"type": "system", "content": f"{username} joined the chat!"})
    
    try:
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            
            # Ignore heartbeat pings from the browser
            if data.get("type") == "ping":
                continue
                
            # Handle real chat messages
            if data.get("type") == "chat":
                content = data.get("content")
                # Save to DB
                await asyncio.to_thread(database.save_message, username, content)
                # Send to everyone
                await manager.broadcast({"type": "chat", "sender": username, "content": content})
                
    except WebSocketDisconnect:
        manager.disconnect(username)
        await manager.broadcast({"type": "system", "content": f"{username} left the chat."})
    except Exception as e:
        manager.disconnect(username)
        print(f"Socket Error: {e}")