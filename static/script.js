/**
 * ============================================================
 * IdlyCall Pro v2.1 - Complete Application JavaScript
 * ============================================================
 * 
 * Features:
 * ✅ Real-time WebSocket Chat
 * ✅ WebRTC Voice & Video Calling
 * ✅ Screen Sharing (Desktop browsers)
 * ✅ Fullscreen Mode (Desktop + Mobile)
 * ✅ Mobile Responsive UI
 * ✅ Force End Call (Emergency Exit - BULLETPROOF)
 * 
 * File: /static/script.js
 * Dependencies: None (vanilla JS)
 * Browser Support: Chrome, Firefox, Safari, Edge (modern versions)
 */

// ============================================================
// SECTION 1: GLOBAL STATE MANAGEMENT
// ============================================================

const AppState = {
    // WebSocket
    ws: null,
    
    // User Identity
    myUsername: localStorage.getItem("chat_username") || "",
    myPicBase64: localStorage.getItem("chat_pic") || "",
    
    // Current Context
    currentChat: "Public",
    
    // WebRTC
    peerConnection: null,
    localStream: null,
    screenStream: null,
    remoteStream: null,
    
    // Call Status Flags
    callActive: false,
    isVideoCall: false,
    isMuted: false,
    isCameraOff: false,
    isScreenSharing: false,
    isFullscreen: false,
    
    // Incoming Call Data
    incomingCallData: null,
    
    // Timers
    callTimerInterval: null,
    callSeconds: 0,
    callTimeout: null
};

// WebRTC Configuration
const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
};

// Default Avatar
const DEFAULT_AVATAR = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';

// ============================================================
// SECTION 2: DOM UTILITY HELPERS
// ============================================================

const $ = (sel) => document.querySelector(sel);

function getElement(id) {
    try {
        return document.getElementById(id);
    } catch (e) {
        console.error(`[DOM] Error getting #${id}:`, e);
        return null;
    }
}

function setDisplay(id, value) {
    const el = getElement(id);
    if (el) el.style.display = value;
}

function safeSend(socket, data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        try {
            socket.send(JSON.stringify(data));
            return true;
        } catch (e) {
            console.error("[WS] Send error:", e);
            return false;
        }
    }
    return false;
}

// ============================================================
// SECTION 3: IMAGE PROCESSING
// ============================================================

function processImage(event, targetId) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert('Image too large (max 5MB)');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(ev) {
        const el = getElement(targetId);
        if (el) el.src = ev.target.result;
        AppState.myPicBase64 = ev.target.result;
        localStorage.setItem("chat_pic", ev.target.result);
    };
    reader.readAsDataURL(file);
}

// ============================================================
// SECTION 4: AUTHENTICATION
// ============================================================

window.manualLogin = function() {
    const input = getElement("usernameInput");
    const name = input?.value.trim();

    if (!name) {
        input?.focus();
        input?.classList.add('shake');
        setTimeout(() => input?.classList.remove('shake'), 400);
        return;
    }

    if (name.length < 2 || name.length > 30) {
        alert('Username must be 2-30 characters');
        return;
    }

    AppState.myUsername = name;
    localStorage.setItem("chat_username", name);
    startApplication();
};

// ============================================================
// SECTION 5: APPLICATION INITIALIZATION
// ============================================================

function startApplication() {
    setDisplay("login-screen", "none");
    setDisplay("app-container", "flex");

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${proto}://${location.host}/ws/${encodeURIComponent(AppState.myUsername)}`;

    try {
        AppState.ws = new WebSocket(wsUrl);
        setupWebSocketHandlers(AppState.ws);
    } catch (err) {
        console.error("[APP] WS error:", err);
        alert('Failed to connect');
    }
}

