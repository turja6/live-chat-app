import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
import database

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

database.init_db()


class Manager:
    def __init__(self):
        self.connections = {}

    async def connect(self, ws, username):
        await ws.accept()
        self.connections[username] = ws

    def disconnect(self, username):
        self.connections.pop(username, None)

    async def send(self, username, data):
        if username in self.connections:
            try:
                await self.connections[username].send_text(json.dumps(data))
            except:
                pass

    async def broadcast(self, data):
        for ws in list(self.connections.values()):
            try:
                await ws.send_text(json.dumps(data))
            except:
                pass


manager = Manager()


@app.get("/")
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.websocket("/ws/{username}")
async def ws_endpoint(ws: WebSocket, username: str):
    await manager.connect(ws, username)

    try:
        await ws.receive_text()  # initial handshake

        await manager.send(username, {
            "type": "history",
            "data": database.get_history(username)
        })

        while True:
            data = json.loads(await ws.receive_text())

            if data["type"] == "chat":
                msg_id = data["msg_id"]
                msg = data["message"]
                receiver = data["receiver"]

                database.save_message(msg_id, username, receiver, "", msg)

                payload = {
                    "type": "chat",
                    "msg_id": msg_id,
                    "sender": username,
                    "receiver": receiver,
                    "message": msg
                }

                if receiver == "Public":
                    await manager.broadcast(payload)
                else:
                    await manager.send(receiver, payload)
                    await manager.send(username, payload)

            elif data["type"] == "get_history":
                history = database.get_history(username, data["target"])
                await manager.send(username, {
                    "type": "history",
                    "data": history
                })

    except WebSocketDisconnect:
        manager.disconnect(username)