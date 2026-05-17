import json
import asyncio
import cloudinary
import cloudinary.uploader
import database

# Configure Cloudinary
cloudinary.config(
  cloud_name = "dvdfjknil", 
  api_key = "452245293533251", 
  api_secret = "WPLiRjhMyG4GVKFBDjrz0zFrEf4",
  secure = True
)

async def handle_connect(manager, data, username, websocket):
    pic = data.get("pic", "")
    target_chat = data.get("target", "Public")
    
    await asyncio.to_thread(database.update_user, username, pic, "Online")
    await manager.broadcast_user_list()
    
    history = await asyncio.to_thread(database.get_chat_history, username, target_chat)
    await websocket.send_text(json.dumps({"type": "history", "target": target_chat, "data": history}))

async def handle_typing(manager, data, username, websocket):
    receiver = data.get("receiver", "Public")
    payload = {"type": "typing", "sender": username, "receiver": receiver}
    if receiver == "Public":
        for user, conn in manager.active_connections.items():
            if user != username:
                try: await conn.send_text(json.dumps(payload))
                except: pass
    else:
        await manager.send_personal_message(payload, receiver)

async def handle_chat(manager, data, username, websocket):
    content = data.get("content")
    receiver = data.get("receiver", "Public")
    current_pic = data.get("pic", "")
    
    if content.startswith("data:image/"):
        upload_result = await asyncio.to_thread(cloudinary.uploader.upload, content)
        content = upload_result.get("secure_url")
        
    ts = await asyncio.to_thread(database.save_message, username, receiver, current_pic, content)
    
    payload = {
        "type": "chat", "sender": username, "receiver": receiver, 
        "profile_pic": current_pic, "content": content, "timestamp": ts
    }
    
    # Pass through standard features
    if "reply_to_id" in data:
        payload["reply_to"] = True
        payload["reply_to_id"] = data["reply_to_id"]
        payload["reply_to_name"] = data["reply_to_name"]
        payload["reply_to_text"] = data["reply_to_text"]
    
    if "fileName" in data:
        payload["fileName"] = data["fileName"]
        
    if receiver == "Public":
        await manager.broadcast(payload)
    else:
        await manager.send_personal_message(payload, receiver)
        if username != receiver: 
            await manager.send_personal_message(payload, username)

async def handle_get_history(manager, data, username, websocket):
    target = data.get("target")
    hist = await asyncio.to_thread(database.get_chat_history, username, target)
    await websocket.send_text(json.dumps({"type": "history", "target": target, "data": hist}))

async def handle_update_profile(manager, data, username, websocket):
    new_pic = data.get("pic")
    await asyncio.to_thread(database.update_user, username, new_pic, "Online")
    await manager.broadcast_user_list()

def setup(manager):
    # Register core events
    manager.register_hook("client_connect", handle_connect)
    manager.register_hook("typing", handle_typing)
    manager.register_hook("chat", handle_chat)
    manager.register_hook("get_history", handle_get_history)
    manager.register_hook("update_profile", handle_update_profile)
