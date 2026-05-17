import json
import asyncio

async def route_call_signal(manager, data, username, websocket):
    # Get who we are trying to call
    receiver = data.get("receiver")
    
    # We can only call specific users, not the Public Lobby
    if receiver and receiver != "Public":
        # Make sure the receiver knows who the call is from
        data["sender"] = username 
        
        # Forward the exact WebRTC signal to the receiver
        await manager.send_personal_message(data, receiver)

def setup(manager):
    # Tell the engine to listen for these specific call events and forward them
    manager.register_hook("call_offer", route_call_signal)
    manager.register_hook("call_answer", route_call_signal)
    manager.register_hook("ice_candidate", route_call_signal)
    manager.register_hook("call_end", route_call_signal)
    print("✅ Loaded Backend Plugin: call_router.py")