function setupWebSocketHandlers(ws) {
    ws.onopen = () => {
        console.log("[WS] ✓ Connected");
        safeSend(ws, { pic: AppState.myPicBase64 });
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            routeMessage(data);
        } catch (e) {
            console.error("[WS] Parse error:", e);
        }
    };

    ws.onclose = (e) => {
        console.log(`[WS] Disconnected: ${e.code}`);
        if (e.code !== 1000 && AppState.myUsername) {
            setTimeout(() => {
                if (getElement("app-container")?.style.display !== "none") {
                    startApplication();
                }
            }, 3000);
        }
    };

    ws.onerror = (err) => console.error("[WS] Error:", err);
}

function routeMessage(data) {
    switch (data.type) {
        case "chat":
            handleChatMessage(data);
            break;
        case "user_list":
            renderUserList(data.data);
            break;
        case "history":
            loadHistory(data.messages);
            break;
        case "incoming_call":
            handleIncomingCall(data);
            break;
        case "call_accepted":
            handleCallAccepted(data);
            break;
        case "call_declined":
            handleCallDeclined(data);
            break;
        case "offer":
            handleOffer(data);
            break;
        case "answer":
            handleAnswer(data);
            break;
        case "ice_candidate":
            handleICECandidate(data);
            break;
        case "call_ended":
        case "call_end":
            handleRemoteEndCall(data);
            break;
        default:
            console.log("[WS] Unknown:", data.type);
    }
}

// ============================================================
// SECTION 6: SOUND UTILITIES
// ============================================================

function playNotificationSound() {
    $("#chatSound")?.play().catch(() => {});
}

function playRingtone() {
    const audio = $("#ringtone");
    if (audio) {
        audio.currentTime = 0;
        audio.loop = true;
        audio.play().catch(() => {});
    }
}

function stopRingtime() {
    const audio = $("#ringtone");
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.loop = false;
    }
}

// ============================================================
// SECTION 7: SANITIZATION
// ============================================================

function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
// SECTION 8: MESSAGE RENDERING
// ============================================================

function renderMessage(text, sender, pic, time) {
    const container = $("#chat-stream");
    if (!container) return;

    const frag = document.createDocumentFragment();
    const div = document.createElement("div");
    div.className = "message";
    div.innerHTML = `
        <img class="msg-avatar" src="${pic || DEFAULT_AVATAR}" loading="lazy">
        <div class="msg-body">
            <div class="msg-meta">
                <span class="msg-sender">${escapeHTML(sender)}</span>
                <span class="msg-time">${escapeHTML(time || '')}</span>
            </div>
            <div class="msg-content">${escapeHTML(text)}</div>
        </div>
    `;
    frag.appendChild(div);
    container.appendChild(frag);

    requestAnimationFrame(() => {
        if (container.scrollHeight - container.scrollTop - container.clientHeight < 150) {
            container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        }
    });
}

function handleChatMessage(data) {
    if (data.sender !== AppState.myUsername) playNotificationSound();
    renderMessage(data.message, data.sender, data.profile_pic, data.timestamp);
}

// ============================================================
// SECTION 9: USER LIST
// ============================================================

function renderUserList(users) {
    const container = $("#user-list-container");
    if (!container) return;

    const arr = Array.isArray(users) ? users : (users.data || []);

    if (!arr.length) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:16px;text-align:center;font-size:13px;">No users online</p>';
        return;
    }

    container.innerHTML = arr.map(u => `
        <div class="user-item" onclick="switchToChat('${escapeHTML(u.username)}')">
            <img src="${u.profile_pic || DEFAULT_AVATAR}" loading="lazy" width="36" height="36" style="border-radius:50%;margin-right:10px;">
            <span>${escapeHTML(u.username)}</span>
        </div>
    `).join("");
}

function loadHistory(messages) {
    if (Array.isArray(messages)) {
        messages.forEach(m => renderMessage(m.message || m.text, m.sender || m.username, m.profile_pic || m.pic, m.timestamp || m.time));
    }
}

// ============================================================
// SECTION 10: CHAT SWITCHING
// ============================================================

