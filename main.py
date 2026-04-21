import json
import re
import urllib.request
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
from fastapi.staticfiles import StaticFiles
import database

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

# Point to the templates directory to serve the HTML file
templates = Jinja2Templates(directory="templates")

# Initialize the SQLite database tables
database.init_db()

# --- NEW: LEVEL 3 LINK PREVIEW ENGINE ---
def scrape_link_preview(text: str):
    """Scrapes the first URL in a message to generate a Discord-style link preview."""
    urls = re.findall(r'(https?://[^\s]+)', text)
    if not urls:
        return None
    
    url = urls[0]
    try:
        # Pretend to be a standard browser to avoid bot blocks
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=2) as response:
            html = response.read().decode('utf-8', errors='ignore')
            
            # Extract Title and OpenGraph Image using Regex
            title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
            image_match = re.search(r'<meta property="og:image" content="(.*?)"', html, re.IGNORECASE)
            desc_match = re.search(r'<meta name="description" content="(.*?)"', html, re.IGNORECASE)
            
            if title_match:
                return {
                    "url": url,
                    "title": title_match.group(1),
                    "image": image_match.group(1) if image_match else "",
                    "description": desc_match.group(1) if desc_match else ""
                }
    except Exception as e:
        print(f"Link Scrape Failed: {e}")
        pass
    return None

# --- NEW: DATABASE PATCHES FOR EDITING/DELETION ---
# Since these weren't in the original database.py, we run them directly here.
def edit_message_in_db(msg_id, new_text):
    conn = database.get_db()
    conn.execute("UPDATE messages SET message = ? WHERE msg_id = ?", (new_text, msg_id))
    conn.commit()
    conn.close()

def delete_message_in_db(msg_id):
    conn = database.get_db()
    conn.execute("DELETE FROM messages WHERE msg_id = ?", (msg_id,))
    conn.commit()
    conn.close()


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
        """Sends a JSON message to EVERY connected user"""
        for connection in list(self.active_connections.values()):
            try:
                await connection.send_text(json.dumps(message))
            except:
                pass

    async def send_personal_message(self, message: dict, username: str):
        """Sends a JSON message to ONE specific user"""
        if username in self.active_connections:
            try:
                await self.active_connections[username].send_text(json.dumps(message))
            except:
                pass

manager = ConnectionManager()


@app.get("/")
async def get(request: Request):
    """Serves the main frontend UI"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(websocket, username)
    
    try:
        # 1. Wait for user profile setup
        setup_data = await websocket.receive_text()
        setup_json = json.loads(setup_data)
        pic = setup_json.get("pic", "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png")

        database.update_user(username, pic, "Online")
        
        # 2. Send initial Public history (Limit 50)
        history = database.get_history(username, "Public")
        await websocket.send_text(json.dumps({"type": "history", "target": "Public", "data": history}))
        
        # 3. Broadcast updated user list
        users = database.get_all_users()
        await manager.broadcast({"type": "user_list", "data": users})
        
        # 4. Main Event Loop
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            
            # ==========================================
            # CHAT, LINKS, AND VOICE NOTES
            # ==========================================
            if data["type"] == "chat":
                msg_id = data.get("msg_id")
                receiver = data["receiver"]
                msg_text = data["message"]
                reply_to = data.get("reply_to", None) # For the new Quoting system
                
                # Check for Link Previews (Only if it's text, not a Base64 image/audio)
                preview = None
                if not msg_text.startswith("data:"):
                    preview = scrape_link_preview(msg_text)

                database.save_message(msg_id, username, receiver, pic, msg_text)
                
                payload = {
                    "type": "chat", 
                    "msg_id": msg_id,
                    "sender": username, 
                    "receiver": receiver, 
                    "profile_pic": pic, 
                    "message": msg_text, 
                    "timestamp": datetime.now().strftime("%I:%M %p"),
                    "reactions": {},
                    "preview": preview,
                    "reply_to": reply_to
                }
                
                if receiver == "Public":
                    await manager.broadcast(payload)
                else:
                    await manager.send_personal_message(payload, receiver)
                    if username != receiver:
                        await manager.send_personal_message(payload, username)
                        
            # ==========================================
            # LEVEL 1: EDITING & DELETION
            # ==========================================
            elif data["type"] == "edit_message":
                msg_id = data["msg_id"]
                new_text = data["new_text"]
                receiver = data["receiver"]
                
                edit_message_in_db(msg_id, new_text)
                payload = {"type": "edit_message", "msg_id": msg_id, "new_text": new_text, "receiver": receiver}
                
                if receiver == "Public":
                    await manager.broadcast(payload)
                else:
                    await manager.send_personal_message(payload, receiver)
                    if username != receiver:
                        await manager.send_personal_message(payload, username)

            elif data["type"] == "delete_message":
                msg_id = data["msg_id"]
                receiver = data["receiver"]
                
                delete_message_in_db(msg_id)
                payload = {"type": "delete_message", "msg_id": msg_id, "receiver": receiver}
                
                if receiver == "Public":
                    await manager.broadcast(payload)
                else:
                    await manager.send_personal_message(payload, receiver)
                    if username != receiver:
                        await manager.send_personal_message(payload, username)

            # ==========================================
            # LEVEL 1: TYPING INDICATORS
            # ==========================================
            elif data["type"] == "typing":
                receiver = data["receiver"]
                payload = {"type": "typing", "sender": username, "receiver": receiver}
                
                if receiver == "Public":
                    await manager.broadcast(payload)
                else:
                    await manager.send_personal_message(payload, receiver)

            # ==========================================
            # EMOJI REACTIONS
            # ==========================================
            elif data["type"] == "reaction":
                msg_id = data["msg_id"]
                emoji = data["emoji"]
                receiver = data["receiver"]
                
                database.add_reaction(msg_id, emoji)
                payload = {"type": "reaction", "msg_id": msg_id, "emoji": emoji, "receiver": receiver}
                
                if receiver == "Public":
                    await manager.broadcast(payload)
                else:
                    await manager.send_personal_message(payload, receiver)
                    if username != receiver:
                        await manager.send_personal_message(payload, username)
                        
            # ==========================================
            # INFINITE SCROLL (PAGINATION)
            # ==========================================
            elif data["type"] == "get_history":
                target = data["target"]
                # The DB function limits to 50, but you can pass an offset from the frontend if needed
                history = database.get_history(username, target)
                await manager.send_personal_message({"type": "history", "target": target, "data": history}, username)
            
            # ==========================================
            # USER SETTINGS
            # ==========================================
            elif data["type"] == "update_settings":
                new_pic = data["pic"]
                new_name = data.get("new_name", username)
                
                database.update_user(new_name, new_pic, "Online")
                users = database.get_all_users()
                await manager.broadcast({"type": "user_list", "data": users})

            # ==========================================
            # WEBRTC CALL SIGNALING
            # ==========================================
            elif data["type"] in ["call_offer", "call_answer", "ice_candidate"]:
                target_user = data["target"]
                data["sender"] = username 
                await manager.send_personal_message(data, target_user)

    except WebSocketDisconnect:
        manager.disconnect(username)
        database.update_status_only(username, "Offline")
        users = database.get_all_users()
        await manager.broadcast({"type": "user_list", "data": users})