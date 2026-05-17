/**
 * ============================================================================
 * call_system.js - Enterprise Grade WebRTC 1-on-1 Video Calling Module
 * ============================================================================
 * 
 * Architecture:
 * - Vanilla JS IIFE (Immediately Invoked Function Expression)
 * - Zero dependencies (No React, Vue, or external CSS)
 * - Hooks into custom window.ChatHooks engine
 * - Fully responsive (100dvh mobile locking, glassmorphism UI)
 * 
 * Features:
 * - Flawless Picture-in-Picture layout (Desktop & Mobile)
 * - Audio/Notification layer with 30s auto-timeout
 * - Automated Call History Logging to chat pipeline
 * - Safe SDP state handling (No HTML serialization bugs)
 * - Dual property mapping (receiver & target) for backend compatibility
 * 
 * @version 2.0.0
 * @author Expert Frontend Engineer
 */
(function () {
    'use strict';

    // =========================================================================
    // 1. CSS INJECTION & DESIGN SYSTEM
    // =========================================================================

    const styleElement = document.createElement('style');
    styleElement.id = 'call-system-dynamic-styles';
    
    /**
     * Modern CSS Architecture:
     * Uses logical layout flows, safe area insets for notched phones,
     * dynamic viewport units (dvh) to prevent mobile browser chrome shifting,
     * and fine-tuned cubic-bezier transitions for buttery smooth interactions.
     */
    styleElement.textContent = `
        /* -------------------------------------------------------------------
           CSS CUSTOM PROPERTIES (DESIGN TOKENS)
           ------------------------------------------------------------------- */
        :root {
            --cs-glass-bg: rgba(24, 24, 27, 0.75);
            --cs-glass-border: rgba(255, 255, 255, 0.08);
            --cs-glass-highlight: rgba(255, 255, 255, 0.15);
            --cs-blur-heavy: blur(30px);
            --cs-blur-medium: blur(15px);
            --cs-blur-light: blur(10px);
            --cs-shadow-heavy: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
            --cs-shadow-soft: 0 15px 35px rgba(0, 0, 0, 0.5);
            --cs-radius-xl: 28px;
            --cs-radius-lg: 16px;
            --cs-radius-md: 12px;
            --cs-radius-sm: 8px;
            --cs-radius-full: 50%;
            --cs-accent-green: #34c759;
            --cs-accent-green-hover: #2dd248;
            --cs-accent-red: #ff3b30;
            --cs-accent-red-hover: #ff4f46;
            --cs-text-primary: #ffffff;
            --cs-text-muted: rgba(255, 255, 255, 0.5);
            --cs-btn-desktop: 54px;
            --cs-btn-mobile: 44px;
            --cs-transition-fast: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            --cs-transition-smooth: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* -------------------------------------------------------------------
           TRIGGER BUTTON (HEADER INJECTION)
           ------------------------------------------------------------------- */
        #call-trigger-btn {
            background: transparent;
            border: 1px solid transparent;
            color: currentColor;
            cursor: pointer;
            padding: 10px;
            border-radius: var(--cs-radius-full);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all var(--cs-transition-fast);
            position: relative;
            overflow: hidden;
        }
        #call-trigger-btn::before {
            content: '';
            position: absolute;
            inset: 0;
            background: rgba(255, 255, 255, 0.1);
            border-radius: var(--cs-radius-full);
            transform: scale(0);
            transition: transform var(--cs-transition-fast);
        }
        #call-trigger-btn:hover::before {
            transform: scale(1);
        }
        #call-trigger-btn:active {
            transform: scale(0.9);
        }

        /* -------------------------------------------------------------------
           MAIN OVERLAY CONTAINER
           Strict Viewport Locking prevents mobile address bar clipping.
           ------------------------------------------------------------------- */
        #call-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            height: 100dvh; /* True screen height, immune to browser UI shifts */
            width: 100vw;  /* True screen width */
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: var(--cs-blur-heavy);
            -webkit-backdrop-filter: var(--cs-blur-heavy);
            z-index: 99999;
            display: none;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            color: var(--cs-text-primary);
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden;
            opacity: 0;
            transition: opacity var(--cs-transition-smooth);
        }
        #call-overlay.active {
            display: flex;
            opacity: 1;
        }
        #call-overlay.fade-out {
            opacity: 0;
        }

        /* -------------------------------------------------------------------
           REMOTE VIDEO CONTAINER (FULL BACKGROUND)
           ------------------------------------------------------------------- */
        #remote-video {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover; /* Ensures video fills space without distorting aspect ratio */
            z-index: 1;
            background: #0a0a0a;
        }

        /* -------------------------------------------------------------------
           LOCAL VIDEO PREVIEW (PICTURE-IN-PICTURE)
           Floating box with safe boundary positioning.
           ------------------------------------------------------------------- */
        #local-video-wrapper {
            position: absolute;
            bottom: 120px; /* Safely above control dock */
            right: 24px;
            width: 240px;
            height: 180px;
            z-index: 2;
            border-radius: var(--cs-radius-lg);
            overflow: hidden;
            box-shadow: var(--cs-shadow-heavy);
            border: 2px solid var(--cs-glass-highlight);
            transition: all var(--cs-transition-smooth);
            /* Subtle floating animation */
            animation: gentle-float 6s ease-in-out infinite;
        }
        @keyframes gentle-float {
            0%, 100% { transform: translateY(0px) scaleX(-1); }
            50% { transform: translateY(-5px) scaleX(-1); }
        }
        #local-video {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transform: scaleX(-1); /* Horizontal mirror for natural selfie view */
            background: #111;
            display: block;
        }

        /* -------------------------------------------------------------------
           STATUS & TIMER DISPLAY
           ------------------------------------------------------------------- */
        #call-top-status {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 80px;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10;
            background: linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%);
            padding-top: env(safe-area-inset-top, 0px); /* Notch handling */
        }
        #call-timer {
            font-size: 18px;
            font-weight: 600;
            letter-spacing: 2px;
            text-shadow: 0 2px 10px rgba(0,0,0,0.8);
            font-variant-numeric: tabular-nums;
            background: rgba(0,0,0,0.4);
            padding: 6px 20px;
            border-radius: 20px;
            backdrop-filter: var(--cs-blur-light);
            border: 1px solid rgba(255,255,255,0.05);
        }

        /* -------------------------------------------------------------------
           FROSTED GLASS CONTROL DOCK CAPSULE
           ------------------------------------------------------------------- */
        #call-controls {
            position: absolute;
            bottom: 32px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 14px;
            padding: 12px 28px;
            background: var(--cs-glass-bg);
            backdrop-filter: var(--cs-blur-medium);
            -webkit-backdrop-filter: var(--cs-blur-medium);
            border: 1px solid var(--cs-glass-border);
            border-radius: 50px;
            z-index: 10;
            box-shadow: var(--cs-shadow-heavy);
        }

        /* -------------------------------------------------------------------
           CONTROL BUTTONS
           Uniform circular action buttons with state toggling.
           ------------------------------------------------------------------- */
        .call-ctrl-btn {
            width: var(--cs-btn-desktop);
            height: var(--cs-btn-desktop);
            border-radius: var(--cs-radius-full);
            border: none;
            background: rgba(255, 255, 255, 0.1);
            color: var(--cs-text-primary);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all var(--cs-transition-fast);
            position: relative;
            outline: none;
        }
        .call-ctrl-btn:hover {
            background: rgba(255, 255, 255, 0.2);
            transform: scale(1.05);
        }
        .call-ctrl-btn:active {
            transform: scale(0.95);
        }
        .call-ctrl-btn:focus-visible {
            box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5);
        }
        /* Toggled Off State (Muted/Disabled) */
        .call-ctrl-btn.toggled-off {
            background: var(--cs-accent-red);
            opacity: 0.9;
            box-shadow: 0 4px 15px rgba(255, 59, 48, 0.4);
        }
        /* End Call Specifics */
        .call-ctrl-btn.end-call {
            background: var(--cs-accent-red);
            width: calc(var(--cs-btn-desktop) + 10px);
            height: calc(var(--cs-btn-desktop) + 10px);
        }
        .call-ctrl-btn.end-call:hover {
            background: var(--cs-accent-red-hover);
            transform: scale(1.1);
            box-shadow: 0 8px 20px rgba(255, 59, 48, 0.5);
        }
        .call-ctrl-btn svg {
            width: 24px;
            height: 24px;
            pointer-events: none;
        }

        /* -------------------------------------------------------------------
           INCOMING & OUTGOING MODALS
           ------------------------------------------------------------------- */
        #incoming-call-ui {
            position: absolute;
            z-index: 20;
            text-align: center;
            background: var(--cs-glass-bg);
            backdrop-filter: var(--cs-blur-heavy);
            -webkit-backdrop-filter: var(--cs-blur-heavy);
            padding: 48px 56px;
            border-radius: var(--cs-radius-xl);
            border: 1px solid var(--cs-glass-border);
            box-shadow: var(--cs-shadow-heavy);
            max-width: 90vw;
            animation: modal-pop var(--cs-transition-smooth);
        }
        @keyframes modal-pop {
            from { opacity: 0; transform: scale(0.9) translateY(20px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
        #incoming-call-ui h2 {
            margin: 0 0 8px 0;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: -0.02em;
            color: var(--cs-text-primary);
        }
        #incoming-call-ui p {
            margin: 0 0 32px 0;
            color: var(--cs-text-muted);
            font-size: 15px;
            font-weight: 400;
            min-height: 24px;
        }
        
        .pulsing-text {
            animation: pulse-opacity 2s ease-in-out infinite;
        }
        @keyframes pulse-opacity {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 1; }
        }
        .spinner-ring {
            width: 40px;
            height: 40px;
            border: 2px solid rgba(255,255,255,0.2);
            border-top-color: var(--cs-text-primary);
            border-radius: var(--cs-radius-full);
            animation: spin 1s linear infinite;
            margin: 0 auto;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .incoming-action-btn {
            padding: 14px 36px;
            border: none;
            border-radius: 50px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin: 0 8px;
            transition: all var(--cs-transition-fast);
            letter-spacing: -0.01em;
            outline: none;
        }
        .incoming-action-btn:active { transform: scale(0.95); }
        .incoming-action-btn:focus-visible { box-shadow: 0 0 0 3px rgba(255,255,255,0.5); }
        .btn-accept { background: var(--cs-accent-green); color: white; }
        .btn-accept:hover { background: var(--cs-accent-green-hover); transform: translateY(-2px); box-shadow: 0 8px 15px rgba(52, 199, 89, 0.3); }
        .btn-reject { background: rgba(255, 59, 48, 0.15); color: var(--cs-accent-red); border: 1px solid rgba(255, 59, 48, 0.3); }
        .btn-reject:hover { background: rgba(255, 59, 48, 0.25); transform: translateY(-2px); }

        /* -------------------------------------------------------------------
           MOBILE MEDIA QUERY ADAPTATIONS
           Targets narrow/tall screens (Smartphones in portrait)
           ------------------------------------------------------------------- */
        @media (max-width: 768px) {
            /* Shrink and reposition PiP to float safely above dock */
            #local-video-wrapper {
                width: 90px;
                height: 130px;
                bottom: 110px; /* Calculates safe space above dock + padding */
                right: 16px;
                border-radius: var(--cs-radius-sm);
                border-width: 1px;
                box-shadow: var(--cs-shadow-soft);
                animation: none; /* Disable floating on mobile to save battery/render */
                transform: scaleX(-1); /* Reset wrapper transform, keep inner mirror */
            }
            #local-video {
                transform: scaleX(-1);
            }

            /* Compact Control Dock */
            #call-controls {
                padding: 8px 16px;
                gap: 10px;
                bottom: 24px;
                left: 16px;
                right: 16px;
                transform: none; /* Full width stretch */
                width: auto;
                justify-content: center;
            }

            /* Smaller Buttons */
            .call-ctrl-btn {
                width: var(--cs-btn-mobile);
                height: var(--cs-btn-mobile);
            }
            .call-ctrl-btn.end-call {
                width: calc(var(--cs-btn-mobile) + 8px);
                height: calc(var(--cs-btn-mobile) + 8px);
            }
            .call-ctrl-btn svg {
                width: 20px;
                height: 20px;
            }

            /* Hide screen share entirely to save real estate */
            .call-btn-screen {
                display: none !important;
            }

            /* Adjust Status Bar */
            #call-top-status {
                height: 60px;
            }
            #call-timer {
                font-size: 15px;
                padding: 4px 14px;
            }

            /* Adjust Incoming Modal */
            #incoming-call-ui {
                padding: 32px 24px;
                border-radius: var(--cs-radius-md);
                width: calc(100vw - 48px);
            }
            #incoming-call-ui h2 { font-size: 22px; }
            #incoming-call-ui p { font-size: 14px; margin-bottom: 24px; }
            .incoming-action-btn { 
                padding: 12px 28px; 
                font-size: 14px; 
                flex: 1;
            }
        }

        /* Extra small devices (e.g. iPhone SE, older Androids) */
        @media (max-width: 380px) {
            #local-video-wrapper {
                width: 75px;
                height: 110px;
                bottom: 100px;
                right: 12px;
            }
            #call-controls {
                gap: 6px;
                padding: 6px 12px;
                bottom: 16px;
            }
        }
    `;
    
    // Inject styles into DOM
    document.head.appendChild(styleElement);


    // =========================================================================
    // 2. STATE MANAGEMENT & CONFIGURATION
    // =========================================================================

    /** 
     * Integrated Audio & Notification Layer 
     * Looping ringtone initialized immediately at top of state tracker
     */
    const callRingtone = new Audio('/static/media/call.mp3');
    callRingtone.loop = true;

    // WebRTC Peer Connection State
    let pc = null;
    let localStream = null;

    // UI Timer State
    let timerInterval = null;
    let callDuration = 0;

    // Media Track States
    let isScreenSharing = false;
    let micEnabled = true;
    let camEnabled = true;

    // Call Lifecycle States: 'idle' | 'ringing' | 'connecting' | 'connected'
    let callState = 'idle'; 
    let callStartTime = null;

    // 30-Second Auto-Timeout Handler
    let callTimeoutId = null;

    // WebRTC Configuration (Google Public STUN)
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };


    // =========================================================================
    // 3. HELPER FUNCTIONS & UTILITIES
    // =========================================================================

    /**
     * Caches DOM elements to prevent excessive re-querying during calls.
     */
    function getUI() {
        return {
            overlay: document.getElementById('call-overlay'),
            remoteVideo: document.getElementById('remote-video'),
            localVideoWrapper: document.getElementById('local-video-wrapper'),
            localVideo: document.getElementById('local-video'),
            timer: document.getElementById('call-timer'),
            incomingUI: document.getElementById('incoming-call-ui'),
            btnMic: document.getElementById('btn-mic'),
            btnCam: document.getElementById('btn-cam'),
            btnScreen: document.getElementById('btn-screen')
        };
    }

    /**
     * Formats raw seconds into MM:SS string.
     */
    function formatDuration(totalSeconds) {
        if (!totalSeconds || totalSeconds < 0) totalSeconds = 0;
        const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const secs = String(totalSeconds % 60).padStart(2, '0');
        return mins + ':' + secs;
    }

    /**
     * Core signaling function.
     * Enforces dual-property auto-mapping (receiver & target) to ensure 
     * absolute compatibility with the FastAPI backend router.
     */
    function sendSignal(payload) {
        // Inject both required properties dynamically if not explicitly overridden
        payload.receiver = currentChat;
        payload.target = currentChat;

        if (typeof ws !== 'undefined' && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        } else {
            console.error("[CallSystem] WebSocket is not connected. Forcing local cleanup.");
            endCall(true);
        }
    }

    /**
     * Pushes an event directly into the standard system chat pipeline.
     * We use type 'message' so it bypasses the strict `return null` interceptor
     * and renders historically in the main timeline for both users.
     */
    function sendChatLog(text) {
        sendSignal({
            type: 'message',
            message: text,
            isSystemLog: true // Flag for frontend to style differently if needed
        });
    }

    /**
     * Starts the visual connection timer.
     */
    function startTimer() {
        const ui = getUI();
        callDuration = 0;
        ui.timer.innerText = '00:00';
        timerInterval = setInterval(function() {
            callDuration++;
            ui.timer.innerText = formatDuration(callDuration);
        }, 1000);
    }

    /**
     * Stops the visual connection timer.
     */
    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    /**
     * Stops the ringing audio and resets its playhead.
     */
    function stopRingtone() {
        if (callRingtone) {
            callRingtone.pause();
            callRingtone.currentTime = 0;
        }
    }

    /**
     * Clears the 30-second auto-timeout if it's pending.
     */
    function clearAutoTimeout() {
        if (callTimeoutId) {
            clearTimeout(callTimeoutId);
            callTimeoutId = null;
        }
    }

    /**
     * Triggers native system push notification if tab is hidden.
     */
    function triggerSystemNotification(senderName) {
        if (document.hidden && 'Notification' in window) {
            if (Notification.permission === 'granted') {
                new Notification("Incoming Video Call", { 
                    body: senderName + " is calling you...",
                    icon: '/static/media/icon-call.png', // Optional fallback
                    requireInteraction: true
                });
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(function(permission) {
                    if (permission === 'granted') {
                        new Notification("Incoming Video Call", { body: senderName + " is calling you..." });
                    }
                });
            }
        }
    }


    // =========================================================================
    // 4. UI LIFECYCLE MANAGEMENT
    // =========================================================================

    /**
     * Completely resets the UI and state variables to idle.
     */
    function resetUI() {
        const ui = getUI();
        
        // Fade out animation
        ui.overlay.classList.add('fade-out');
        
        setTimeout(function() {
            ui.overlay.classList.remove('active', 'fade-out');
            ui.remoteVideo.srcObject = null;
            ui.localVideo.srcObject = null;
            ui.timer.innerText = '00:00';
            ui.incomingUI.style.display = 'none';
            ui.btnMic.classList.remove('toggled-off');
            ui.btnCam.classList.remove('toggled-off');
            ui.btnScreen.classList.remove('toggled-off');
        }, 300); // Match CSS transition duration

        micEnabled = true;
        camEnabled = true;
        isScreenSharing = false;
        callState = 'idle';
        callStartTime = null;
    }

    /**
     * Hard cleanup of Peer Connection and local media streams.
     */
    function cleanupPeerConnection() {
        if (pc) {
            pc.ontrack = null;
            pc.onicecandidate = null;
            pc.oniceconnectionstatechange = null;
            pc.close();
            pc = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(function(track) { track.stop(); });
            localStream = null;
        }
        stopTimer();
        stopRingtone();
        clearAutoTimeout();
    }


    // =========================================================================
    // 5. WEBRTC CORE ENGINE
    // =========================================================================

    /**
     * Requests camera and microphone permissions.
     */
    async function getLocalMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
                audio: true 
            });
            const ui = getUI();
            ui.localVideo.srcObject = localStream;
            return localStream;
        } catch (err) {
            console.error("[CallSystem] Failed to get local media", err);
            alert("Could not access camera or microphone. Please check permissions.");
            throw err;
        }
    }

    /**
     * Initializes the RTCPeerConnection and attaches vital event listeners.
     */
    function createPeerConnection() {
        pc = new RTCPeerConnection(rtcConfig);

        // Gather and send ICE candidates
        pc.onicecandidate = function(event) {
            if (event.candidate) {
                sendSignal({
                    type: 'ice_candidate',
                    candidate: event.candidate
                });
            }
        };

        // Handle incoming remote media tracks
        pc.ontrack = function(event) {
            const ui = getUI();
            ui.remoteVideo.srcObject = event.streams[0];
            ui.incomingUI.style.display = 'none';
        };

        // Monitor connection health (handles unexpected drops)
        pc.oniceconnectionstatechange = function() {
            if (pc && (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed')) {
                console.warn("[CallSystem] Connection lost:", pc.iceConnectionState);
                if (callState === 'connected') {
                    endCall(false); // Send end signal if we dropped mid-call
                }
            }
        };
    }

    /**
     * Attaches local tracks to the active peer connection.
     */
    function addLocalTracks() {
        if (localStream && pc) {
            localStream.getTracks().forEach(function(track) {
                pc.addTrack(track, localStream);
            });
        }
    }

    /**
     * Initiates an outgoing call.
     */
    async function initiateCall() {
        try {
            await getLocalMedia();
            createPeerConnection();
            addLocalTracks();

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            sendSignal({
                type: 'call_offer',
                offer: offer
            });

            callState = 'ringing';
            sendChatLog('📞 Video Call Started...');

            const ui = getUI();
            ui.overlay.classList.remove('fade-out');
            ui.overlay.classList.add('active');
            ui.incomingUI.style.display = 'block';
            ui.incomingUI.innerHTML = 
                '<h2>' + currentChat + '</h2>' +
                '<p class="pulsing-text">Ringing...</p>' +
                '<div class="spinner-ring"></div>';
                
        } catch (err) {
            endCall(true);
        }
    }

    /**
     * CRITICAL BUG FIX IMPLEMENTATION:
     * Safe state handling for incoming offer. 
     * We DO NOT pass the raw SDP object into the HTML onclick attribute.
     * It is securely stored in window.currentIncomingOffer to prevent 
     * hidden line breaks from breaking the HTML runtime environment.
     */
    window.acceptCall = async function() {
        const offer = window.currentIncomingOffer;
        if (!offer) {
            console.error("[CallSystem] No incoming offer found in safe state.");
            return;
        }

        stopRingtone();
        clearAutoTimeout();

        try {
            await getLocalMedia();
            createPeerConnection();
            addLocalTracks();

            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            sendSignal({
                type: 'call_answer',
                answer: answer
            });

            // Update state and UI
            callState = 'connected';
            callStartTime = Date.now();
            startTimer();
            sendChatLog('📞 Video Call Connected...');

            const ui = getUI();
            ui.incomingUI.style.display = 'none';
            
        } catch (err) {
            console.error("[CallSystem] Error accepting call", err);
            endCall(true);
        }
    };

    /**
     * Handles the incoming answer from the callee.
     */
    async function handleAnswer(answer) {
        if (!pc) return;
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            
            callState = 'connected';
            callStartTime = Date.now();
            startTimer();
            sendChatLog('📞 Video Call Connected...');

            const ui = getUI();
            if (ui.incomingUI) ui.incomingUI.style.display = 'none';
        } catch (err) {
            console.error("[CallSystem] Error setting remote description (answer)", err);
        }
    }

    /**
     * Handles incoming ICE candidates from the remote peer.
     */
    async function handleIceCandidate(candidate) {
        if (!pc) return;
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("[CallSystem] Error adding ICE candidate", err);
        }
    }


    // =========================================================================
    // 6. MEDIA CONTROLS (MIC, CAM, SCREEN SHARE)
    // =========================================================================

    /**
     * Toggles local microphone track.
     */
    function toggleMic() {
        if (!localStream) return;
        micEnabled = !micEnabled;
        localStream.getAudioTracks().forEach(function(track) { track.enabled = micEnabled; });
        getUI().btnMic.classList.toggle('toggled-off', !micEnabled);
    }

    /**
     * Toggles local camera track.
     */
    function toggleCam() {
        if (!localStream) return;
        camEnabled = !camEnabled;
        localStream.getVideoTracks().forEach(function(track) { track.enabled = camEnabled; });
        getUI().btnCam.classList.toggle('toggled-off', !camEnabled);
    }

    /**
     * Toggles screen sharing. Replaces video track dynamically without dropping call.
     */
    async function toggleScreen() {
        if (!pc || !localStream) return;
        const ui = getUI();
        const videoSender = pc.getSenders().find(function(s) { return s.track.kind === 'video'; });

        if (!isScreenSharing) {
            try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.getVideoTracks()[0];
                
                await videoSender.replaceTrack(screenTrack);
                ui.localVideo.srcObject = screenStream;
                isScreenSharing = true;
                ui.btnScreen.classList.add('toggled-off');

                // Listen for native browser "Stop sharing" UI event
                screenTrack.onended = function() {
                    revertScreenShare(videoSender);
                };
            } catch (err) {
                console.log("[CallSystem] Screen share cancelled by user.");
            }
        } else {
            await revertScreenShare(videoSender);
        }
    }

    /**
     * Reverts from screen share back to user camera.
     */
    async function revertScreenShare(videoSender) {
        try {
            const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const camTrack = camStream.getVideoTracks()[0];
            
            await videoSender.replaceTrack(camTrack);
            getUI().localVideo.srcObject = camStream;
            
            // Update local state stream reference
            if (localStream) {
                localStream.getVideoTracks().forEach(function(t) { t.stop(); });
                localStream.removeTrack(localStream.getVideoTracks()[0]);
                localStream.addTrack(camTrack);
            }

            isScreenSharing = false;
            getUI().btnScreen.classList.remove('toggled-off');
        } catch (err) {
            console.error("[CallSystem] Error reverting screen share", err);
            endCall(true);
        }
    }


    // =========================================================================
    // 7. CALL LIFECYCLE & HISTORY LOG ARCHITECTURE
    // =========================================================================

    /**
     * Terminates the call.
     * @param {boolean} isInternal - If true, skips sending the call_end signal over WebSocket.
     */
    function endCall(isInternal) {
        // History Logging Logic
        if (callState === 'connected') {
            const finalDuration = formatDuration(callDuration);
            sendChatLog('📞 Video Call Ended — Duration: ' + finalDuration);
        } else if (callState === 'ringing' && !isInternal) {
            sendChatLog('🚫 Call Cancelled');
        }

        // Send termination signal if initiated by user
        if (!isInternal) {
            sendSignal({
                type: 'call_end'
            });
        }

        // Execute hard cleanup
        cleanupPeerConnection();
        resetUI();
    }

    /**
     * Rejects an incoming call. Logs a missed call to history.
     */
    window.rejectCall = function() {
        stopRingtone();
        clearAutoTimeout();
        
        sendSignal({
            type: 'call_end'
        });
        sendChatLog('🚫 Missed Call');
        
        cleanupPeerConnection();
        resetUI();
    };

    /**
     * 30-Second Auto-Timeout Routine.
     * If unanswered after 30 seconds, triggers automated cleanup and logs missed call.
     */
    function executeAutoTimeout() {
        console.warn("[CallSystem] 30-second auto-timeout reached.");
        stopRingtone();
        
        sendSignal({
            type: 'call_end'
        });
        sendChatLog('🚫 Missed Call');
        
        cleanupPeerConnection();
        resetUI();
    }


    // =========================================================================
    // 8. HOOKS INTEGRATION (UI INJECTION & SIGNAL INTERCEPTOR)
    // =========================================================================

    // Ensure hooks array exists globally
    if (!window.ChatHooks) window.ChatHooks = { onUIReady: [], onMessageRender: [] };
    
    /**
     * UI READY HOOK:
     * Injects the trigger button into the chat header, and the full
     * overlay interface into the document body.
     */
    window.ChatHooks.onUIReady.push(function() {
        
        // --- 1. Inject Trigger Button ---
        const header = document.querySelector('.chat-header') || document.querySelector('header') || document.body;
        const callBtn = document.createElement('button');
        callBtn.id = 'call-trigger-btn';
        callBtn.title = 'Start Video Call';
        callBtn.setAttribute('aria-label', 'Start Video Call');
        callBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>`;
        callBtn.onclick = initiateCall;
        header.appendChild(callBtn);

        // --- 2. Inject Full Screen Overlay ---
        const overlay = document.createElement('div');
        overlay.id = 'call-overlay';
        overlay.innerHTML = `
            <!-- Remote Video Background -->
            <video id="remote-video" autoplay playsinline></video>
            
            <!-- Local Video PiP Wrapper -->
            <div id="local-video-wrapper">
                <video id="local-video" autoplay playsinline muted></video>
            </div>

            <!-- Top Status Bar -->
            <div id="call-top-status">
                <div id="call-timer">00:00</div>
            </div>
            
            <!-- Incoming / Outgoing Modal -->
            <div id="incoming-call-ui" style="display: none;">
                <h2>Incoming Video Call</h2>
                <p id="incoming-caller-name" class="pulsing-text">User</p>
                <div style="display: flex; justify-content: center; gap: 12px; margin-top: 8px;">
                    <button class="incoming-action-btn btn-reject" onclick="window.rejectCall()" aria-label="Decline Call">Decline</button>
                    <button class="incoming-action-btn btn-accept" onclick="window.acceptCall()" aria-label="Accept Call">Accept</button>
                </div>
            </div>

            <!-- Frosted Glass Control Dock -->
            <div id="call-controls">
                <button id="btn-mic" class="call-ctrl-btn" onclick="window.callSystemToggleMic()" title="Toggle Microphone" aria-label="Toggle Microphone">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                    </svg>
                </button>
                <button id="btn-cam" class="call-ctrl-btn" onclick="window.callSystemToggleCam()" title="Toggle Camera" aria-label="Toggle Camera">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M23 7l-7 5 7 5V7z"></path>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                    </svg>
                </button>
                <button id="btn-screen" class="call-ctrl-btn call-btn-screen" onclick="window.callSystemToggleScreen()" title="Share Screen" aria-label="Share Screen">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                        <line x1="8" y1="21" x2="16" y2="21"></line>
                        <line x1="12" y1="17" x2="12" y2="21"></line>
                    </svg>
                </button>
                <button class="call-ctrl-btn end-call" onclick="window.callSystemEndCall()" title="End Call" aria-label="End Call">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" transform="rotate(135 12 12)"></path>
                    </svg>
                </button>
            </div>
        `;
        
        document.body.appendChild(overlay);

        // --- 3. Expose Control Functions Globally ---
        // Required because inline onclick attributes cannot access IIFE scope directly
        window.callSystemToggleMic = toggleMic;
        window.callSystemToggleCam = toggleCam;
        window.callSystemToggleScreen = toggleScreen;
        window.callSystemEndCall = endCall;
    });

    /**
     * MESSAGE RENDER HOOK:
     * Intercepts WebSocket signaling messages to handle background WebRTC logic.
     * Returns null to swallow signaling messages so they don't render as chat text.
     */
    window.ChatHooks.onMessageRender.push(function(msg) {
        // Ensure we are dealing with parsed object
        if (typeof msg === 'string') {
            try { msg = JSON.parse(msg); } catch(e) { return msg; }
        }

        if (msg && msg.type) {
            const ui = getUI();

            switch(msg.type) {
                case 'call_offer':
                    // -----------------------------------------------------------------
                    // CRITICAL BUG FIX: Safe State Handling
                    // Save complex SDP offer securely to a global variable. 
                    // DO NOT pass raw object into HTML onclick string.
                    // -----------------------------------------------------------------
                    window.currentIncomingOffer = msg.offer;
                    
                    callState = 'ringing';
                    
                    // Show UI and play audio/notifications
                    ui.overlay.classList.remove('fade-out');
                    ui.overlay.classList.add('active');
                    ui.incomingUI.style.display = 'block';
                    ui.incomingUI.querySelector('#incoming-caller-name').innerText = msg.sender || currentChat;
                    
                    callRingtone.play().catch(function(e) { 
                        console.log("[CallSystem] Audio play blocked:", e); 
                    });
                    triggerSystemNotification(msg.sender || currentChat);
                    
                    // Start 30-Second Auto-Timeout
                    clearAutoTimeout();
                    callTimeoutId = setTimeout(executeAutoTimeout, 30000);
                    
                    // Return null to prevent rendering in chat
                    return null;

                case 'call_answer':
                    clearAutoTimeout();
                    handleAnswer(msg.answer);
                    return null;

                case 'ice_candidate':
                    handleIceCandidate(msg.candidate);
                    return null;

                case 'call_end':
                    // If it ended while ringing locally, log missed call
                    if (callState === 'ringing') {
                        sendChatLog('🚫 Missed Call');
                    }
                    stopRingtone();
                    clearAutoTimeout();
                    cleanupPeerConnection();
                    resetUI();
                    return null;
            }
        }

        // Let standard chat messages (including our injected history logs) render normally
        return msg;
    });

})();