(function() {
    console.log("Loading Advanced WebRTC A/V Call System...");

    // ==========================================
    // 1. CALL STATE MANAGEMENT
    // ==========================================
    const callState = {
        peerConnection: null,
        localStream: null,
        remoteStream: null,
        currentCall: null,
        isReceiving: false,
        isMuted: false,
        isVideoEnabled: true,
        isScreenSharing: false,
        callStatus: 'idle',
        timerInterval: null,
        startTime: null,
        audioContext: null,
        analyser: null,
        isFrontCamera: true
    };

    // Advanced ICE Servers (Includes TURN placeholder for production)
    const servers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // Add your premium TURN servers here for production:
            // { urls: 'turn:your-turn-server.com', username: 'user', credential: 'password' }
        ]
    };

    // ==========================================
    // 2. INJECT RESPONSIVE & ANIMATED CSS
    // ==========================================
    const styles = `
        <style>
            /* Smooth Glassmorphism Modal */
            #av-modal {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(20, 24, 28, 0.85); backdrop-filter: blur(14px);
                z-index: 9999; display: none; flex-direction: column;
                align-items: center; justify-content: center; opacity: 0;
                transition: opacity 0.3s ease;
            }
            #av-modal.active { display: flex; opacity: 1; }
            
            .av-container {
                position: relative; width: 100%; height: 100%;
                max-width: 1000px; max-height: 90vh; background: #000;
                border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            #av-modal.active .av-container { transform: scale(1); }
            
            /* Videos & Speaking Glow */
            .remote-vid { 
                width: 100%; height: 100%; object-fit: cover; transition: filter 0.3s; 
            }
            .remote-vid.speaking { box-shadow: inset 0 0 0 6px #22c55e; }
            
            /* Draggable Picture-in-Picture */
            .local-vid {
                position: absolute; bottom: 120px; right: 20px;
                width: 120px; height: 160px; object-fit: cover;
                border-radius: 16px; border: 2px solid rgba(255,255,255,0.1);
                background: #222; z-index: 50; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                cursor: grab; touch-action: none; transition: transform 0.1s;
            }
            .local-vid:active { cursor: grabbing; transform: scale(1.05); }

            /* Blur Background when Camera Off */
            .camera-off .remote-vid, .camera-off .local-vid { 
                backdrop-filter: blur(25px); background: rgba(255,255,255,0.05); opacity: 0; 
            }

            .audio-avatar {
                display: none; position: absolute; top: 50%; left: 50%;
                transform: translate(-50%, -50%); width: 140px; height: 140px;
                border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6);
                color: #fff; align-items: center; justify-content: center;
                box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); animation: pulse 2s infinite; z-index: 10;
            }
            .audio-mode .audio-avatar { display: flex; }

            /* Header & Timer */
            .av-header {
                position: absolute; top: 30px; left: 0; width: 100%;
                text-align: center; color: white; z-index: 20; text-shadow: 0 2px 8px rgba(0,0,0,0.8);
            }
            .av-header h2 { margin: 0; font-size: 26px; font-weight: 600; letter-spacing: 0.5px; }
            .av-header p { margin: 5px 0 0; font-size: 16px; opacity: 0.9; }
            .av-timer { display: inline-block; margin-top: 8px; padding: 4px 12px; background: rgba(0,0,0,0.5); border-radius: 12px; font-variant-numeric: tabular-nums; font-size: 14px; }

            /* Premium Floating Dock Controls */
            .av-controls {
                position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
                display: flex; gap: 15px; z-index: 100; background: rgba(32, 44, 51, 0.85);
                padding: 12px 24px; border-radius: 20px; backdrop-filter: blur(16px);
                box-shadow: 0 10px 30px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1);
            }
            .av-btn {
                width: 50px; height: 50px; border-radius: 50%; border: none;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; transition: all 0.2s; color: white; background: rgba(255,255,255,0.1);
            }
            .av-btn:hover { background: rgba(255,255,255,0.25); transform: translateY(-3px); }
            .av-btn.disabled { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
            
            .btn-answer { background: #22c55e; display: none; width: 60px; height: 60px; }
            .btn-answer:hover { background: #16a34a; }
            .btn-hangup { background: #ef4444; width: 60px; height: 60px; }
            .btn-hangup:hover { background: #dc2626; }
            .av-btn svg { width: 22px; height: 22px; fill: currentColor; }

            /* Mobile UI Safe Area Optimization */
            @media (max-width: 768px) {
                .av-container { max-width: 100%; max-height: 100%; border-radius: 0; }
                .av-controls { bottom: env(safe-area-inset-bottom, 20px); width: 90%; justify-content: space-between; padding: 10px 15px; }
                .local-vid { bottom: 110px; right: 15px; width: 100px; height: 140px; }
                .av-btn { width: 45px; height: 45px; }
                .btn-hangup, .btn-answer { width: 55px; height: 55px; }
            }

            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
                70% { box-shadow: 0 0 0 25px rgba(99, 102, 241, 0); }
                100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
            }
        </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styles);

    // ==========================================
    // 3. INJECT PREMIUM CALLING UI HTML
    // ==========================================
    const modalHtml = `
        <div id="av-modal">
            <div class="av-container" id="av-container">
                <div class="av-header">
                    <h2 id="av-peer-name">@User</h2>
                    <p id="av-status">Calling...</p>
                    <div class="av-timer" id="av-timer" style="display:none;">00:00</div>
                </div>
                
                <video id="av-remote-video" class="remote-vid" autoplay playsinline></video>
                <video id="av-local-video" class="local-vid" autoplay playsinline muted></video>
                
                <div class="audio-avatar" id="av-audio-avatar">
                    <svg viewBox="0 0 24 24" width="60" height="60" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
                </div>

                <div class="av-controls dock">
                    <button id="av-btn-mic" class="av-btn" title="Toggle Microphone">
                        <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                    </button>
                    <button id="av-btn-cam" class="av-btn" title="Toggle Camera">
                        <svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                    </button>
                    <button id="av-btn-screen" class="av-btn desktop-only" title="Share Screen">
                        <svg viewBox="0 0 24 24"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>
                    </button>
                    <button id="av-btn-pip" class="av-btn desktop-only" title="Picture-in-Picture">
                        <svg viewBox="0 0 24 24"><path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/></svg>
                    </button>
                    
                    <button id="av-answer-btn" class="av-btn btn-answer" title="Answer">
                        <svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
                    </button>
                    <button id="av-hangup-btn" class="av-btn btn-hangup" title="Hang Up">
                        <svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Header Actions Integration
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

    // DOM Elements
    const DOM = {
        modal: document.getElementById('av-modal'),
        container: document.getElementById('av-container'),
        localVid: document.getElementById('av-local-video'),
        remoteVid: document.getElementById('av-remote-video'),
        answerBtn: document.getElementById('av-answer-btn'),
        hangupBtn: document.getElementById('av-hangup-btn'),
        status: document.getElementById('av-status'),
        peerName: document.getElementById('av-peer-name'),
        timer: document.getElementById('av-timer'),
        btnMic: document.getElementById('av-btn-mic'),
        btnCam: document.getElementById('av-btn-cam'),
        btnScreen: document.getElementById('av-btn-screen'),
        btnPip: document.getElementById('av-btn-pip')
    };

    // ==========================================
    // 4. ADVANCED UTILITIES & UI LOGIC
    // ==========================================

    // Dragging Logic for Local Video (Mobile + Desktop)
    let isDragging = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;
    
    function dragStart(e) {
        initialX = e.type === "touchstart" ? e.touches[0].clientX - xOffset : e.clientX - xOffset;
        initialY = e.type === "touchstart" ? e.touches[0].clientY - yOffset : e.clientY - yOffset;
        if (e.target === DOM.localVid) isDragging = true;
    }
    function dragEnd(e) { initialX = currentX; initialY = currentY; isDragging = false; }
    function drag(e) {
        if (!isDragging) return;
        e.preventDefault();
        currentX = e.type === "touchmove" ? e.touches[0].clientX - initialX : e.clientX - initialX;
        currentY = e.type === "touchmove" ? e.touches[0].clientY - initialY : e.clientY - initialY;
        xOffset = currentX; yOffset = currentY;
        DOM.localVid.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    }
    
    DOM.container.addEventListener("mousedown", dragStart, false);
    DOM.container.addEventListener("mouseup", dragEnd, false);
    DOM.container.addEventListener("mousemove", drag, false);
    DOM.container.addEventListener("touchstart", dragStart, {passive: false});
    DOM.container.addEventListener("touchend", dragEnd, false);
    DOM.container.addEventListener("touchmove", drag, {passive: false});

    // Call Timer Engine
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

    // Active Speaker Detection (Glow Effect)
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

    // Cleanup Engine (Prevents Memory Leaks)
    function cleanupCall() {
        if (callState.peerConnection) {
            callState.peerConnection.close();
            callState.peerConnection = null;
        }
        if (callState.localStream) {
            callState.localStream.getTracks().forEach(t => t.stop());
            callState.localStream = null;
        }
        if (callState.isScreenSharing) toggleScreenShare(true); // Force stop
        if (callState.audioContext) {
            callState.audioContext.close();
            callState.audioContext = null;
        }
        
        clearInterval(callState.timerInterval);
        DOM.localVid.srcObject = null;
        DOM.remoteVid.srcObject = null;
        DOM.timer.style.display = 'none';
        DOM.timer.innerText = "00:00";
        DOM.modal.classList.remove('active');
        DOM.container.classList.remove('audio-mode', 'camera-off');
        DOM.remoteVid.classList.remove('speaking');
        
        // Reset drags
        DOM.localVid.style.transform = `translate3d(0, 0, 0)`;
        xOffset = 0; yOffset = 0;
        
        callState.callStatus = 'idle';
        callState.isReceiving = false;
        callState.isMuted = false;
        DOM.btnMic.classList.remove('disabled');
        DOM.btnCam.classList.remove('disabled');
    }

    // ==========================================
    // 5. CORE WEBRTC ENGINE
    // ==========================================

    async function setupMedia(videoEnabled) {
        try {
            callState.isVideoEnabled = videoEnabled;
            if (!videoEnabled) DOM.container.classList.add('audio-mode');
            else DOM.container.classList.remove('audio-mode');

            callState.localStream = await navigator.mediaDevices.getUserMedia({ 
                video: videoEnabled ? { facingMode: callState.isFrontCamera ? "user" : "environment" } : false, 
                audio: true 
            });
            
            if (videoEnabled) DOM.localVid.srcObject = callState.localStream;
            return true;
        } catch (err) {
            console.error("Media Error:", err);
            if(typeof showToast === 'function') showToast("Camera/Microphone access denied.", "error");
            return false;
        }
    }

    function createPeerConnection() {
        callState.peerConnection = new RTCPeerConnection(servers);

        // Add local tracks
        callState.localStream.getTracks().forEach(track => {
            callState.peerConnection.addTrack(track, callState.localStream);
        });

        // Receive remote tracks
        callState.peerConnection.ontrack = (event) => {
            callState.remoteStream = event.streams[0];
            DOM.remoteVid.srcObject = callState.remoteStream;
        };

        // Network path routing
        callState.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({
                    type: "av_ice_candidate",
                    receiver: currentChat,
                    candidate: event.candidate
                }));
            }
        };

        // Robust Connection State Handling
        callState.peerConnection.onconnectionstatechange = () => {
            switch(callState.peerConnection.connectionState) {
                case 'connected':
                    callState.callStatus = 'connected';
                    DOM.status.innerText = 'Connected';
                    startTimer();
                    setupActiveSpeaker();
                    break;
                case 'connecting':
                    DOM.status.innerText = 'Connecting...';
                    break;
                case 'disconnected':
                    DOM.status.innerText = 'Reconnecting...';
                    break;
                case 'failed':
                    DOM.status.innerText = 'Call Failed';
                    setTimeout(() => hangUp(true), 2000);
                    break;
            }
        };
    }

    async function initCall(videoEnabled) {
        if (currentChat === 'Public') {
            if(typeof showToast === 'function') showToast("Cannot call Public Lobby.", "error");
            return;
        }

        const mediaReady = await setupMedia(videoEnabled);
        if (!mediaReady) return;

        callState.callStatus = 'calling';
        DOM.peerName.innerText = `@${currentChat}`;
        DOM.status.innerText = videoEnabled ? "Video Calling..." : "Audio Calling...";
        DOM.modal.classList.add('active');
        DOM.answerBtn.style.display = 'none';

        createPeerConnection();

        const offer = await callState.peerConnection.createOffer();
        await callState.peerConnection.setLocalDescription(offer);

        ws.send(JSON.stringify({
            type: "av_offer",
            receiver: currentChat,
            offer: offer,
            isVideo: videoEnabled
        }));
    }

    // Disconnect Action (Prevents infinite loop via sendSignal)
    function hangUp(sendSignal = true) {
        if (sendSignal && ws && ws.readyState === WebSocket.OPEN && currentChat !== 'Public') {
            ws.send(JSON.stringify({ type: "av_hangup", receiver: currentChat }));
        }
        cleanupCall();
    }

    // ==========================================
    // 6. TOGGLE CONTROLS (Mute, Video, Screen, PiP)
    // ==========================================

    DOM.btnMic.onclick = () => {
        if(!callState.localStream) return;
        const track = callState.localStream.getAudioTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            callState.isMuted = !track.enabled;
            DOM.btnMic.classList.toggle('disabled', callState.isMuted);
            if(typeof showToast === 'function') showToast(callState.isMuted ? "Microphone Muted" : "Microphone Active", "success");
        }
    };

    DOM.btnCam.onclick = () => {
        if(!callState.localStream) return;
        const track = callState.localStream.getVideoTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            callState.isVideoEnabled = track.enabled;
            DOM.btnCam.classList.toggle('disabled', !callState.isVideoEnabled);
            DOM.container.classList.toggle('camera-off', !callState.isVideoEnabled);
        }
    };

    async function toggleScreenShare(forceStop = false) {
        try {
            if (!callState.isScreenSharing && !forceStop) {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.getVideoTracks()[0];
                const sender = callState.peerConnection.getSenders().find(s => s.track.kind === 'video');
                
                if(sender) sender.replaceTrack(screenTrack);
                callState.isScreenSharing = true;
                DOM.btnScreen.classList.add('disabled'); // Highlight active

                screenTrack.onended = () => toggleScreenShare(true); // Revert when stopped in browser
            } else if (callState.isScreenSharing) {
                const videoTrack = callState.localStream.getVideoTracks()[0];
                const sender = callState.peerConnection.getSenders().find(s => s.track.kind === 'video');
                
                if(sender && videoTrack) sender.replaceTrack(videoTrack);
                callState.isScreenSharing = false;
                DOM.btnScreen.classList.remove('disabled');
            }
        } catch(e) {
            console.error("Screen Share Error:", e);
        }
    }
    DOM.btnScreen.onclick = () => toggleScreenShare();

    DOM.btnPip.onclick = async () => {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (DOM.remoteVid.readyState === 4) {
                await DOM.remoteVid.requestPictureInPicture();
            }
        } catch (e) { console.error("PiP Error:", e); }
    };

    DOM.hangupBtn.onclick = () => hangUp(true);

    // ==========================================
    // 7. WEBSOCKET & NETWORK HOOKS
    // ==========================================
    
    window.IdlyPlugins.messageHandlers['av_offer'] = async function(data) {
        if (callState.isReceiving || callState.callStatus !== 'idle') return; 
        
        callState.isReceiving = true;
        callState.callStatus = 'ringing';
        
        if (currentChat !== data.sender) {
            document.querySelector(`[onclick="switchChat('${data.sender}')"]`)?.click();
        }

        DOM.peerName.innerText = `@${data.sender}`;
        DOM.status.innerText = data.isVideo ? "Incoming Video Call..." : "Incoming Audio Call...";
        
        if (!data.isVideo) DOM.container.classList.add('audio-mode');
        else DOM.container.classList.remove('audio-mode');

        DOM.modal.classList.add('active');
        DOM.answerBtn.style.display = 'flex';

        DOM.answerBtn.onclick = async () => {
            DOM.answerBtn.style.display = 'none';
            DOM.status.innerText = "Connecting...";

            const mediaReady = await setupMedia(data.isVideo);
            if (!mediaReady) {
                hangUp(true);
                return;
            }

            createPeerConnection();
            await callState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

            const answer = await callState.peerConnection.createAnswer();
            await callState.peerConnection.setLocalDescription(answer);

            ws.send(JSON.stringify({
                type: "av_answer",
                receiver: data.sender,
                answer: answer
            }));
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
        } catch (e) { console.error("ICE error", e); }
    };

    window.IdlyPlugins.messageHandlers['av_hangup'] = function(data) {
        if (typeof showToast === "function") showToast(`Call ended by @${data.sender}.`, "error");
        hangUp(false); // Pass false to prevent infinite ping-pong loop
    };

    // Reconnection UI Logic
    window.addEventListener('offline', () => {
        if(callState.callStatus === 'connected') DOM.status.innerText = 'Network Offline...';
    });
    window.addEventListener('online', () => {
        if(callState.callStatus === 'connected') DOM.status.innerText = 'Connected';
    });

})();