window.switchToChat = function(target) {
    if (!target) return;
    AppState.currentChat = target;
    
    const title = $("#chatHeaderTitle");
    if (title) title.textContent = target;

    const stream = $("#chat-stream");
    if (stream) stream.innerHTML = '';

    safeSend(AppState.ws, { type: "get_history", target });
    closeMobileSidebar();
};
window.switchChat = window.switchToChat;

// ============================================================
// SECTION 11: SEND MESSAGE
// ============================================================

window.sendMyMessage = function() {
    const input = $("#msg-input");
    const text = input?.value.trim();

    if (!text) return;
    if (!AppState.ws || AppState.ws.readyState !== WebSocket.OPEN) {
        alert('Not connected');
        return;
    }

    safeSend(AppState.ws, { type: "chat", receiver: AppState.currentChat, message: text });
    input.value = '';
    input.focus();
};

// ============================================================
// SECTION 12: MOBILE SIDEBAR
// ============================================================

window.toggleMobileSidebar = function() {
    const sidebar = $("#sidebar");
    if (!sidebar) return;
    
    const isOpen = sidebar.classList.contains("open");
    sidebar.classList.toggle("open");

    if (window.innerWidth <= 768) {
        document.body.style.overflow = isOpen ? "" : "hidden";
    }
};

function closeMobileSidebar() {
    const sidebar = $("#sidebar");
    if (sidebar && window.innerWidth <= 768 && sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
        document.body.style.overflow = "";
    }
}

// ============================================================
// SECTION 13: WEBCRT CALLING SYSTEM
// ============================================================

