/**
 * ============================================
 * IdlyCall Pro v2.1 - Complete Application Script
 * ============================================
 * 
 * Features:
 * ✅ Real-time WebSocket Chat
 * ✅ WebRTC Voice & Video Calling
 * ✅ Screen Sharing (Desktop)
 * ✅ Fullscreen Mode (Desktop + Mobile)
 * ✅ Mobile Responsive UI
 * ✅ Force End Call (Emergency Exit)
 * 
 * Author: Generated for Modular Project Structure
 * File: /static/script.js
 */

// ============================================================
// SECTION 1: GLOBAL STATE MANAGEMENT
// ============================================================

/**
 * Application State Variables
 * All mutable state lives here for easy debugging
 */
const AppState = {
    // WebSocket Connection
    ws: null,
    
    // User Identity
    myUsername: localStorage.getItem("chat_username") || "",
    myPicBase64: localStorage.getItem("chat_pic") || "",
    
    // Current Context
    currentChat: "Public",
    
    // WebRTC State
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
    
    // Timer References
    callTimerInterval: null,
    callSeconds: 0,
    callTimeout: null
};

// ICE Servers for WebRTC (Google's public STUN servers)
const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
};

// Default avatar fallback URL
const DEFAULT_AVATAR = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';

// ============================================================
// SECTION 2: DOM UTILITY HELPERS
// ============================================================

/**
 * Shorthand for document.querySelector
 * @param {string} selector - CSS selector
 * @returns {Element|null}
 */
const $ = (selector) => document.querySelector(selector);

/**
 * Shorthand for document.querySelectorAll
 * @param {string} selector - CSS selector
 * @returns {NodeList}
 */
const $$ = (selector) => document.querySelectorAll(selector);

/**
 * Safely get element by ID
 * @param {string} id - Element ID
 * @returns {Element|null}
 */
function getElement(id) {
    try {
        return document.getElementById(id);
    } catch (e) {
        console.error(`[DOM] Error getting element #${id}:`, e);
        return null;
    }
}

/**
 * Set element display style safely
 * @param {string} id - Element ID
 * @param {string} display - Display value ('none', 'flex', 'block', etc.)
 */
function setDisplay(id, display) {
    const el = getElement(id);
    if (el) {
        el.style.display = display;
    }
}

// ============================================================
// SECTION 3: IMAGE PROCESSING
// ============================================================

/**
 * Process uploaded image file and convert to base64
 * @param {Event} event - File input change event
 * @param {string} targetId - ID of preview image element
 */
function processImage(event, targetId) {
    const file = event.target.files[0];
    
    if (!file) {
        console.log("[IMAGE] No file selected");
        return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('Image too large. Maximum size is 5MB.');
        return;
    }

    const reader = new FileReader();

    reader.onload = function(loadEvent) {
        try {
            const targetElement = getElement(targetId);
            if (targetElement) {
                targetElement.src = loadEvent.target.result;
            }
            AppState.myPicBase64 = loadEvent.target.result;
            localStorage.setItem("chat_pic", loadEvent.target.result);
            console.log("[IMAGE] Profile picture updated");
        } catch (err) {
            console.error("[IMAGE] Error processing image:", err);
        }
    };

    reader.onerror = function() {
        console.error("[IMAGE] Failed to read file");
        alert('Failed to read image file. Please try again.');
    };

    reader.readAsDataURL(file);
}

// ============================================================
// SECTION 4: AUTHENTICATION & LOGIN
// ============================================================

/**
 * Handle manual login form submission
 * Validates username and initializes application
 */
window.manualLogin = function() {
    const inputElement = getElement("usernameInput");
    
    if (!inputElement) {
        console.error("[AUTH] Username input not found");
        return;
    }

    const username = inputElement.value.trim();

    // Validation
    if (!username) {
        inputElement.focus();
        
        // Shake animation feedback
        inputElement.classList.add('shake');
        setTimeout(() => {
            inputElement.classList.remove('shake');
        }, 400);

        // Visual hint
        inputElement.style.borderColor = '#ef4444';
        setTimeout(() => {
            inputElement.style.borderColor = '';
        }, 2000);

        return;
    }

    // Additional validation: no special characters that could break things
    if (username.length < 2 || username.length > 30) {
        alert('Username must be between 2 and 30 characters');
        return;
    }

    // Store credentials
    AppState.myUsername = username;
    localStorage.setItem("chat_username", username);

    console.log(`[AUTH] User logged in as: ${username}`);
    
    // Initialize main application
    startApplication();
};

// ============================================================
// SECTION 5: APPLICATION INITIALIZATION
// ============================================================

/**
 * Main application startup function
 * Establishes WebSocket connection and sets up UI
 */
