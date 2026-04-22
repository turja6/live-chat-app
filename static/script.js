/**
 * IdlyCall Pro v2.1 - Complete Application Script
 * Chat + WebRTC Voice/Video Calling
 * Features: Fullscreen | Screen Sharing | Mobile Support
 */

// ==========================================
// STATE
// ==========================================
let ws = null;
let myUsername = localStorage.getItem("chat_username") || "";
let myPicBase64 = localStorage.getItem("chat_pic") || "";
let currentChat = "Public";

// WebRTC State
let peerConnection = null;
let localStream = null;
let screenStream = null;
let remoteStream = null;
let callActive = false;
let isVideoCall = false;
let isMuted = false;
let isCameraOff = false;
let isScreenSharing = false;
let isFullscreen = false;
let incomingCallData = null;
let callTimerInterval = null;
let callSeconds = 0;

// ICE Servers
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

const DEFAULT_AVATAR = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';

// DOM Helpers
const $ = (sel) => document.querySelector(sel);

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
        setTimeout(() => input?.classList.remove('shake'), 400);
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

            // ---- WEBRTC SIGNALING ----
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
                console.log("[WS] Unknown:", d.type);
        }
    } catch (err) {
        console.error("[WS] Parse error:", err);
    }
}

// ==========================================
// SOUND UTILITIES
// ==========================================
function playNotificationSound() {
    $("#chatSound")?.play().catch(() => {});
}

function playRingtone() {
    $("#ringtone")?.play().catch(() => {});
}

function stopRingtime() {
    const audio = $("#ringtone");
    if (audio) { audio.pause(); audio.currentTime = 0; }
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
        const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        if (nearBottom) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
}

// ==========================================
// USER LIST
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
 * START OUTGOING CALL
 * @param {boolean} isVideo - true for video, false for voice only
 */
async function startCall(isVideo) {
    // Validate target
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
        // Get media stream
        localStream = await navigator.mediaDevices.getUserMedia({
            video: isVideo,
            audio: true
        });

        // ✅ FIX: Show call interface immediately with display:flex
        showCallInterface(currentChat, null);

        // Create peer connection
        createPeerConnection();

        // Add local tracks
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Show local preview
        updateLocalVideoPreview();

        $("#callStatus").textContent = "Calling...";

        // Send via signaling server
        ws.send(JSON.stringify({
            type: "start_call",
            target: currentChat,
            is_video: isVideo,
            caller_name: myUsername,
            caller_pic: myPicBase64
        }));

        // Timeout for no answer
        window.callTimeout = setTimeout(() => {
            if ($("#callStatus").textContent === "Calling...") {
                endCall();
                alert("No answer");
            }
        }, 30000);

    } catch (err) {
        console.error("[CALL] Media error:", err);
        alert("Could not access camera/microphone.\nCheck browser permissions.");
        endCall();
    }
}

/**
 * HANDLE INCOMING CALL
 */
function handleIncomingCall(data) {
    incomingCallData = data;

    // Update ringing modal
    const avatar = $("#caller-avatar");
    const name = $("#caller-name");
    const typeLabel = $("#call-type-label");

    if (avatar) avatar.src = data.caller_pic || DEFAULT_AVATAR;
    if (name) name.textContent = data.caller_name || "Unknown";
    if (typeLabel) typeLabel.textContent = data.is_video ? "Video Call" : "Voice Call";

    // Show modal
    const modal = $("#ringing-modal");
    if (modal) modal.style.display = "flex";

    playRingtone();
}

/**
 * ACCEPT INCOMING CALL
 */
async function acceptCall() {
    if (!incomingCallData) return;

    stopRingtime();
    $("#ringing-modal").style.display = "none";

    isVideoCall = incomingCallData.is_video || false;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: isVideoCall,
            audio: true
        });

        // ✅ FIX: Show call interface
        showCallInterface(incomingCallData.caller_name, incomingCallData.caller_pic);

        createPeerConnection();

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        updateLocalVideoPreview();

        ws.send(JSON.stringify({
            type: "accept_call",
            target: incomingCallData.caller
        }));

        $("#callStatus").textContent = "Connecting...";

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
 * HANDLE CALL ACCEPTED (Caller side)
 */
async function handleCallAccepted(data) {
    clearTimeout(window.callTimeout);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    ws.send(JSON.stringify({
        type: "offer",
        target: data.accepted_by || currentChat,
        offer: offer
    }));

    $("#callStatus").textContent = "Ringing...";
}

/**
 * HANDLE CALL DECLINED
 */
function handleCallDeclined(data) {
    clearTimeout(window.callTimeout);
    alert("Call declined");
    endCall();
}

