/**
 * IdlyCall Pro - Core Application Script
 * Chat + WebRTC Voice/Video Calling
 * High-performance WebSocket client with full call management
 */

// ==========================================
// STATE MANAGEMENT
// ==========================================
let ws = null;
let myUsername = localStorage.getItem("chat_username") || "";
let myPicBase64 = localStorage.getItem("chat_pic") || "";
let currentChat = "Public";

// WebRTC State
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let callActive = false;
let isVideoCall = false;
let isMuted = false;
let isCameraOff = false;
let incomingCallData = null;
let callTimerInterval = null;
let callSeconds = 0;

// ICE Servers (public STUN/TURN)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Default avatar
const DEFAULT_AVATAR = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';

// DOM Cache
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ==========================================
// IMAGE PROCESSING
// ==========================================
function processImage(e, targetId) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(ev) {
        const el = $(`#${targetId}`);
        if (el) el.src = ev.target.result;
        myPicBase64 = ev.target.result;
    };
    reader.readAsDataURL(file);
}

// ==========================================
// AUTHENTICATION
// ==========================================
window.manualLogin = function() {
    const input = $("#usernameInput");
    const name = input?.value.trim();

    if (!name) {
        input?.focus();
        input?.classList.add('shake');
        setTimeout(() => input?.classList.remove('shake'), 500);
        return;
    }

    myUsername = name;
    localStorage.setItem("chat_username", name);
    startApp();
};

