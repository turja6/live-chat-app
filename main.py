import json
import asyncio
import importlib
import os
import sys
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import database

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")
database.init_db()

class PluginManager:
    def __init__(self):
        self.active_connections = {}
        self.hooks = {}

    def register_hook(self, event_type, callback):
        if event_type not in self.hooks:
            self.hooks[event_type] = []
        self.hooks[event_type].append(callback)

    async def trigger_event(self, event_type, data, username, websocket):
        if event_type in self.hooks:
            for callback in self.hooks[event_type]:
                await callback(self, data, username, websocket)

    async def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]
            await asyncio.to_thread(database.update_user, username, None, "Offline")
            await self.broadcast_user_list()

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections.values()):
            try: await connection.send_text(json.dumps(message))
            except: pass

    async def send_personal_message(self, message: dict, username: str):
        if username in self.active_connections:
            try: await self.active_connections[username].send_text(json.dumps(message))
            except: pass

    async def broadcast_user_list(self):
        users = await asyncio.to_thread(database.get_all_users)
        await self.broadcast({"type": "user_list", "users": users})

manager = PluginManager()

if not os.path.exists("plugins"): os.makedirs("plugins")
sys.path.append(os.path.abspath("plugins"))
for filename in os.listdir("plugins"):
    if filename.endswith(".py") and not filename.startswith("__"):
        module_name = filename[:-3]
        module = importlib.import_module(module_name)
        module.setup(manager)

@app.get("/")
async def get(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await websocket.accept()
    init_data = await websocket.receive_text()
    init_json = json.loads(init_data)
    manager.active_connections[username] = websocket
    
    await manager.trigger_event("client_connect", init_json, username, websocket)
    
    try:
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            msg_type = data.get("type", "chat")
            
            if msg_type == "ping": continue
            await manager.trigger_event(msg_type, data, username, websocket)
            
    except WebSocketDisconnect:
        await manager.disconnect(username)
    except Exception as e:
        await manager.disconnect(username)