/**
 * HANDLE OFFER (Callee receives)
 */
async function handleOffer(data) {
    if (!peerConnection) createPeerConnection();

    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    ws.send(JSON.stringify({
        type: "answer",
        target: data.from || currentChat,
        answer: answer
    }));
}

/**
 * HANDLE ANSWER (Caller receives)
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
 * HANDLE REMOTE END
 */
function handleRemoteEndCall(data) {
    endCall();
    if (data.ended_by) alert(`${data.ended_by} ended the call`);
}

// ==========================================
// PEER CONNECTION
// ==========================================
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(iceServers);

    peerConnection.ontrack = (event) => {
        console.log("[WEBRTC] Received remote track");
        remoteStream = event.streams[0];

        const remoteVideo = $("#remoteVideo");
        const noVideoFallback = $("#noRemoteVideo");

        if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
            remoteVideo.style.display = "block";
        }
        if (noVideoFallback) noVideoFallback.style.display = "none";

        $("#callStatus").textContent = "Connected";
        startCallTimer();
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "ice_candidate",
                target: currentChat,
                candidate: event.candidate
            }));
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log("[WEBRTC] State:", peerConnection.connectionState);

        switch (peerConnection.connectionState) {
            case "connected":
                $("#callStatus").textContent = "Connected";
                startCallTimer();
                break;
            case "disconnected":
            case "failed":
                $("#callStatus").textContent = "Reconnecting...";
                break;
            case "closed":
                endCall();
                break;
        }
    };
}

// ==========================================
// CALL INTERFACE VISIBILITY MANAGEMENT
// ==========================================

/**
 * SHOW CALL INTERFACE
 * ✅ FIX: Ensures display:flex is set correctly
 */
function showCallInterface(remoteName, remotePic) {
    callActive = true;
    callSeconds = 0;

    // ✅ CRITICAL FIX: Set display to flex explicitly
    const overlay = $("#call-interface");
    if (overlay) {
        overlay.style.display = "flex";
    }

    // Set remote user info
    const nameEl = $("#remoteUserName");
    const avatarEl = $("#remoteUserAvatar");

    if (nameEl) nameEl.textContent = remoteName || "User";
    if (avatarEl) avatarEl.src = remotePic || DEFAULT_AVATAR;

    // Reset control states
    resetCallControls();

    // Show/hide fallback based on call type
    const noRemoteVideo = $("#noRemoteVideo");
    const remoteVideo = $("#remoteVideo");

    if (isVideoCall) {
        if (noRemoteVideo) noRemoteVideo.style.display = "flex";
        if (remoteVideo) remoteVideo.style.display = "none";
    } else {
        if (noRemoteVideo) noRemoteVideo.style.display = "flex";
        if (remoteVideo) remoteVideo.style.display = "none";
    }

    // Show/hide PiP based on video call
    const pipContainer = $("#localPip");
    if (pipContainer) {
        pipContainer.style.display = isVideoCall ? "block" : "none";
    }
}

/**
 * END CALL - Cleanup everything
 */
function endCall() {
    // Stop timer
    stopCallTimer();

    // Notify server
    if (ws && ws.readyState === WebSocket.OPEN && callActive) {
        ws.send(JSON.stringify({ type: "end_call", target: currentChat }));
    }

    // Stop screen share if active
    if (isScreenSharing) {
        stopScreenShare();
    }

    // Stop local tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    remoteStream = null;

    // Reset state
    callActive = false;
    isMuted = false;
    isCameraOff = false;
    isScreenSharing = false;
    incomingCallData = null;
    clearTimeout(window.callTimeout);

    // Exit fullscreen if active
    if (isFullscreen) {
        exitFullscreenMode();
    }

    // ✅ FIX: Hide call interface by setting display:none
    const overlay = $("#call-interface");
    if (overlay) {
        overlay.style.display = "none";
    }

    // Stop ringtone
    stopRingtime();

    // Hide ringing modal
    const ringingModal = $("#ringing-modal");
    if (ringingModal) ringingModal.style.display = "none";

    // Clear video sources
    const localVideo = $("#localVideo");
    const remoteVideo = $("#remoteVideo");

    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;

    console.log("[CALL] Ended");
}

window.endCall = endCall;

// ==========================================
// CALL CONTROLS
// ==========================================

/**
 * TOGGLE MUTE
 */