async function startCall(isVideo) {
    if (!AppState.currentChat || AppState.currentChat === "Public") {
        alert("Select a private chat first");
        return;
    }

    if (AppState.callActive) {
        alert("Already in a call");
        return;
    }

    AppState.isVideoCall = isVideo;

    try {
        AppState.localStream = await navigator.mediaDevices.getUserMedia({
            video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        showCallInterface(AppState.currentChat, null);
        createPeerConnection();

        AppState.localStream.getTracks().forEach(track => {
            if (AppState.peerConnection) AppState.peerConnection.addTrack(track, AppState.localStream);
        });

        updateLocalVideoPreview();
        updateCallStatus("Calling...");

        safeSend(AppState.ws, {
            type: "start_call",
            target: AppState.currentChat,
            is_video: isVideo,
            caller_name: AppState.myUsername,
            caller_pic: AppState.myPicBase64
        });

        AppState.callTimeout = setTimeout(() => {
            if (AppState.callActive && $("#callStatus")?.textContent === "Calling...") {
                window.forceEndCall();
                alert("No answer");
            }
        }, 30000);

    } catch (err) {
        console.error("[CALL] Media error:", err);
        alert(`Could not access ${isVideo ? 'camera/mic' : 'microphone'}.\nCheck permissions.`);
        cleanupPartialCall();
    }
}

function cleanupPartialCall() {
    if (AppState.localStream) {
        AppState.localStream.getTracks().forEach(t => t.stop());
        AppState.localStream = null;
    }
    hideCallInterface();
}

// ============================================================
// SECTION 14: INCOMING CALL HANDLING
// ============================================================

function handleIncomingCall(data) {
    AppState.incomingCallData = data;

    $("#caller-avatar").src = data.caller_pic || DEFAULT_AVATAR;
    $("#caller-name").textContent = data.caller_name || "Unknown";
    $("#call-type-label").textContent = data.is_video ? "Video Call" : "Voice Call";

    setDisplay("ringing-modal", "flex");
    playRingtone();
}

async function acceptCall() {
    if (!AppState.incomingCallData) return;

    stopRingtime();
    setDisplay("ringing-modal", "none");

    AppState.isVideoCall = AppState.incomingCallData.is_video || false;

    try {
        AppState.localStream = await navigator.mediaDevices.getUserMedia({
            video: AppState.isVideoCall ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
            audio: { echoCancellation: true, noiseSuppression: true }
        });

        showCallInterface(AppState.incomingCallData.caller_name, AppState.incomingCallData.caller_pic);
        createPeerConnection();

        AppState.localStream.getTracks().forEach(track => {
            if (AppState.peerConnection) AppState.peerConnection.addTrack(track, AppState.localStream);
        });

        updateLocalVideoPreview();
        safeSend(AppState.ws, { type: "accept_call", target: AppState.incomingCallData.caller });
        updateCallStatus("Connecting...");

    } catch (err) {
        console.error("[ACCEPT] Error:", err);
        declineCall();
    }
}

function declineCall() {
    stopRingtime();
    setDisplay("ringing-modal", "none");

    if (AppState.incomingCallData && AppState.ws) {
        safeSend(AppState.ws, { type: "decline_call", target: AppState.incomingCallData.caller });
    }
    AppState.incomingCallData = null;
}

window.acceptCall = acceptCall;
window.declineCall = declineCall;

// ============================================================
// SECTION 15: WEBRTC SIGNALING HANDLERS
// ============================================================

async function handleCallAccepted(data) {
    if (AppState.callTimeout) { clearTimeout(AppState.callTimeout); AppState.callTimeout = null; }

    if (AppState.peerConnection) {
        try {
            const offer = await AppState.peerConnection.createOffer();
            await AppState.peerConnection.setLocalDescription(offer);
            safeSend(AppState.ws, { type: "offer", target: data.accepted_by || AppState.currentChat, offer });
            updateCallStatus("Ringing...");
        } catch (e) { console.error("[OFFER] Error:", e); }
    }
}

function handleCallDeclined(data) {
    if (AppState.callTimeout) { clearTimeout(AppState.callTimeout); AppState.callTimeout = null; }
    alert("Call declined");
    window.forceEndCall();
}

async function handleOffer(data) {
    if (!AppState.peerConnection) createPeerConnection();

    try {
        await AppState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await AppState.peerConnection.createAnswer();
        await AppState.peerConnection.setLocalDescription(answer);
        safeSend(AppState.ws, { type: "answer", target: data.from || AppState.currentChat, answer });
    } catch (e) { console.error("[OFFER-HANDLE] Error:", e); }
}

async function handleAnswer(data) {
    if (AppState.peerConnection) {
        try {
            await AppState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (e) { console.error("[ANSWER] Error:", e); }
    }
}

async function handleICECandidate(data) {
    if (data.candidate && AppState.peerConnection) {
        try {
            await AppState.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) { console.error("[ICE] Error:", e); }
    }
}

function handleRemoteEndCall(data) {
    showErrorMessage(`${data.ended_by || 'User'} ended the call`);
    window.forceEndCall();
}

// ============================================================
// SECTION 16: PEER CONNECTION
// ============================================================

function createPeerConnection() {
    console.log("[RTC] Creating peer connection...");
    AppState.peerConnection = new RTCPeerConnection(RTC_CONFIG);

    AppState.peerConnection.ontrack = (event) => {
        console.log("[RTC] Remote track received:", event.track.kind);
        AppState.remoteStream = event.streams[0];

        const remoteVideo = $("#remoteVideo");
        const noRemoteVideo = $("#noRemoteVideo");

        if (remoteVideo) { remoteVideo.srcObject = AppState.remoteVideo; remoteVideo.style.display = "block"; }
        if (noRemoteVideo) noRemoteVideo.style.display = "none";

        updateCallStatus("Connected");
        startCallTimer();
    };

    AppState.peerConnection.onicecandidate = (event) => {
        if (event.candidate && AppState.ws) {
            safeSend(AppState.ws, { type: "ice_candidate", target: AppState.currentChat, candidate: event.candidate });
        }
    };

    AppState.peerConnection.onconnectionstatechange = () => {
        const state = AppState.peerConnection.connectionState;
        console.log("[RTC] State:", state);

        switch (state) {
            case "connected": updateCallStatus("Connected"); startCallTimer(); break;
            case "disconnected": updateCallStatus("Reconnecting..."); break;
            case "failed": updateCallStatus("Failed"); break;
            case "closed": console.log("[RTC] Closed"); break;
        }
    };

    console.log("[RTC] ✓ Peer connection created");
}

// ============================================================
// SECTION 17: CALL INTERFACE VISIBILITY
// ============================================================

function showCallInterface(remoteName, remotePic) {
    AppState.callActive = true;
    AppState.callSeconds = 0;

    // ✅ CRITICAL: Set display to flex
    const overlay = $("#call-interface");
    if (overlay) overlay.style.display = "flex";

    $("#remoteUserName").textContent = remoteName || "User";
    $("#remoteUserAvatar").src = remotePic || DEFAULT_AVATAR;

    resetAllControls();

    // Setup video elements
    const isVideo = AppState.isVideoCall;
    $("#remoteVideo").style.display = isVideo ? "block" : "none";
    $("#noRemoteVideo").style.display = "flex";
    $("#localPip").style.display = isVideo ? "block" : "none";
}

function hideCallInterface() {
    const overlay = $("#call-interface");
    if (overlay) overlay.style.display = "none";
}

function updateCallStatus(status) {
    const el = $("#callStatus");
    if (el) el.textContent = status;
}

// ============================================================
// SECTION 18: ⭐⭐⭐ FORCE END CALL ⭐⭐⭐
// THE FIX - Bulletproof emergency exit function
// ============================================================

/**
 * ══════════════════════════════════════════════════════
 * FORCE END CALL - Emergency Exit Function
 * ══════════════════════════════════════════════════════
 * 
 * GUARANTEES user can exit call screen NO MATTER WHAT.
 * 
 * Handles:
 * ✅ Hides call interface (returns to chat)
 * ✅ Stops ALL media tracks (turns off camera LED)
 * ✅ Sends end signal via WebSocket
 * ✅ Closes peer connection
 * ✅ Stops ringtone sounds
 * ✅ Exits fullscreen mode
 * ✅ Resets ALL state variables
 * ✅ Won't crash even if things are already null
 * 
 * Safe to call multiple times - idempotent.
 * 
 * Usage: onclick="window.forceEndCall()"
 */
window.forceEndCall = function() {

    console.log("════════════════════════════════════════");
    console.log("[FORCE-END] Executing emergency exit...");
    console.log("════════════════════════════════════════");

    // STEP 1: Hide call interface
    try {
        const overlay = getElement('call-interface');
        if (overlay) overlay.style.display = 'none';
        console.log("[FORCE-END] ✓ Interface hidden");
    } catch (e) { console.error("[FORCE-END] Step 1 error:", e.message); }

    // Also hide ringing modal
    try {
        const modal = getElement('ringing-modal');
        if (modal) modal.style.display = 'none';
    } catch (e) {}

    // STEP 2: Stop local media tracks (camera + mic)
    // Wrapped in try-catch for safety
    try {
        if (AppState.localStream) {
            const tracks = AppState.localStream.getTracks();
            tracks.forEach((track, i) => {
                console.log(`[FORCE-END] Stopping track ${i}: ${track.kind}`);
                if (track.stop) track.stop();
                track.enabled = false;
            });
            AppState.localStream = null;
            console.log("[FORCE-END] ✓ Local media stopped");
        }
    } catch (e) {
        console.error("[FORCE-END] Step 2 error:", e.message);
        AppState.localStream = null; // Force null anyway
    }

    // STEP 3: Stop screen share if active
    try {
        if (AppState.screenStream) {
            AppState.screenStream.getTracks().forEach(t => { if(t.stop) t.stop(); t.enabled = false; });
            AppState.screenStream = null;
            AppState.isScreenSharing = false;
            console.log("[FORCE-END] ✓ Screen share stopped");
        }
    } catch (e) {
        AppState.screenStream = null;
        AppState.isScreenSharing = false;
    }

    // STEP 4: Send end signal via WebSocket
    try {
        if (AppState.ws && AppState.ws.readyState === WebSocket.OPEN && AppState.callActive) {
            safeSend(AppState.ws, {
                type: "call_end",
                target: AppState.currentChat,
                ended_by: AppState.myUsername,
                timestamp: new Date().toISOString()
            });
            console.log("[FORCE-END] ✓ End signal sent");
        }
    } catch (e) { console.error("[FORCE-END] Step 4 error:", e.message); }

    // STEP 5: Close peer connection
    try {
        if (AppState.peerConnection) {
            AppState.peerConnection.close();
            AppState.peerConnection = null;
        }
        AppState.remoteStream = null;
        console.log("[FORCE-END] ✓ Peer connection closed");
    } catch (e) {
        AppState.peerConnection = null;
        AppState.remoteStream = null;
    }

    // STEP 6: Stop ringtone
    try { stopRingtime(); console.log("[FORCE-END] ✓ Ringtone stopped"); } catch (e) {}

    // STEP 7: Exit fullscreen
    try {
        if (AppState.isFullscreen || document.fullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            else if (document.msExitFullscreen) document.msExitFullscreen();
            AppState.isFullscreen = false;
            console.log("[FORCE-END] ✓ Exited fullscreen");
        }
    } catch (e) { AppState.isFullscreen = false; }

    // STEP 8: Clear video sources
    try {
        const localVid = getElement('localVideo');
        const remoteVid = getElement('remoteVideo');
        if (localVid) localVid.srcObject = null;
        if (remoteVid) remoteVid.srcObject = null;
        console.log("[FORCE-END] ✓ Video sources cleared");
    } catch (e) {}

    // STEP 9: Reset ALL state variables
    AppState.callActive = false;
    AppState.isMuted = false;
    AppState.isCameraOff = false;
    AppState.isScreenSharing = false;
    AppState.incomingCallData = null;

    if (AppState.callTimeout) { clearTimeout(AppState.callTimeout); AppState.callTimeout = null; }
    if (AppState.callTimerInterval) { clearInterval(AppState.callTimerInterval); AppState.callTimerInterval = null; }
    AppState.callSeconds = 0;

    console.log("[FORCE-END] ✓ All state reset");

    // STEP 10: Reset control buttons
    try { resetAllControls(); } catch (e) {}

    // FINAL: Success confirmation
    console.log("════════════════════════════════════════");
    console.log("%c✅ [FORCE-END] SUCCESS! User returned to chat.", "color:#22c55e;font-weight:bold;font-size:14px;");
    console.log("════════════════════════════════════════");
};

/**
 * Reset control button visual states
 */
function resetAllControls() {
    try {
        // Mute
        $("#btnMute")?.classList.remove('active');
        $("#micOn")?.style?.removeProperty('display');
        $("#micOff")?.style?.setProperty('display', 'none');

        // Camera
        $("#btnCamera")?.classList.remove('active');
        $("#camOn")?.style?.removeProperty('display');
        $("#camOff")?.style?.setProperty('display', 'none');

        // Screen
        $("#btnScreen")?.classList.remove('active');
        $("#screenOn")?.style?.removeProperty('display');
        $("#screenOff")?.style?.setProperty('display', 'none');

        // Timer
        const timer = $("#callTimer");
        if (timer) timer.textContent = '00:00';

        // Status
        const status = $("#callStatus");
        if (status) status.textContent = 'Connecting...';

        // Fullscreen icons
        $("#fsIconEnter")?.style?.removeProperty('display');
        $("#fsIconExit")?.style?.setProperty('display', 'none');
        AppState.isFullscreen = false;

    } catch (e) { console.error("[RESET] Error:", e); }
}

// Backward compatibility
window.endCall = window.forceEndCall;

// ============================================================
// SECTION 19: CALL CONTROLS (Mute/Camera)
// ============================================================

window.toggleMute = function() {
    if (!AppState.localStream) return;

    AppState.isMuted = !AppState.isMuted;
    AppState.localStream.getAudioTracks().forEach(t => t.enabled = !AppState.isMuted);

    $("#btnMute")?.classList.toggle('active', AppState.isMuted);
    $("#micOn")?.style?.setProperty('display', AppState.isMuted ? 'none' : 'block');
    $("#micOff")?.style?.setProperty('display', AppState.isMuted ? 'block' : 'none');
};

window.toggleCamera = function() {
    if (!AppState.localStream || !AppState.isVideoCall) return;

    AppState.isCameraOff = !AppState.isCameraOff;
    AppState.localStream.getVideoTracks().forEach(t => t.enabled = !AppState.isCameraOff);

    updateLocalVideoPreview();

    $("#btnCamera")?.classList.toggle('active', AppState.isCameraOff);
    $("#camOn")?.style?.setProperty('display', AppState.isCameraOff ? 'none' : 'block');
    $("#camOff")?.style?.setProperty('display', AppState.isCameraOff ? 'block' : 'none');
};

function updateLocalVideoPreview() {
    const localVid = $("#localVideo");
    const noLocalVid = $("#noLocalVideo");
    const pip = $("#localPip");

    if (AppState.isVideoCall && !AppState.isCameraOff) {
        if (localVid) localVid.style.display = 'block';
        if (noLocalVid) noLocalVid.style.display = 'none';
        if (pip) pip.style.display = 'block';
    } else if (AppState.isVideoCall && AppState.isCameraOff) {
        if (localVid) localVid.style.display = 'none';
        if (noLocalVid) noLocalVid.style.display = 'flex';
        if (pip) pip.style.display = 'block';
    } else {
        if (pip) pip.style.display = 'none';
    }
}

// ============================================================
// SECTION 20: SCREEN SHARING
// ============================================================

window.toggleScreenShare = async function() {
    if (!AppState.callActive || !AppState.peerConnection) {
        alert("Not in an active call");
        return;
    }

    if (AppState.isScreenSharing) {
        stopScreenShareInternal();
        return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
        alert("Browser doesn't support screen sharing");
        return;
    }

    try {
        AppState.screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },
            audio: false
        });

        AppState.screenStream.getVideoTracks()[0].onended = stopScreenShareInternal;

        const sender = AppState.peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(AppState.screenStream.getVideoTracks()[0]);

        AppState.isScreenSharing = true;

        $("#btnScreen")?.classList.add('active');
        $("#screenOn")?.style?.setProperty('display', 'none');
        $("#screenOff")?.style?.setProperty('display', 'block');

        const localVid = $("#localVideo");
        if (localVid) localVid.srcObject = AppState.screenStream;

        console.log("[SCREEN] Sharing started");

    } catch (err) {
        console.error("[SCREEN] Error:", err);
        if (err.name === 'NotAllowedError') alert("Screen sharing denied");
        else if (err.name === 'NotFoundError') alert("No screen source available");
        else alert("Screen sharing error: " + err.message);
    }
};

