/* ==========================================
   1. GLOBAL STATE & CONFIG
   ========================================== */
let ws;
let myUsername = localStorage.getItem("chat_username");
let myPicBase64 = localStorage.getItem("chat_pic") || "/static/IC.png";
let currentChat = "Public";
let userProfiles = {};

// WebRTC State
let peerConnection;
let localStream;
let activeCallUser = null;
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// Sounds
const chatSound = document.getElementById("chatSound");
const ringSound = document.getElementById("ringSound");
const dialSound = document.getElementById("dialSound");

/* ==========================================
   2. WEBSOCKET CORE ENGINE
   ========================================== */
function startApp() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-container").style.display = "flex";

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${protocol}://${window.location.host}/ws/${myUsername}`);

    ws.onopen = () => {
        ws.send(JSON.stringify({ pic: myPicBase64 }));
        // Initialize Plugins here if needed
        if (window.reactions) window.reactions = new IdlyCallReactions(ws, myUsername);
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case "chat":
                handleIncomingChatMessage(data);
                break;
            case "history":
                renderHistory(data.data);
                break;
            case "user_list":
                updateSidebar(data.data);
                break;
            case "call_offer":
                handleIncomingCall(data);
                break;
            case "call_answer":
                peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                break;
            case "ice_candidate":
                peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                break;
            case "call_end":
                forceEndCall();
                break;
            case "reaction":
                if (window.IdlyCallReactions) IdlyCallReactions.updateUI(data);
                break;
        }
    };
}

/* ==========================================
   3. MESSAGING LOGIC
   ========================================== */
function sendMyMessage() {
    const input = document.getElementById("msg-input");
    const val = input.value.trim();
    if (ws && val) {
        ws.send(JSON.stringify({
            type: "chat",
            msg_id: Date.now().toString(),
            receiver: currentChat,
            message: val
        }));
        input.value = '';
    }
}

function handleIncomingChatMessage(data) {
    if (data.sender !== myUsername) {
        chatSound.play().catch(() => {});
    }
    // Only draw if we are currently looking at that chat
    if (data.receiver === currentChat || (data.sender === currentChat && data.receiver === myUsername)) {
        drawMessage(data.message, data.sender, data.profile_pic, data.timestamp);
    }
}

function drawMessage(text, sender, pic, time) {
    const stream = document.getElementById('chat-stream');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message';
    
    const isImage = text.includes("res.cloudinary.com") || text.startsWith("data:image/");
    const content = isImage 
        ? `<img src="${text}" class="msg-image-attachment" onclick="window.open(this.src, '_blank')">` 
        : `<div class="msg-content">${text}</div>`;

    msgDiv.innerHTML = `
        <img src="${pic || '/static/IC.png'}" class="msg-avatar">
        <div>
            <div class="msg-header">
                <span class="msg-sender">${sender}</span>
                <span class="msg-time">${time || ''}</span>
            </div>
            ${content}
        </div>
    `;
    stream.appendChild(msgDiv);
    stream.scrollTop = stream.scrollHeight;
}

/* ==========================================
   4. WEBRTC CALLING ENGINE
   ========================================== */
async function startCall(videoEnabled) {
    activeCallUser = currentChat;
    document.getElementById("call-interface").style.display = "flex";
    dialSound.play().catch(() => {});

    localStream = await navigator.mediaDevices.getUserMedia({ 
        video: videoEnabled ? { width: 1280, height: 720 } : false, 
        audio: true 
    });
    document.getElementById("localVideo").srcObject = localStream;

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (e) => {
        document.getElementById("remoteVideo").srcObject = e.streams[0];
        dialSound.pause();
    };

    peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
            ws.send(JSON.stringify({ type: "ice_candidate", target: activeCallUser, candidate: e.candidate }));
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "call_offer", target: activeCallUser, sdp: offer, video: videoEnabled }));
}

function forceEndCall() {
    dialSound.pause();
    ringSound.pause();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (peerConnection) peerConnection.close();
    document.getElementById("call-interface").style.display = "none";
}

function endCallBtnClicked() {
    ws.send(JSON.stringify({ type: "call_end", target: activeCallUser }));
    forceEndCall();
}

/* ==========================================
   5. HELPERS & UI
   ========================================== */
function updateSidebar(users) {
    const container = document.getElementById('user-list-container');
    container.innerHTML = users.map(u => `
        <div class="user-item ${currentChat === u.username ? 'active' : ''}" onclick="switchChat('${u.username}')">
            <img src="${u.profile_pic || '/static/IC.png'}">
            <span>${u.username}</span>
            <div class="status-dot ${u.status === 'Online' ? 'online' : 'offline'}"></div>
        </div>
    `).join('');
}

function switchChat(target) {
    currentChat = target;
    document.getElementById("chatHeaderTitle").innerText = target;
    document.getElementById("call-buttons-container").style.display = target === "Public" ? "none" : "flex";
    document.getElementById("chat-stream").innerHTML = "";
    ws.send(JSON.stringify({ type: "get_history", target: target }));
}

function renderHistory(messages) {
    document.getElementById("chat-stream").innerHTML = "";
    messages.forEach(m => drawMessage(m.message, m.sender, m.profile_pic, m.timestamp));
}

// Global Event Listeners
document.getElementById("msg-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMyMessage();
});