// ==========================================
// APP INITIALIZATION
// ==========================================
function startApp() {
    $("#login-screen").style.display = "none";
    $("#app-container").style.display = "flex";

    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/${encodeURIComponent(myUsername)}`);

    ws.onopen = () => {
        console.log("[WS] Connected");
        ws.send(JSON.stringify({ pic: myPicBase64 }));
    };

    ws.onmessage = handleWebSocketMessage;

    ws.onclose = (e) => {
        console.log("[WS] Disconnected:", e.code);
        if (e.code !== 1000 && myUsername) {
            setTimeout(() => {
                if ($("#app-container").style.display !== "none") startApp();
            }, 3000);
        }
    };

    ws.onerror = (err) => console.error("[WS] Error:", err);
}

// ==========================================
// WEBSOCKET MESSAGE HANDLER
// ==========================================
function handleWebSocketMessage(e) {
    try {
        const d = JSON.parse(e.data);

        switch (d.type) {
            case "chat":
                if (d.sender !== myUsername) playNotificationSound();
                renderMessage(d.message, d.sender, d.profile_pic, d.timestamp);
                break;

            case "user_list":
                renderUserList(d.data);
                break;

            case "history":
                if (Array.isArray(d.messages)) {
                    d.messages.forEach(m =>
                        renderMessage(m.message, m.sender, m.profile_pic, m.timestamp)
                    );
                }
                break;

            // ---- WEBRTC SIGNALING EVENTS ----
            case "incoming_call":
                handleIncomingCall(d);
                break;

            case "call_accepted":
                handleCallAccepted(d);
                break;

            case "call_declined":
                handleCallDeclined(d);
                break;

            case "ice_candidate":
                handleICECandidate(d);
                break;

            case "offer":
                handleOffer(d);
                break;

            case "answer":
                handleAnswer(d);
                break;

            case "call_ended":
                handleRemoteEndCall(d);
                break;

            default:
                console.log("[WS] Unknown type:", d.type);
        }
    } catch (err) {
        console.error("[WS] Parse error:", err);
    }
}

// ==========================================
// SOUND UTILITIES
// ==========================================
function playNotificationSound() {
    const audio = $("#chatSound");
    if (audio) audio.play().catch(() => {});
}

function playRingtone() {
    const audio = $("#ringtone");
    if (audio) audio.play().catch(() => {});
}

function stopRingtone() {
    const audio = $("#ringtone");
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }
}

// ==========================================
// SANITIZATION
// ==========================================
function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ==========================================
// MESSAGE RENDERING
// ==========================================
function renderMessage(text, sender, pic, time) {
    const container = $("#chat-stream");
    if (!container) return;

    const frag = document.createDocumentFragment();
    const msgEl = document.createElement("div");
    msgEl.className = "message";
    msgEl.innerHTML = `
        <img class="msg-avatar" src="${pic || DEFAULT_AVATAR}" alt="" loading="lazy">
        <div class="msg-body">
            <div class="msg-meta">
                <span class="msg-sender">${escapeHTML(sender)}</span>
                <span class="msg-time">${time || ""}</span>
            </div>
            <div class="msg-content">${escapeHTML(text)}</div>
        </div>
    `;
    frag.appendChild(msgEl);
    container.appendChild(frag);

    requestAnimationFrame(() => {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        if (isNearBottom) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
}

// ==========================================
// USER LIST RENDERING
// ==========================================
function renderUserList(users) {
    const container = $("#user-list-container");
    if (!container) return;

    if (!users || users.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:16px;text-align:center;font-size:13px;">No users online</p>';
        return;
    }

    container.innerHTML = users.map(u => `
        <div class="user-item" onclick="switchChat('${escapeHTML(u.username)}')">
            <img src="${u.profile_pic || DEFAULT_AVATAR}" alt="" loading="lazy">
            <span>${escapeHTML(u.username)}</span>
        </div>
    `).join("");
}

// ==========================================
// CHAT SWITCHING
// ==========================================
window.switchChat = function(target) {
    currentChat = target;
    const title = $("#chatHeaderTitle");
    if (title) title.textContent = target;

    const stream = $("#chat-stream");
    if (stream) stream.innerHTML = "";

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "get_history", target }));
    }
    closeMobileSidebar();
};

// ==========================================
// SEND MESSAGE
// ==========================================
window.sendMyMessage = function() {
    const input = $("#msg-input");
    const text = input?.value.trim();

    if (!text) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert("Not connected");
        return;
    }

    ws.send(JSON.stringify({ type: "chat", receiver: currentChat, message: text }));
    input.value = "";
    input.focus();
};

// ==========================================
// MOBILE SIDEBAR
// ==========================================
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

// ==========================================
// ==========================================
// WEBRTC CALLING SYSTEM
// ==========================================
// ==========================================

/**
 * INITIATE AN OUTGOING CALL
 * @param {boolean} isVideo - true for video call, false for voice only
 */
async function startCall(isVideo) {
    // Validate we have someone to call
    if (!currentChat || currentChat === "Public") {
        alert("Select a private chat to call");
        return;
    }

    if (callActive) {
        alert("Already in a call");
        return;
    }

    isVideoCall = isVideo;
    
    try {
        // Get local media stream
        localStream = await navigator.mediaDevices.getUserMedia({
            video: isVideo,
            audio: true
        });

        // Show call UI immediately
        showCallInterface(currentChat, null);

        // Create peer connection
        createPeerConnection();

        // Add local tracks
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Show local preview
        const localVideo = $("#local-video");
        if (localVideo) localVideo.srcObject = localStream;

        // Update UI state
        updateLocalVideoVisibility();
        $("#call-status").textContent = "Calling...";

        // Send call offer via WebSocket
        ws.send(JSON.stringify({
            type: "start_call",
            target: currentChat,
            is_video: isVideo,
            caller_name: myUsername,
            caller_pic: myPicBase64
        }));

        // Set timeout for no answer
        window.callTimeout = setTimeout(() => {
            if ($("#call-status").textContent === "Calling...") {
                endCall();
                alert("No answer");
            }
        }, 30000); // 30 second timeout

    } catch (err) {
        console.error("[CALL] Media error:", err);
        alert("Could not access camera/microphone. Check permissions.");
        endCall();
    }
}

/**
 * HANDLE INCOMING CALL
 * Shows ringing modal and plays sound
 * @param {Object} data - Call data from server
 */
function handleIncomingCall(data) {
    incomingCallData = data;
    
    // Update ringing modal with caller info
    const callerAvatar = $("#caller-avatar");
    const callerName = $("#caller-name");
    const callTypeLabel = $("#call-type-label");

    if (callerAvatar) callerAvatar.src = data.caller_pic || DEFAULT_AVATAR;
    if (callerName) callerName.textContent = data.caller_name || "Unknown";
    if (callTypeLabel) callTypeLabel.textContent = data.is_video ? "Video Call" : "Voice Call";

    // Show ringing modal
    const modal = $("#ringing-modal");
    if (modal) modal.style.display = "flex";

    // Play ringtone
    playRingtone();
}

/**
 * ACCEPT INCOMING CALL
 * Called when user clicks Accept button
 */
async function acceptCall() {
    if (!incomingCallData) return;

    stopRingtime();
    $("#ringing-modal").style.display = "none";

    isVideoCall = incomingCallData.is_video || false;

    try {
        // Get local media
        localStream = await navigator.mediaDevices.getUserMedia({
            video: isVideoCall,
            audio: true
        });

        // Show call interface
        showCallInterface(incomingCallData.caller_name, incomingCallData.caller_pic);

        // Setup peer connection
        createPeerConnection();

        // Add local tracks
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Show local video
        const localVideo = $("#local-video");
        if (localVideo) localVideo.srcObject = localStream;
        updateLocalVideoVisibility();

        // Notify server we accepted
        ws.send(JSON.stringify({
            type: "accept_call",
            target: incomingCallData.caller
        }));

        $("#call-status").textContent = "Connecting...";

    } catch (err) {
        console.error("[CALL] Accept error:", err);
        declineCall();
    }
}

/**
 * DECLINE INCOMING CALL
 */
function declineCall() {
    stopRingtime();
    $("#ringing-modal").style.display = "none";

    if (incomingCallData && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: "decline_call",
            target: incomingCallData.caller
        }));
    }

    incomingCallData = null;
}

/**
 * HANDLE CALL ACCEPTED BY REMOTE
 */
async function handleCallAccepted(data) {
    clearTimeout(window.callTimeout);
    
    // Create offer (we are the caller)
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Send offer via signaling
    ws.send(JSON.stringify({
        type: "offer",
        target: data.accepted_by || currentChat,
        offer: offer
    }));

    $("#call-status").textContent = "Ringing...";
}

/**
 * HANDLE CALL DECLINED BY REMOTE
 */
function handleCallDeclined(data) {
    clearTimeout(window.callTimeout);
    alert("Call declined");
    endCall();
}

/**
 * HANDLE OFFER FROM CALLER (when we accepted)
 */
async function handleOffer(data) {
    if (!peerConnection) createPeerConnection();

    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

    // Create answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Send answer back
    ws.send(JSON.stringify({
        type: "answer",
        target: data.from || currentChat,
        answer: answer
    }));
}

/**
 * HANDLE ANSWER FROM CALLEE
 */
async function handleAnswer(data) {
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
}

/**
 * HANDLE ICE CANDIDATE
 */
async function handleICECandidate(data) {
    if (peerConnection && data.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
}

/**
 * HANDLE REMOTE ENDING THE CALL
 */
function handleRemoteEndCall(data) {
    endCall();
    alert(data.ended_by ? `${data.ended_by} ended the call` : "Call ended");
}

// ==========================================
// PEER CONNECTION MANAGEMENT
// ==========================================

/**
 * Create RTCPeerConnection with event handlers
 */
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(iceServers);

    // Handle incoming remote stream
    peerConnection.ontrack = (event) => {
        console.log("[WEBRTC] Received remote track");
        remoteStream = event.streams[0];
        
        const remoteVideo = $("#remote-video");
        const noVideoFallback = $("#no-remote-video");
        
        if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
            remoteVideo.style.display = "block";
        }
        if (noVideoFallback) noVideoFallback.style.display = "none";

        // Call connected!
        $("#call-status").textContent = "Connected";
        startCallTimer();
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "ice_candidate",
                target: currentChat,
                candidate: event.candidate
            }));
        }
    };

    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log("[WEBRTC] State:", peerConnection.connectionState);
        
        switch (peerConnection.connectionState) {
            case "connected":
                $("#call-status").textContent = "Connected";
                startCallTimer();
                break;
            case "disconnected":
            case "failed":
                $("#call-status").textContent = "Reconnecting...";
                break;
            case "closed":
                endCall();
                break;
        }
    };
}

// ==========================================
// CALL INTERFACE UI
// ==========================================

/**
 * Show the call overlay interface
 * @param {string} remoteName - Name of person we're calling
 * @param {string} remotePic - Their avatar URL
 */
function showCallInterface(remoteName, remotePic) {
    callActive = true;
    callSeconds = 0;

    const overlay = $("#call-interface");
    if (overlay) overlay.style.display = "flex";

    // Set remote user info
    const remoteUserName = $("#remote-user-name");
    const remoteUserAvatar = $("#remote-user-avatar");
    
    if (remoteUserName) remoteUserName.textContent = remoteName || "User";
    if (remoteUserAvatar) remoteUserAvatar.src = remotePic || DEFAULT_AVATAR;

    // Reset control states
    resetCallControls();

    // Hide/show fallback based on video availability
    const noRemoteVideo = $("#no-remote-video");
    const remoteVideo = $("#remote-video");
    
    if (isVideoCall) {
        if (noRemoteVideo) noRemoteVideo.style.display = "flex";
        if (remoteVideo) remoteVideo.style.display = "none";
    } else {
        if (noRemoteVideo) noRemoteVideo.style.display = "flex";
        if (remoteVideo) remoteVideo.style.display = "none";
    }
}

/**
 * End the current call - cleanup everything
 */
function endCall() {
    // Stop timer
    stopCallTimer();

    // Notify server
    if (ws && ws.readyState === WebSocket.OPEN && callActive) {
        ws.send(JSON.stringify({
            type: "end_call",
            target: currentChat
        }));
    }

    // Stop local media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    // Clear remote stream reference
    remoteStream = null;

    // Reset state
    callActive = false;
    isMuted = false;
    isCameraOff = false;
    incomingCallData = null;
    clearTimeout(window.callTimeout);

    // Hide call UI
    const overlay = $("#call-interface");
    if (overlay) overlay.style.display = "none";

    // Stop ringtone if playing
    stopRingtime();

    // Hide ringing modal if showing
    const ringingModal = $("#ringing-modal");
    if (ringingModal) ringingModal.style.display = "none";

    // Clear video sources
    const localVideo = $("#local-video");
    const remoteVideo = $("#remote-video");
    
    if (localVideo) {
        localVideo.srcObject = null;
    }
    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }

    console.log("[CALL] Ended");
}

window.endCall = endCall;

// ==========================================
// CALL CONTROLS
// ==========================================

/**
 * Toggle Mute / Unmute microphone
 */
window.toggleMute = function() {
    if (!localStream) return;

    isMuted = !isMuted;
    
    const audioTracks = localStream.getAudioTracks();
    audioTracks.forEach(track => track.enabled = !isMuted);

    // Update UI
    const btn = $("#btn-mute");
    const iconOn = $("#icon-mic-on");
    const iconOff = $("#icon-mic-off");

    if (btn) btn.classList.toggle("active", isMuted);
    if (iconOn) iconOn.style.display = isMuted ? "none" : "block";
    if (iconOff) iconOff.style.display = isMuted ? "block" : "none";
};

/**
 * Toggle Camera On / Off
 */
window.toggleCamera = function() {
    if (!localStream || !isVideoCall) return;

    isCameraOff = !isCameraOff;
    
    const videoTracks = localStream.getVideoTracks();
    videoTracks.forEach(track => track.enabled = !isCameraOff);

    // Update UI visibility
    updateLocalVideoVisibility();

    // Update button state
    const btn = $("#btn-camera");
    const iconOn = $("#cam-on");
    const iconOff = $("#cam-off");

    if (btn) btn.classList.toggle("active", isCameraOff);
    if (iconOn) iconOn.style.display = isCameraOff ? "none" : "block";
    if (iconOff) iconOff.style.display = isCameraOff ? "block" : "none";
};

/**
 * Update local video PiP visibility
 */
function updateLocalVideoVisibility() {
    const localVideo = $("#local-video");
    const noLocalVideo = $("#no-local-video");
    const pipContainer = $("#local-pip");

    if (isVideoCall && !isCameraOff) {
        if (localVideo) localVideo.style.display = "block";
        if (noLocalVideo) noLocalVideo.style.display = "none";
        if (pipContainer) pipContainer.style.display = "block";
    } else {
        if (localVideo) localVideo.style.display = "none";
        if (noLocalVideo) noLocalVideo.style.display = "flex";
        if (pipContainer) pipContainer.style.display = "block"; // Still show container
    }

    // For voice calls, hide PiP entirely
    if (!isVideoCall) {
        if (pipContainer) pipContainer.style.display = "none";
    }
}

/**
 * Reset all call control buttons to default state
 */
function resetCallControls() {
    isMuted = false;
    isCameraOff = false;

    // Mute button
    const muteBtn = $("#btn-mute");
    const micOn = $("#icon-mic-on");
    const micOff = $("#icon-mic-off");
    if (muteBtn) muteBtn.classList.remove("active");
    if (micOn) micOn.style.display = "block";
    if (micOff) micOff.style.display = "none";

    // Camera button
    const camBtn = $("#btn-camera");
    const camOn = $("#cam-on");
    const camOff = $("#cam-off");
    if (camBtn) camBtn.classList.remove("active");
    if (camOn) camOn.style.display = "block";
    if (camOff) camOff.style.display = "none";

    // Timer
    const timer = $("#call-timer");
    if (timer) timer.textContent = "00:00";
}

// ==========================================
// CALL TIMER
// ==========================================

function startCallTimer() {
    stopCallTimer();
    callSeconds = 0;
    updateTimerDisplay();
    callTimerInterval = setInterval(() => {
        callSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
}

function updateTimerDisplay() {
    const mins = Math.floor(callSeconds / 60).toString().padStart(2, '0');
    const secs = (callSeconds % 60).toString().padStart(2, '0');
    const timerEl = $("#call-timer");
    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
}

// ==========================================
// DRAGGABLE PIP (Picture-in-Picture)
// ==========================================
let dragState = { isDragging: false, startX: 0, startY: 0, initialLeft: 0, initialTop: 0 };

window.startDrag = function(e) {
    if (e.target.tagName === 'VIDEO' || e.target.id === 'no-local-video') return; // Allow interaction with video
    
    const pip = $("#local-pip");
    if (!pip) return;

    dragState.isDragging = true;
    dragState.startX = e.clientX || e.touches?.[0]?.clientX;
    dragState.startY = e.clientY || e.touches?.[0]?.clientY;
    dragState.initialLeft = pip.offsetLeft;
    dragState.initialTop = pip.offsetTop;

    pip.style.transition = 'none';

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', stopDrag);
};

function onDrag(e) {
    if (!dragState.isDragging) return;
    e.preventDefault();

    const pip = $("#local-pip");
    if (!pip) return;

    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;

    const dx = clientX - dragState.startX;
    const dy = clientY - dragState.startY;

    let newLeft = dragState.initialLeft + dx;
    let newTop = dragState.initialTop + dy;

    // Constrain to viewport
    const rect = pip.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width;
    const maxTop = window.innerHeight - rect.height;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    pip.style.left = newLeft + 'px';
    pip.style.top = newTop + 'px';
    pip.style.right = 'auto';
}

function stopDrag() {
    dragState.isDragging = false;
    
    const pip = $("#local-pip");
    if (pip) pip.style.transition = '';

    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', onDrag);
    document.removeEventListener('touchend', stopDrag);
}

// ==========================================
// EVENT LISTENERS
// ==========================================

document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement.id === "msg-input") {
        e.preventDefault();
        window.sendMyMessage();
    }
    
    // Escape to end call
    if (e.key === "Escape" && callActive) {
        endCall();
    }
});

document.addEventListener("click", (e) => {
    if (window.innerWidth > 768) return;
    const sidebar = $("#sidebar");
    const menuBtn = $(".mobile-menu");
    if (sidebar?.classList.contains("open") && !sidebar.contains(e.target) && menuBtn && !menuBtn.contains(e.target)) {
        closeMobileSidebar();
    }
});

window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
        document.body.style.overflow = "";
        $("#sidebar")?.classList.remove("open");
    }
});

window.addEventListener("beforeunload", () => {
    if (callActive) endCall();
    if (ws) ws.close(1000);
});

// Console branding
console.log(
    "%c🔥 IdlyCall Pro %cv2.0 %c| Calls Enabled",
    "color:#FF7A00;font-weight:bold;font-size:16px;",
    "color:#9ca3af;font-size:12px;",
    "color:#fff;font-size:12px;"
);