(function() {
    'use strict';

    // --- CSS INJECTION ---
    const style = document.createElement('style');
    style.textContent = `
        #call-trigger-btn {
            background: transparent;
            border: none;
            color: currentColor;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        #call-trigger-btn:hover {
            background: rgba(255,255,255,0.1);
        }

        #call-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            height: 100dvh;
            width: 100vw;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            z-index: 99999;
            display: none;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden;
        }
        #call-overlay.active {
            display: flex;
        }

        #remote-video {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            object-fit: cover;
            z-index: 1;
            background: #0a0a0a;
        }

        #local-video {
            position: absolute;
            bottom: 120px;
            right: 24px;
            width: 260px;
            height: 195px;
            object-fit: cover;
            border-radius: 16px;
            border: 2px solid rgba(255,255,255,0.15);
            z-index: 2;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
            transform: scaleX(-1);
            background: #111;
        }

        #call-timer {
            position: absolute;
            top: 32px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 20px;
            font-weight: 500;
            letter-spacing: 1px;
            z-index: 10;
            text-shadow: 0 2px 10px rgba(0,0,0,0.8);
            font-variant-numeric: tabular-nums;
            background: rgba(0,0,0,0.3);
            padding: 6px 16px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
        }

        #call-controls {
            position: absolute;
            bottom: 32px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 16px;
            padding: 12px 24px;
            background: rgba(24, 24, 27, 0.75);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 50px;
            z-index: 10;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        .call-ctrl-btn {
            width: 54px;
            height: 54px;
            border-radius: 50%;
            border: none;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .call-ctrl-btn:hover {
            background: rgba(255, 255, 255, 0.2);
            transform: scale(1.05);
        }
        .call-ctrl-btn.active {
            background: rgba(255, 255, 255, 0.9);
            color: #000;
        }
        .call-ctrl-btn.end-call {
            background: #ff3b30;
        }
        .call-ctrl-btn.end-call:hover {
            background: #ff4f46;
            transform: scale(1.1);
        }
        .call-ctrl-btn svg {
            width: 24px;
            height: 24px;
            pointer-events: none;
        }

        #incoming-call-ui {
            position: absolute;
            z-index: 20;
            text-align: center;
            background: rgba(24, 24, 27, 0.85);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            padding: 48px 56px;
            border-radius: 28px;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            max-width: 90vw;
        }
        #incoming-call-ui h2 { 
            margin: 0 0 8px 0; 
            font-size: 28px; 
            font-weight: 600;
            letter-spacing: -0.02em;
            color: #fff;
        }
        #incoming-call-ui p { 
            margin: 0 0 32px 0; 
            color: rgba(255,255,255,0.5); 
            font-size: 15px;
            font-weight: 400;
        }
        
        .pulsing-text {
            animation: pulse-opacity 2s ease-in-out infinite;
        }
        @keyframes pulse-opacity {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 1; }
        }

        .incoming-action-btn {
            padding: 14px 36px;
            border: none;
            border-radius: 50px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin: 0 8px;
            transition: all 0.2s ease;
            letter-spacing: -0.01em;
        }
        .incoming-action-btn:active { transform: scale(0.95); }
        .btn-accept { background: #34c759; color: white; }
        .btn-accept:hover { background: #2dd248; }
        .btn-reject { background: rgba(255, 59, 48, 0.2); color: #ff3b30; border: 1px solid rgba(255, 59, 48, 0.3); }
        .btn-reject:hover { background: rgba(255, 59, 48, 0.3); }

        /* Mobile Adjustments */
        @media (max-width: 768px) {
            #local-video {
                width: 100px;
                height: 75px;
                bottom: 110px; /* Safely tucked above control panel */
                right: 16px;
                border-radius: 12px;
                border-width: 1px;
                box-shadow: 0 10px 20px rgba(0,0,0,0.5);
            }
            #call-controls {
                padding: 10px 16px;
                gap: 12px;
                bottom: 24px;
            }
            .call-ctrl-btn {
                width: 46px;
                height: 46px;
            }
            .call-ctrl-btn svg {
                width: 20px;
                height: 20px;
            }
            .call-btn-screen {
                display: none !important;
            }
            #call-timer {
                font-size: 16px;
                top: 24px;
                padding: 4px 12px;
            }
            #incoming-call-ui {
                padding: 32px 24px;
                border-radius: 20px;
            }
            #incoming-call-ui h2 { font-size: 22px; }
            #incoming-call-ui p { font-size: 14px; margin-bottom: 24px; }
            .incoming-action-btn {
                padding: 12px 28px;
                font-size: 14px;
            }
        }
    `;
    document.head.appendChild(style);

    // --- STATE VARIABLES ---
    let pc = null;
    let localStream = null;
    let timerInterval = null;
    let callDuration = 0;
    let isScreenSharing = false;
    let micEnabled = true;
    let camEnabled = true;

    // --- WEBRTC CONFIG ---
    const rtcConfig = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    // --- HELPER FUNCTIONS ---
    function getUI() {
        return {
            overlay: document.getElementById('call-overlay'),
            remoteVideo: document.getElementById('remote-video'),
            localVideo: document.getElementById('local-video'),
            timer: document.getElementById('call-timer'),
            incomingUI: document.getElementById('incoming-call-ui'),
            btnMic: document.getElementById('btn-mic'),
            btnCam: document.getElementById('btn-cam'),
            btnScreen: document.getElementById('btn-screen')
        };
    }

    function startTimer() {
        const ui = getUI();
        callDuration = 0;
        ui.timer.innerText = '00:00';
        timerInterval = setInterval(function() {
            callDuration++;
            const mins = String(Math.floor(callDuration / 60)).padStart(2, '0');
            const secs = String(callDuration % 60).padStart(2, '0');
            ui.timer.innerText = mins + ':' + secs;
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function resetUI() {
        const ui = getUI();
        if (ui.overlay) ui.overlay.classList.remove('active');
        if (ui.remoteVideo) ui.remoteVideo.srcObject = null;
        if (ui.localVideo) ui.localVideo.srcObject = null;
        if (ui.timer) ui.timer.innerText = '00:00';
        if (ui.incomingUI) ui.incomingUI.style.display = 'none';
        if (ui.btnMic) ui.btnMic.classList.remove('active');
        if (ui.btnCam) ui.btnCam.classList.remove('active');
        if (ui.btnScreen) ui.btnScreen.classList.remove('active');
        micEnabled = true;
        camEnabled = true;
        isScreenSharing = false;
    }

    function cleanupPeerConnection() {
        if (pc) {
            pc.ontrack = null;
            pc.onicecandidate = null;
            pc.close();
            pc = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(function(track) { track.stop(); });
            localStream = null;
        }
        stopTimer();
    }

    function sendSignal(payload) {
        if (typeof ws !== 'undefined' && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        } else {
            console.error("WebSocket is not connected.");
            endCall(true);
        }
    }

    // --- WEBRTC LOGIC ---
    async function getLocalMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const ui = getUI();
            ui.localVideo.srcObject = localStream;
            return localStream;
        } catch (err) {
            console.error("Failed to get local media", err);
            alert("Could not access camera/microphone.");
            throw err;
        }
    }

    function createPeerConnection() {
        pc = new RTCPeerConnection(rtcConfig);

        pc.onicecandidate = function(event) {
            if (event.candidate) {
                sendSignal({
                    type: 'ice_candidate',
                    receiver: currentChat,
                    target: currentChat,
                    candidate: event.candidate
                });
            }
        };

        pc.ontrack = function(event) {
            const ui = getUI();
            ui.remoteVideo.srcObject = event.streams[0];
            ui.incomingUI.style.display = 'none';
            startTimer();
        };
    }

    function addLocalTracks() {
        if (localStream && pc) {
            localStream.getTracks().forEach(function(track) {
                pc.addTrack(track, localStream);
            });
        }
    }

    async function initiateCall() {
        try {
            await getLocalMedia();
            createPeerConnection();
            addLocalTracks();

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            sendSignal({
                type: 'call_offer',
                receiver: currentChat,
                target: currentChat,
                offer: offer
            });

            const ui = getUI();
            ui.overlay.classList.add('active');
            ui.incomingUI.style.display = 'block';
            // Polished Outgoing Modal
            ui.incomingUI.innerHTML = 
                '<h2>' + currentChat + '</h2>' +
                '<p class="pulsing-text">Ringing...</p>' +
                '<div style="width: 40px; height: 40px; border: 2px solid rgba(255,255,255,0.2); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>' +
                '<style>@keyframes spin { to { transform: rotate(360deg); } }</style>';
        } catch (err) {
            endCall(true);
        }
    }

    // CRITICAL BUG FIX IMPLEMENTATION:
    // Secure global variable mapping for the incoming SDP offer.
    window.acceptCall = async function() {
        const offer = window.currentIncomingOffer;
        if (!offer) return;

        try {
            await getLocalMedia();
            createPeerConnection();
            addLocalTracks();

            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            sendSignal({
                type: 'call_answer',
                receiver: currentChat,
                target: currentChat,
                answer: answer
            });

            const ui = getUI();
            ui.incomingUI.style.display = 'none';
        } catch (err) {
            console.error("Error accepting call", err);
            endCall(true);
        }
    };

    async function handleAnswer(answer) {
        if (!pc) return;
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            const ui = getUI();
            if (ui.incomingUI) ui.incomingUI.style.display = 'none';
        } catch (err) {
            console.error("Error setting remote description (answer)", err);
        }
    }

    async function handleIceCandidate(candidate) {
        if (!pc) return;
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("Error adding ICE candidate", err);
        }
    }

    // --- CONTROLS LOGIC ---
    function toggleMic() {
        if (!localStream) return;
        micEnabled = !micEnabled;
        localStream.getAudioTracks().forEach(function(track) { track.enabled = micEnabled; });
        getUI().btnMic.classList.toggle('active', !micEnabled);
    }

    function toggleCam() {
        if (!localStream) return;
        camEnabled = !camEnabled;
        localStream.getVideoTracks().forEach(function(track) { track.enabled = camEnabled; });
        getUI().btnCam.classList.toggle('active', !camEnabled);
    }

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
                ui.btnScreen.classList.add('active');

                screenTrack.onended = function() {
                    revertScreenShare(videoSender);
                };
            } catch (err) {
                console.log("Screen share cancelled by user.");
            }
        } else {
            await revertScreenShare(videoSender);
        }
    }

    async function revertScreenShare(videoSender) {
        try {
            const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const camTrack = camStream.getVideoTracks()[0];
            
            await videoSender.replaceTrack(camTrack);
            
            getUI().localVideo.srcObject = camStream;
            
            if (localStream) {
                localStream.getVideoTracks().forEach(function(t) { t.stop(); });
                localStream.removeTrack(localStream.getVideoTracks()[0]);
                localStream.addTrack(camTrack);
            }

            isScreenSharing = false;
            getUI().btnScreen.classList.remove('active');
        } catch (err) {
            console.error("Error reverting screen share", err);
            endCall(true);
        }
    }

    function endCall(isInternal) {
        if (!isInternal) {
            sendSignal({
                type: 'call_end',
                receiver: currentChat,
                target: currentChat
            });
        }
        cleanupPeerConnection();
        resetUI();
    }

    window.rejectCall = function() {
        sendSignal({
            type: 'call_end',
            receiver: currentChat,
            target: currentChat
        });
        resetUI();
    };

    // --- HOOKS INTEGRATION ---

    if (!window.ChatHooks) window.ChatHooks = { onUIReady: [], onMessageRender: [] };
    
    window.ChatHooks.onUIReady.push(function() {
        const header = document.querySelector('.chat-header') || document.querySelector('header') || document.body;
        const callBtn = document.createElement('button');
        callBtn.id = 'call-trigger-btn';
        callBtn.title = 'Start Video Call';
        callBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>';
        callBtn.onclick = initiateCall;
        header.appendChild(callBtn);

        const overlay = document.createElement('div');
        overlay.id = 'call-overlay';
        overlay.innerHTML = 
            '<video id="remote-video" autoplay playsinline></video>' +
            '<video id="local-video" autoplay playsinline muted></video>' +
            '<div id="call-timer">00:00</div>' +
            
            // Polished Incoming Modal
            '<div id="incoming-call-ui" style="display: none;">' +
                '<h2>Incoming Video Call</h2>' +
                '<p id="incoming-caller-name" class="pulsing-text">User</p>' +
                '<div style="display: flex; justify-content: center; gap: 12px; margin-top: 8px;">' +
                    '<button class="incoming-action-btn btn-reject" onclick="window.rejectCall()">Decline</button>' +
                    '<button class="incoming-action-btn btn-accept" onclick="window.acceptCall()">Accept</button>' +
                '</div>' +
            '</div>' +

            // Frosted Glass Control Dock
            '<div id="call-controls">' +
                '<button id="btn-mic" class="call-ctrl-btn" onclick="window.callSystemToggleMic()" title="Toggle Microphone">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>' +
                '</button>' +
                '<button id="btn-cam" class="call-ctrl-btn" onclick="window.callSystemToggleCam()" title="Toggle Camera">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>' +
                '</button>' +
                '<button id="btn-screen" class="call-ctrl-btn call-btn-screen" onclick="window.callSystemToggleScreen()" title="Share Screen">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>' +
                '</button>' +
                '<button class="call-ctrl-btn end-call" onclick="window.callSystemEndCall()" title="End Call">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" transform="rotate(135 12 12)"></path></svg>' +
                '</button>' +
            '</div>';
            
        document.body.appendChild(overlay);

        // Expose control functions
        window.callSystemToggleMic = toggleMic;
        window.callSystemToggleCam = toggleCam;
        window.callSystemToggleScreen = toggleScreen;
        window.callSystemEndCall = endCall;
    });

    window.ChatHooks.onMessageRender.push(function(msg) {
        if (typeof msg === 'string') {
            try { msg = JSON.parse(msg); } catch(e) { return msg; }
        }

        if (msg && msg.type) {
            const ui = getUI();

            switch(msg.type) {
                case 'call_offer':
                    // CRITICAL BUG FIX: Securely map the complex SDP object to a global variable.
                    // DO NOT stringify it directly into the onclick attribute.
                    window.currentIncomingOffer = msg.offer;
                    
                    ui.overlay.classList.add('active');
                    ui.incomingUI.style.display = 'block';
                    ui.incomingUI.querySelector('#incoming-caller-name').innerText = msg.sender || currentChat;
                    
                    return null;

                case 'call_answer':
                    handleAnswer(msg.answer);
                    return null;

                case 'ice_candidate':
                    handleIceCandidate(msg.candidate);
                    return null;

                case 'call_end':
                    cleanupPeerConnection();
                    resetUI();
                    return null;
            }
        }

        return msg;
    });

})();