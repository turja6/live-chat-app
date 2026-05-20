// static/plugins/video_calls.js

(function() {
    console.log("Loading Video Call Plugin...");

    // ==========================================
    // 1. INJECT VIDEO UI INTO THE DOM
    // ==========================================
    const modalHtml = `
        <div id="video-modal" class="modal-overlay">
            <div class="modal-content" style="max-width: 800px; text-align: center;">
                <h2 id="video-status">Calling...</h2>
                <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px; height: 300px;">
                    <video id="remote-video" autoplay playsinline style="width: 70%; background: #000; border-radius: 8px; object-fit: cover;"></video>
                    <video id="local-video" autoplay playsinline muted style="width: 30%; background: #222; border-radius: 8px; object-fit: cover;"></video>
                </div>
                <div style="display: flex; justify-content: center; gap: 15px;">
                    <button id="answer-btn" class="btn-primary" style="background: var(--online); display: none; width: 120px;">Answer</button>
                    <button id="hangup-btn" class="btn-primary" style="background: var(--danger); width: 120px;">Hang Up</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // ==========================================
    // 2. ADD CALL BUTTON TO HEADER
    // ==========================================
    const headerActions = document.querySelector('.chat-header-actions');
    if (headerActions) {
        const callBtn = document.createElement('button');
        callBtn.className = 'icon-btn desktop-only';
        callBtn.title = "Video Call";
        callBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
        callBtn.onclick = startCall;
        headerActions.insertBefore(callBtn, headerActions.firstChild);
    }

    // ==========================================
    // 3. WEBRTC STATE & CONFIG
    // ==========================================
    let peerConnection;
    let localStream;
    const servers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }, // Free Google STUN server
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const videoModal = document.getElementById('video-modal');
    const answerBtn = document.getElementById('answer-btn');
    const hangupBtn = document.getElementById('hangup-btn');
    const statusText = document.getElementById('video-status');

    let isReceivingCall = false;

    // ==========================================
    // 4. CORE WEBRTC FUNCTIONS
    // ==========================================
    async function setupMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            return true;
        } catch (err) {
            console.error("Error accessing media devices.", err);
            showToast("Camera/Microphone access denied.", "error");
            return false;
        }
    }

    function createPeerConnection() {
        peerConnection = new RTCPeerConnection(servers);

        // Add our local stream to the connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // When we get the remote stream, show it in the UI
        peerConnection.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
            statusText.innerText = "Call Connected";
        };

        // When we find a network path (ICE), send it to the other user via WebSocket
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({
                    type: "video_ice_candidate",
                    receiver: currentChat,
                    candidate: event.candidate
                }));
            }
        };
    }

    async function startCall() {
        if (currentChat === 'Public') {
            showToast("You cannot call the Public Lobby.", "error");
            return;
        }

        const mediaReady = await setupMedia();
        if (!mediaReady) return;

        videoModal.classList.add('active');
        statusText.innerText = `Calling @${currentChat}...`;
        answerBtn.style.display = 'none';

        createPeerConnection();

        // Create an offer and send it
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        ws.send(JSON.stringify({
            type: "video_offer",
            receiver: currentChat,
            offer: offer
        }));
    }

    function hangUp() {
        videoModal.classList.remove('active');
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        localVideo.srcObject = null;
        remoteVideo.srcObject = null;
        isReceivingCall = false;

        // Tell the other user we hung up
        if (ws && ws.readyState === WebSocket.OPEN && currentChat !== 'Public') {
            ws.send(JSON.stringify({ type: "video_hangup", receiver: currentChat }));
        }
    }

    hangupBtn.onclick = hangUp;

    // ==========================================
    // 5. REGISTER WEBSOCKET HOOKS
    // ==========================================
    
    // When someone calls us
    window.IdlyPlugins.messageHandlers['video_offer'] = async function(data) {
        if (isReceivingCall) return; // Ignore if already in a call
        
        isReceivingCall = true;
        
        // Force the app to switch to the caller's chat window if not already there
        if (currentChat !== data.sender) {
            document.querySelector(`[onclick="switchChat('${data.sender}')"]`)?.click();
        }

        videoModal.classList.add('active');
        statusText.innerText = `Incoming call from @${data.sender}`;
        answerBtn.style.display = 'inline-block';

        answerBtn.onclick = async () => {
            answerBtn.style.display = 'none';
            statusText.innerText = "Connecting...";

            const mediaReady = await setupMedia();
            if (!mediaReady) {
                hangUp();
                return;
            }

            createPeerConnection();
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            ws.send(JSON.stringify({
                type: "video_answer",
                receiver: data.sender,
                answer: answer
            }));
        };
    };

    // When the person we called answers
    window.IdlyPlugins.messageHandlers['video_answer'] = async function(data) {
        if (!peerConnection) return;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    };

    // Routing the network paths
    window.IdlyPlugins.messageHandlers['video_ice_candidate'] = async function(data) {
        if (!peerConnection) return;
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
            console.error("Error adding received ice candidate", e);
        }
    };

    // When the other person hangs up
    window.IdlyPlugins.messageHandlers['video_hangup'] = function(data) {
        showToast(`@${data.sender} ended the call.`, "error");
        hangUp();
    };

})();