(function() {
    console.log("Loading WhatsApp-Edition Ultimate WebRTC Engine...");

    // ==========================================
    // 1. BULLETPROOF INITIALIZATION & DOM SCRAPING
    // ==========================================
    window.IdlyPlugins = window.IdlyPlugins || {};
    window.IdlyPlugins.messageHandlers = window.IdlyPlugins.messageHandlers || {};

    function getSocket() {
        return window.ws || window.socket || window.websocket || null;
    }

    // FIX FOR image_0bbf5f.jpg: Aggressive Target User Extraction
    function getTargetUser() {
        // 1. Try standard variable
        if (window.currentChat && window.currentChat !== "Public" && window.currentChat !== "Messages") {
            return window.currentChat;
        }
        
        // 2. DOM Scrape Fallback (Reads the "@ TG" from your header)
        const headerEl = document.querySelector('.chat-header, .header-info, #chat-title');
        if (headerEl) {
            const text = headerEl.innerText || "";
            if (text.includes('@')) {
                const extracted = text.split('@')[1].split('\n')[0].replace('Direct Message', '').trim();
                if (extracted && extracted !== "Public") return extracted;
            }
        }

        // 3. Sidebar Active State Fallback
        const activeItem = document.querySelector('.user-item.active .username, .chat-item.active .name');
        if (activeItem) {
            const extracted = activeItem.innerText.trim();
            if (extracted && extracted !== "Public") return extracted;
        }

        return "Public";
    }

    function notify(msg, type="info") {
        if (typeof window.showToast === "function") window.showToast(msg, type);
        else console.log(`[${type.toUpperCase()}] ${msg}`);
    }

    // ==========================================
    // 2. ADVANCED CALL STATE MANAGEMENT
    // ==========================================
    const callState = {
        peerConnection: null,
        localStream: null,
        remoteStream: null,
        callStatus: 'idle',
        isReceiving: false,
        isMuted: false,
        isVideoEnabled: true,
        isScreenSharing: false,
        timerInterval: null,
        startTime: null,
        audioContext: null,
        analyser: null,
        hideControlsTimeout: null
    };

    const servers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    // ==========================================
    // 3. WHATSAPP DESIGN LANGUAGE CSS
    // ==========================================
    const styles = `
        <style>
            /* Base Immersive Background */
            #wa-call-modal {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100dvh;
                background: #111B21; z-index: 10000; display: none; flex-direction: column;
                opacity: 0; transition: opacity 0.3s ease; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            #wa-call-modal.active { display: flex; opacity: 1; }
            
            /* Main Video Placement (Edge-to-edge) */
            .wa-remote-vid { 
                position: absolute; inset: 0; width: 100%; height: 100%;
                object-fit: cover; z-index: 1; transition: filter 0.3s;
                background: #111B21;
            }
            
            /* Active Speaker Glow */
            .wa-remote-vid.speaking { box-shadow: inset 0 0 0 4px #00A884; }

            /* Self Video Preview Placement */
            .wa-local-vid {
                position: absolute; right: 24px; bottom: 120px;
                width: 150px; height: 200px; object-fit: cover;
                border-radius: 16px; border: 2px solid rgba(255,255,255,0.1);
                background: #202C33; z-index: 50; box-shadow: 0 8px 24px rgba(0,0,0,0.35);
                transition: opacity 0.3s, transform 0.1s; cursor: grab; touch-action: none;
            }
            .wa-local-vid:active { cursor: grabbing; transform: scale(1.05); }

            /* Audio Call & Camera Off Layout */
            .audio-mode .wa-remote-vid, .audio-mode .wa-local-vid { opacity: 0; pointer-events: none; }
            .camera-off .wa-remote-vid, .camera-off .wa-local-vid { 
                backdrop-filter: blur(20px); opacity: 0; pointer-events: none;
            }
            
            /* Large Avatar for Audio Mode */
            .wa-avatar-container {
                position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%);
                z-index: 10; display: none; flex-direction: column; align-items: center;
            }
            .audio-mode .wa-avatar-container, .camera-off .wa-avatar-container { display: flex; }
            
            .wa-avatar {
                width: 160px; height: 160px; border-radius: 50%;
                background: #202C33; border: 4px solid #00A884;
                display: flex; align-items: center; justify-content: center; color: white;
                box-shadow: 0 8px 24px rgba(0,0,0,0.35); animation: wa-pulse 2s infinite;
            }
            .wa-avatar svg { width: 80px; height: 80px; fill: #00A884; }

            /* Top Status Area */
            .wa-header {
                position: absolute; top: 0; left: 0; width: 100%;
                padding: 40px 20px 20px; text-align: center; color: white; z-index: 20;
                background: linear-gradient(to bottom, rgba(17,27,33,0.9), transparent);
                text-shadow: 0 2px 4px rgba(0,0,0,0.8); transition: opacity 0.3s;
            }
            .wa-header h2 { margin: 0; font-size: 28px; font-weight: 500; letter-spacing: 0.5px; }
            .wa-header p { margin: 8px 0 0; font-size: 16px; opacity: 0.9; color: #00A884; }
            .wa-timer { 
                font-size: 16px; margin-top: 10px; font-variant-numeric: tabular-nums; 
                display: none; background: rgba(32,44,51,0.75); padding: 6px 16px; 
                border-radius: 20px; backdrop-filter: blur(12px); display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }

            /* Bottom Control Dock Placement */
            .wa-controls {
                position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%);
                z-index: 100; background: rgba(32,44,51,0.75); backdrop-filter: blur(12px);
                border-radius: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);
                display: flex; align-items: center; justify-content: center; gap: 24px;
                padding: 15px 25px; transition: opacity 0.3s;
            }
            .wa-controls.hidden { opacity: 0; pointer-events: none; }
            .wa-header.hidden { opacity: 0; pointer-events: none; }

            /* Circular Button Layout */
            .wa-btn {
                width: 60px; height: 60px; border-radius: 50%; border: none;
                display: flex; align-items: center; justify-content: center;
                background: rgba(255,255,255,0.1); color: white;
                cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            .wa-btn:active { transform: scale(0.9); }
            .wa-btn:hover { background: rgba(255,255,255,0.2); }
            .wa-btn.disabled { background: rgba(255,255,255,0.8); color: #111B21; }
            .wa-btn svg { width: 28px; height: 28px; fill: currentColor; }

            /* Action Buttons */
            .btn-accept { background: #00A884; color: white; display: none; animation: wa-bounce 2s infinite; }
            .btn-accept:hover { background: #008f6f; }
            .btn-reject { background: #E53935; color: white; }
            .btn-reject:hover { background: #c62828; }

            /* Mobile WhatsApp Layout Adjustments */
            @media (max-width: 768px) {
                .wa-local-vid { width: 110px; height: 150px; bottom: 140px; right: 16px; }
                .wa-controls { bottom: calc(20px + env(safe-area-inset-bottom)); width: 90%; gap: 16px; padding: 12px 20px; }
                .wa-btn { width: 56px; height: 56px; }
                .btn-accept, .btn-reject { width: 64px; height: 64px; }
            }

            /* Animations */
            @keyframes wa-pulse {
                0% { box-shadow: 0 0 0 0 rgba(0, 168, 132, 0.6); }
                70% { box-shadow: 0 0 0 30px rgba(0, 168, 132, 0); }
                100% { box-shadow: 0 0 0 0 rgba(0, 168, 132, 0); }
            }
            @keyframes wa-bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }
        </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styles);

    // ==========================================
    // 4. INJECT HTML UI
    // ==========================================
    const modalHtml = `
        <div id="wa-call-modal">
            <div class="wa-header" id="wa-header">
                <h2 id="wa-name">John Doe</h2>
                <p id="wa-status">Calling...</p>
                <div class="wa-timer" id="wa-timer" style="display:none;">00:00</div>
            </div>
            
            <video id="wa-remote-vid" class="wa-remote-vid" autoplay playsinline></video>
            <video id="wa-local-vid" class="wa-local-vid" autoplay playsinline muted></video>
            
            <div class="wa-avatar-container">
                <div class="wa-avatar">
                    <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                </div>
            </div>

            <div class="wa-controls" id="wa-controls">
                <button id="wa-btn-screen" class="wa-btn desktop-only" title="Share Screen">
                    <svg viewBox="0 0 24 24"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>
                </button>
                <button id="wa-btn-cam" class="wa-btn" title="Toggle Camera">
                    <svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                </button>
                <button id="wa-btn-mic" class="wa-btn" title="Mute Microphone">
                    <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                </button>
                <button id="wa-btn-pip" class="wa-btn desktop-only" title="Picture-in-Picture">
                    <svg viewBox="0 0 24 24"><path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/></svg>
                </button>
                <button id="wa-btn-accept" class="wa-btn btn-accept" title="Accept Call">
                    <svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
                </button>
                <button id="wa-btn-reject" class="wa-btn btn-reject" title="End Call">
                    <svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
                </button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // ==========================================
    // 5. INJECT HEADER START BUTTONS
    // ==========================================
    const headerActions = document.querySelector('.chat-header-actions');
    if (headerActions) {
        const videoBtn = document.createElement('button');
        videoBtn.className = 'icon-btn';
        videoBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
        videoBtn.onclick = () => initCall(true);
        
        const audioBtn = document.createElement('button');
        audioBtn.className = 'icon-btn';
        audioBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>`;
        audioBtn.onclick = () => initCall(false);

        headerActions.insertBefore(videoBtn, headerActions.firstChild);
        headerActions.insertBefore(audioBtn, headerActions.firstChild);
    }

    // DOM Elements Map
    const DOM = {
        modal: document.getElementById('wa-call-modal'),
        header: document.getElementById('wa-header'),
        controls: document.getElementById('wa-controls'),
        localVid: document.getElementById('wa-local-vid'),
        remoteVid: document.getElementById('wa-remote-vid'),
        btnAccept: document.getElementById('wa-btn-accept'),
        btnReject: document.getElementById('wa-btn-reject'),
        status: document.getElementById('wa-status'),
        peerName: document.getElementById('wa-name'),
        timer: document.getElementById('wa-timer'),
        btnMic: document.getElementById('wa-btn-mic'),
        btnCam: document.getElementById('wa-btn-cam'),
        btnScreen: document.getElementById('wa-btn-screen'),
        btnPip: document.getElementById('wa-btn-pip')
    };

    // ==========================================
    // 6. AUTO-HIDE CONTROLS & DRAG-AND-DROP
    // ==========================================
    function showControlsTemporarily() {
        DOM.controls.classList.remove('hidden');
        DOM.header.classList.remove('hidden');
        clearTimeout(callState.hideControlsTimeout);
        
        callState.hideControlsTimeout = setTimeout(() => {
            if (callState.callStatus === 'connected') {
                DOM.controls.classList.add('hidden');
                DOM.header.classList.add('hidden');
            }
        }, 3500);
    }
    
    DOM.modal.addEventListener('mousemove', showControlsTemporarily);
    DOM.modal.addEventListener('touchstart', showControlsTemporarily);

    // Drag-and-Drop for Floating Self Video
    let isDragging = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;
    
    function dragStart(e) {
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }
        if (e.target === DOM.localVid) isDragging = true;
    }
    function dragEnd(e) { initialX = currentX; initialY = currentY; isDragging = false; }
    function drag(e) {
        if (!isDragging) return;
        e.preventDefault();
        showControlsTemporarily();
        if (e.type === "touchmove") {
            currentX = e.touches[0].clientX - initialX;
            currentY = e.touches[0].clientY - initialY;
        } else {
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
        }
        xOffset = currentX; yOffset = currentY;
        DOM.localVid.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    }
    
    DOM.modal.addEventListener("mousedown", dragStart, false);
    DOM.modal.addEventListener("mouseup", dragEnd, false);
    DOM.modal.addEventListener("mousemove", drag, false);
    DOM.modal.addEventListener("touchstart", dragStart, {passive: false});
    DOM.modal.addEventListener("touchend", dragEnd, false);
    DOM.modal.addEventListener("touchmove", drag, {passive: false});

    // ==========================================
    // 7. ACTIVE SPEAKER DETECTION
    // ==========================================
    function setupActiveSpeaker() {
        if (!callState.remoteStream) return;
        try {
            callState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            callState.analyser = callState.audioContext.createAnalyser();
            const source = callState.audioContext.createMediaStreamSource(callState.remoteStream);
            source.connect(callState.analyser);
            callState.analyser.fftSize = 256;
            const bufferLength = callState.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            function checkLevel() {
                if (callState.callStatus !== 'connected') return;
                callState.analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for(let i=0; i<bufferLength; i++) sum += dataArray[i];
                let average = sum / bufferLength;
                
                if(average > 30) DOM.remoteVid.classList.add('speaking');
                else DOM.remoteVid.classList.remove('speaking');
                
                requestAnimationFrame(checkLevel);
            }
            checkLevel();
        } catch(e) { console.warn("Active speaker detection not supported"); }
    }

    // ==========================================
    // 8. CORE ENGINE & LIFECYCLE
    // ==========================================
    function startTimer() {
        callState.startTime = Date.now();
        DOM.timer.style.display = 'inline-block';
        callState.timerInterval = setInterval(() => {
            const secs = Math.floor((Date.now() - callState.startTime) / 1000);
            const m = Math.floor(secs / 60).toString().padStart(2, '0');
            const s = (secs % 60).toString().padStart(2, '0');
            DOM.timer.innerText = `${m}:${s}`;
        }, 1000);
        showControlsTemporarily();
    }

    function resetUI() {
        clearInterval(callState.timerInterval);
        clearTimeout(callState.hideControlsTimeout);
        DOM.timer.style.display = 'none';
        DOM.timer.innerText = "00:00";
        DOM.controls.classList.remove('hidden');
        DOM.header.classList.remove('hidden');
        DOM.modal.classList.remove('active', 'audio-mode', 'camera-off');
        DOM.remoteVid.classList.remove('speaking');
        DOM.localVid.srcObject = null;
        DOM.remoteVid.srcObject = null;
        callState.callStatus = 'idle';
        callState.isReceiving = false;
        callState.isMuted = false;
        callState.isScreenSharing = false;
        
        DOM.btnMic.classList.remove('disabled');
        DOM.btnCam.classList.remove('disabled');
        DOM.btnScreen.classList.remove('disabled');
        DOM.btnAccept.style.display = 'none';
        
        DOM.localVid.style.transform = `translate3d(0, 0, 0)`;
        xOffset = 0; yOffset = 0;
    }

    function cleanupCall() {
        if (callState.peerConnection) {
            callState.peerConnection.close();
            callState.peerConnection = null;
        }
        if (callState.localStream) {
            callState.localStream.getTracks().forEach(t => t.stop());
            callState.localStream = null;
        }
        if (callState.audioContext) {
            callState.audioContext.close();
            callState.audioContext = null;
        }
        resetUI();
    }

    async function setupMedia(videoEnabled) {
        try {
            callState.isVideoEnabled = videoEnabled;
            if (!videoEnabled) DOM.modal.classList.add('audio-mode');
            else DOM.modal.classList.remove('audio-mode');

            callState.localStream = await navigator.mediaDevices.getUserMedia({ 
                video: videoEnabled ? { facingMode: "user" } : false, 
                audio: true 
            });
            
            if (videoEnabled) DOM.localVid.srcObject = callState.localStream;
            return true;
        } catch (err) {
            console.error("Media Error:", err);
            notify("Camera/Mic access denied. Ensure HTTPS is active.", "error");
            return false;
        }
    }

    function safeSend(payload) {
        const socket = getSocket();
        if (socket && socket.readyState === 1) {
            socket.send(JSON.stringify(payload));
        } else {
            notify("Connection lost. Action failed.", "error");
        }
    }

    function createPeerConnection(target) {
        callState.peerConnection = new RTCPeerConnection(servers);

        callState.localStream.getTracks().forEach(track => {
            callState.peerConnection.addTrack(track, callState.localStream);
        });

        callState.peerConnection.ontrack = (event) => {
            callState.remoteStream = event.streams[0];
            DOM.remoteVid.srcObject = callState.remoteStream;
        };

        callState.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                safeSend({ type: "av_ice_candidate", receiver: target, candidate: event.candidate });
            }
        };

        callState.peerConnection.onconnectionstatechange = () => {
            switch(callState.peerConnection.connectionState) {
                case 'connected':
                    callState.callStatus = 'connected';
                    DOM.status.innerText = '';
                    startTimer();
                    setupActiveSpeaker();
                    break;
                case 'connecting':
                    DOM.status.innerText = 'Connecting...';
                    break;
                case 'disconnected':
                case 'failed':
                    DOM.status.innerText = 'Call Connection Lost';
                    setTimeout(() => hangUp(true), 2000);
                    break;
            }
        };
    }

    async function initCall(videoEnabled) {
        const target = getTargetUser();
        if (target === 'Public' || !target) {
            notify("You cannot start a call in the Public Lobby.", "error");
            return;
        }

        const mediaReady = await setupMedia(videoEnabled);
        if (!mediaReady) return;

        callState.callStatus = 'calling';
        DOM.peerName.innerText = target;
        DOM.status.innerText = "Calling...";
        DOM.modal.classList.add('active');
        DOM.btnAccept.style.display = 'none';

        createPeerConnection(target);

        const offer = await callState.peerConnection.createOffer();
        await callState.peerConnection.setLocalDescription(offer);

        safeSend({ type: "av_offer", receiver: target, offer: offer, isVideo: videoEnabled });
        showControlsTemporarily();
    }

    function hangUp(sendSignal = true) {
        const target = getTargetUser();
        if (sendSignal && target !== 'Public') {
            safeSend({ type: "av_hangup", receiver: target });
        }
        cleanupCall();
    }

    // ==========================================
    // 9. BUTTON CONTROLS
    // ==========================================

    DOM.btnMic.onclick = () => {
        if(!callState.localStream) return;
        const track = callState.localStream.getAudioTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            callState.isMuted = !track.enabled;
            DOM.btnMic.classList.toggle('disabled', callState.isMuted);
        }
        showControlsTemporarily();
    };

    DOM.btnCam.onclick = () => {
        if(!callState.localStream) return;
        const track = callState.localStream.getVideoTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            callState.isVideoEnabled = track.enabled;
            DOM.btnCam.classList.toggle('disabled', !callState.isVideoEnabled);
            DOM.modal.classList.toggle('camera-off', !callState.isVideoEnabled);
        }
        showControlsTemporarily();
    };

    DOM.btnScreen.onclick = async () => {
        try {
            if (!callState.isScreenSharing) {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.getVideoTracks()[0];
                const sender = callState.peerConnection.getSenders().find(s => s.track.kind === 'video');
                
                if(sender) sender.replaceTrack(screenTrack);
                callState.isScreenSharing = true;
                DOM.btnScreen.classList.add('disabled');

                screenTrack.onended = () => {
                    const videoTrack = callState.localStream.getVideoTracks()[0];
                    if(sender && videoTrack) sender.replaceTrack(videoTrack);
                    callState.isScreenSharing = false;
                    DOM.btnScreen.classList.remove('disabled');
                };
            } else {
                const videoTrack = callState.localStream.getVideoTracks()[0];
                const sender = callState.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if(sender && videoTrack) sender.replaceTrack(videoTrack);
                callState.isScreenSharing = false;
                DOM.btnScreen.classList.remove('disabled');
            }
        } catch(e) { console.error("Screen Share Error:", e); }
        showControlsTemporarily();
    };

    DOM.btnPip.onclick = async () => {
        try {
            if (document.pictureInPictureElement) await document.exitPictureInPicture();
            else if (DOM.remoteVid.readyState === 4) await DOM.remoteVid.requestPictureInPicture();
        } catch (e) { console.error("PiP Error:", e); }
        showControlsTemporarily();
    };

    DOM.btnReject.onclick = () => hangUp(true);

    // ==========================================
    // 10. WEBSOCKET EVENT LISTENERS
    // ==========================================
    
    window.IdlyPlugins.messageHandlers['av_offer'] = async function(data) {
        if (callState.isReceiving || callState.callStatus !== 'idle') {
            safeSend({ type: "av_hangup", receiver: data.sender }); 
            return; 
        }
        
        callState.isReceiving = true;
        callState.callStatus = 'ringing';
        
        if (getTargetUser() !== data.sender && typeof window.switchChat === 'function') {
            window.switchChat(data.sender);
        }

        DOM.peerName.innerText = data.sender;
        DOM.status.innerText = data.isVideo ? "WhatsApp Video Call..." : "WhatsApp Audio Call...";
        
        if (!data.isVideo) DOM.modal.classList.add('audio-mode');
        else DOM.modal.classList.remove('audio-mode');

        DOM.modal.classList.add('active');
        DOM.btnAccept.style.display = 'flex';
        showControlsTemporarily();

        DOM.btnAccept.onclick = async () => {
            DOM.btnAccept.style.display = 'none';
            DOM.status.innerText = "Connecting...";

            const mediaReady = await setupMedia(data.isVideo);
            if (!mediaReady) {
                hangUp(true);
                return;
            }

            createPeerConnection(data.sender);
            await callState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

            const answer = await callState.peerConnection.createAnswer();
            await callState.peerConnection.setLocalDescription(answer);

            safeSend({ type: "av_answer", receiver: data.sender, answer: answer });
        };
    };

    window.IdlyPlugins.messageHandlers['av_answer'] = async function(data) {
        if (!callState.peerConnection) return;
        await callState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    };

    window.IdlyPlugins.messageHandlers['av_ice_candidate'] = async function(data) {
        if (!callState.peerConnection) return;
        try {
            await callState.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) { console.error("ICE err", e); }
    };

    window.IdlyPlugins.messageHandlers['av_hangup'] = function(data) {
        notify(`Call ended by ${data.sender}.`, "error");
        hangUp(false);
    };

    window.addEventListener('offline', () => {
        if(callState.callStatus === 'connected') DOM.status.innerText = 'Network Offline...';
    });
    window.addEventListener('online', () => {
        if(callState.callStatus === 'connected') DOM.status.innerText = '';
    });

    console.log("WhatsApp-Edition Engine Loaded Successfully.");
})();