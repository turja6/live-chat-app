(function() {
    console.log("Loading Ultimate WebRTC A/V Call Engine (Full Version)...");

    // ==========================================
    // 1. BULLETPROOF INITIALIZATION & GLOBALS
    // ==========================================
    window.IdlyPlugins = window.IdlyPlugins || {};
    window.IdlyPlugins.messageHandlers = window.IdlyPlugins.messageHandlers || {};

    // Safely get the active WebSocket to prevent "undefined" errors
    function getSocket() {
        return window.ws || window.socket || window.websocket || null;
    }

    // Safely get the target user from your main app
    function getTargetUser() {
        return window.currentChat || "Public";
    }

    // Safely show toast notifications gracefully falling back to console
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
        analyser: null
    };

    // Premium STUN/TURN Server Configuration
    const servers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ]
    };

    // ==========================================
    // 3. MASSIVE CSS ARCHITECTURE (MOBILE & DESKTOP)
    // ==========================================
    const styles = `
        <style>
            /* True Fullscreen Mobile Dialer UI with Glassmorphism */
            #phone-modal {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100dvh;
                background: #0f1115; z-index: 10000; display: none; flex-direction: column;
                opacity: 0; transition: opacity 0.3s ease; overflow: hidden;
            }
            #phone-modal.active { display: flex; opacity: 1; }
            
            /* Background Video Layer */
            .phone-remote-vid { 
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                object-fit: cover; z-index: 1; transition: filter 0.3s;
                background: #0f1115;
            }
            /* Active Speaker Glow */
            .phone-remote-vid.speaking { box-shadow: inset 0 0 0 6px #22c55e; }

            /* Floating Draggable Local Video */
            .phone-local-vid {
                position: absolute; top: 80px; right: 20px;
                width: 110px; height: 160px; object-fit: cover;
                border-radius: 12px; border: 2px solid rgba(255,255,255,0.2);
                background: #222; z-index: 50; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                transition: opacity 0.3s, transform 0.1s; cursor: grab; touch-action: none;
            }
            .phone-local-vid:active { cursor: grabbing; transform: scale(1.05); }

            /* Modes: Audio Only & Camera Off */
            .audio-mode .phone-remote-vid, .audio-mode .phone-local-vid { opacity: 0; pointer-events: none; }
            .camera-off .phone-remote-vid, .camera-off .phone-local-vid { 
                backdrop-filter: blur(25px); opacity: 0; pointer-events: none;
            }
            
            /* Big Circular Avatar for Audio Mode */
            .phone-avatar-container {
                position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%);
                z-index: 10; display: none; flex-direction: column; align-items: center;
            }
            .audio-mode .phone-avatar-container, .camera-off .phone-avatar-container { 
                display: flex; 
            }
            .phone-avatar {
                width: 160px; height: 160px; border-radius: 50%;
                background: linear-gradient(135deg, #4f46e5, #7c3aed);
                display: flex; align-items: center; justify-content: center; color: white;
                box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.6); animation: pulse-ring 2s infinite;
            }
            .phone-avatar svg { width: 80px; height: 80px; fill: currentColor; }

            /* Call Info Header */
            .phone-header {
                position: absolute; top: 0; left: 0; width: 100%;
                padding: 40px 20px 20px; text-align: center; color: white; z-index: 20;
                background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
                text-shadow: 0 2px 4px rgba(0,0,0,0.8);
            }
            .phone-header h2 { margin: 0; font-size: 32px; font-weight: 500; letter-spacing: 1px; }
            .phone-header p { margin: 8px 0 0; font-size: 18px; opacity: 0.8; }
            .phone-timer { 
                font-size: 16px; margin-top: 10px; opacity: 0.9; 
                font-variant-numeric: tabular-nums; display: none; 
                background: rgba(0,0,0,0.4); padding: 4px 12px; border-radius: 20px; display: inline-block;
            }

            /* Bottom Controls (Dock) */
            .phone-controls {
                position: absolute; bottom: 0; left: 0; width: 100%;
                padding: 30px 20px 40px; z-index: 100;
                background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
                display: flex; flex-direction: column; align-items: center; gap: 30px;
                padding-bottom: env(safe-area-inset-bottom, 40px);
            }
            .phone-tools { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; }
            .phone-actions { display: flex; gap: 40px; justify-content: center; width: 100%; }

            /* Floating Buttons */
            .p-btn {
                width: 60px; height: 60px; border-radius: 50%; border: none;
                display: flex; align-items: center; justify-content: center;
                background: rgba(255,255,255,0.15); color: white; backdrop-filter: blur(10px);
                cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }
            .p-btn:active { transform: scale(0.9); }
            .p-btn:hover { background: rgba(255,255,255,0.25); }
            .p-btn.disabled { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
            .p-btn svg { width: 26px; height: 26px; fill: currentColor; }

            /* Action Buttons */
            .btn-accept { background: #22c55e; color: white; width: 75px; height: 75px; display: none; animation: bounce-ring 2s infinite; }
            .btn-accept:hover { background: #16a34a; }
            .btn-reject { background: #ef4444; color: white; width: 75px; height: 75px; }
            .btn-reject:hover { background: #dc2626; }
            .btn-accept svg, .btn-reject svg { width: 36px; height: 36px; }

            /* Desktop Scale Overrides */
            @media (min-width: 768px) {
                #phone-modal { align-items: center; justify-content: center; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px); }
                .phone-remote-vid { position: relative; width: 1000px; max-width: 90vw; height: 80vh; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
                .phone-controls { position: absolute; width: 1000px; max-width: 90vw; border-radius: 0 0 24px 24px; bottom: 10vh; }
                .phone-header { position: absolute; width: 1000px; max-width: 90vw; border-radius: 24px 24px 0 0; top: 10vh; }
                .phone-local-vid { top: calc(10vh + 30px); right: calc(5vw + 30px); width: 150px; height: 200px; }
            }

            @keyframes pulse-ring {
                0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.6); }
                70% { box-shadow: 0 0 0 30px rgba(79, 70, 229, 0); }
                100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
            }
            @keyframes bounce-ring {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }
        </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styles);

    // ==========================================
    // 4. INJECT MASSIVE HTML UI
    // ==========================================
    const modalHtml = `
        <div id="phone-modal">
            <div class="phone-header">
                <h2 id="phone-name">@User</h2>
                <p id="phone-status">Calling...</p>
                <div class="phone-timer" id="phone-timer" style="display:none;">00:00</div>
            </div>
            
            <video id="phone-remote-vid" class="phone-remote-vid" autoplay playsinline></video>
            <video id="phone-local-vid" class="phone-local-vid" autoplay playsinline muted></video>
            
            <div class="phone-avatar-container">
                <div class="phone-avatar">
                    <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                </div>
            </div>

            <div class="phone-controls dock">
                <div class="phone-tools">
                    <button id="phone-btn-mic" class="p-btn" title="Mute Microphone">
                        <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                    </button>
                    <button id="phone-btn-cam" class="p-btn" title="Toggle Camera">
                        <svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                    </button>
                    <button id="phone-btn-screen" class="p-btn desktop-only" title="Share Screen">
                        <svg viewBox="0 0 24 24"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>
                    </button>
                    <button id="phone-btn-pip" class="p-btn desktop-only" title="Picture-in-Picture">
                        <svg viewBox="0 0 24 24"><path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/></svg>
                    </button>
                </div>
                <div class="phone-actions">
                    <button id="phone-btn-accept" class="p-btn btn-accept" title="Accept Call">
                        <svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
                    </button>
                    <button id="phone-btn-reject" class="p-btn btn-reject" title="End Call">
                        <svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
                    </button>
                </div>
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

    // ==========================================
    // 6. DOM ELEMENTS MAP
    // ==========================================
    const DOM = {
        modal: document.getElementById('phone-modal'),
        localVid: document.getElementById('phone-local-vid'),
        remoteVid: document.getElementById('phone-remote-vid'),
        btnAccept: document.getElementById('phone-btn-accept'),
        btnReject: document.getElementById('phone-btn-reject'),
        status: document.getElementById('phone-status'),
        peerName: document.getElementById('phone-name'),
        timer: document.getElementById('phone-timer'),
        btnMic: document.getElementById('phone-btn-mic'),
        btnCam: document.getElementById('phone-btn-cam'),
        btnScreen: document.getElementById('phone-btn-screen'),
        btnPip: document.getElementById('phone-btn-pip')
    };

    // ==========================================
    // 7. DRAG-AND-DROP ENGINE FOR LOCAL VIDEO
    // ==========================================
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
    
    // Bind Drag Listeners to Modal
    DOM.modal.addEventListener("mousedown", dragStart, false);
    DOM.modal.addEventListener("mouseup", dragEnd, false);
    DOM.modal.addEventListener("mousemove", drag, false);
    DOM.modal.addEventListener("touchstart", dragStart, {passive: false});
    DOM.modal.addEventListener("touchend", dragEnd, false);
    DOM.modal.addEventListener("touchmove", drag, {passive: false});

    // ==========================================
    // 8. AUDIO ANALYSER (ACTIVE SPEAKER DETECTION)
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
                
                if(average > 35) DOM.remoteVid.classList.add('speaking');
                else DOM.remoteVid.classList.remove('speaking');
                
                requestAnimationFrame(checkLevel);
            }
            checkLevel();
        } catch(e) { console.warn("Active speaker detection not supported on this device"); }
    }

    // ==========================================
    // 9. CORE ENGINE & LIFECYCLE
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
    }

    function resetUI() {
        clearInterval(callState.timerInterval);
        DOM.timer.style.display = 'none';
        DOM.timer.innerText = "00:00";
        DOM.modal.classList.remove('active', 'audio-mode', 'camera-off');
        DOM.remoteVid.classList.remove('speaking');
        DOM.localVid.srcObject = null;
        DOM.remoteVid.srcObject = null;
        callState.callStatus = 'idle';
        callState.isReceiving = false;
        callState.isMuted = false;
        callState.isScreenSharing = false;
        
        // Reset Buttons
        DOM.btnMic.classList.remove('disabled');
        DOM.btnCam.classList.remove('disabled');
        DOM.btnScreen.classList.remove('disabled');
        DOM.btnAccept.style.display = 'none';
        
        // Reset Draggable Position
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
            notify("Camera/Mic access denied. Ensure HTTPS is active and permissions are granted.", "error");
            return false;
        }
    }

    function safeSend(payload) {
        const socket = getSocket();
        if (socket && socket.readyState === 1) {
            socket.send(JSON.stringify(payload));
        } else {
            console.error("WebRTC Error: WebSocket is not open.");
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
                    setupActiveSpeaker(); // Boot the glowing effect
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
    }

    function hangUp(sendSignal = true) {
        const target = getTargetUser();
        if (sendSignal && target !== 'Public') {
            safeSend({ type: "av_hangup", receiver: target });
        }
        cleanupCall();
    }

    // ==========================================
    // 10. ADVANCED BUTTON CONTROLS
    // ==========================================

    DOM.btnMic.onclick = () => {
        if(!callState.localStream) return;
        const track = callState.localStream.getAudioTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            callState.isMuted = !track.enabled;
            DOM.btnMic.classList.toggle('disabled', callState.isMuted);
        }
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
    };

    DOM.btnScreen.onclick = async () => {
        try {
            if (!callState.isScreenSharing) {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.getVideoTracks()[0];
                const sender = callState.peerConnection.getSenders().find(s => s.track.kind === 'video');
                
                if(sender) sender.replaceTrack(screenTrack);
                callState.isScreenSharing = true;
                DOM.btnScreen.classList.add('disabled'); // Act as active toggle

                // Auto-revert if they stop sharing via browser UI
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
        } catch(e) {
            console.error("Screen Share Error:", e);
        }
    };

    DOM.btnPip.onclick = async () => {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (DOM.remoteVid.readyState === 4) {
                await DOM.remoteVid.requestPictureInPicture();
            }
        } catch (e) { console.error("Picture-in-Picture Error:", e); }
    };

    DOM.btnReject.onclick = () => hangUp(true);

    // ==========================================
    // 11. WEBSOCKET EVENT LISTENERS
    // ==========================================
    
    window.IdlyPlugins.messageHandlers['av_offer'] = async function(data) {
        if (callState.isReceiving || callState.callStatus !== 'idle') {
            safeSend({ type: "av_hangup", receiver: data.sender }); // Busy tone
            return; 
        }
        
        callState.isReceiving = true;
        callState.callStatus = 'ringing';
        
        if (getTargetUser() !== data.sender && typeof window.switchChat === 'function') {
            window.switchChat(data.sender);
        }

        DOM.peerName.innerText = data.sender;
        DOM.status.innerText = data.isVideo ? "Incoming Video Call..." : "Incoming Audio Call...";
        
        if (!data.isVideo) DOM.modal.classList.add('audio-mode');
        else DOM.modal.classList.remove('audio-mode');

        DOM.modal.classList.add('active');
        DOM.btnAccept.style.display = 'flex';

        DOM.btnAccept.onclick = async () => {
            DOM.btnAccept.style.display = 'none';
            DOM.status.innerText = "Connecting secure channel...";

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
        } catch (e) { console.error("Network ICE processing error", e); }
    };

    window.IdlyPlugins.messageHandlers['av_hangup'] = function(data) {
        notify(`Call ended by ${data.sender}.`, "error");
        hangUp(false); // Do not send back a signal to prevent endless loops
    };

    // Connection Recovery Listeners
    window.addEventListener('offline', () => {
        if(callState.callStatus === 'connected') DOM.status.innerText = 'Network Offline...';
    });
    window.addEventListener('online', () => {
        if(callState.callStatus === 'connected') DOM.status.innerText = '';
    });

    console.log("Ultimate WebRTC Engine System Ready.");
})();