(function InitCallSystem() {
    let localStream;
    let peerConnection;
    const servers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    // 1. INJECT CUSTOM CSS FOR VIDEO UI
    const style = document.createElement('style');
    style.innerHTML = `
        .call-btn { color: var(--online); }
        .call-btn:hover { background: rgba(16, 185, 129, 0.2) !important; }
        #call-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 1000; flex-direction: column; align-items: center; justify-content: center; color: white; }
        #call-modal.active { display: flex; }
        .video-grid { display: flex; gap: 20px; margin: 20px; max-width: 90%; }
        video { background: #222; border-radius: 12px; max-width: 45vw; max-height: 50vh; object-fit: cover; }
        #local-video { transform: scaleX(-1); border: 2px solid var(--accent-primary); }
        .call-controls { display: flex; gap: 20px; margin-top: 20px; }
        .call-action-btn { padding: 15px 30px; border: none; border-radius: 30px; font-weight: bold; cursor: pointer; font-size: 1rem; transition: transform 0.2s; }
        .call-action-btn:hover { transform: scale(1.05); }
        .btn-end { background: var(--danger); color: white; }
        .btn-answer { background: var(--online); color: white; }
    `;
    document.head.appendChild(style);

    // 2. INJECT HTML UI
    window.ChatHooks.onUIReady.push(function() {
        // Add Call Button to Header
        const headerActions = document.getElementById("mount-header-actions");
        if (headerActions) {
            const callBtn = document.createElement("button");
            callBtn.className = "icon-btn call-btn";
            callBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
            callBtn.title = "Video Call";
            callBtn.onclick = initiateCall;
            headerActions.prepend(callBtn);
        }

        // Add Video Modal to Overlays
        const overlayZone = document.getElementById("mount-overlays");
        if (overlayZone) {
            overlayZone.innerHTML += `
                <div id="call-modal">
                    <h2 id="call-status">Calling...</h2>
                    <div class="video-grid">
                        <video id="local-video" autoplay muted playsinline></video>
                        <video id="remote-video" autoplay playsinline></video>
                    </div>
                    <div class="call-controls" id="call-controls">
                        <button class="call-action-btn btn-end" onclick="endCall()">End Call</button>
                    </div>
                </div>
            `;
        }
    });

    // 3. INTERCEPT SIGNALING MESSAGES (So they don't show as chat bubbles)
    window.ChatHooks.onMessageRender.push(function(msg) {
        if (msg.type === "call_offer") { handleReceiveOffer(msg); return null; }
        if (msg.type === "call_answer") { handleReceiveAnswer(msg); return null; }
        if (msg.type === "ice_candidate") { handleNewICECandidateMsg(msg); return null; }
        if (msg.type === "call_end") { cleanupCallUI(); return null; }
        return msg; // Let normal messages pass through
    });

    // 4. WEBRTC LOGIC
    async function startMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById("local-video").srcObject = localStream;
            document.getElementById("call-modal").classList.add("active");
        } catch (err) {
            showToast("Camera/Microphone access denied", "error");
            throw err;
        }
    }

    function createPeerConnection() {
        peerConnection = new RTCPeerConnection(servers);
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "ice_candidate", receiver: currentChat, candidate: event.candidate }));
            }
        };
        peerConnection.ontrack = (event) => {
            document.getElementById("remote-video").srcObject = event.streams[0];
        };
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    async function initiateCall() {
        if (currentChat === "Public") { showToast("You can only call in Direct Messages", "error"); return; }
        await startMedia();
        document.getElementById("call-status").innerText = `Calling ${currentChat}...`;
        createPeerConnection();

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "call_offer", receiver: currentChat, offer: offer }));
    }

    async function handleReceiveOffer(msg) {
        document.getElementById("call-modal").classList.add("active");
        document.getElementById("call-status").innerText = `Incoming call from ${msg.sender}...`;
        const controls = document.getElementById("call-controls");
        
        // Temporarily add an Answer button
        const answerBtn = document.createElement("button");
        answerBtn.className = "call-action-btn btn-answer";
        answerBtn.innerText = "Answer";
        answerBtn.onclick = async () => {
            await startMedia();
            createPeerConnection();
            await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: "call_answer", receiver: msg.sender, answer: answer }));
            document.getElementById("call-status").innerText = `In call with ${msg.sender}`;
            answerBtn.remove();
        };
        controls.prepend(answerBtn);
        
        // Auto-reject if they close it before answering
        window.tempCaller = msg.sender;
    }

    async function handleReceiveAnswer(msg) {
        document.getElementById("call-status").innerText = `In call with ${msg.sender}`;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.answer));
    }

    async function handleNewICECandidateMsg(msg) {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
        }
    }

    // Expose endCall to global scope so the HTML button can click it
    window.endCall = function() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const target = currentChat !== "Public" ? currentChat : window.tempCaller;
            if (target) ws.send(JSON.stringify({ type: "call_end", receiver: target }));
        }
        cleanupCallUI();
    };

    function cleanupCallUI() {
        document.getElementById("call-modal").classList.remove("active");
        const answerBtn = document.querySelector(".btn-answer");
        if (answerBtn) answerBtn.remove();
        
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
        window.tempCaller = null;
    }

    console.log("📞 Video Calling Plugin Loaded!");
})();