function stopScreenShareInternal() {
    try {
        if (AppState.screenStream) {
            AppState.screenStream.getTracks().forEach(t => { if(t.stop) t.stop(); t.enabled = false; });
            AppState.screenStream = null;
        }

        if (AppState.localStream && AppState.peerConnection) {
            const camTrack = AppState.localStream.getVideoTracks()[0];
            const sender = AppState.peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender && camTrack) sender.replaceTrack(camTrack);

            const localVid = $("#localVideo");
            if (localVid) localVid.srcObject = AppState.localStream;
        }

        AppState.isScreenSharing = false;

        $("#btnScreen")?.classList.remove('active');
        $("#screenOn")?.style?.removeProperty('display');
        $("#screenOff")?.style?.setProperty('display', 'none');

        console.log("[SCREEN] Sharing stopped");
    } catch (e) {
        AppState.screenStream = null;
        AppState.isScreenSharing = false;
    }
}

// ============================================================
// SECTION 21: FULLSCREEN MODE
// ============================================================

window.toggleFullscreen = function() {
    if (!document.fullscreenElement) enterFullscreen();
    else exitFullscreen();
};

function enterFullscreen() {
    const el = $("#call-interface");
    if (!el) return;

    const method = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen || el.mozRequestFullScreen || el.webkitEnterFullscreen;

    if (method) {
        method.call(el).then(() => {
            AppState.isFullscreen = true;
            updateFSIcon(true);
        }).catch(() => alert("Could not enter fullscreen"));
    }
}

