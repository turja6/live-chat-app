(function InitAdvancedCallSystem() {
    let localStream;
    let screenStream;
    let peerConnection;
    let isMuted = false;
    let isVideoOff = false;
    let isScreenSharing = false;
    const servers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    // 1. INJECT RESPONSIVE, MODERN CSS
    const style = document.createElement('style');
    style.innerHTML = `
        /* Top Header Call Button */
        .header-call-btn { color: var(--online); background: transparent; transition: all 0.2s ease; }
        .header-call-btn:hover { background: rgba(16, 185, 129, 0.15) !important; transform: scale(1.05); }
        
        /* Full Screen Call Overlay */
        #adv-call-overlay {
            position: fixed; inset: 0; background: #09090b; z-index: 9999; display: none;
            flex-direction: column; opacity: 0; transition: opacity 0.3s ease;
        }
        #adv-call-overlay.active { display: flex; opacity: 1; }
        
        /* Top Bar Info */
        .call-top-bar {
            position: absolute; top: 0; left: 0; width: 100%; padding: 20px 30px;
            background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
            z-index: 10; display: flex; justify-content: space-between; align-items: center;
        }
        .call-info-text h3 { margin: 0; color: white; font-size: 1.5rem; font-weight: 600; }
        .call-info-text p { margin: 5px 0 0 0; color: #10b981; font-weight: 500; font-size: 0.9rem; }

        /* Video Grid Layout */
        .video-layout {
            flex: 1; display: flex; align-items: center; justify-content: center;
            position: relative; overflow: hidden; padding: 20px;
        }
        
        /* Remote Video (Main Background) */
        #remote-video {
            width: 100%; height: 100%; object-fit: cover; border-radius: 16px;
            background: #18181b; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        
        /* Local Video (Floating PiP) */
        #local-video {
            position: absolute; bottom: 120px; right: 40px; width: 200px; height: 280px;
            object-fit: cover; border-radius: 16px; border: 2px solid rgba(255,255,255,0.1);
            background: #27272a; box-shadow: 0 15px 35px rgba(0,0,0,0.6);
            transform: scaleX(-1); transition: all 0.3s ease; z-index: 5;
        }
        
        /* Control Bar (Glassmorphism) */
        .control-bar {
            position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
            background: rgba(24, 24, 27, 0.7); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);
            padding: 15px 25px; border-radius: 50px; border: 1px solid rgba(255,255,255,0.08);
            display: flex; gap: 20px; z-index: 10; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }

        /* Control Buttons */
        .ctrl-btn {
            width: 54px; height: 54px; border-radius: 50%; border: none;
            background: rgba(255,255,255,0.1); color: white; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .ctrl-btn:hover { background: rgba(255,255,255,0.2); transform: translateY(-3px); }
        .ctrl-btn svg { width: 24px; height: 24px; fill: currentColor; }
        
        /* Active/Toggled States */
        .ctrl-btn.off { background: white; color: #18181b; }
        .ctrl-btn.end { background: #ef4444; color: white; }
        .ctrl-btn.end:hover { background: #dc2626; }
        .ctrl-btn.accept { background: #10b981; color: white; animation: pulseCall 2s infinite; }

        @keyframes pulseCall { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(16, 185, 129, 0); } 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); } }

        /* Mobile Responsiveness */
        @media (max-width: 768px) {
            .video-layout { padding: 0; }
            #remote-video { border-radius: 0; }
            #local-video { width: 110px; height: 160px; bottom: 110px; right: 20px; }
            .control-bar { bottom: 20px; width: 90%; max-width: 350px; justify-content: space-between; padding: 12px 20px; }
            .ctrl-btn { width: 48px; height: 48px; }
            .ctrl-btn svg { width: 22px; height: 22px; }
        }
    `;
    document.head.appendChild(style);

    // SVG Icons
    const ICONS = {
        micOn: `<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`,
        micOff: `<svg viewBox="0 0 24 24"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02 3.28l-2.6 2.6V21h-2v-3.08c-2.43-.34-4.48-1.95-5.54-4.22l1.62-.89c.86 1.76 2.69 2.99 4.8 2.99.71 0 1.38-.15 2-.41l1.72 1.71v.18zm-5.69-5.69L4.27 3.57 3 4.84l3.18 3.18C6.06 8.95 6 9.46 6 10v1h2v-1c0-1.63.85-3.05 2.15-3.86l2.13 2.13c-.18.23-.28.51-.28.82v6c0 1.66 1.34 3 3 3 .31 0 .59-.1.82-.28l2.91 2.91 1.27-1.27-10.71-10.71zM15 10V5c0-1.66-1.34-3-3-3s-3 1.34-3 3v1.17l6 6V10z"/></svg>`,
        camOn: `<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
        camOff: `<svg viewBox="0 0 24 24"><path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/></svg>`,
        screen: `<svg viewBox="0 0 24 24"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.11-.9-2-2-2H4c-1.11 0-2 .89-2 2v10c0 1.1.89 2 2 2H0v2h24v-2h-4zM4 16V6h16v10H4z"/></svg>`,
        end: `<svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>`,
        accept: `<svg viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`
    };

    // 2. BUILD THE UI
    window.ChatHooks.onUIReady.push(function() {
        const headerActions = document.getElementById("mount-header-actions");
        if (headerActions) {
            const callBtn = document.createElement("button");
            callBtn.className = "icon-btn header-call-btn";
            callBtn.innerHTML = ICONS.camOn;
            callBtn.onclick = initiateCall;
            headerActions.prepend(callBtn);
        }

        const overlayZone = document.getElementById("mount-overlays");
        if (overlayZone) {
            overlayZone.innerHTML += `
                <div id="adv-call-overlay">
                    <div class="call-top-bar">
                        <div class="call-info-text">
                            <h3 id="call-target-name">User</h3>
                            <p id="call-status-text">Ringing...</p>
                        </div>
                    </div>
                    <div class="video-layout">
                        <video id="remote-video" autoplay playsinline></video>
                        <video id="local-video" autoplay muted playsinline></video>
                    </div>
                    <div class="control-bar" id="call-controls"></div>
                </div>
            `;
        }
    });

    // 3. INTERCEPT SIGNALS
    window.ChatHooks.onMessageRender.push(function(msg) {
        if (msg.type === "call_offer") { handleReceiveOffer(msg); return null; }
        if (msg.type === "call_answer") { handleReceiveAnswer(msg); return null; }
        if (msg.type === "ice_candidate") { handleNewICECandidateMsg(msg); return null; }
        if (msg.type === "call_end") { cleanupCallUI(); return null; }
        return msg; 
    });

    // 4. LOGIC
    async function startMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById("local-video").srcObject = localStream;
            isMuted = false; isVideoOff = false; isScreenSharing = false;
        } catch (err) {
            showToast("Camera/Microphone access denied", "error"); throw err;
        }
    }

    function createPeerConnection() {
        peerConnection = new RTCPeerConnection(servers);
        peerConnection.onicecandidate = (e) => {
            if (e.candidate && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "ice_candidate", receiver: window.currentCallTarget, candidate: e.candidate }));
            }
        };
        peerConnection.ontrack = (e) => {
            document.getElementById("remote-video").srcObject = e.streams[0];
        };
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    // --- BUTTON CONTROLS ---
    function renderRingingControls() {
        document.getElementById("call-controls").innerHTML = `
            <button class="ctrl-btn end" onclick="endCall()" title="Cancel Call">${ICONS.end}</button>
        `;
    }

    function renderIncomingControls(offerStr) {
        document.getElementById("call-controls").innerHTML = `
            <button class="ctrl-btn accept" onclick="acceptCall('${escapeHtml(JSON.stringify(offerStr))}')">${ICONS.accept}</button>
            <button class="ctrl-btn end" onclick="endCall()">${ICONS.end}</button>
        `;
    }

    function renderActiveControls() {
        document.getElementById("call-controls").innerHTML = `
            <button class="ctrl-btn" id="btn-mic" onclick="toggleMic()">${ICONS.micOn}</button>
            <button class="ctrl-btn" id="btn-cam" onclick="toggleCam()">${ICONS.camOn}</button>
            <button class="ctrl-btn desktop-only" id="btn-screen" onclick="toggleScreenShare()">${ICONS.screen}</button>
            <button class="ctrl-btn end" onclick="endCall()">${ICONS.end}</button>
        `;
    }

    // --- CALL ACTIONS ---
    async function initiateCall() {
        if (currentChat === "Public") { showToast("Direct Messages only", "error"); return; }
        window.currentCallTarget = currentChat;
        await startMedia();
        document.getElementById("adv-call-overlay").classList.add("active");
        document.getElementById("call-target-name").innerText = window.currentCallTarget;
        document.getElementById("call-status-text").innerText = "Ringing...";
        document.getElementById("call-status-text").style.color = "#10b981";
        renderRingingControls();

        createPeerConnection();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "call_offer", receiver: window.currentCallTarget, offer: offer }));
    }

    async function handleReceiveOffer(msg) {
        window.currentCallTarget = msg.sender;
        document.getElementById("adv-call-overlay").classList.add("active");
        document.getElementById("call-target-name").innerText = msg.sender;
        document.getElementById("call-status-text").innerText = "Incoming Video Call...";
        document.getElementById("call-status-text").style.color = "#ef4444";
        renderIncomingControls(msg.offer);
    }

    window.acceptCall = async function(offerStr) {
        const offer = JSON.parse(offerStr);
        await startMedia();
        createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        ws.send(JSON.stringify({ type: "call_answer", receiver: window.currentCallTarget, answer: answer }));
        startCallTimer(); renderActiveControls();
    };

    async function handleReceiveAnswer(msg) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.answer));
        startCallTimer(); renderActiveControls();
    }

    async function handleNewICECandidateMsg(msg) {
        if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }

    // --- TOGGLES ---
    window.toggleMic = function() {
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted;
        const btn = document.getElementById('btn-mic');
        btn.classList.toggle('off', isMuted);
        btn.innerHTML = isMuted ? ICONS.micOff : ICONS.micOn;
    };

    window.toggleCam = function() {
        isVideoOff = !isVideoOff;
        localStream.getVideoTracks()[0].enabled = !isVideoOff;
        const btn = document.getElementById('btn-cam');
        btn.classList.toggle('off', isVideoOff);
        btn.innerHTML = isVideoOff ? ICONS.camOff : ICONS.camOn;
        document.getElementById('local-video').style.opacity = isVideoOff ? '0.3' : '1';
    };

    window.toggleScreenShare = async function() {
        const btn = document.getElementById('btn-screen');
        if (!isScreenSharing) {
            try {
                screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const videoTrack = screenStream.getVideoTracks()[0];
                const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
                sender.replaceTrack(videoTrack);
                
                isScreenSharing = true;
                btn.classList.add('off');
                document.getElementById('local-video').srcObject = screenStream;

                // Stop screen sharing when user clicks native browser "Stop sharing" bar
                videoTrack.onended = () => { window.toggleScreenShare(); };
            } catch (err) { console.error("Screen share failed", err); }
        } else {
            const videoTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(videoTrack);
            
            isScreenSharing = false;
            btn.classList.remove('off');
            document.getElementById('local-video').srcObject = localStream;
            
            if (screenStream) screenStream.getTracks().forEach(t => t.stop());
        }
    };

    window.endCall = function() {
        if (ws && ws.readyState === WebSocket.OPEN && window.currentCallTarget) {
            ws.send(JSON.stringify({ type: "call_end", receiver: window.currentCallTarget }));
        }
        cleanupCallUI();
    };

    // --- UTILS ---
    let callTimer;
    let callSeconds = 0;
    function startCallTimer() {
        clearInterval(callTimer); callSeconds = 0;
        const statusText = document.getElementById("call-status-text");
        statusText.style.color = "#10b981";
        callTimer = setInterval(() => {
            callSeconds++;
            const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
            const secs = String(callSeconds % 60).padStart(2, '0');
            statusText.innerText = `${mins}:${secs}`;
        }, 1000);
    }

    function cleanupCallUI() {
        document.getElementById("adv-call-overlay").classList.remove("active");
        clearInterval(callTimer);
        if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
        if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
        if (peerConnection) { peerConnection.close(); peerConnection = null; }
        document.getElementById("local-video").srcObject = null;
        document.getElementById("remote-video").srcObject = null;
        window.currentCallTarget = null;
    }

    function escapeHtml(unsafe) { return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
})();