window.toggleMute = function() {
    if (!localStream) return;

    isMuted = !isMuted;

    const audioTracks = localStream.getAudioTracks();
    audioTracks.forEach(track => track.enabled = !isMuted);

    // Update UI
    const btn = $("#btnMute");
    const iconOn = $("#micOn");
    const iconOff = $("#micOff");

    if (btn) btn.classList.toggle("active", isMuted);
    if (iconOn) iconOn.style.display = isMuted ? "none" : "block";
    if (iconOff) iconOff.style.display = isMuted ? "block" : "none";
};

/**
 * TOGGLE CAMERA
 */
window.toggleCamera = function() {
    if (!localStream || !isVideoCall) return;

    isCameraOff = !isCameraOff;

    const videoTracks = localStream.getVideoTracks();
    videoTracks.forEach(track => track.enabled = !isCameraOff);

    updateLocalVideoPreview();

    // Update button
    const btn = $("#btnCamera");
    const iconOn = $("#camOn");
    const iconOff = $("#camOff");

    if (btn) btn.classList.toggle("active", isCameraOff);
    if (iconOn) iconOn.style.display = isCameraOff ? "none" : "block";
    if (iconOff) iconOff.style.display = isCameraOff ? "block" : "none";
};

/**
 * UPDATE LOCAL VIDEO PREVIEW VISIBILITY
 */
function updateLocalVideoPreview() {
    const localVideo = $("#localVideo");
    const noLocalVideo = $("#noLocalVideo");
    const pipContainer = $("#localPip");

    if (isVideoCall && !isCameraOff) {
        if (localVideo) localVideo.style.display = "block";
        if (noLocalVideo) noLocalVideo.style.display = "none";
        if (pipContainer) pipContainer.style.display = "block";
    } else if (isVideoCall && isCameraOff) {
        if (localVideo) localVideo.style.display = "none";
        if (noLocalVideo) noLocalVideo.style.display = "flex";
        if (pipContainer) pipContainer.style.display = "block";
    } else {
        // Voice call - hide PiP entirely
        if (pipContainer) pipContainer.style.display = "none";
    }
}

/**
 * RESET ALL CONTROL BUTTONS TO DEFAULT STATE
 */
function resetCallControls() {
    isMuted = false;
    isCameraOff = false;
    isScreenSharing = false;

    // Mute button
    const muteBtn = $("#btnMute");
    const micOn = $("#micOn");
    const micOff = $("#micOff");
    if (muteBtn) muteBtn.classList.remove("active");
    if (micOn) micOn.style.display = "block";
    if (micOff) micOff.style.display = "none";

    // Camera button
    const camBtn = $("#btnCamera");
    const camOn = $("#camOn");
    const camOff = $("#camOff");
    if (camBtn) camBtn.classList.remove("active");
    if (camOn) camOn.style.display = "block";
    if (camOff) camOff.style.display = "none";

    // Screen share button
    const screenBtn = $("#btnScreen");
    const screenOn = $("#screenOn");
    const screenOff = $("#screenOff");
    if (screenBtn) screenBtn.classList.remove("active");
    if (screenOn) screenOn.style.display = "block";
    if (screenOff) screenOff.style.display = "none";

    // Timer
    const timer = $("#callTimer");
    if (timer) timer.textContent = "00:00";

    // Fullscreen icons
    const fsEnter = $("#fsIconEnter");
    const fsExit = $("#fsIconExit");
    if (fsEnter) fsEnter.style.display = "block";
    if (fsExit) fsExit.style.display = "none";
    isFullscreen = false;
}

// ==========================================
// SCREEN SHARING
// ==========================================

/**
 * TOGGLE SCREEN SHARE
 * Uses getDisplayMedia API (works on Chrome, Firefox, Edge, Safari)
 */
window.toggleScreenShare = async function() {
    if (!callActive || !peerConnection) {
        alert("Not in a call");
        return;
    }

    if (isScreenSharing) {
        stopScreenShare();
        return;
    }

    try {
        // Request screen capture
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always"
            },
            audio: false
        });

        // Handle user stopping share via browser UI
        screenStream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };

        // Replace video track in peer connection
        const videoTrack = screenStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s =>
            s.track && s.track.kind === "video"
        );

        if (sender) {
            await sender.replaceTrack(videoTrack);
        }

        // Update UI state
        isScreenSharing = true;

        const btn = $("#btnScreen");
        const iconOn = $("#screenOn");
        const iconOff = $("#screenOff");

        if (btn) btn.classList.add("active");
        if (iconOn) iconOn.style.display = "none";
        if (iconOff) iconOff.style.display = "block";

        // Show local screen preview
        const localVideo = $("#localVideo");
        if (localVideo) localVideo.srcObject = screenStream;

        console.log("[SCREEN] Sharing started");

    } catch (err) {
        console.error("[SCREEN] Error:", err);
        if (err.name === "NotAllowedError") {
            alert("Screen sharing was denied");
        } else if (err.name === "NotFoundError") {
            alert("No screen source available");
        } else {
            alert("Could not start screen sharing");
        }
    }
};

