(function() {
    console.log("Loading WebRTC A/V Call Plugin...");

    // ==========================================
    // 1. INJECT RESPONSIVE CSS STYLES
    // ==========================================
    const styles = `
        <style>
            /* Base Modal styling */
            #av-modal {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(10, 10, 10, 0.95); backdrop-filter: blur(10px);
                z-index: 9999; display: none; flex-direction: column;
                align-items: center; justify-content: center; opacity: 0;
                transition: opacity 0.3s ease;
            }
            #av-modal.active { display: flex; opacity: 1; }
            
            /* Responsive Video Container */
            .av-container {
                position: relative; width: 100%; height: 100%;
                max-width: 900px; max-height: 85vh; background: #000;
                border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            }
            
            /* Remote Video (Full background) */
            .remote-vid { width: 100%; height: 100%; object-fit: cover; }
            
            /* Local Video (Floating Picture-in-Picture) */
            .local-vid {
                position: absolute; bottom: 20px; right: 20px;
                width: 150px; height: 200px; object-fit: cover;
                border-radius: 12px; border: 2px solid rgba(255,255,255,0.2);
                background: #222; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            }

            /* Audio-Only Mode Placeholder */
            .audio-avatar {
                display: none; position: absolute; top: 50%; left: 50%;
                transform: translate(-50%, -50%); width: 150px; height: 150px;
                border-radius: 50%; background: var(--accent-primary, #6366f1);
                color: #fff; align-items: center; justify-content: center;
                font-size: 64px; box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7);
                animation: pulse 2s infinite;
            }

            /* Modes */
            .audio-mode .remote-vid, .audio-mode .local-vid { opacity: 0; }
            .audio-mode .audio-avatar { display: flex; }

            /* Call Header (Status & Name) */
            .av-header {
                position: absolute; top: 30px; left: 0; width: 100%;
                text-align: center; color: white; z-index: 20;
                text-shadow: 0 2px 5px rgba(0,0,0,0.8);
            }
            .av-header h2 { margin: 0; font-size: 24px; font-weight: 600; }
            .av-header p { margin: 5px 0 0; font-size: 16px; opacity: 0.8; }

            /* Controls (Bottom floating buttons) */
            .av-controls {
                position: absolute; bottom: 40px; left: 50%;
                transform: translateX(-50%); display: flex; gap: 25px; z-index: 20;
            }
            .av-btn {
                width: 65px; height: 65px; border-radius: 50%; border: none;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; transition: transform 0.2s, background 0.2s;
                color: white; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            }
            .av-btn:hover { transform: scale(1.1); }
            .btn-answer { background: #22c55e; display: none; }
            .btn-hangup { background: #ef4444; }
            .av-btn svg { width: 30px; height: 30px; fill: currentColor; }

            /* Mobile Overrides (Phone Size) */
            @media (max-width: 768px) {
                .av-container { max-width: 100%; max-height: 100%; border-radius: 0; }
                .local-vid { width: 100px; height: 140px; bottom: 120px; right: 15px; }
                .av-controls { bottom: 30px; gap: 40px; }
                .av-btn { width: 70px; height: 70px; }
                .av-header { top: 40px; }
            }

            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
                70% { box-shadow: 0 0 0 30px rgba(99, 102, 241, 0); }
                100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
            }
        </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styles);

    // ==========================================
    // 2. INJECT CALLING UI HTML
    // ==========================================
    const modalHtml = `
        <div id="av-modal">
            <div class="av-container" id="av-container">
                <div class="av-header">
                    <h2 id="av-status">Calling...</h2>
                    <p id="av-peer-name">@User</p>
                </div>
                
                <video id="av-remote-video" class="remote-vid" autoplay playsinline></video>
                <video id="av-local-video" class="local-vid" autoplay playsinline muted></video>
                
                <div class="audio-avatar" id="av-audio-avatar">
                    <svg viewBox="0 0 24 24" width="60" height="60" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
                </div>

                <div class="av-controls">
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

    // ==========================================
    // 3. ADD A/V BUTTONS TO HEADER
    // ==========================================
    const headerActions = document.querySelector('.chat-header-actions');
    if (headerActions) {
        // Video Call Button
        const videoBtn = document.createElement('button');
        videoBtn.className = 'icon-btn';
        videoBtn.title = "Video Call";
        videoBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
        videoBtn.onclick = () => startCall(true);
        
        // Audio Call Button
        const audioBtn = document.createElement('button');
        audioBtn.className = 'icon-btn';
        audioBtn.title = "Audio Call";
        audioBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>`;
        audioBtn.onclick = () => startCall(false);

        headerActions.insertBefore(videoBtn, headerActions.firstChild);
        headerActions.insertBefore(audioBtn, headerActions.firstChild);
    }

    // ==========================================
    // 4. WEBRTC STATE & DOM ELEMENTS
    // ==========================================
    let peerConnection;
    let localStream;
    let isVideoCallActive = true;
    let isReceivingCall = false;

    const servers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    const modal = document.getElementById('av-modal');
    const container = document.getElementById('av-container');
    const localVideo = document.getElementById('av-local-video');
    const remoteVideo = document.getElementById('av-remote-video');
    const answerBtn = document.getElementById('av-answer-btn');
    const hangupBtn = document.getElementById('av-hangup-btn');
    const statusText = document.getElementById('av-status');
    const peerNameText = document.getElementById('av-peer-name');

    // ==========================================
    // 5. CORE WEBRTC LOGIC
    // ==========================================
    async function setupMedia(videoEnabled) {
        try {
            isVideoCallActive = videoEnabled;
            // Toggle CSS modes based on call type
            if (!videoEnabled) {
                container.classList.add('audio-mode');
            } else {
                container.classList.remove('audio-mode');
            }

            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: videoEnabled, 
                audio: true 
            });
            
            if (videoEnabled) {
                localVideo.srcObject = localStream;
            }
            return true;
        } catch (err) {
            console.error("Error accessing media devices.", err);
            showToast("Camera/Microphone access denied or unavailable.", "error");
            return false;
        }
    }

    function createPeerConnection() {
        peerConnection = new RTCPeerConnection(servers);

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
            statusText.innerText = "Connected";
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({
                    type: "av_ice_candidate",
                    receiver: currentChat,
                    candidate: event.candidate
                }));
            }
        };
    }

    async function startCall(videoEnabled) {
        if (currentChat === 'Public') {
            showToast("You cannot call the Public Lobby.", "error");
            return;
        }

        const mediaReady = await setupMedia(videoEnabled);
        if (!mediaReady) return;

        peerNameText.innerText = `@${currentChat}`;
        statusText.innerText = videoEnabled ? "Video Calling..." : "Audio Calling...";
        modal.classList.add('active');
        answerBtn.style.display = 'none';

        createPeerConnection();

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        ws.send(JSON.stringify({
            type: "av_offer",
            receiver: currentChat,
            offer: offer,
            isVideo: videoEnabled
        }));
    }

    function hangUp() {
        modal.classList.remove('active');
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
        container.classList.remove('audio-mode');

        if (ws && ws.readyState === WebSocket.OPEN && currentChat !== 'Public') {
            ws.send(JSON.stringify({ type: "av_hangup", receiver: currentChat }));
        }
    }

    hangupBtn.onclick = hangUp;

    // ==========================================
    // 6. WEBSOCKET HOOKS
    // ==========================================
    
    window.IdlyPlugins.messageHandlers['av_offer'] = async function(data) {
        if (isReceivingCall) return; 
        
        isReceivingCall = true;
        
        if (currentChat !== data.sender) {
            document.querySelector(`[onclick="switchChat('${data.sender}')"]`)?.click();
        }

        peerNameText.innerText = `@${data.sender}`;
        statusText.innerText = data.isVideo ? "Incoming Video Call..." : "Incoming Audio Call...";
        
        // Prep UI based on incoming call type
        if (!data.isVideo) container.classList.add('audio-mode');
        else container.classList.remove('audio-mode');

        modal.classList.add('active');
        answerBtn.style.display = 'flex';

        answerBtn.onclick = async () => {
            answerBtn.style.display = 'none';
            statusText.innerText = "Connecting...";

            const mediaReady = await setupMedia(data.isVideo);
            if (!mediaReady) {
                hangUp();
                return;
            }

            createPeerConnection();
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            ws.send(JSON.stringify({
                type: "av_answer",
                receiver: data.sender,
                answer: answer
            }));
        };
    };

    window.IdlyPlugins.messageHandlers['av_answer'] = async function(data) {
        if (!peerConnection) return;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    };

    window.IdlyPlugins.messageHandlers['av_ice_candidate'] = async function(data) {
        if (!peerConnection) return;
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
            console.error("Error adding received ice candidate", e);
        }
    };

    window.IdlyPlugins.messageHandlers['av_hangup'] = function(data) {
        if (typeof showToast === "function") {
            showToast(`@${data.sender} ended the call.`, "error");
        }
        hangUp();
    };

})();