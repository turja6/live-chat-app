import json
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
import database

app = FastAPI()

# Point to the templates directory to serve the HTML file
templates = Jinja2Templates(directory="templates")

# Initialize the SQLite database tables
database.init_db()

class ConnectionManager:
    def __init__(self):
        # Dictionary to store active connections: {"username": WebSocket_Object}
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections[username] = websocket

    def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]

    async def broadcast(self, message: dict):
        """Sends a JSON message to EVERY connected user (Public Chat & User Lists)"""
        for connection in list(self.active_connections.values()):
            await connection.send_text(json.dumps(message))

    async def send_personal_message(self, message: dict, username: str):
        """Sends a JSON message to ONE specific user (Direct Messages & Calls)"""
        if username in self.active_connections:
            await self.active_connections[username].send_text(json.dumps(message))

manager = ConnectionManager()


@app.get("/")
async def get(request: Request):
    """Serves the main frontend UI"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(websocket, username)
    
    try:
        # 1. Wait for the user to send their profile picture upon connecting
        setup_data = await websocket.receive_text()
        setup_json = json.loads(setup_data)
        pic = setup_json.get("pic", "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png")

        # Mark user as Online in the database
        database.update_user(username, pic, "Online")
        
        # 2. Send the user the public chat history immediately so they aren't looking at an empty screen
        history = database.get_history(username, "Public")
        await websocket.send_text(json.dumps({"type": "history", "target": "Public", "data": history}))
        
        # 3. Broadcast the updated user list to everyone
        users = database.get_all_users()
        await manager.broadcast({"type": "user_list", "data": users})
        
        # 4. Infinite loop to handle incoming data from this user
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            
            # --- HANDLE STANDARD MESSAGES (Text & Images) ---
            if data["type"] == "chat":
                msg_id = data.get("msg_id")
                receiver = data["receiver"]
                msg_text = data["message"]
                
                # Save to Database
                database.save_message(msg_id, username, receiver, pic, msg_text)
                
                # Construct the payload to send to clients
                payload = {
                    "type": "chat", 
                    "msg_id": msg_id,
                    "sender": username, 
                    "receiver": receiver, 
                    "profile_pic": pic, 
                    "message": msg_text, 
                    "timestamp": datetime.now().strftime("%I:%M %p"),
                    "reactions": {}
                }
                
                # Route the message
                if receiver == "Public":
                    await manager.broadcast(payload)
                else:
                    await manager.send_personal_message(payload, receiver)
                    # Send a copy back to the sender so it appears on their screen too
                    if username != receiver:
                        await manager.send_personal_message(payload, username)
                        
            # --- HANDLE LIVE EMOJI REACTIONS ---
            elif data["type"] == "reaction":
                msg_id = data["msg_id"]
                emoji = data["emoji"]
                receiver = data["receiver"]
                
                # Save reaction to the specific message in the database
                database.add_reaction(msg_id, emoji)
                
                payload = {
                    "type": "reaction", 
                    "msg_id": msg_id, 
                    "emoji": emoji, 
                    "receiver": receiver
                }
                
                # Route the reaction update identically to how the message was routed
                if receiver == "Public":
                    await manager.broadcast(payload)
                else:
                    await manager.send_personal_message(payload, receiver)
                    if username != receiver:
                        await manager.send_personal_message(payload, username)
                        
            # --- HANDLE CHAT SWITCHING (Fetching History) ---
            elif data["type"] == "get_history":
                target = data["target"]
                history = database.get_history(username, target)
                await manager.send_personal_message({"type": "history", "target": target, "data": history}, username)
            
            # --- HANDLE USER SETTINGS UPDATES ---
            elif data["type"] == "update_settings":
                new_pic = data["pic"]
                new_name = data.get("new_name", username)
                
                # Update database and alert everyone of the profile change
                database.update_user(new_name, new_pic, "Online")
                users = database.get_all_users()
                await manager.broadcast({"type": "user_list", "data": users})

            # --- HANDLE WEBRTC CALL SIGNALING (Video/Audio Calls) ---
            # The server doesn't process video; it just passes the connection data to the target user.
            elif data["type"] in ["call_offer", "call_answer", "ice_candidate"]:
                target_user = data["target"]
                data["sender"] = username # Let the receiver know who is calling
                await manager.send_personal_message(data, target_user)

    except WebSocketDisconnect:
        # 5. Handle user disconnecting (closing the browser tab)
        manager.disconnect(username)
        
        # Mark user as offline without wiping their profile picture
        database.update_status_only(username, "Offline")
        
        # Tell everyone else to grey out this user's name in the sidebar
        users = database.get_all_users()
        await manager.broadcast({"type": "user_list", "data": users})