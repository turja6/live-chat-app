// --- static/plugins/call_system.js ---
(function InitCallSystem() {
    let localStream;
    let peerConnection;
    const servers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    
    // Track media states
    let isMuted = false;
    let isVideoOff = false;

    // 1. INJECT MODERN UI CSS
    const style = document.createElement('style');
    style.innerHTML = `
        /* Top Header Call Button */
        .header-call-btn { color: var(--online); background: transparent; transition: all 0.2s ease; }
        .header-call-btn:hover { background: rgba(16, 185, 129, 0.15) !important; transform: scale(1.05); }
        
        /* Full Screen Call Overlay */
        #custom-call-overlay {
            position: fixed; inset: 0; background: rgba(15, 15, 17, 0.95);
            backdrop-filter: blur(15px); z-index: 9999; display: none;
            flex-direction: column; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.3s ease;
        }
        #custom-call-overlay.active { display: flex; opacity: 1; }
        
        /* Video Container (Picture in Picture) */
        .video-wrapper {
            position: relative; width: 90vw; max-width: 1000px; height: 65vh; 
            border-radius: 24px; overflow: hidden; background: #000; 
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.05);
        }
        #remote-video { width: 100%; height: 100%; object-fit: cover; }
        
        /* Local Video (Floating bottom right) */
        #local-video {
            position: absolute; bottom: 20px; right: 20px; 
            width: 160px; height: 220px; object-fit: cover; 
            border-radius: 16px; border: 2px solid rgba(255,255,255,0.2); 
            box-shadow: 0 10px 25px rgba(0,0,0,0.5); transform: scaleX(-1);
            transition: opacity 0.3s; background: #222;
        }
        
        /* Call Info Text */
        .call-header-info { position: absolute; top: 30px; left: 30px; z-index: 10; text-shadow: 0 2px 10px rgba(0,0,0,0.8); }
        .call-header-info h3 { margin: 0; font-size: 1.8rem; color: white; font-weight: 600; }
        .call-header-info p { margin: 5px 0 0 0; color: #10b981; font-weight: 500; font-size: 1rem; animation: pulseText 2s infinite; }
        
        /* Circular Action Buttons */
        .call-action-bar { display: flex; gap: 24px; margin-top: 40px; align-items: center; }
        .btn-circle {
            width: 64px; height: 64px; border-radius: 50%; border: none; 
            display: flex; align-items: center; justify-content: center; 
            cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        .btn-circle:hover { transform: translateY(-4px); box-shadow: 0 8px 25px rgba(0,0,0,0.3); }
        .btn-circle svg { width: 28px; height: 28px; fill: white; }
        
        /* Button Colors */
        .btn-accept { background: #10b981; animation: bounceCall 2s infinite; }
        .btn-reject { background: #ef4444; }
        .btn-toggle { background: #2a2a30; border: 1px solid rgba(255,255,255,0.1); }
        .btn-toggle:hover { background: #3f3f46; }
        .btn-toggle.disabled { background: #ef4444; border-color: #ef4444; }

        @keyframes pulseText { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes bounceCall { 0%, 20%, 50%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-10px); } 60% { transform: translateY(-5px); } }
        
        @media (max-width: 768px) {
            .video-wrapper { width: 100vw; height: 100vh; border-radius: 0; border: none; }
            #local-video { width: 100px; height: 140px; bottom: 120px; right: 20px; }
            .call-action-bar { position: absolute; bottom: 30px; gap: 15px; }
            .btn-circle { width: 56px; height: 56px; }
        }
    `;
    document.head.appendChild(style);

    // 2. INJECT HTML UI
    window.ChatHooks.onUIReady.push(function() {
        const headerActions = document.getElementById("mount-header-actions");
        if (headerActions) {
            const callBtn = document.createElement("button");
            callBtn.className = "icon-btn header-call-btn";
            callBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
            callBtn.title = "Start Video Call";
            callBtn.onclick = initiateCall;
            headerActions.prepend(callBtn);
        }

        const overlayZone = document.getElementById("mount-overlays");
        if (overlayZone) {
            overlayZone.innerHTML += `
                <div id="custom-call-overlay">
                    <div class="video-wrapper">
                        <div class="call-header-info">
                            <h3 id="call-target-name">User</h3>
                            <p id="call-status-text">Ringing...</p>
                        </div>
                        <video id="remote-video" autoplay playsinline></video>
                        <video id="local-video" autoplay muted playsinline></video>
                    </div>
                    
                    <div class="call-action-bar" id="call-controls">
                        </div>
                </div>
            `;
        }
    });

    // 3. INTERCEPT SIGNALING MESSAGES
    window.ChatHooks.onMessageRender.push(function(msg) {
        if (msg.type === "call_offer") { handleReceiveOffer(msg); return null; }
        if (msg.type === "call_answer") { handleReceiveAnswer(msg); return null; }
        if (msg.type === "ice_candidate") { handleNewICECandidateMsg(msg); return null; }
        if (msg.type === "call_end") { cleanupCallUI(); return null; }
        return msg; 
    });

    // 4. WEBRTC & UI LOGIC
    async function startMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById("local-video").srcObject = localStream;
            isMuted = false;
            isVideoOff = false;
        } catch (err) {
            showToast("Camera/Microphone access denied", "error");
            throw err;
        }
    }

    function createPeerConnection() {
        peerConnection = new RTCPeerConnection(servers);
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "ice_candidate", receiver: window.currentCallTarget, candidate: event.candidate }));
            }
        };
        peerConnection.ontrack = (event) => {
            document.getElementById("remote-video").srcObject = event.streams[0];
        };
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    // Renders the buttons for an active ongoing call
    function renderActiveControls() {
        const controls = document.getElementById("call-controls");
        controls.innerHTML = `
            <button class="btn-circle btn-toggle" id="btn-mute" onclick="toggleMute()" title="Mute Microphone">
                <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
            </button>
            <button class="btn-circle btn-toggle" id="btn-video" onclick="toggleCam()" title="Turn Off Camera">
                <svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
            </button>
            <button class="btn-circle btn-reject" onclick="endCall()" title="End Call">
                <svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
            </button>
        `;
    }

    async function initiateCall() {
        if (currentChat === "Public") { showToast("You can only call in Direct Messages", "error"); return; }
        window.currentCallTarget = currentChat;
        
        await startMedia();
        document.getElementById("custom-call-overlay").classList.add("active");
        document.getElementById("call-target-name").innerText = window.currentCallTarget;
        document.getElementById("call-status-text").innerText = "Ringing...";
        
        // Show only End Call button while ringing
        document.getElementById("call-controls").innerHTML = `
            <button class="btn-circle btn-reject" onclick="endCall()" title="Cancel">
                <svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
            </button>
        `;

        createPeerConnection();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "call_offer", receiver: window.currentCallTarget, offer: offer }));
    }

    async function handleReceiveOffer(msg) {
        window.currentCallTarget = msg.sender;
        document.getElementById("custom-call-overlay").classList.add("active");
        document.getElementById("call-target-name").innerText = msg.sender;
        document.getElementById("call-status-text").innerText = "Incoming Video Call...";
        document.getElementById("call-status-text").style.color = "#ef4444"; // Red for incoming
        
        // Incoming Call Controls (Accept / Reject)
        document.getElementById("call-controls").innerHTML = `
            <button class="btn-circle btn-accept" onclick="acceptCall('${escapeHtml(JSON.stringify(msg.offer))}')" title="Answer">
                <svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
            </button>
            <button class="btn-circle btn-reject" onclick="endCall()" title="Decline">
                <svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
            </button>
        `;
    }

    // Expose Accept function globally so innerHTML button can hit it
    window.acceptCall = async function(offerStr) {
        const offer = JSON.parse(offerStr);
        await startMedia();
        createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        ws.send(JSON.stringify({ type: "call_answer", receiver: window.currentCallTarget, answer: answer }));
        
        document.getElementById("call-status-text").innerText = "00:00 (Connected)";
        document.getElementById("call-status-text").style.color = "#10b981";
        renderActiveControls();
        startCallTimer();
    };

    async function handleReceiveAnswer(msg) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.answer));
        document.getElementById("call-status-text").innerText = "00:00 (Connected)";
        document.getElementById("call-status-text").style.color = "#10b981";
        renderActiveControls();
        startCallTimer();
    }

    async function handleNewICECandidateMsg(msg) {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
        }
    }

    // Expose toggles globally
    window.toggleMute = function() {
        if (!localStream) return;
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted;
        document.getElementById('btn-mute').classList.toggle('disabled', isMuted);
    };

    window.toggleCam = function() {
        if (!localStream) return;
        isVideoOff = !isVideoOff;
        localStream.getVideoTracks()[0].enabled = !isVideoOff;
        document.getElementById('btn-video').classList.toggle('disabled', isVideoOff);
        document.getElementById('local-video').style.opacity = isVideoOff ? '0.3' : '1';
    };

    window.endCall = function() {
        if (ws && ws.readyState === WebSocket.OPEN && window.currentCallTarget) {
            ws.send(JSON.stringify({ type: "call_end", receiver: window.currentCallTarget }));
        }
        cleanupCallUI();
    };

    let callTimer;
    let callSeconds = 0;
    function startCallTimer() {
        clearInterval(callTimer);
        callSeconds = 0;
        const statusText = document.getElementById("call-status-text");
        callTimer = setInterval(() => {
            callSeconds++;
            const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
            const secs = String(callSeconds % 60).padStart(2, '0');
            statusText.innerText = `${mins}:${secs}`;
        }, 1000);
    }

    function cleanupCallUI() {
        document.getElementById("custom-call-overlay").classList.remove("active");
        clearInterval(callTimer);
        
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        document.getElementById("local-video").srcObject = null;
        document.getElementById("remote-video").srcObject = null;
        window.currentCallTarget = null;
    }

    // Helper function for HTML escaping inside strings
    function escapeHtml(unsafe) {
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    console.log("📞 Custom UI Video Calling Plugin Loaded!");
})();