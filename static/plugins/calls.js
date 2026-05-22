(function() {
    console.log("Loading WebRTC A/V Call Engine (Mobile UI v2)...");

    // ==========================================
    // 1. GLOBALS & SOCKET SAFELOAD
    // ==========================================
    window.IdlyPlugins = window.IdlyPlugins || {};
    window.IdlyPlugins.messageHandlers = window.IdlyPlugins.messageHandlers || {};

    function getTargetUser() {
        try {
            if (typeof currentChat !== "undefined" && currentChat && currentChat !== "Public") return currentChat.trim();
            if (window.currentChat && window.currentChat !== "Public") return window.currentChat.trim();
        } catch (e) {}

        try {
            const headerText = document.body.innerText || "";
            const headerMatch = headerText.match(/@\s*([A-Za-z0-9_.-]+)\s*Direct Message/i);
            if (headerMatch && headerMatch[1]) return headerMatch[1].trim();
            
            const genericMatch = headerText.match(/@\s*([A-Za-z0-9_.-]+)/);
            if (genericMatch && genericMatch[1] && genericMatch[1].toLowerCase() !== "public") return genericMatch[1].trim();
        } catch (e) {}

        return "Public";
    }

    function notify(msg, type="info") {
        if (typeof window.showToast === "function") window.showToast(msg, type);
        else console.log(`[${type.toUpperCase()}] ${msg}`);
    }

    function safeSend(payload) {
        try {
            if (typeof ws !== "undefined" && ws.readyState === 1) {
                ws.send(JSON.stringify(payload));
            } else if (window.ws && window.ws.readyState === 1) {
                window.ws.send(JSON.stringify(payload));
            } else {
                notify("WebSocket connection lost.", "error");
            }
        } catch (e) {
            console.error("Socket error", e);
        }
    }

    // ==========================================
    // 2. STATE MANAGEMENT
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

    const servers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    // ==========================================
    // 3. MOBILE-FIRST CSS — WHATSAPP STYLE
    // ==========================================
    const styles = `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap');

            /* ── PHONE FRAME WRAPPER (desktop only) ── */
            #phone-frame-shell {
                position: fixed;
                inset: 0;
                z-index: 9999;
                display: none;
                align-items: center;
                justify-content: center;
                background: rgba(5, 8, 12, 0.88);
                backdrop-filter: blur(18px);
                -webkit-backdrop-filter: blur(18px);
            }
            #phone-frame-shell.active { display: flex; }

            /* Desktop: phone chrome */
            @media (min-width: 600px) {
                #phone-frame-inner {
                    width: 393px;
                    height: 852px;
                    max-height: 95vh;
                    border-radius: 52px;
                    overflow: hidden;
                    position: relative;
                    box-shadow:
                        0 0 0 10px #1a1a1e,
                        0 0 0 12px #2c2c2e,
                        0 50px 120px rgba(0,0,0,0.9),
                        inset 0 0 0 1px rgba(255,255,255,0.06);
                }
                /* notch */
                #phone-frame-inner::before {
                    content: '';
                    position: absolute;
                    top: 14px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 120px;
                    height: 34px;
                    background: #1a1a1e;
                    border-radius: 20px;
                    z-index: 9999;
                }
            }

            /* Mobile: full screen */
            @media (max-width: 599px) {
                #phone-frame-inner {
                    width: 100vw;
                    height: 100dvh;
                    border-radius: 0;
                    position: relative;
                    overflow: hidden;
                }
            }

            /* ── MODAL ITSELF ── */
            #phone-modal {
                width: 100%;
                height: 100%;
                background: #0b0d10;
                display: flex;
                flex-direction: column;
                position: relative;
                overflow: hidden;
                font-family: 'Nunito', -apple-system, BlinkMacSystemFont, sans-serif;
            }

            /* ── REMOTE VIDEO ── */
            .phone-remote-vid {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
                z-index: 1;
                background: #0b0d10;
                transition: filter 0.4s ease;
            }
            .phone-remote-vid.speaking {
                filter: brightness(1.04);
                outline: none;
            }
            /* Speaking ring overlay */
            .phone-remote-vid.speaking::after {
                content: '';
                position: absolute;
                inset: 0;
                border: 4px solid #25d366;
                border-radius: inherit;
                pointer-events: none;
                animation: speak-pulse 0.6s ease-out;
            }

            /* ── LOCAL PiP ── */
            .phone-local-vid {
                position: absolute;
                bottom: 180px;
                right: 18px;
                width: 96px;
                height: 136px;
                object-fit: cover;
                border-radius: 18px;
                border: 2.5px solid rgba(255,255,255,0.18);
                background: #1a1c22;
                z-index: 50;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4);
                cursor: grab;
                touch-action: none;
                transition: opacity 0.3s, box-shadow 0.2s, transform 0.12s;
            }
            .phone-local-vid:active {
                cursor: grabbing;
                transform: scale(1.07);
                box-shadow: 0 14px 40px rgba(0,0,0,0.7);
            }

            /* ── AUDIO / CAMERA-OFF MODES ── */
            .audio-mode .phone-remote-vid,
            .audio-mode .phone-local-vid { opacity: 0; pointer-events: none; }

            .camera-off .phone-local-vid { opacity: 0; pointer-events: none; }

            /* ── AVATAR (audio mode center stage) ── */
            .phone-avatar-zone {
                position: absolute;
                inset: 0;
                z-index: 8;
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 0;
                background: linear-gradient(160deg, #0d1117 0%, #111820 60%, #0a0f15 100%);
            }
            .audio-mode .phone-avatar-zone,
            .camera-off .phone-avatar-zone { display: flex; }

            /* Outer glow ring */
            .phone-avatar-ring {
                width: 188px;
                height: 188px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                background: conic-gradient(from 0deg, #25d366, #128c7e, #075e54, #25d366);
                animation: spin-ring 4s linear infinite;
                padding: 3px;
            }
            .phone-avatar-ring-inner {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                background: #0b0d10;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            /* Static pulse shadow */
            .phone-avatar-ring::before {
                content: '';
                position: absolute;
                width: 210px;
                height: 210px;
                border-radius: 50%;
                background: transparent;
                box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.5);
                animation: avatar-pulse 2.2s ease-out infinite;
            }
            .phone-avatar {
                width: 172px;
                height: 172px;
                border-radius: 50%;
                background: linear-gradient(145deg, #1f2937, #111827);
                display: flex;
                align-items: center;
                justify-content: center;
                color: #6b7280;
                font-size: 64px;
                font-weight: 700;
                letter-spacing: -2px;
                user-select: none;
            }
            .phone-avatar svg { width: 72px; height: 72px; fill: #4b5563; }

            /* ── TOP HEADER ── */
            .phone-header {
                position: absolute;
                top: 0; left: 0; right: 0;
                padding: 56px 24px 28px;
                z-index: 20;
                text-align: center;
                background: linear-gradient(180deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.5) 60%, transparent 100%);
                pointer-events: none;
            }
            /* Desktop: push below notch */
            @media (min-width: 600px) {
                .phone-header { padding-top: 72px; }
            }

            .phone-header-name {
                margin: 0;
                font-size: 26px;
                font-weight: 700;
                color: #ffffff;
                letter-spacing: 0.2px;
                text-shadow: 0 1px 6px rgba(0,0,0,0.5);
            }
            .phone-header-status {
                margin: 6px 0 0;
                font-size: 14px;
                font-weight: 500;
                color: rgba(255,255,255,0.72);
                letter-spacing: 0.3px;
                min-height: 20px;
            }
            .phone-timer {
                display: none;
                margin-top: 8px;
                font-size: 13px;
                font-weight: 600;
                color: #25d366;
                letter-spacing: 1.5px;
                font-variant-numeric: tabular-nums;
                background: rgba(37,211,102,0.12);
                border: 1px solid rgba(37,211,102,0.25);
                padding: 3px 14px;
                border-radius: 20px;
                display: inline-block;
            }

            /* ── BOTTOM CONTROL DOCK ── */
            .phone-controls {
                position: absolute;
                bottom: 0; left: 0; right: 0;
                z-index: 100;
                padding: 24px 20px 0;
                padding-bottom: calc(28px + env(safe-area-inset-bottom, 0px));
                background: linear-gradient(0deg, rgba(11,13,16,0.97) 0%, rgba(11,13,16,0.88) 50%, transparent 100%);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 20px;
            }

            /* Tool row (mic, cam, screen, pip) */
            .phone-tools {
                display: flex;
                gap: 18px;
                justify-content: center;
                align-items: center;
            }

            /* Action row (accept / reject) */
            .phone-actions {
                display: flex;
                gap: 52px;
                justify-content: center;
                align-items: center;
                width: 100%;
            }

            /* ── BUTTON BASE ── */
            .p-btn {
                border: none;
                outline: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.14s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s, background 0.2s;
                -webkit-tap-highlight-color: transparent;
                user-select: none;
            }
            .p-btn:active { transform: scale(0.88); }

            /* Tool buttons */
            .p-btn-tool {
                width: 58px;
                height: 58px;
                border-radius: 50%;
                background: rgba(255,255,255,0.1);
                color: #ffffff;
                flex-direction: column;
                gap: 4px;
            }
            .p-btn-tool svg { width: 24px; height: 24px; fill: currentColor; }
            .p-btn-tool span {
                font-size: 10px;
                font-weight: 600;
                color: rgba(255,255,255,0.65);
                font-family: 'Nunito', sans-serif;
                letter-spacing: 0.2px;
            }
            .p-btn-tool:hover { background: rgba(255,255,255,0.18); }
            .p-btn-tool.active {
                background: rgba(255,255,255,0.92);
                color: #0b0d10;
            }
            .p-btn-tool.active svg { fill: #0b0d10; }
            .p-btn-tool.active span { color: #0b0d10; }

            /* Main action buttons */
            .btn-accept {
                width: 74px;
                height: 74px;
                border-radius: 50%;
                background: #25d366;
                color: #fff;
                display: none;
                box-shadow: 0 6px 30px rgba(37,211,102,0.5);
                animation: accept-bob 1.2s ease-in-out infinite;
            }
            .btn-accept:hover { background: #20bd5a; }
            .btn-accept:active { transform: scale(0.88); box-shadow: 0 3px 14px rgba(37,211,102,0.4); }
            .btn-accept svg { width: 36px; height: 36px; fill: currentColor; }

            .btn-reject {
                width: 74px;
                height: 74px;
                border-radius: 50%;
                background: #ef4444;
                color: #fff;
                box-shadow: 0 6px 30px rgba(239,68,68,0.45);
            }
            .btn-reject:hover { background: #dc2626; }
            .btn-reject svg { width: 36px; height: 36px; fill: currentColor; }

            /* Reject label */
            .btn-action-label {
                font-size: 11px;
                font-weight: 600;
                color: rgba(255,255,255,0.55);
                text-align: center;
                margin-top: 8px;
                display: block;
                letter-spacing: 0.3px;
            }
            .p-btn-wrap {
                display: flex;
                flex-direction: column;
                align-items: center;
            }

            /* ── DESKTOP-ONLY SHOW ── */
            .desktop-only { display: flex; }
            @media (max-width: 599px) { .desktop-only { display: flex; } }

            /* ── KEYFRAMES ── */
            @keyframes avatar-pulse {
                0%   { box-shadow: 0 0 0 0 rgba(37,211,102,0.55); }
                60%  { box-shadow: 0 0 0 28px rgba(37,211,102,0); }
                100% { box-shadow: 0 0 0 0 rgba(37,211,102,0); }
            }
            @keyframes spin-ring {
                0%   { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            @keyframes speak-pulse {
                0%   { opacity: 1; transform: scale(1); }
                100% { opacity: 0; transform: scale(1.04); }
            }
            @keyframes accept-bob {
                0%, 100% { transform: translateY(0) scale(1); }
                50%       { transform: translateY(-6px) scale(1.04); }
            }
            @keyframes incoming-ring {
                0%, 100% { box-shadow: 0 0 0 0 rgba(37,211,102,0.6); }
                50%       { box-shadow: 0 0 0 18px rgba(37,211,102,0); }
            }
        </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styles);

    // ==========================================
    // 4. INJECT HTML UI  — IDs preserved verbatim
    // ==========================================
    const modalHtml = `
        <div id="phone-frame-shell">
            <div id="phone-frame-inner">
                <div id="phone-modal">

                    <!-- Remote full-screen video -->
                    <video id="phone-remote-vid" class="phone-remote-vid" autoplay playsinline></video>

                    <!-- Local PiP video -->
                    <video id="phone-local-vid" class="phone-local-vid" autoplay playsinline muted></video>

                    <!-- Audio-mode / camera-off center avatar -->
                    <div class="phone-avatar-zone">
                        <div style="position:relative; display:flex; align-items:center; justify-content:center;">
                            <div class="phone-avatar-ring">
                                <div class="phone-avatar-ring-inner">
                                    <div class="phone-avatar">
                                        <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Top header -->
                    <div class="phone-header">
                        <p class="phone-header-name" id="phone-name">@User</p>
                        <p class="phone-header-status" id="phone-status">Calling...</p>
                        <div class="phone-timer" id="phone-timer" style="display:none;">00:00</div>
                    </div>

                    <!-- Bottom control dock -->
                    <div class="phone-controls">

                        <!-- Tool row: Mic · Cam · Screen · PiP -->
                        <div class="phone-tools">
                            <button id="phone-btn-mic" class="p-btn p-btn-tool" title="Mute">
                                <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                                <span>Mute</span>
                            </button>
                            <button id="phone-btn-cam" class="p-btn p-btn-tool" title="Camera">
                                <svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                                <span>Video</span>
                            </button>
                            <button id="phone-btn-screen" class="p-btn p-btn-tool desktop-only" title="Screen">
                                <svg viewBox="0 0 24 24"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>
                                <span>Screen</span>
                            </button>
                            <button id="phone-btn-pip" class="p-btn p-btn-tool desktop-only" title="PiP">
                                <svg viewBox="0 0 24 24"><path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/></svg>
                                <span>PiP</span>
                            </button>
                        </div>

                        <!-- Action row: Accept + Reject -->
                        <div class="phone-actions">
                            <div class="p-btn-wrap">
                                <button id="phone-btn-accept" class="p-btn btn-accept" title="Accept Call">
                                    <svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
                                </button>
                                <span class="btn-action-label" id="phone-accept-label">Accept</span>
                            </div>
                            <div class="p-btn-wrap">
                                <button id="phone-btn-reject" class="p-btn btn-reject" title="End Call">
                                    <svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
                                </button>
                                <span class="btn-action-label">End</span>
                            </div>
                        </div>

                    </div><!-- /phone-controls -->
                </div><!-- /phone-modal -->
            </div><!-- /phone-frame-inner -->
        </div><!-- /phone-frame-shell -->
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
    // 6. DOM ELEMENTS MAP — IDs unchanged
    // ==========================================
    const DOM = {
        shell: document.getElementById('phone-frame-shell'),
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
    // 7. DRAG-AND-DROP ENGINE (PiP local video)
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
    
    DOM.shell.addEventListener("mousedown", dragStart, false);
    DOM.shell.addEventListener("mouseup", dragEnd, false);
    DOM.shell.addEventListener("mousemove", drag, false);
    DOM.shell.addEventListener("touchstart", dragStart, {passive: false});
    DOM.shell.addEventListener("touchend", dragEnd, false);
    DOM.shell.addEventListener("touchmove", drag, {passive: false});

    // ==========================================
    // 8. AUDIO ANALYSER (speaking glow)
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
                const average = sum / bufferLength;
                
                if(average > 35) DOM.remoteVid.classList.add('speaking');
                else DOM.remoteVid.classList.remove('speaking');
                
                requestAnimationFrame(checkLevel);
            }
            checkLevel();
        } catch(e) {}
    }

    // ==========================================
    // 9. CORE ENGINE & LIFECYCLE
    // ==========================================

    function showShell() {
        DOM.shell.classList.add('active');
    }
    function hideShell() {
        DOM.shell.classList.remove('active');
    }

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
        hideShell();
        DOM.modal.classList.remove('audio-mode', 'camera-off');
        DOM.remoteVid.classList.remove('speaking');
        DOM.localVid.srcObject = null;
        DOM.remoteVid.srcObject = null;
        callState.callStatus = 'idle';
        callState.isReceiving = false;
        callState.isMuted = false;
        callState.isScreenSharing = false;
        
        DOM.btnMic.classList.remove('active');
        DOM.btnCam.classList.remove('active');
        DOM.btnScreen.classList.remove('active');
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
                video: videoEnabled, 
                audio: true 
            });
            
            if (videoEnabled) DOM.localVid.srcObject = callState.localStream;
            return true;
        } catch (err) {
            console.error("Media Error:", err);
            notify("Camera/Mic access denied. Please allow permissions in browser.", "error");
            return false;
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
                safeSend({ type: "video_ice_candidate", receiver: target, candidate: event.candidate });
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
        
        if (target === 'Public' || !target || target.toLowerCase() === 'public lobby') {
            notify("You cannot start a call in the Public Lobby.", "error");
            return;
        }

        const mediaReady = await setupMedia(videoEnabled);
        if (!mediaReady) return;

        callState.callStatus = 'calling';
        DOM.peerName.innerText = `@${target}`;
        DOM.status.innerText = "Calling...";
        showShell();
        DOM.btnAccept.style.display = 'none';

        createPeerConnection(target);

        const offer = await callState.peerConnection.createOffer();
        await callState.peerConnection.setLocalDescription(offer);

        safeSend({ type: "video_offer", receiver: target, offer: offer, isVideo: videoEnabled });
    }

    function hangUp(sendSignal = true) {
        const target = getTargetUser();
        if (sendSignal && target !== 'Public' && target.toLowerCase() !== 'public lobby') {
            safeSend({ type: "video_hangup", receiver: target });
        }
        cleanupCall();
    }

    // ==========================================
    // 10. BUTTON CONTROLS
    // ==========================================

    DOM.btnMic.onclick = () => {
        if(!callState.localStream) return;
        const track = callState.localStream.getAudioTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            callState.isMuted = !track.enabled;
            DOM.btnMic.classList.toggle('active', callState.isMuted);
        }
    };

    DOM.btnCam.onclick = () => {
        if(!callState.localStream) return;
        const track = callState.localStream.getVideoTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            callState.isVideoEnabled = track.enabled;
            DOM.btnCam.classList.toggle('active', !callState.isVideoEnabled);
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
                DOM.btnScreen.classList.add('active');

                screenTrack.onended = () => {
                    const videoTrack = callState.localStream.getVideoTracks()[0];
                    if(sender && videoTrack) sender.replaceTrack(videoTrack);
                    callState.isScreenSharing = false;
                    DOM.btnScreen.classList.remove('active');
                };
            } else {
                const videoTrack = callState.localStream.getVideoTracks()[0];
                const sender = callState.peerConnection.getSenders().find(s => s.track.kind === 'video');
                
                if(sender && videoTrack) sender.replaceTrack(videoTrack);
                callState.isScreenSharing = false;
                DOM.btnScreen.classList.remove('active');
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

    window.IdlyPlugins.messageHandlers['video_offer'] = async function(data) {
        if (callState.isReceiving || callState.callStatus !== 'idle') {
            safeSend({ type: "video_hangup", receiver: data.sender }); 
            return; 
        }
        
        callState.isReceiving = true;
        callState.callStatus = 'ringing';
        
        if (getTargetUser() !== data.sender && typeof window.switchChat === 'function') {
            window.switchChat(data.sender);
        }

        DOM.peerName.innerText = `@${data.sender}`;
        DOM.status.innerText = data.isVideo ? "Incoming Video Call..." : "Incoming Audio Call...";
        
        if (!data.isVideo) DOM.modal.classList.add('audio-mode');
        else DOM.modal.classList.remove('audio-mode');

        showShell();
        DOM.btnAccept.style.display = 'flex';

        DOM.btnAccept.onclick = async () => {
            DOM.btnAccept.style.display = 'none';
            DOM.status.innerText = "Connecting secure channel...";

            const mediaReady = await setupMedia(data.isVideo !== false);
            if (!mediaReady) {
                hangUp(true);
                return;
            }

            createPeerConnection(data.sender);
            await callState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

            const answer = await callState.peerConnection.createAnswer();
            await callState.peerConnection.setLocalDescription(answer);

            safeSend({ type: "video_answer", receiver: data.sender, answer: answer });
        };
    };

    window.IdlyPlugins.messageHandlers['video_answer'] = async function(data) {
        if (!callState.peerConnection) return;
        await callState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    };

    window.IdlyPlugins.messageHandlers['video_ice_candidate'] = async function(data) {
        if (!callState.peerConnection) return;
        try {
            await callState.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) { console.error("ICE error", e); }
    };

    window.IdlyPlugins.messageHandlers['video_hangup'] = function(data) {
        notify(`Call ended by @${data.sender}.`, "error");
        hangUp(false);
    };

    window.addEventListener('offline', () => {
        if(callState.callStatus === 'connected') DOM.status.innerText = 'Network Offline...';
    });
    window.addEventListener('online', () => {
        if(callState.callStatus === 'connected') DOM.status.innerText = '';
    });

    console.log("WebRTC Mobile UI Engine Ready.");
})();