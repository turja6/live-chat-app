(function() {
    console.log("Loading Advanced Native Phone WebRTC System...");

    // ==========================================
    // 1. BULLETPROOF INITIALIZATION
    // ==========================================
    window.IdlyPlugins = window.IdlyPlugins || {};
    window.IdlyPlugins.messageHandlers = window.IdlyPlugins.messageHandlers || {};

    // Safely get the active WebSocket
    function getSocket() {
        return window.ws || window.socket || window.websocket || null;
    }

    // Safely get the target user
    function getTargetUser() {
        return window.currentChat || "Public";
    }

    // Safely show toast notifications
    function notify(msg, type="info") {
        if (typeof window.showToast === "function") window.showToast(msg, type);
        else console.log(`[${type.toUpperCase()}] ${msg}`);
    }

    // ==========================================
    // 2. CALL STATE MANAGEMENT
    // ==========================================
    const callState = {
        peerConnection: null,
        localStream: null,
        remoteStream: null,
        callStatus: 'idle',
        isReceiving: false,
        isMuted: false,
        isVideoEnabled: true,
        timerInterval: null,
        startTime: null,
        audioContext: null,
        analyser: null
    };

    const servers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    // ==========================================
    // 3. NATIVE PHONE CSS (MOBILE-FIRST)
    // ==========================================
    const styles = `
        <style>
            /* True Fullscreen Mobile Dialer UI */
            #phone-modal {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100dvh;
                background: #0f1115; z-index: 10000; display: none; flex-direction: column;
                opacity: 0; transition: opacity 0.3s ease; overflow: hidden;
            }
            #phone-modal.active { display: flex; opacity: 1; }
            
            /* Videos */
            .phone-remote-vid { 
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                object-fit: cover; z-index: 1; transition: filter 0.3s;
                background: #0f1115;
            }
            .phone-local-vid {
                position: absolute; top: 80px; right: 20px;
                width: 110px; height: 160px; object-fit: cover;
                border-radius: 12px; border: 2px solid rgba(255,255,255,0.2);
                background: #222; z-index: 50; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                transition: opacity 0.3s;
            }

            /* Audio Mode & Blur */
            .audio-mode .phone-remote-vid, .audio-mode .phone-local-vid,
            .camera-off .phone-remote-vid, .camera-off .phone-local-vid { 
                opacity: 0; pointer-events: none;
            }
            
            /* Big Circular Avatar for Audio */
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

            /* Header Info */
            .phone-header {
                position: absolute; top: 0; left: 0; width: 100%;
                padding: 40px 20px 20px; text-align: center; color: white; z-index: 20;
                background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
            }
            .phone-header h2 { margin: 0; font-size: 32px; font-weight: 500; letter-spacing: 1px; }
            .phone-header p { margin: 8px 0 0; font-size: 18px; opacity: 0.8; }
            .phone-timer { font-size: 16px; margin-top: 10px; opacity: 0.9; font-variant-numeric: tabular-nums; display: none; }

            /* Bottom Controls (Dock) */
            .phone-controls {
                position: absolute; bottom: 0; left: 0; width: 100%;
                padding: 30px 20px 40px; z-index: 100;
                background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
                display: flex; flex-direction: column; align-items: center; gap: 30px;
            }
            .phone-tools {
                display: flex; gap: 25px; justify-content: center;
            }
            .phone-actions {
                display: flex; gap: 40px; justify-content: center; width: 100%;
            }

            /* Buttons */
            .p-btn {
                width: 60px; height: 60px; border-radius: 50%; border: none;
                display: flex; align-items: center; justify-content: center;
                background: rgba(255,255,255,0.15); color: white; backdrop-filter: blur(10px);
                cursor: pointer; transition: all 0.2s;
            }
            .p-btn:active { transform: scale(0.9); }
            .p-btn.disabled { background: rgba(255,255,255,0.8); color: #111; }
            .p-btn svg { width: 26px; height: 26px; fill: currentColor; }

            .btn-accept { background: #22c55e; color: white; width: 75px; height: 75px; display: none; animation: bounce-ring 2s infinite; }
            .btn-reject { background: #ef4444; color: white; width: 75px; height: 75px; }
            .btn-accept svg, .btn-reject svg { width: 36px; height: 36px; }

            /* Mobile Overrides */
            @media (min-width: 768px) {
                #phone-modal { align-items: center; justify-content: center; background: rgba(0,0,0,0.8); }
                .phone-remote-vid { position: relative; width: 400px; height: 700px; border-radius: 30px; overflow: hidden; }
                .phone-controls { position: absolute; width: 400px; border-radius: 0 0 30px 30px; }
                .phone-header { position: absolute; width: 400px; border-radius: 30px 30px 0 0; }
                .phone-local-vid { top: 120px; right: calc(50% - 180px); }
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
    // 4. INJECT HTML UI
    // ==========================================
    const modalHtml = `
        <div id="phone-modal">
            <div class="phone-header">
                <h2 id="phone-name">@User</h2>
                <p id="phone-status">Calling...</p>
                <div class="phone-timer" id="phone-timer">00:00</div>
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
                    <button id="phone-btn-mic" class="p-btn" title="Mute">
                        <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                    </button>
                    <button id="phone-btn-cam" class="p-btn" title="Video">
                        <svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                    </button>
                </div>
                <div class="phone-actions">
                    <button id="phone-btn-accept" class="p-btn btn-accept" title="Accept">
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

    // Header Actions
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
        modal: document.getElementById('phone-modal'),
        localVid: document.getElementById('phone-local-vid'),
        remoteVid: document.getElementById('phone-remote-vid'),
        btnAccept: document.getElementById('phone-btn-accept'),
        btnReject: document.getElementById('phone-btn-reject'),
        status: document.getElementById('phone-status'),
        peerName: document.getElementById('phone-name'),
        timer: document.getElementById('phone-timer'),
        btnMic: document.getElementById('phone-btn-mic'),
        btnCam: document.getElementById('phone-btn-cam')
    };

    // ==========================================
    // 5. CORE LOGIC & ENGINE
    // ==========================================

    function startTimer() {
        callState.startTime = Date.now();
        DOM.timer.style.display = 'block';
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
        DOM.localVid.srcObject = null;
        DOM.remoteVid.srcObject = null;
        callState.callStatus = 'idle';
        callState.isReceiving = false;
        callState.isMuted = false;
        DOM.btnMic.classList.remove('disabled');
        DOM.btnCam.classList.remove('disabled');
        DOM.btnAccept.style.display = 'none';
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
            notify("Camera/Mic access denied. Please check site permissions.", "error");
            return false;
        }
    }

    function safeSend(payload) {
        const socket = getSocket();
        if (socket && socket.readyState === 1) {
            socket.send(JSON.stringify(payload));
        } else {
            console.error("Call Error: WebSocket is not connected.");
            notify("Connection lost. Cannot make call.", "error");
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
                    break;
                case 'connecting':
                    DOM.status.innerText = 'Connecting...';
                    break;
                case 'disconnected':
                case 'failed':
                    DOM.status.innerText = 'Call Failed';
                    setTimeout(() => hangUp(true), 1500);
                    break;
            }
        };
    }

    async function initCall(videoEnabled) {
        const target = getTargetUser();
        if (target === 'Public' || !target) {
            notify("You cannot call the Public Lobby.", "error");
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
    // 6. BUTTON CONTROLS
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

    DOM.btnReject.onclick = () => hangUp(true);

    // ==========================================
    // 7. NETWORK HOOKS
    // ==========================================
    
    window.IdlyPlugins.messageHandlers['av_offer'] = async function(data) {
        if (callState.isReceiving || callState.callStatus !== 'idle') {
            safeSend({ type: "av_hangup", receiver: data.sender }); // Auto-reject if busy
            return; 
        }
        
        callState.isReceiving = true;
        callState.callStatus = 'ringing';
        
        if (getTargetUser() !== data.sender && typeof window.switchChat === 'function') {
            window.switchChat(data.sender);
        }

        DOM.peerName.innerText = data.sender;
        DOM.status.innerText = data.isVideo ? "Incoming Video..." : "Incoming Audio...";
        
        if (!data.isVideo) DOM.modal.classList.add('audio-mode');
        else DOM.modal.classList.remove('audio-mode');

        DOM.modal.classList.add('active');
        DOM.btnAccept.style.display = 'flex';

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
        notify(`Call ended.`, "error");
        hangUp(false);
    };

})();