function exitFullscreen() {
    const method = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen || document.mozCancelFullScreen;

    if (method) {
        method.call(document).then(() => {
            AppState.isFullscreen = false;
            updateFSIcon(false);
        }).catch(() => {});
    }
}

function updateFSIcon(fs) {
    $("#fsIconEnter")?.style?.setProperty('display', fs ? 'none' : 'block');
    $("#fsIconExit")?.style?.setProperty('display', fs ? 'block' : 'none');
}

// Listen for fullscreen changes
['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
    document.addEventListener(evt, () => {
        AppState.isFullscreen = !!document.fullscreenElement;
        updateFSIcon(AppState.isFullscreen);
    });
});

// ============================================================
// SECTION 22: CALL TIMER
// ============================================================

function startCallTimer() {
    stopCallTimer();
    AppState.callSeconds = 0;
    updateTimerDisplay();
    AppState.callTimerInterval = setInterval(() => {
        AppState.callSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function stopCallTimer() {
    if (AppState.callTimerInterval) {
        clearInterval(AppState.callTimerInterval);
        AppState.callTimerInterval = null;
    }
}

function updateTimerDisplay() {
    const mins = String(Math.floor(AppState.callSeconds / 60)).padStart(2, '0');
    const secs = String(AppState.callSeconds % 60).padStart(2, '0');
    const el = $("#callTimer");
    if (el) el.textContent = `${mins}:${secs}`;
}

// ============================================================
// SECTION 23: EVENT LISTENERS
// ============================================================

document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase();

    if (e.key === 'Enter' && tag === 'input' && document.activeElement.id === 'msg-input') {
        e.preventDefault();
        window.sendMyMessage();
    }

    if (e.key === 'Escape' && AppState.callActive) {
        if (AppState.isFullscreen) exitFullscreen();
        else window.forceEndCall();
    }

    if ((e.key === 'f' || e.key === 'F') && AppState.callActive && tag !== 'input') {
        e.preventDefault();
        toggleFullscreen();
    }
});

document.addEventListener('click', (e) => {
    if (window.innerWidth > 768) return;
    const sidebar = $("#sidebar");
    const menuBtn = $(".mobile-menu");
    if (sidebar?.classList.contains("open") && !sidebar.contains(e.target) && menuBtn && !menuBtn.contains(e.target)) {
        closeMobileSidebar();
    }
});

window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
        document.body.style.overflow = "";
        $("#sidebar")?.classList.remove("open");
    }
});

window.addEventListener('beforeunload', () => {
    if (AppState.callActive) {
        try { safeSend(AppState.ws, { type: "call_end", target: AppState.currentChat }); } catch(e) {}
        if (AppState.localStream) AppState.localStream.getTracks().forEach(t => t.stop());
        if (AppState.screenStream) AppState.screenStream.getTracks().forEach(t => t.stop());
    }
    if (AppState.ws) AppState.ws.close(1000);
});

// Prevent zoom on double-tap (iOS)
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
}, { passive: false });

// ============================================================
// SECTION 24: INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log("%c🔥 IdlyCall Pro v2.1 Loaded", "color:#FF7A00;font-weight:bold;font-size:16px;");
    console.log("%c📞 Calls | 🖥️ Screenshare | ⌨️ ESC=End, F=Fullscreen", "color:#9ca3af;font-size:11px;");

    // Focus username input on login screen
    if ($("#login-screen")?.style.display !== "none") {
        setTimeout(() => $("#usernameInput")?.focus(), 500);
    }

    // Inject shake animation if not present
    if (!$("#shake-style")) {
        const style = document.createElement('style');
        style.id = "shake-style";
        style.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}.shake{animation:shake 0.4s ease}`;
        document.head.appendChild(style);
    }
});