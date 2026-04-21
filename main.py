from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
from typing import List

app = FastAPI()

# Point to the templates folder for the HTML file
templates = Jinja2Templates(directory="templates")

# A list to keep track of all connected users
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

# Route 1: Serve the HTML webpage
@app.get("/")
async def get(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Route 2: Handle the live chat WebSocket connections
@app.websocket("/ws/{client_name}")
async def websocket_endpoint(websocket: WebSocket, client_name: str):
    await manager.connect(websocket)
    await manager.broadcast(f"🟢 {client_name} joined the chat")
    try:
        while True:
            # Wait for a new message from this client
            data = await websocket.receive_text()
            # Send the message to everyone
            await manager.broadcast(f"{client_name}: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast(f"🔴 {client_name} left the chat")