/**
 * STOP SCREEN SHARING
 */
function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }

    // Restore camera track if available
    if (localStream && peerConnection) {
        const videoTrack = localStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s =>
            s.track && s.track.kind === "video"
        );

        if (sender && videoTrack) {
            sender.replaceTrack(videoTrack);
        }

        // Restore local preview
        const localVideo = $("#localVideo");
        if (localVideo) localVideo.srcObject = localStream;
    }

    // Update UI
    isScreenSharing = false;

    const btn = $("#btnScreen");
    const iconOn = $("#screenOn");
    const iconOff = $("#screenOff");

    if (btn) btn.classList.remove("active");
    if (iconOn) iconOn.style.display = "block";
    if (iconOff) iconOff.style.display = "none";

    console.log("[SCREEN] Sharing stopped");
}

// ==========================================
// FULLSCREEN MODE
// ==========================================

/**
 * TOGGLE FULLSCREEN
 * Works on desktop browsers and mobile (Chrome, Safari)
 */
window.toggleFullscreen = function() {
    if (!document.fullscreenElement) {
        enterFullscreenMode();
    } else {
        exitFullscreenMode();
    }
};

/**
 * ENTER FULLSCREEN
 */
function enterFullscreenMode() {
    const el = $("#call-interface");

    if (el.requestFullscreen) {
        el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen(); // Safari
    } else if (el.msRequestFullscreen) {
        el.msRequestFullscreen(); // IE11
    } else if (el.webkitEnterFullscreen) {
        el.webkitEnterFullscreen(); // iOS Safari
    }

    isFullscreen = true;
    updateFullscreenIcon(true);
}

/**
 * EXIT FULLSCREEN
 */
function exitFullscreenMode() {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    }

    isFullscreen = false;
    updateFullscreenIcon(false);
}

/**
 * UPDATE FULLSCREEN ICON
 */
function updateFullscreenIcon(fullscreen) {
    const enterIcon = $("#fsIconEnter");
    const exitIcon = $("#fsIconExit");

    if (enterIcon) enterIcon.style.display = fullscreen ? "none" : "block";
    if (exitIcon) exitIcon.style.display = fullscreen ? "block" : "none";
}

// Listen for fullscreen change events (user pressing ESC)
document.addEventListener("fullscreenchange", handleFullscreenChange);
document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
document.addEventListener("mozfullscreenchange", handleFullscreenChange);
document.addEventListener("MSFullscreenChange", handleFullscreenChange);

function handleFullscreenChange() {
    isFullscreen = !!document.fullscreenElement;
    updateFullscreenIcon(isFullscreen);
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
    const timerEl = $("#callTimer");
    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
}

// ==========================================
// EVENT LISTENERS
// ==========================================

document.addEventListener("keydown", (e) => {
    // Enter to send message
    if (e.key === "Enter" && document.activeElement.id === "msg-input") {
        e.preventDefault();
        window.sendMyMessage();
    }

    // Escape to end call or exit fullscreen
    if (e.key === "Escape") {
        if (callActive && isFullscreen) {
            exitFullscreenMode();
        } else if (callActive) {
            endCall();
        }
    }

    // F11 or 'f' to toggle fullscreen when in call
    if ((e.key === 'f' || e.key === 'F') && callActive && document.activeElement.tagName !== 'INPUT') {
        toggleFullscreen();
    }
});

// Click outside to close mobile sidebar
document.addEventListener("click", (e) => {
    if (window.innerWidth > 768) return;
    const sidebar = $("#sidebar");
    const menuBtn = $(".mobile-menu");
    if (sidebar?.classList.contains("open") && !sidebar.contains(e.target) && menuBtn && !menuBtn.contains(e.target)) {
        closeMobileSidebar();
    }
});

// Window resize handler
window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
        document.body.style.overflow = "";
        $("#sidebar")?.classList.remove("open");
    }
});

// Cleanup before page unload
window.addEventListener("beforeunload", () => {
    if (callActive) endCall();
    if (ws) ws.close(1000);
});

// Prevent zoom on double tap (iOS)
document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
});
let lastTouchEnd = 0;

// Console branding
console.log(
    "%c🔥 IdlyCall Pro %cv2.1 %c| Calls + Screenshare + Fullscreen",
    "color:#FF7A00;font-weight:bold;font-size:16px;",
    "color:#9ca3af;font-size:12px;",
    "color:#fff;font-size:12px;"
);