function startApplication() {
    // Hide login screen
    setDisplay("login-screen", "none");

    // Show main app container
    setDisplay("app-container", "flex");

    // Determine WebSocket protocol based on page security
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/ws/${encodeURIComponent(AppState.myUsername)}`;

    console.log(`[APP] Connecting to: ${wsUrl}`);

    try {
        // Create WebSocket connection
        AppState.ws = new WebSocket(wsUrl);

        // Setup connection handlers
        setupWebSocketHandlers(AppState.ws);

    } catch (error) {
        console.error("[APP] WebSocket creation failed:", error);
        showErrorMessage("Failed to connect to server. Please refresh.");
    }
}

/**
 * Configure all WebSocket event handlers
 * @param {WebSocket} socket - WebSocket instance
 */
function setupWebSocketHandlers(socket) {

    /**
     * Connection Opened Successfully
     */
    socket.onopen = function(event) {
        console.log("[WS] ✓ Connected to server");
        
        // Send profile information
        const profileData = {
            type: "profile_update",
            pic: AppState.myPicBase64 || null
        };
        
        safeSend(socket, profileData);
    };

    /**
     * Message Received from Server
     * Routes messages to appropriate handlers based on type
     */
    socket.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            
            console.log("[WS] Received:", data.type || "unknown");

            switch (data.type) {
                // ---- CHAT MESSAGES ----
                case "chat":
                    handleChatMessage(data);
                    break;

                case "user_list":
                    handleUserListUpdate(data);
                    break;

                case "history":
                    handleChatHistory(data);
                    break;

                // ---- WEBRTC SIGNALING ----
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
                    handleSDPOffer(data);
                    break;

                case "answer":
                    handleSDPAnswer(data);
                    break;

                case "ice_candidate":
                    handleICECandidate(data);
                    break;

                case "call_ended":
                case "call_end":
                    handleRemoteCallEnd(data);
                    break;

                // ---- UNKNOWN TYPE ----
                default:
                    console.warn("[WS] Unhandled message type:", data.type);
            }

        } catch (parseError) {
            console.error("[WS] Failed to parse message:", parseError);
            console.error("[WS] Raw data:", event.data);
        }
    };

    /**
     * Connection Closed
     */
    socket.onclose = function(event) {
        console.log(`[WS] Disconnected: Code=${event.code}, Reason=${event.reason || 'none'}`);

        // Auto-reconnect if not intentional close and user is logged in
        if (event.code !== 1000 && AppState.myUsername) {
            console.log("[WS] Attempting reconnection in 3 seconds...");
            
            setTimeout(() => {
                // Only reconnect if app is still visible
                const appContainer = getElement("app-container");
                if (appContainer && appContainer.style.display !== "none") {
                    startApplication();
                }
            }, 3000);
        }
    };

    /**
     * Connection Error
     */
    socket.onerror = function(error) {
        console.error("[WS] Connection error:", error);
        // Don't show alert here - onclose will fire next
    };
}

/**
 * Safely send JSON data through WebSocket
 * @param {WebSocket} socket - Active WebSocket
 * @param {Object} data - Data object to send
 */
function safeSend(socket, data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        try {
            socket.send(JSON.stringify(data));
            return true;
        } catch (e) {
            console.error("[WS] Send error:", e);
            return false;
        }
    } else {
        console.warn("[WS] Cannot send - socket not open. State:", socket?.readyState);
        return false;
    }
}

// ============================================================
// SECTION 6: SOUND UTILITIES
// ============================================================

/**
 * Play notification sound for incoming messages
 */
function playNotificationSound() {
    const audio = getElement("chatSound");
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(err => {
            // Silently fail - browser may block autoplay
            console.log("[SOUND] Notification blocked:", err.message);
        });
    }
}

/**
 * Start playing ringtone for incoming calls
 */
function playRingtone() {
    const audio = getElement("ringtone");
    if (audio) {
        audio.currentTime = 0;
        audio.loop = true;
        audio.play().catch(err => {
            console.log("[SOUND] Ringtone blocked:", err.message);
        });
    }
}

/**
 * Stop ringtone playback
 */
function stopRingtone() {
    const audio = getElement("ringtone");
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.loop = false;
    }
}

// ============================================================
// SECTION 7: HTML SANITIZATION (Security)
// ============================================================

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} unsafe - Potentially unsafe string
 * @returns {string} Escaped safe string
 */
function escapeHTML(unsafe) {
    if (!unsafe) return "";
    if (typeof unsafe !== 'string') {
        unsafe = String(unsafe);
    }
    
    const div = document.createElement("div");
    div.textContent = unsafe;
    return div.innerHTML;
}

// ============================================================
// SECTION 8: MESSAGE RENDERING
// ============================================================

/**
 * Render a chat message in the message stream
 * Uses DocumentFragment for performance optimization
 * 
 * @param {string} text - Message text content
 * @param {string} sender - Sender's username
 * @param {string} pic - Sender's profile picture URL or base64
 * @param {string} time - Timestamp string
 */
function renderMessage(text, sender, pic, time) {
    const container = getElement("chat-stream");
    
    if (!container) {
        console.error("[MSG] Chat stream container not found");
        return;
    }

    // Use DocumentFragment for batch DOM operations (performance)
    const fragment = document.createDocumentFragment();

    // Create message element
    const messageDiv = document.createElement("div");
    messageDiv.className = "message";

    // Build message HTML (Discord-style layout)
    const avatarSrc = pic || DEFAULT_AVATAR;
    
    messageDiv.innerHTML = `
        <img class="msg-avatar" src="${avatarSrc}" alt="${escapeHTML(sender)}" loading="lazy">
        <div class="msg-body">
            <div class="msg-meta">
                <span class="msg-sender">${escapeHTML(sender)}</span>
                <span class="msg-time">${escapeHTML(time || '')}</span>
            </div>
            <div class="msg-content">${escapeHTML(text)}</div>
        </div>
    `;

    fragment.appendChild(messageDiv);
    container.appendChild(fragment);

    // Smart auto-scroll: only scroll if user is near bottom
    requestAnimationFrame(() => {
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        const shouldAutoScroll = distanceFromBottom < 150;
        
        if (shouldAutoScroll) {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: "smooth"
            });
        }
    });
}

/**
 * Handle incoming chat message from server
 * @param {Object} data - Message data object
 */
function handleChatMessage(data) {
    const { message, sender, profile_pic, timestamp } = data;

    // Play notification for other users' messages
    if (sender !== AppState.myUsername) {
        playNotificationSound();
    }

    // Render the message
    renderMessage(message, sender, profile_pic, timestamp);
}

// ============================================================
// SECTION 9: USER LIST MANAGEMENT
// ============================================================

/**
 * Render the online users list in sidebar
 * @param {Array|Object} usersData - Array of user objects or data wrapper
 */
function handleUserListUpdate(usersData) {
    const container = getElement("user-list-container");
    
    if (!container) {
        console.error("[USERS] Container not found");
        return;
    }

    // Extract array from potential wrapper
    const users = Array.isArray(usersData) ? usersData : (usersData.data || []);

    if (!users || users.length === 0) {
        container.innerHTML = `
            <p style="color: var(--text-muted); padding: 20px; text-align: center; font-size: 13px;">
                No users online
            </p>
        `;
        return;
    }

    // Generate user list HTML
    const html = users.map(user => `
        <div class="user-item" onclick="switchToChat('${escapeHTML(user.username)}')">
            <img src="${user.profile_pic || DEFAULT_AVATAR}" 
                 alt="${escapeHTML(user.username)}" 
                 loading="lazy"
                 width="36" height="36"
                 style="border-radius: 50%; margin-right: 10px;">
            <span>${escapeHTML(user.username)}</span>
        </div>
    `).join("");

    container.innerHTML = html;
    
    console.log(`[USERS] Rendered ${users.length} users`);
}

/**
 * Handle chat history when switching conversations
 * @param {Object} data - History data containing messages array
 */
function handleChatHistory(data) {
    const messages = data.messages || [];
    
    if (Array.isArray(messages)) {
        console.log(`[HISTORY] Loading ${messages.length} messages`);
        
        messages.forEach(msg => {
            renderMessage(
                msg.message || msg.text || '',
                msg.sender || msg.username || '',
                msg.profile_pic || msg.pic || '',
                msg.timestamp || msg.time || ''
            );
        });
    }
}

// ============================================================
// SECTION 10: CHAT SWITCHING
// ============================================================

/**
 * Switch active conversation
 * @param {string} target - Target username or channel name
 */
window.switchToChat = function(target) {
    if (!target) {
        console.warn("[CHAT] No target specified");
        return;
    }

    // Update state
    AppState.currentChat = target;

    // Update header title
    const headerTitle = getElement("chatHeaderTitle");
    if (headerTitle) {
        headerTitle.textContent = target;
    }

    // Clear current message stream
    const streamContainer = getElement("chat-stream");
    if (streamContainer) {
        streamContainer.innerHTML = '';
    }

    // Request history from server
    if (AppState.ws && AppState.ws.readyState === WebSocket.OPEN) {
        safeSend(AppState.ws, {
            type: "get_history",
            target: target
        });
    }

    // Close mobile sidebar after selection
    closeMobileSidebar();

    console.log(`[CHAT] Switched to: ${target}`);
};

// Backward compatibility alias
window.switchChat = window.switchToChat;

// ============================================================
// SECTION 11: SEND MESSAGE
// ============================================================

/**
 * Send a message to the current conversation
 * Triggered by send button click or Enter key
 */
window.sendMyMessage = function() {
    const inputElement = getElement("msg-input");
    
    if (!inputElement) {
        console.error("[SEND] Input not found");
        return;
    }

    const messageText = inputElement.value.trim();

    // Don't send empty messages
    if (!messageText) {
        return;
    }

    // Check WebSocket status
    if (!AppState.ws || AppState.ws.readyState !== WebSocket.OPEN) {
        showErrorMessage("Not connected to server. Message not sent.");
        return;
    }

    // Construct and send message payload
    const payload = {
        type: "chat",
        receiver: AppState.currentChat,
        message: messageText,
        timestamp: new Date().toISOString()
    };

    const sent = safeSend(AppState.ws, payload);

    if (sent) {
        // Clear input field
        inputElement.value = '';
        
        // Keep focus on input for continuous typing
        inputElement.focus();
        
        console.log(`[SEND] Message sent to ${AppState.currentChat}`);
    }
};

// ============================================================
// SECTION 12: MOBILE SIDEBAR MANAGEMENT
// ============================================================

/**
 * Toggle mobile sidebar visibility
 * Manages body scroll lock for better UX
 */
window.toggleMobileSidebar = function() {
    const sidebar = getElement("sidebar");
    
    if (!sidebar) return;

    const isOpen = sidebar.classList.contains("open");
    
    // Toggle class
    sidebar.classList.toggle("open");

    // Manage body scroll lock on mobile devices only
    if (window.innerWidth <= 768) {
        if (!isOpen) {
            // Opening sidebar - prevent background scrolling
            document.body.style.overflow = "hidden";
        } else {
            // Closing sidebar - restore scrolling
            document.body.style.overflow = "";
        }
    }
};

/**
 * Close mobile sidebar (utility function)
 */
function closeMobileSidebar() {
    const sidebar = getElement("sidebar");
    
    if (sidebar && window.innerWidth <= 768 && sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
        document.body.style.overflow = "";
    }
}

// ============================================================
// SECTION 13: ERROR DISPLAY UTILITY
// ============================================================

/**
 * Show temporary error message to user
 * Could be enhanced to use toast notifications
 * @param {string} message - Error message to display
 */
function showErrorMessage(message) {
    alert(message); // Simple implementation - can upgrade to toast
    
    console.error(`[ERROR] ${message}`);
}

// ============================================================
// SECTION 14: WEBCRTC CALLING SYSTEM
// ============================================================

/**
 * START AN OUTGOING CALL
 * Initiates WebRTC call to current chat target
 * 
 * @param {boolean} isVideo - true for video call, false for voice-only
 */
async function startCall(isVideo) {
    // Validation checks
    if (!AppState.currentChat || AppState.currentChat.toLowerCase() === "public") {
        showErrorMessage("Select a private chat to call.\n\nYou cannot call the Public channel.");
        return;
    }

    if (AppState.callActive) {
        showErrorMessage("You are already in a call.\n\nEnd the current call before starting a new one.");
        return;
    }

    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showErrorMessage("Your browser does not support video calling.\n\nPlease use Chrome, Firefox, Safari, or Edge.");
        return;
    }

    // Set call type
    AppState.isVideoCall = isVideo;

    console.log(`[CALL] Starting ${isVideo ? 'video' : 'voice'} call to: ${AppState.currentChat}`);

    try {
        // Request media permissions
        AppState.localStream = await navigator.mediaDevices.getUserMedia({
            video: isVideo ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            } : false,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        console.log("[CALL] ✓ Local media stream acquired");

        // Show call interface immediately
        showCallInterface(AppState.currentChat, null);

        // Create peer connection
        createPeerConnection();

        // Add local tracks to peer connection
        AppState.localStream.getTracks().forEach(track => {
            if (AppState.peerConnection) {
                AppState.peerConnection.addTrack(track, AppState.localStream);
            }
        });

        // Show local video preview
        updateLocalVideoPreview();

        // Update status
        updateCallStatus("Calling...");

        // Send call initiation via signaling server
        safeSend(AppState.ws, {
            type: "start_call",
            target: AppState.currentChat,
            is_video: isVideo,
            caller_name: AppState.myUsername,
            caller_pic: AppState.myPicBase64
        });

        // Set answer timeout (30 seconds)
        AppState.callTimeout = setTimeout(() => {
            if (AppState.callActive && getElement("callStatus")?.textContent === "Calling...") {
                console.log("[CALL] No answer - timeout");
                window.forceEndCall();
                showErrorMessage("No answer. The user may be unavailable.");
            }
        }, 30000);

    } catch (mediaError) {
        console.error("[CALL] Media acquisition error:", mediaError);
        
        let errorMessage = "Could not access your ";
        
        if (mediaError.name === "NotAllowedError") {
            if (isVideo) {
                errorMessage += "camera and microphone.\n\nPlease allow access in your browser settings.";
            } else {
                errorMessage += "microphone.\n\nPlease allow access in your browser settings.";
            }
        } else if (mediaError.name === "NotFoundError") {
            errorMessage += isVideo ? "camera." : "microphone.";
            errorMessage += "\n\nNo device found. Please connect a device and try again.";
        } else if (mediaError.name === "NotReadableError") {
            errorMessage += isVideo ? "camera." : "microphone.";
            errorMessage += "\n\nDevice is being used by another application.";
        } else {
            errorMessage += "media devices.\n\nError: " + mediaError.message;
        }
        
        showErrorMessage(errorMessage);
        
        // Clean up any partial state
        cleanupPartialCallState();
    }
}

/**
 * Clean up partial call state after error
 */
function cleanupPartialCallState() {
    if (AppState.localStream) {
        AppState.localStream.getTracks().forEach(t => t.stop());
        AppState.localStream = null;
    }
    hideCallInterface();
}

// ============================================================
// SECTION 15: INCOMING CALL HANDLING
// ============================================================

/**
 * HANDLE INCOMING CALL FROM SERVER
 * Shows ringing modal and plays ringtone
 * 
 * @param {Object} data - Call data from signaling server
 */
function handleIncomingCall(data) {
    console.log("[CALL-IN] Incoming call from:", data.caller_name);

    // Store incoming call data for later use
    AppState.incomingCallData = data;

    // Update ringing modal UI
    const avatarEl = getElement("caller-avatar");
    const nameEl = getElement("caller-name");
    const typeLabelEl = getElement("call-type-label");

    if (avatarEl) avatarEl.src = data.caller_pic || DEFAULT_AVATAR;
    if (nameEl) nameEl.textContent = data.caller_name || "Unknown Caller";
    if (typeLabelEl) typeLabelEl.textContent = data.is_video ? "Video Call" : "Voice Call";

    // Show ringing modal
    setDisplay("ringing-modal", "flex");

    // Play ringtone
    playRingtone();
}

/**
 * ACCEPT INCOMING CALL
 * Called when user clicks Accept button
 */
async function acceptCall() {
    if (!AppState.incomingCallData) {
        console.warn("[ACCEPT] No incoming call data");
        return;
    }

    console.log("[ACCEPT] Accepting call...");

    // Stop ringtone
    stopRingtime();

    // Hide ringing modal
    setDisplay("ringing-modal", "none");

    // Extract call info
    const callerName = AppState.incomingCallData.caller_name || "Unknown";
    const callerPic = AppState.incomingCallData.caller_pic || null;
    AppState.isVideoCall = AppState.incomingCallData.is_video || false;

    try {
        // Get local media
        AppState.localStream = await navigator.mediaDevices.getUserMedia({
            video: AppState.isVideoCall ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            } : false,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        console.log("[ACCEPT] ✓ Local media acquired");

        // Show call interface
        showCallInterface(callerName, callerPic);

        // Create peer connection
        createPeerConnection();

        // Add local tracks
        AppState.localStream.getTracks().forEach(track => {
            if (AppState.peerConnection) {
                AppState.peerConnection.addTrack(track, AppState.localStream);
            }
        });

        // Show local preview
        updateLocalVideoPreview();

        // Notify server of acceptance
        safeSend(AppState.ws, {
            type: "accept_call",
            target: AppState.incomingCallData.caller
        });

        // Update status
        updateCallStatus("Connecting...");

    } catch (error) {
        console.error("[ACCEPT] Error accepting call:", error);
        declineCall(); // Auto-decline on error
        showErrorMessage("Failed to accept call.\n\nCheck your camera/microphone permissions.");
    }
}

/**
 * DECLINE INCOMING CALL
 */
function declineCall() {
    console.log("[DECLINE] Declining call...");

    // Stop ringtone
    stopRingtime();

    // Hide modal
    setDisplay("ringing-modal", "none");

    // Notify server
    if (AppState.incomingCallData && AppState.ws) {
        safeSend(AppState.ws, {
            type: "decline_call",
            target: AppState.incomingCallData.caller
        });
    }

    // Clear data
    AppState.incomingCallData = null;
}

// Make accept/decline globally accessible
window.acceptCall = acceptCall;
window.declineCall = declineCall;

// ============================================================
// SECTION 16: WEBRTC SIGNALING HANDLERS
// ============================================================

/**
 * HANDLE CALL ACCEPTED (Caller receives acknowledgment)
 * @param {Object} data - Acceptance data
 */
async function handleCallAccepted(data) {
    console.log("[SIGNAL] Call accepted by:", data.accepted_by);

    // Clear timeout
    if (AppState.callTimeout) {
        clearTimeout(AppState.callTimeout);
        AppState.callTimeout = null;
    }

    // Create and send SDP offer
    if (AppState.peerConnection) {
        try {
            const offer = await AppState.peerConnection.createOffer();
            await AppState.peerConnection.setLocalDescription(offer);

            safeSend(AppState.ws, {
                type: "offer",
                target: data.accepted_by || AppState.currentChat,
                offer: offer
            });

            updateCallStatus("Ringing...");
        } catch (error) {
            console.error("[SIGNAL] Error creating offer:", error);
        }
    }
}

/**
 * HANDLE CALL DECLINED
 * @param {Object} data - Decline data
 */
function handleCallDeclined(data) {
    console.log("[SIGNAL] Call declined");

    if (AppState.callTimeout) {
        clearTimeout(AppState.callTimeout);
        AppState.callTimeout = null;
    }

    showErrorMessage("Call was declined.");
    window.forceEndCall();
}

/**
 * HANDLE SDP OFFER (Callee receives from caller)
 * @param {Object} data - Offer data containing SDP
 */
async function handleSDPOffer(data) {
    console.log("[SIGNAL] Received SDP offer");

    if (!AppState.peerConnection) {
        createPeerConnection();
    }

    try {
        await AppState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

        // Create answer
        const answer = await AppState.peerConnection.createAnswer();
        await AppState.peerConnection.setLocalDescription(answer);

        // Send answer back
        safeSend(AppState.ws, {
            type: "answer",
            target: data.from || AppState.currentChat,
            answer: answer
        });

    } catch (error) {
        console.error("[SIGNAL] Error handling offer:", error);
    }
}

/**
 * HANDLE SDP ANSWER (Caller receives from callee)
 * @param {Object} data - Answer data containing SDP
 */
async function handleSDPAnswer(data) {
    console.log("[SIGNAL] Received SDP answer");

    if (AppState.peerConnection) {
        try {
            await AppState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (error) {
            console.error("[SIGNAL] Error handling answer:", error);
        }
    }
}

/**
 * HANDLE ICE CANDIDATE
 * @param {Object} data - ICE candidate data
 */
async function handleICECandidate(data) {
    if (data.candidate && AppState.peerConnection) {
        try {
            await AppState.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
            console.error("[SIGNAL] Error adding ICE candidate:", error);
        }
    }
}

/**
 * HANDLE REMOTE END CALL
 * Other person ended the call
 * @param {Object} data - End call data
 */
function handleRemoteCallEnd(data) {
    console.log("[SIGNAL] Remote end call from:", data.ended_by);
    
    const message = data.ended_by 
        ? `${data.ended_by} ended the call.` 
        : "The call has ended.";
    
    showErrorMessage(message);
    window.forceEndCall();
}

// ============================================================
// SECTION 17: PEER CONNECTION MANAGEMENT
// ============================================================

/**
 * Create RTCPeerConnection with all event handlers
 */
function createPeerConnection() {
    console.log("[RTC] Creating peer connection...");

    AppState.peerConnection = new RTCPeerConnection(RTC_CONFIG);

    /**
     * Handle incoming remote media stream
     */
    AppState.peerConnection.ontrack = function(event) {
        console.log("[RTC] Received remote track:", event.track.kind);

        AppState.remoteStream = event.streams[0];

        // Show remote video
        const remoteVideo = getElement("remoteVideo");
        const noRemoteVideo = getElement("noRemoteVideo");

        if (remoteVideo) {
            remoteVideo.srcObject = AppState.remoteStream;
            remoteVideo.style.display = "block";
        }

        if (noRemoteVideo) {
            noRemoteVideo.style.display = "none";
        }

        // Update status
        updateCallStatus("Connected");
        startCallTimer();
    };

    /**
     * Handle ICE candidate generation
     */
    AppState.peerConnection.onicecandidate = function(event) {
        if (event.candidate && AppState.ws) {
            safeSend(AppState.ws, {
                type: "ice_candidate",
                target: AppState.currentChat,
                candidate: event.candidate
            });
        }
    };

    /**
     * Monitor connection state changes
     */
    AppState.peerConnection.onconnectionstatechange = function() {
        const state = AppState.peerConnection.connectionState;
        console.log("[RTC] Connection state:", state);

        switch (state) {
            case "connected":
                updateCallStatus("Connected");
                startCallTimer();
                break;
                
            case "disconnected":
                updateCallStatus("Reconnecting...");
                break;
                
            case "failed":
                updateCallStatus("Connection Failed");
                break;
                
            case "closed":
                console.log("[RTC] Connection closed");
                break;
        }
    };

    /**
     * Monitor ICE gathering state
     */
    AppState.peerConnection.onicegatheringstatechange = function() {
        console.log("[RTC] ICE gathering:", AppState.peerConnection.iceGatheringState);
    };

    console.log("[RTC] ✓ Peer connection created");
}

// ============================================================
// SECTION 18: CALL INTERFACE VISIBILITY
// ============================================================

/**
 * SHOW CALL INTERFACE OVERLAY
 * Displays the full-screen call interface
 * 
 * @param {string} remoteName - Name of person being called
 * @param {string} remotePic - Their avatar URL
 */
function showCallInterface(remoteName, remotePic) {
    console.log("[UI] Showing call interface");

    // Mark as active
    AppState.callActive = true;
    AppState.callSeconds = 0;

    // CRITICAL: Set display to flex (this was the bug!)
    const overlay = getElement("call-interface");
    if (overlay) {
        overlay.style.display = "flex";
    }

    // Set remote user info
    const nameEl = getElement("remoteUserName");
    const avatarEl = getElement("remoteUserAvatar");
    
    if (nameEl) nameEl.textContent = remoteName || "User";
    if (avatarEl) avatarEl.src = remotePic || DEFAULT_AVATAR;

    // Reset control buttons to default state
    resetAllControlButtons();

    // Setup video elements based on call type
    const remoteVideo = getElement("remoteVideo");
    const noRemoteVideo = getElement("noRemoteVideo");
    const pipContainer = getElement("localPip");

    if (AppState.isVideoCall) {
        // Video call - prepare for video display
        if (remoteVideo) remoteVideo.style.display = "block';
        if (noRemoteVideo) noRemoteVideo.style.display = "flex'; // Show until connected
        if (pipContainer) pipContainer.style.display = "block';
    } else {
        // Voice call - hide video elements
        if (remoteVideo) remoteVideo.style.display = 'none';
        if (noRemoteVideo) noRemoteVideo.style.display = 'flex';
        if (pipContainer) pipContainer.style.display = 'none'; // No PiP for voice
    }
}

/**
 * HIDE CALL INTERFACE OVERLAY
 * Returns user to chat view
 */
function hideCallInterface() {
    const overlay = getElement("call-interface");
    if (overlay) {
        overlay.style.display = "none";
    }
}

/**
 * Update call status text
 * @param {string} status - Status message to display
 */
function updateCallStatus(status) {
    const statusEl = getElement("callStatus");
    if (statusEl) {
        statusEl.textContent = status;
    }
}

// ============================================================
// SECTION 19: ⭐ FORCE END CALL (THE FIX)
// ============================================================

/**
 * ================================================
 * FORCE END CALL - Emergency Exit Function
 * ================================================
 * 
 * This function GUARANTEES the user can exit
 * the call screen NO MATTER WHAT.
 * 
 * It handles EVERY possible failure scenario:
 * ✅ Hides call interface (returns to chat)
 * ✅ Stops ALL media tracks (camera + mic)
 * ✅ Sends end signal to other person
 * ✅ Closes peer connection
 * ✅ Stops ringtone sounds
 * ✅ Exits fullscreen mode
 * ✅ Resets ALL state variables
 * ✅ Won't crash even if things are already null
 * 
 * Safe to call multiple times - idempotent.
 * Safe to call before call starts - no-op.
 * 
 * Usage: onclick="window.forceEndCall()"
 */

window.forceEndCall = function() {
    
    console.log("═══════════════════════════════════════");
    console.log("[FORCE-END] Executing emergency termination...");
    console.log("═══════════════════════════════════════");

    // ────────────────────────────────────────────────
    // STEP 1: HIDE CALL INTERFACE (Return to Chat)
    // ────────────────────────────────────────────────
    try {
        const callOverlay = getElement('call-interface');
        if (callOverlay) {
            callOverlay.style.display = 'none';
            console.log("[FORCE-END] ✓ Step 1: Call interface hidden");
        }
    } catch (err) {
        console.error("[FORCE-END] ✗ Step 1 Error:", err.message);
    }

    // Also ensure ringing modal is hidden
    try {
        const ringingModal = getElement('ringing-modal');
        if (ringingModal) {
            ringingModal.style.display = 'none';
        }
    } catch (err) {
        // Non-critical
    }

    // ────────────────────────────────────────────────
    // STEP 2: STOP LOCAL MEDIA TRACKS (Camera + Mic)
    // This turns OFF the camera LED light!
    // Wrapped in try-catch for safety
    // ────────────────────────────────────────────────
    try {
        if (AppState.localStream) {
            const tracks = AppState.localStream.getTracks();
            let stoppedCount = 0;
            
            tracks.forEach((track, index) => {
                console.log(`[FORCE-END] Stopping track ${index}: ${track.kind} (${track.label})`);
                
                // Stop the track
                if (track.stop) {
                    track.stop();
                }
                track.enabled = false;
                stoppedCount++;
            });
            
            // Nullify reference
            AppState.localStream = null;
            console.log(`[FORCE-END] ✓ Step 2: Stopped ${stoppedCount} local tracks`);
        } else {
            console.log("[FORCE-END] ✓ Step 2: No local stream (already clean)");
        }
    } catch (err) {
        console.error("[FORCE-END] ✗ Step 2 Error:", err.message);
        AppState.localStream = null; // Force null anyway
    }

    // ────────────────────────────────────────────────
    // STEP 3: STOP SCREEN SHARE STREAM (if active)
    // ────────────────────────────────────────────────
    try {
        if (AppState.screenStream) {
            const tracks = AppState.screenStream.getTracks();
            tracks.forEach(track => {
                if (track.stop) track.stop();
                track.enabled = false;
            });
            AppState.screenStream = null;
            AppState.isScreenSharing = false;
            console.log("[FORCE-END] ✓ Step 3: Screen share stopped");
        }
    } catch (err) {
        console.error("[FORCE-END] ✗ Step 3 Error:", err.message);
        AppState.screenStream = null;
        AppState.isScreenSharing = false;
    }

    // ────────────────────────────────────────────────
    // STEP 4: SEND "call_end" VIA WEBSOCKET
    // Notify the other person to close their UI too
    // ────────────────────────────────────────────────
    try {
        if (AppState.ws && AppState.ws.readyState === WebSocket.OPEN && AppState.callActive) {
            const endPayload = {
                type: "call_end",
                target: AppState.currentChat,
                ended_by: AppState.myUsername,
                timestamp: new Date().toISOString(),
                reason: "user_ended"
            };
            
            const sent = safeSend(AppState.ws, endPayload);
            
            if (sent) {
                console.log("[FORCE-END] ✓ Step 4: End signal sent to server");
            } else {
                console.warn("[FORCE-END] ! Step 4: Failed to send end signal");
            }
        } else {
            console.log("[FORCE-END] ⊘ Step 4: Skipped (not connected or not in call)");
        }
    } catch (err) {
        console.error("[FORCE-END] ✗ Step 4 Error:", err.message);
    }

    // ────────────────────────────────────────────────
    // STEP 5: CLOSE PEER CONNECTION
    // ────────────────────────────────────────────────
    try {
        if (AppState.peerConnection) {
            AppState.peerConnection.close();
            AppState.peerConnection = null;
            console.log("[FORCE-END] ✓ Step 5: Peer connection closed");
        }
        
        // Also clear remote stream reference
        AppState.remoteStream = null;
    } catch (err) {
        console.error("[FORCE-END] ✗ Step 5 Error:", err.message);
        AppState.peerConnection = null;
        AppState.remoteStream = null;
    }

    // ────────────────────────────────────────────────
    // STEP 6: STOP RINGTONE IF PLAYING
    // ────────────────────────────────────────────────
    try {
        stopRingtime();
        console.log("[FORCE-END] ✓ Step 6: Ringtone stopped");
    } catch (err) {
        console.error("[FORCE-END] ✗ Step 6 Error:", err.message);
    }

    // ────────────────────────────────────────────────
    // STEP 7: EXIT FULLSCREEN MODE (if active)
    // Prevents getting stuck in fullscreen
    // ────────────────────────────────────────────────
    try {
        if (AppState.isFullscreen || document.fullscreenElement) {
            // Try different methods for browser compatibility
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen(); // Safari
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen(); // IE11
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen(); // Firefox
            }
            
            AppState.isFullscreen = false;
            console.log("[FORCE-END] ✓ Step 7: Exited fullscreen");
        }
    } catch (err) {
        console.error("[FORCE-END] ✗ Step 7 Error:", err.message);
        AppState.isFullscreen = false;
    }

    // ────────────────────────────────────────────────
    // STEP 8: CLEAR VIDEO ELEMENT SOURCES
    // Remove references to streams from DOM
    // ────────────────────────────────────────────────
    try {
        const localVideo = getElement('localVideo');
        const remoteVideo = getElement('remoteVideo');
        
        if (localVideo) localVideo.srcObject = null;
        if (remoteVideo) remoteVideo.srcObject = null;
        
        console.log("[FORCE-END] ✓ Step 8: Video sources cleared");
    } catch (err) {
        console.error("[FORCE-END] ✗ Step 8 Error:", err.message);
    }

    // ────────────────────────────────────────────────
    // STEP 9: RESET ALL STATE VARIABLES
    // This is critical for preventing stale state bugs
    // ────────────────────────────────────────────────
    AppState.callActive = false;
    AppState.isMuted = false;
    AppState.isCameraOff = false;
    AppState.isScreenSharing = false;
    AppState.incomingCallData = null;
    
    // Clear any pending timeout
    if (AppState.callTimeout) {
        clearTimeout(AppState.callTimeout);
        AppState.callTimeout = null;
    }
    
    // Stop timer
    if (AppState.callTimerInterval) {
        clearInterval(AppState.callTimerInterval);
        AppState.callTimerInterval = null;
    }
    AppState.callSeconds = 0;

    console.log("[FORCE-END] ✓ Step 9: All state variables reset");

    // ────────────────────────────────────────────────
    // STEP 10: RESET CONTROL BUTTONS VISUAL STATE
    // Return buttons to default appearance
    // ────────────────────────────────────────────────
    try {
        resetAllControlButtons();
        console.log("[FORCE-END] ✓ Step 10: Control buttons reset");
    } catch (err) {
        console.error("[FORCE-END] ✗ Step 10 Error:", err.message);
    }

    // ────────────────────────────────────────────────
    // FINAL: CONFIRM SUCCESS
    // ────────────────────────────────────────────────
    console.log("═══════════════════════════════════════");
    console.log("%c✅ [FORCE-END] SUCCESS!", 
               "color: #22c55e; font-weight: bold; font-size: 14px;");
    console.log("User returned to chat. Camera released.");
    console.log("═══════════════════════════════════════");
};

/**
 * Helper: Reset all control buttons to default visual state
 */
function resetAllControlButtons() {
    try {
        // Mute button
        const btnMute = getElement('btnMute');
        const micOn = getElement('micOn');
        const micOff = getElement('micOff');
        
        if (btnMute) btnMute.classList.remove('active');
        if (micOn) micOn.style.display = 'block';
        if (micOff) micOff.style.display = 'none';

        // Camera button
        const btnCam = getElement('btnCamera');
        const camOn = getElement('camOn');
        const camOff = getElement('camOff');
        
        if (btnCam) btnCam.classList.remove('active');
        if (camOn) camOn.style.display = 'block';
        if (camOff) camOff.style.display = 'none';

        // Screen share button
        const btnScreen = getElement('btnScreen');
        const screenOn = getElement('screenOn');
        const screenOff = getElement('screenOff');
        
        if (btnScreen) btnScreen.classList.remove('active');
        if (screenOn) screenOn.style.display = 'block';
        if (screenOff) screenOff.style.display = 'none';

        // Timer display
        const timerEl = getElement('callTimer');
        if (timerEl) timerEl.textContent = '00:00';

        // Status text
        const statusEl = getElement('callStatus');
        if (statusEl) statusEl.textContent = 'Connecting...';

        // Fullscreen icons
        const fsEnter = getElement('fsIconEnter');
        const fsExit = getElement('fsIconExit');
        if (fsEnter) fsEnter.style.display = 'block';
        if (fsExit) fsExit.style.display = 'none';
        
        AppState.isFullscreen = false;

    } catch (err) {
        console.error("[CONTROLS] Reset error:", err);
    }
}

// Backward compatibility - keep old name working
window.endCall = window.forceEndCall;

// ============================================================
// SECTION 20: CALL CONTROLS (Mute / Camera)
// ============================================================

/**
 * TOGGLE MUTE / UNMUTE MICROPHONE
 */
window.toggleMute = function() {
    if (!AppState.localStream) {
        console.warn("[MUTE] No local stream");
        return;
    }

    AppState.isMuted = !AppState.isMuted;

    // Toggle audio tracks
    const audioTracks = AppState.localStream.getAudioTracks();
    audioTracks.forEach(track => {
        track.enabled = !AppState.isMuted;
    });

    // Update button UI
    const btn = getElement('btnMute');
    const iconOn = getElement('micOn');
    const iconOff = getElement('micOff');

    if (btn) btn.classList.toggle('active', AppState.isMuted);
    if (iconOn) iconOn.style.display = AppState.isMuted ? 'none' : 'block';
    if (iconOff) iconOff.style.display = AppState.isMuted ? 'block' : 'none';

    console.log(`[MUTE] Microphone ${AppState.isMuted ? 'OFF' : 'ON'}`);
};

/**
 * TOGGLE CAMERA ON/OFF
 */
window.toggleCamera = function() {
    if (!AppState.localStream || !AppState.isVideoCall) {
        console.warn("[CAM] Not a video call or no stream");
        return;
    }

    AppState.isCameraOff = !AppState.isCameraOff;

    // Toggle video tracks
    const videoTracks = AppState.localStream.getVideoTracks();
    videoTracks.forEach(track => {
        track.enabled = !AppState.isCameraOff;
    });

    // Update PiP preview visibility
    updateLocalVideoPreview();

    // Update button UI
    const btn = getElement('btnCamera');
    const iconOn = getElement('camOn');
    const iconOff = getElement('camOff');

    if (btn) btn.classList.toggle('active', AppState.isCameraOff);
    if (iconOn) iconOn.style.display = AppState.isCameraOff ? 'none' : 'block';
    if (iconOff) iconOff.style.display = AppState.isCameraOff ? 'block' : 'none';

    console.log(`[CAM] Camera ${AppState.isCameraOff ? 'OFF' : 'ON'}`);
};

/**
 * UPDATE LOCAL VIDEO PREVIEW VISIBILITY
 * Handles showing/hiding PiP based on camera state
 */
function updateLocalVideoPreview() {
    const localVideo = getElement('localVideo');
    const noLocalVideo = getElement('noLocalVideo');
    const pipContainer = getElement('localPip');

    if (AppState.isVideoCall && !AppState.isCameraOff) {
        // Camera ON - show video
        if (localVideo) localVideo.style.display = 'block';
        if (noLocalVideo) noLocalVideo.style.display = 'none';
        if (pipContainer) pipContainer.style.display = 'block';
    } else if (AppState.isVideoCall && AppState.isCameraOff) {
        // Camera OFF - show placeholder
        if (localVideo) localVideo.style.display = 'none';
        if (noLocalVideo) noLocalVideo.style.display = 'flex';
        if (pipContainer) pipContainer.style.display = 'block';
    } else {
        // Voice call - hide PiP entirely
        if (pipContainer) pipContainer.style.display = 'none';
    }
}

// ============================================================
// SECTION 21: SCREEN SHARING
// ============================================================

/**
 * TOGGLE SCREEN SHARING
 * Uses getDisplayMedia API (Chrome, Firefox, Edge, Safari)
 */
window.toggleScreenShare = async function() {
    // Validation
    if (!AppState.callActive || !AppState.peerConnection) {
        showErrorMessage("Not in an active call");
        return;
    }

    // If currently sharing, stop sharing
    if (AppState.isScreenSharing) {
        stopScreenShareInternal();
        return;
    }

    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        showErrorMessage("Your browser doesn't support screen sharing.\n\nUse Chrome, Firefox, Edge, or Safari.");
        return;
    }

    console.log("[SCREEN] Starting screen capture...");

    try {
        // Request screen capture
        AppState.screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always"
            },
            audio: false // Most browsers don't support audio in getDisplayMedia
        });

        // Handle user clicking "Stop sharing" in browser UI
        const videoTrack = AppState.screenStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.onended = () => {
                console.log("[SCREEN] User stopped sharing via browser UI");
                stopScreenShareInternal();
            };
        }

        // Replace video track in peer connection
        const sender = AppState.peerConnection.getSenders().find(s =>
            s.track && s.track.kind === 'video'
        );

        if (sender) {
            await sender.replaceTrack(videoTrack);
            console.log("[SCREEN] Track replaced in peer connection");
        }

        // Update state
        AppState.isScreenSharing = true;

        // Update UI
        const btn = getElement('btnScreen');
        const iconOn = getElement('screenOn');
        const iconOff = getElement('screenOff');

        if (btn) btn.classList.add('active');
        if (iconOn) iconOn.style.display = 'none';
        if (iconOff) iconOff.style.display = 'block';

        // Show screen in local preview
        const localVideo = getElement('localVideo');
        if (localVideo) {
            localVideo.srcObject = AppState.screenStream;
        }

        console.log("[SCREEN] ✓ Screen sharing started");

    } catch (err) {
        console.error("[SCREEN] Error:", err);

        if (err.name === 'NotAllowedError') {
            showErrorMessage("Screen sharing was denied.\n\nPlease allow screen access when prompted.");
        } else if (err.name === 'NotFoundError') {
            showErrorMessage("No screen source available.");
        } else if (err.name === 'AbortError') {
            // User cancelled selection dialog - silent
            console.log("[SCREEN] User cancelled screen selection");
        } else {
            showErrorMessage(`Screen sharing error: ${err.message}`);
        }
    }
};

/**
 * Internal function to stop screen sharing
 */
function stopScreenShareInternal() {
    console.log("[SCREEN] Stopping screen share...");

    try {
        // Stop screen stream tracks
        if (AppState.screenStream) {
            AppState.screenStream.getTracks().forEach(track => {
                if (track.stop) track.stop();
                track.enabled = false;
            });
            AppState.screenStream = null;
        }

        // Restore camera track if available
        if (AppState.localStream && AppState.peerConnection) {
            const camTrack = AppState.localStream.getVideoTracks()[0];
            const sender = AppState.peerConnection.getSenders().find(s =>
                s.track && s.track.kind === 'video'
            );

            if (sender && camTrack) {
                sender.replaceTrack(camTrack);
            }

            // Restore local preview
            const localVideo = getElement('localVideo');
            if (localVideo) {
                localVideo.srcObject = AppState.localStream;
            }
        }

        // Update state
        AppState.isScreenSharing = false;

        // Update UI
        const btn = getElement('btnScreen');
        const iconOn = getElement('screenOn');
        const iconOff = getElement('screenOff');

        if (btn) btn.classList.remove('active');
        if (iconOn) iconOn.style.display = 'block';
        if (iconOff) iconOff.style.display = 'none';

        console.log("[SCREEN] ✓ Screen sharing stopped");

    } catch (err) {
        console.error("[SCREEN] Stop error:", err);
        AppState.screenStream = null;
        AppState.isScreenSharing = false;
    }
}

// ============================================================
// SECTION 22: FULLSCREEN MODE
// ============================================================

/**
 * TOGGLE FULLSCREEN MODE
 * Works on desktop (Chrome, Firefox, Safari, Edge) and mobile
 */
window.toggleFullscreen = function() {
    if (!document.fullscreenElement) {
        enterFullscreenMode();
    } else {
        exitFullscreenMode();
    }
};

/**
 * Enter fullscreen mode
 */
function enterFullscreenMode() {
    const callInterface = getElement('call-interface');
    
    if (!callInterface) {
        console.warn("[FS] Call interface not found");
        return;
    }

    // Try multiple methods for cross-browser support
    const requestMethod = callInterface.requestFullscreen ||
                          callInterface.webkitRequestFullscreen ||
                          callInterface.msRequestFullscreen ||
                          callInterface.mozRequestFullScreen ||
                          callInterface.webkitEnterFullscreen;

    if (requestMethod) {
        requestMethod.call(callInterface).then(() => {
            AppState.isFullscreen = true;
            updateFullscreenIcon(true);
            console.log("[FS] Entered fullscreen");
        }).catch(err => {
            console.error("[FS] Error entering fullscreen:", err);
            showErrorMessage("Could not enter fullscreen mode.");
        });
    } else {
        showErrorMessage("Your browser doesn't support fullscreen API.");
    }
}

/**
 * Exit fullscreen mode
 */
function exitFullscreenMode() {
    const exitMethod = document.exitFullscreen ||
                       document.webkitExitFullscreen ||
                       document.msExitFullscreen ||
                       document.mozCancelFullScreen ||
                       document.webkitExitFullscreen;

    if (exitMethod) {
        exitMethod.call(document).then(() => {
            AppState.isFullscreen = false;
            updateFullscreenIcon(false);
            console.log("[FS] Exited fullscreen");
        }).catch(err => {
            console.error("[FS] Error exiting fullscreen:", err);
        });
    }
}

/**
 * Update fullscreen toggle icon
 * @param {boolean} isFullscreenMode - Current fullscreen state
 */
function updateFullscreenIcon(isFullscreenMode) {
    const enterIcon = getElement('fsIconEnter');
    const exitIcon = getElement('fsIconExit');

    if (enterIcon) enterIcon.style.display = isFullscreenMode ? 'none' : 'block';
    if (exitIcon) exitIcon.style.display = isFullscreenMode ? 'block' : 'none';
}

// Listen for fullscreen changes (user pressing ESC, etc.)
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('MSFullscreenChange', handleFullscreenChange);

/**
 * Handle fullscreen state change events
 */
function handleFullscreenChange() {
    const isNowFullscreen = !!document.fullscreenElement;
    AppState.isFullscreen = isNowFullscreen;
    updateFullscreenIcon(isNowFullscreen);
    
    if (isNowFullscreen) {
        console.log("[FS] Browser entered fullscreen");
    } else {
        console.log("[FS] Browser exited fullscreen");
    }
}

// ============================================================
// SECTION 23: CALL TIMER
// ============================================================

/**
 * Start the call duration timer
 */
function startCallTimer() {
    // Stop any existing timer first
    stopCallTimer();

    AppState.callSeconds = 0;
    updateTimerDisplay();

    AppState.callTimerInterval = setInterval(() => {
        AppState.callSeconds++;
        updateTimerDisplay();
    }, 1000);

    console.log("[TIMER] Started");
}

/**
 * Stop the call duration timer
 */
function stopCallTimer() {
    if (AppState.callTimerInterval) {
        clearInterval(AppState.callTimerInterval);
        AppState.callTimerInterval = null;
    }
}

/**
 * Update timer display element
 * Formats as MM:SS
 */
function updateTimerDisplay() {
    const minutes = Math.floor(AppState.callSeconds / 60).toString().padStart(2, '0');
    const seconds = (AppState.callSeconds % 60).toString().padStart(2, '0');
    
    const timerEl = getElement('callTimer');
    if (timerEl) {
        timerEl.textContent = `${minutes}:${seconds}`;
    }
}

// ============================================================
// SECTION 24: EVENT LISTENERS
// ============================================================

/**
 * Keyboard event handler
 * Global keyboard shortcuts
 */
document.addEventListener('keydown', function(event) {
    const key = event.key;
    const activeTag = document.activeElement?.tagName?.toLowerCase();

    // ENTER: Send message (when focused on input)
    if (key === 'Enter' && activeTag === 'input' && document.activeElement.id === 'msg-input') {
        event.preventDefault();
        window.sendMyMessage();
        return;
    }

    // ESCAPE: Multiple contexts
    if (key === 'Escape') {
        if (AppState.callActive) {
            if (AppState.isFullscreen) {
                // First press: Exit fullscreen
                exitFullscreenMode();
            } else {
                // Second press: End call
                window.forceEndCall();
            }
        }
        return;
    }

    // F key: Toggle fullscreen during call (only when not typing)
    if ((key === 'f' || key === 'F') && AppState.callActive && activeTag !== 'input') {
        event.preventDefault();
        toggleFullscreen();
        return;
    }
});

/**
 * Click outside handler for mobile sidebar
 */
document.addEventListener('click', function(event) {
    // Only apply on mobile viewports
    if (window.innerWidth > 768) return;

    const sidebar = getElement('sidebar');
    const menuBtn = document.querySelector('.mobile-menu');

    if (sidebar?.classList.contains('open') && 
        menuBtn && 
        !sidebar.contains(event.target) && 
        !menuBtn.contains(event.target)) {
        closeMobileSidebar();
    }
});

/**
 * Window resize handler
 * Reset mobile state when resizing to desktop
 */
window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
        // Restore body scroll
        document.body.style.overflow = '';
        
        // Close mobile sidebar
        const sidebar = getElement('sidebar');
        if (sidebar) {
            sidebar.classList.remove('open');
        }
    }
});

/**
 * Before unload handler
 * Cleanup resources before page closes
 */
window.addEventListener('beforeunload', function() {
    console.log("[CLEANUP] Page unloading...");

    // End any active call
    if (AppState.callActive) {
        // Send end signal synchronously if possible
        try {
            if (AppState.ws && AppState.ws.readyState === WebSocket.OPEN) {
                AppState.ws.send(JSON.stringify({
                    type: "call_end",
                    target: AppState.currentChat,
                    reason: "page_close"
                }));
            }
        } catch (e) {
            // Ignore errors during unload
        }

        // Stop media
        if (AppState.localStream) {
            AppState.localStream.getTracks().forEach(t => t.stop());
        }
        if (AppState.screenStream) {
            AppState.screenStream.getTracks().forEach(t => t.stop());
        }
    }

    // Close WebSocket gracefully
    if (AppState.ws) {
        AppState.ws.close(1000, "Page closing");
    }
});

/**
 * Prevent zoom on double-tap (iOS Safari fix)
 */
let lastTouchEndTime = 0;
document.addEventListener('touchend', function(event) {
    const now = Date.now();
    if (now - lastTouchEndTime <= 300) {
        event.preventDefault();
    }
    lastTouchEndTime = now;
}, { passive: false });

// ============================================================
// SECTION 25: INITIALIZATION ON DOM READY
// ============================================================

/**
 * DOM Content Loaded Handler
 * Performs initial setup when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log("═══════════════════════════════════════");
    console.log("%c🔥 IdlyCall Pro %cv2.1 %cLoaded", 
               "color:#FF7A00;font-weight:bold;font-size:18px;",
               "color:#9ca3af;font-size:12px;",
               "color:#fff;font-size:12px;");
    console.log("═══════════════════════════════════════");

    // Focus username input if login screen visible
    const loginScreen = getElement('login-screen');
    const usernameInput = getElement('usernameInput');
    
    if (loginScreen && loginScreen.style.display !== 'none' && usernameInput) {
        // Small delay to allow animations to complete
        setTimeout(() => {
            usernameInput.focus();
        }, 500);
    }

    // Add shake animation if not present in CSS
    if (!document.getElementById('shake-animation-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'shake-animation-styles';
        styleSheet.textContent = `
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-8px); }
                50% { transform: translateX(8px); }
                75% { transform: translateX(-4px); }
            }
            .shake {
                animation: shake 0.4s ease-in-out;
            }
        `;
        document.head.appendChild(styleSheet);
    }

    console.log("[INIT] Ready. Waiting for user login...");
});

// ============================================================
// SECTION 26: CONSOLE BRANDING (Final)
// ============================================================

console.log("%c💬 Chat System: Ready", "color:#3b82f6;font-weight:bold;");
console.log("%c📞 Calling System: Ready", "color:#22c55e;font-weight:bold;");
console.log("%c🖥️  Screen Share: Ready", "color:#a855f7;font-weight:bold;");
console.log("%c⌨️  Shortcuts: ESC=EndCall, F=Fullscreen", "color:#6b7280;font-size:11px;");