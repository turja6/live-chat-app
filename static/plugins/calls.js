(function() {
    console.log("Loading WebRTC A/V Call Engine (Mobile UI)...");

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

    function notify(msg, type = "info") {
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
    // 3. CSS — TOTAL MOBILE-FIRST REWRITE
    // ==========================================
    const styles = `
        <style>
            /* ── Reset & root tokens ── */
            #av-modal *, #av-modal *::before, #av-modal *::after {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
                -webkit-tap-highlight-color: transparent;
            }

            /* ── Phone frame shell (desktop: centred mockup) ── */
            #av-modal {
                position: fixed;
                inset: 0;
                z-index: 99999;
                display: none;
                align-items: center;
                justify-content: center;
                background: rgba(0, 0, 0, 0.92);
                backdrop-filter: blur(18px);
                -webkit-backdrop-filter: blur(18px);
                opacity: 0;
                transition: opacity 0.35s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            #av-modal.active {
                display: flex;
                opacity: 1;
            }

            /*
             * av-container = the "phone screen" inside the modal.
             * On real mobile  → fills 100 vw / 100 dvh edge-to-edge.
             * On desktop      → locked 390 × 844 px floating phone frame.
             */
            #av-container {
                position: relative;
                width: 100vw;
                height: 100dvh;
                overflow: hidden;
                background: #0b0d11;
                display: flex;
                flex-direction: column;
            }

            /* Desktop phone-mockup override */
            @media (min-width: 600px) {
                #av-container {
                    width: 390px;
                    height: 844px;
                    border-radius: 52px;
                    box-shadow:
                        0 0 0 2px #2a2a2e,
                        0 0 0 6px #1a1a1e,
                        0 40px 80px rgba(0,0,0,0.8),
                        0 0 0 8px #111113;
                    overflow: hidden;
                }

                /* Decorative notch bar */
                #av-container::before {
                    content: '';
                    position: absolute;
                    top: 14px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 126px;
                    height: 36px;
                    background: #0b0d11;
                    border-radius: 20px;
                    z-index: 300;
                    box-shadow: inset 0 0 0 2px #2a2a2e;
                }
            }

            /* ── Full-bleed remote video (layer 1) ── */
            #av-remote-video {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
                z-index: 1;
                background: #0b0d11;
                transition: filter 0.4s ease;
            }

            /* Speaking glow pressed inward as a ring */
            #av-remote-video.speaking {
                filter: drop-shadow(0 0 0 6px #22c55e);
                outline: 4px solid #22c55e;
                outline-offset: -4px;
            }

            /* ── Gradient overlays so text stays readable ── */
            #av-top-gradient {
                position: absolute;
                top: 0; left: 0; right: 0;
                height: 220px;
                background: linear-gradient(
                    to bottom,
                    rgba(0,0,0,0.82) 0%,
                    rgba(0,0,0,0.45) 60%,
                    transparent 100%
                );
                z-index: 10;
                pointer-events: none;
            }
            #av-bottom-gradient {
                position: absolute;
                bottom: 0; left: 0; right: 0;
                height: 340px;
                background: linear-gradient(
                    to top,
                    rgba(0,0,0,0.95) 0%,
                    rgba(0,0,0,0.7) 50%,
                    transparent 100%
                );
                z-index: 10;
                pointer-events: none;
            }

            /* ── Header (caller name + status) ── */
            #av-header {
                position: absolute;
                top: 0; left: 0; right: 0;
                z-index: 20;
                padding-top: max(52px, env(safe-area-inset-top, 52px));
                padding-bottom: 20px;
                padding-left: 24px;
                padding-right: 24px;
                text-align: center;
                color: #ffffff;
                pointer-events: none;
                user-select: none;
            }

            /* Desktop: push header down past decorative notch */
            @media (min-width: 600px) {
                #av-header { padding-top: 68px; }
            }

            #av-header .caller-name {
                font-size: 30px;
                font-weight: 600;
                letter-spacing: 0.3px;
                text-shadow: 0 2px 12px rgba(0,0,0,0.9);
                line-height: 1.15;
            }
            #av-header .caller-status {
                margin-top: 8px;
                font-size: 16px;
                font-weight: 400;
                color: rgba(255,255,255,0.75);
                text-shadow: 0 1px 6px rgba(0,0,0,0.8);
                letter-spacing: 0.5px;
            }
            #av-timer {
                display: none;
                margin-top: 10px;
                font-size: 15px;
                font-variant-numeric: tabular-nums;
                color: rgba(255,255,255,0.85);
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.15);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                padding: 5px 16px;
                border-radius: 100px;
                display: inline-block;
                pointer-events: none;
            }
            #av-timer.hidden { display: none !important; }

            /* ── Audio-mode avatar (center stage) ── */
            #av-avatar-wrap {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -52%);
                z-index: 15;
                display: none;          /* shown by .audio-mode */
                flex-direction: column;
                align-items: center;
                gap: 20px;
            }
            .audio-mode #av-avatar-wrap { display: flex; }

            /* Outer pulse ring */
            .av-pulse-outer {
                width: 200px;
                height: 200px;
                border-radius: 50%;
                background: rgba(99, 102, 241, 0.12);
                display: flex;
                align-items: center;
                justify-content: center;
                animation: av-pulse-outer 2.4s ease-out infinite;
            }
            /* Middle ring */
            .av-pulse-mid {
                width: 172px;
                height: 172px;
                border-radius: 50%;
                background: rgba(99, 102, 241, 0.18);
                display: flex;
                align-items: center;
                justify-content: center;
                animation: av-pulse-mid 2.4s ease-out infinite 0.3s;
            }
            /* Inner avatar circle */
            .av-avatar-circle {
                width: 148px;
                height: 148px;
                border-radius: 50%;
                background: linear-gradient(145deg, #6366f1 0%, #8b5cf6 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow:
                    0 0 0 4px rgba(99,102,241,0.4),
                    0 12px 40px rgba(99,102,241,0.5);
            }
            .av-avatar-circle svg {
                width: 72px;
                height: 72px;
                fill: rgba(255,255,255,0.95);
            }
            .av-avatar-label {
                font-size: 15px;
                color: rgba(255,255,255,0.6);
                letter-spacing: 0.4px;
            }

            @keyframes av-pulse-outer {
                0%   { transform: scale(0.94); opacity: 0.6; }
                50%  { transform: scale(1.04); opacity: 0.25; }
                100% { transform: scale(0.94); opacity: 0.6; }
            }
            @keyframes av-pulse-mid {
                0%   { transform: scale(0.96); opacity: 0.7; }
                50%  { transform: scale(1.03); opacity: 0.35; }
                100% { transform: scale(0.96); opacity: 0.7; }
            }

            /* ── Local PiP video ── */
            #av-local-video {
                position: absolute;
                top: 88px;
                right: 16px;
                width: 104px;
                height: 150px;
                border-radius: 18px;
                object-fit: cover;
                background: #1a1a2e;
                z-index: 40;
                border: 2.5px solid rgba(255,255,255,0.22);
                box-shadow:
                    0 8px 32px rgba(0,0,0,0.55),
                    0 2px 8px rgba(0,0,0,0.4);
                cursor: grab;
                touch-action: none;
                transition: transform 0.12s ease, box-shadow 0.2s ease, opacity 0.3s ease;
            }
            #av-local-video:active { cursor: grabbing; transform: scale(1.06); }

            /* Adjust PiP so it clears the desktop notch bar */
            @media (min-width: 600px) {
                #av-local-video { top: 112px; right: 18px; }
            }

            /* Hide PiP + remote in audio-only mode */
            .audio-mode #av-local-video,
            .audio-mode #av-remote-video {
                opacity: 0;
                pointer-events: none;
            }
            /* Camera off = blur remote, hide PiP */
            .camera-off #av-remote-video {
                filter: blur(28px) brightness(0.35);
            }
            .camera-off #av-local-video {
                opacity: 0;
                pointer-events: none;
            }

            /* ── Bottom frosted-glass dock ── */
            #av-controls {
                position: absolute;
                bottom: 0; left: 0; right: 0;
                z-index: 50;

                /* Frosted glass */
                background: rgba(14, 17, 23, 0.78);
                backdrop-filter: blur(22px) saturate(160%);
                -webkit-backdrop-filter: blur(22px) saturate(160%);
                border-top: 1px solid rgba(255,255,255,0.08);

                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 18px;

                /* Safe-area bottom padding for notched phones */
                padding: 22px 24px max(28px, env(safe-area-inset-bottom, 28px));
            }

            /* ── Tool row (mic, cam, screen, pip) ── */
            #av-tools {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 16px;
                flex-wrap: wrap;
                width: 100%;
            }

            /* ── Primary action row (accept / reject / hangup) ── */
            #av-actions {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 44px;
                width: 100%;
            }

            /* ── Generic circular button ── */
            .av-btn {
                position: relative;
                width: 58px;
                height: 58px;
                border-radius: 50%;
                border: none;
                outline: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255,255,255,0.10);
                color: #fff;
                transition:
                    transform 0.14s ease,
                    background 0.2s ease,
                    box-shadow 0.2s ease;
                -webkit-user-select: none;
                user-select: none;
                flex-shrink: 0;
            }
            .av-btn svg {
                width: 24px;
                height: 24px;
                fill: currentColor;
                pointer-events: none;
            }
            .av-btn:active {
                transform: scale(0.88);
                background: rgba(255,255,255,0.18);
            }
            .av-btn:hover:not(:active) {
                background: rgba(255,255,255,0.16);
                box-shadow: 0 0 0 6px rgba(255,255,255,0.06);
            }

            /* Muted / disabled state = red tint */
            .av-btn.muted,
            .av-btn.disabled {
                background: rgba(239, 68, 68, 0.18);
                color: #f87171;
                box-shadow: 0 0 0 2px rgba(239,68,68,0.25) inset;
            }

            /* ── Accept button (big green) ── */
            #av-answer-btn {
                width: 76px;
                height: 76px;
                background: linear-gradient(145deg, #22c55e, #16a34a);
                box-shadow:
                    0 0 0 0 rgba(34,197,94,0.55),
                    0 8px 24px rgba(34,197,94,0.45);
                animation: av-ring-bounce 1.8s ease-in-out infinite;
                display: none; /* shown when incoming */
            }
            #av-answer-btn svg { width: 34px; height: 34px; }
            #av-answer-btn:active {
                transform: scale(0.86);
                background: linear-gradient(145deg, #16a34a, #15803d);
            }

            /* ── Hangup / Reject button (big red) ── */
            #av-hangup-btn {
                width: 76px;
                height: 76px;
                background: linear-gradient(145deg, #ef4444, #dc2626);
                box-shadow: 0 8px 24px rgba(239,68,68,0.45);
            }
            #av-hangup-btn svg { width: 34px; height: 34px; }
            #av-hangup-btn:active {
                transform: scale(0.86);
                background: linear-gradient(145deg, #dc2626, #b91c1c);
            }

            /* Accept bounce animation */
            @keyframes av-ring-bounce {
                0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.6), 0 8px 24px rgba(34,197,94,0.4); }
                45%       { box-shadow: 0 0 0 16px rgba(34,197,94,0), 0 8px 24px rgba(34,197,94,0.4); }
            }

            /* ── Incoming call label above buttons ── */
            #av-incoming-label {
                display: none;
                font-size: 13px;
                color: rgba(255,255,255,0.55);
                letter-spacing: 0.6px;
                text-transform: uppercase;
                text-align: center;
                width: 100%;
            }
            #av-incoming-label.visible { display: block; }

            /* Incoming button pair labels */
            .av-btn-wrap {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
            }
            .av-btn-label {
                font-size: 12px;
                color: rgba(255,255,255,0.55);
                letter-spacing: 0.3px;
                pointer-events: none;
                user-select: none;
            }
        </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styles);

    // ==========================================
    // 4. HTML — MOBILE PHONE UI
    //    ALL original IDs preserved exactly:
    //    av-modal, av-container, av-remote-video,
    //    av-local-video, av-answer-btn, av-hangup-btn
    // ==========================================
    const modalHtml = `
        <div id="av-modal">
            <div id="av-container">

                <!-- Layer 1: full-bleed remote video -->
                <video id="av-remote-video" autoplay playsinline></video>

                <!-- Gradient overlays -->
                <div id="av-top-gradient"></div>
                <div id="av-bottom-gradient"></div>

                <!-- Layer: audio-mode avatar (hidden in video calls) -->
                <div id="av-avatar-wrap">
                    <div class="av-pulse-outer">
                        <div class="av-pulse-mid">
                            <div class="av-avatar-circle">
                                <!-- Person silhouette -->
                                <svg viewBox="0 0 24 24">
                                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12
                                             2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2
                                             0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                    <span class="av-avatar-label">Audio Call</span>
                </div>

                <!-- Layer: local PiP video -->
                <video id="av-local-video" autoplay playsinline muted></video>

                <!-- Header: name + status -->
                <div id="av-header">
                    <div class="caller-name" id="av-peer-name">@User</div>
                    <div class="caller-status" id="av-status">Calling...</div>
                    <div id="av-timer" class="hidden">00:00</div>
                </div>

                <!-- Bottom frosted-glass dock -->
                <div id="av-controls">

                    <!-- Incoming label (shown only when ringing) -->
                    <div id="av-incoming-label">Incoming Call</div>

                    <!-- Tool row: mic · camera · screen · pip -->
                    <div id="av-tools">

                        <div class="av-btn-wrap">
                            <button id="av-btn-mic" class="av-btn" title="Mute / Unmute">
                                <!-- Microphone icon -->
                                <svg viewBox="0 0 24 24">
                                    <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6
                                             0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10
                                             0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7
                                             0 0 0 19 11h-2z"/>
                                </svg>
                            </button>
                            <span class="av-btn-label">Mute</span>
                        </div>

                        <div class="av-btn-wrap">
                            <button id="av-btn-cam" class="av-btn" title="Toggle Camera">
                                <!-- Video camera icon -->
                                <svg viewBox="0 0 24 24">
                                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55
                                             0-1 .45-1 1v10c0 .55.45 1 1
                                             1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                                </svg>
                            </button>
                            <span class="av-btn-label">Camera</span>
                        </div>

                        <div class="av-btn-wrap">
                            <button id="av-btn-screen" class="av-btn" title="Share Screen">
                                <!-- Screen share icon -->
                                <svg viewBox="0 0 24 24">
                                    <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1
                                             0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4
                                             16V6h16v10H4z"/>
                                </svg>
                            </button>
                            <span class="av-btn-label">Screen</span>
                        </div>

                        <div class="av-btn-wrap">
                            <button id="av-btn-pip" class="av-btn" title="Picture in Picture">
                                <!-- PiP icon -->
                                <svg viewBox="0 0 24 24">
                                    <path d="M19 11h-8v6h8v-6zm4 8V5a2 2 0 0 0-2-2H3a2
                                             2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0
                                             2-2zm-2 .02H3V4.98h18v14.04z"/>
                                </svg>
                            </button>
                            <span class="av-btn-label">PiP</span>
                        </div>

                    </div><!-- /#av-tools -->

                    <!-- Primary actions: accept (ringing) + hangup (always) -->
                    <div id="av-actions">

                        <div class="av-btn-wrap">
                            <button id="av-answer-btn" class="av-btn" title="Accept Call">
                                <!-- Phone accept icon -->
                                <svg viewBox="0 0 24 24">
                                    <path d="M20 15.5a14.9 14.9 0 0 1-4.6-.73c-.36-.12-.76
                                             -.03-1.03.25l-2.09 2.09a15.16 15.16 0 0
                                             1-6.38-6.37l2.08-2.1c.27-.27.36-.67.24-1.02A14.9
                                             14.9 0 0 1 7.5 3c0-.55-.45-1-1-1H3c-.55
                                             0-1 .45-1 1C2 13.41 10.59 22 21 22c.55 0
                                             1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/>
                                </svg>
                            </button>
                            <span class="av-btn-label" id="av-accept-label">Accept</span>
                        </div>

                        <div class="av-btn-wrap">
                            <button id="av-hangup-btn" class="av-btn" title="End Call">
                                <!-- Phone hangup icon (rotated) -->
                                <svg viewBox="0 0 24 24">
                                    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .4-.23.74
                                             -.56.9-.98.49-1.87 1.12-2.66
                                             1.85-.18.18-.43.28-.7.28-.28
                                             0-.53-.11-.71-.29L.29 13.08A1
                                             1 0 0 1 0 12.38c0-.28.11-.53.29-.71C3.34
                                             8.78 7.46 7 12 7s8.66 1.78 11.71
                                             4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48
                                             2.48c-.18.18-.43.29-.71.29-.27
                                             0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85a1
                                             1 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                                </svg>
                            </button>
                            <span class="av-btn-label">End Call</span>
                        </div>

                    </div><!-- /#av-actions -->

                </div><!-- /#av-controls -->

            </div><!-- /#av-container -->
        </div><!-- /#av-modal -->
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // ==========================================
    // 5. INJECT HEADER START BUTTONS
    // ==========================================
    const headerActions = document.querySelector('.chat-header-actions');
    if (headerActions) {
        const videoBtn = document.createElement('button');
        videoBtn.className = 'icon-btn';
        videoBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1
                     1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
        videoBtn.onclick = () => initCall(true);

        const audioBtn = document.createElement('button');
        audioBtn.className = 'icon-btn';
        audioBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57
                     1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53
                     0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01
                     21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>`;
        audioBtn.onclick = () => initCall(false);

        headerActions.insertBefore(videoBtn, headerActions.firstChild);
        headerActions.insertBefore(audioBtn, headerActions.firstChild);
    }

    // ==========================================
    // 6. DOM ELEMENTS MAP
    //    Using the NEW HTML IDs where they changed
    //    (av-peer-name, av-status, av-timer, av-btn-*)
    //    Core IDs av-modal, av-container, av-remote-video,
    //    av-local-video, av-answer-btn, av-hangup-btn — untouched
    // ==========================================
    const DOM = {
        modal:      document.getElementById('av-modal'),
        container:  document.getElementById('av-container'),
        localVid:   document.getElementById('av-local-video'),
        remoteVid:  document.getElementById('av-remote-video'),
        btnAccept:  document.getElementById('av-answer-btn'),
        btnReject:  document.getElementById('av-hangup-btn'),
        status:     document.getElementById('av-status'),
        peerName:   document.getElementById('av-peer-name'),
        timer:      document.getElementById('av-timer'),
        btnMic:     document.getElementById('av-btn-mic'),
        btnCam:     document.getElementById('av-btn-cam'),
        btnScreen:  document.getElementById('av-btn-screen'),
        btnPip:     document.getElementById('av-btn-pip'),
        incomingLbl:document.getElementById('av-incoming-label'),
        acceptLbl:  document.getElementById('av-accept-label')
    };

    // ==========================================
    // 7. DRAG-AND-DROP ENGINE (PiP)
    // ==========================================
    let isDragging = false, currentX = 0, currentY = 0,
        initialX = 0, initialY = 0, xOffset = 0, yOffset = 0;

    function dragStart(e) {
        if (e.target !== DOM.localVid) return;
        const src = e.type === 'touchstart' ? e.touches[0] : e;
        initialX = src.clientX - xOffset;
        initialY = src.clientY - yOffset;
        isDragging = true;
    }
    function dragEnd() {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }
    function drag(e) {
        if (!isDragging) return;
        e.preventDefault();
        const src = e.type === 'touchmove' ? e.touches[0] : e;
        currentX = src.clientX - initialX;
        currentY = src.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;
        DOM.localVid.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    }

    DOM.modal.addEventListener('mousedown',  dragStart, false);
    DOM.modal.addEventListener('mouseup',    dragEnd,   false);
    DOM.modal.addEventListener('mousemove',  drag,      false);
    DOM.modal.addEventListener('touchstart', dragStart, { passive: false });
    DOM.modal.addEventListener('touchend',   dragEnd,   false);
    DOM.modal.addEventListener('touchmove',  drag,      { passive: false });

    // ==========================================
    // 8. AUDIO ANALYSER (SPEAKING GLOW)
    // ==========================================
    function setupActiveSpeaker() {
        if (!callState.remoteStream) return;
        try {
            callState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            callState.analyser = callState.audioContext.createAnalyser();
            const source = callState.audioContext.createMediaStreamSource(callState.remoteStream);
            source.connect(callState.analyser);
            callState.analyser.fftSize = 256;
            const buf = new Uint8Array(callState.analyser.frequencyBinCount);

            function tick() {
                if (callState.callStatus !== 'connected') return;
                callState.analyser.getByteFrequencyData(buf);
                const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
                DOM.remoteVid.classList.toggle('speaking', avg > 35);
                requestAnimationFrame(tick);
            }
            tick();
        } catch (e) { console.warn('AudioAnalyser unavailable', e); }
    }

    // ==========================================
    // 9. CORE ENGINE & LIFECYCLE
    // ==========================================
    function startTimer() {
        callState.startTime = Date.now();
        DOM.timer.classList.remove('hidden');
        callState.timerInterval = setInterval(() => {
            const s = Math.floor((Date.now() - callState.startTime) / 1000);
            DOM.timer.innerText =
                `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`;
        }, 1000);
    }

    function resetUI() {
        clearInterval(callState.timerInterval);
        DOM.timer.classList.add('hidden');
        DOM.timer.innerText = '00:00';

        DOM.modal.classList.remove('active');
        DOM.container.classList.remove('audio-mode', 'camera-off');
        DOM.remoteVid.classList.remove('speaking');

        DOM.localVid.srcObject  = null;
        DOM.remoteVid.srcObject = null;

        callState.callStatus    = 'idle';
        callState.isReceiving   = false;
        callState.isMuted       = false;
        callState.isScreenSharing = false;

        DOM.btnMic.classList.remove('muted', 'disabled');
        DOM.btnCam.classList.remove('disabled');
        DOM.btnScreen.classList.remove('disabled');

        DOM.btnAccept.style.display = 'none';
        DOM.acceptLbl.style.display = 'none';
        DOM.incomingLbl.classList.remove('visible');

        DOM.localVid.style.transform = 'translate3d(0,0,0)';
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

    // ── setupMedia — untouched logic, zero changes ──
    async function setupMedia(videoEnabled) {
        try {
            callState.isVideoEnabled = videoEnabled;
            if (!videoEnabled) DOM.container.classList.add('audio-mode');
            else               DOM.container.classList.remove('audio-mode');

            callState.localStream = await navigator.mediaDevices.getUserMedia({
                video: videoEnabled,
                audio: true
            });

            if (videoEnabled) DOM.localVid.srcObject = callState.localStream;
            return true;
        } catch (err) {
            console.error('Media Error:', err);
            notify('Camera/Mic access denied. Please allow permissions in browser.', 'error');
            return false;
        }
    }

    // ── createPeerConnection — untouched logic ──
    function createPeerConnection(target) {
        callState.peerConnection = new RTCPeerConnection(servers);

        callState.localStream.getTracks().forEach(track => {
            callState.peerConnection.addTrack(track, callState.localStream);
        });

        callState.peerConnection.ontrack = (event) => {
            callState.remoteStream  = event.streams[0];
            DOM.remoteVid.srcObject = callState.remoteStream;
        };

        callState.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                safeSend({ type: 'video_ice_candidate', receiver: target, candidate: event.candidate });
            }
        };

        callState.peerConnection.onconnectionstatechange = () => {
            switch (callState.peerConnection.connectionState) {
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

    // ── initCall — untouched logic ──
    async function initCall(videoEnabled) {
        const target = getTargetUser();
        if (target === 'Public' || !target || target.toLowerCase() === 'public lobby') {
            notify('You cannot start a call in the Public Lobby.', 'error');
            return;
        }

        const mediaReady = await setupMedia(videoEnabled);
        if (!mediaReady) return;

        callState.callStatus = 'calling';
        DOM.peerName.innerText = `@${target}`;
        DOM.status.innerText   = 'Calling...';
        DOM.modal.classList.add('active');
        DOM.btnAccept.style.display = 'none';
        DOM.acceptLbl.style.display = 'none';
        DOM.incomingLbl.classList.remove('visible');

        createPeerConnection(target);

        const offer = await callState.peerConnection.createOffer();
        await callState.peerConnection.setLocalDescription(offer);

        safeSend({ type: 'video_offer', receiver: target, offer, isVideo: videoEnabled });
    }

    // ── hangUp — untouched logic ──
    function hangUp(sendSignal = true) {
        const target = getTargetUser();
        if (sendSignal && target !== 'Public' && target.toLowerCase() !== 'public lobby') {
            safeSend({ type: 'video_hangup', receiver: target });
        }
        cleanupCall();
    }

    // ==========================================
    // 10. BUTTON CONTROLS
    // ==========================================
    DOM.btnMic.onclick = () => {
        if (!callState.localStream) return;
        const track = callState.localStream.getAudioTracks()[0];
        if (track) {
            track.enabled    = !track.enabled;
            callState.isMuted = !track.enabled;
            DOM.btnMic.classList.toggle('muted', callState.isMuted);
        }
    };

    DOM.btnCam.onclick = () => {
        if (!callState.localStream) return;
        const track = callState.localStream.getVideoTracks()[0];
        if (track) {
            track.enabled          = !track.enabled;
            callState.isVideoEnabled = track.enabled;
            DOM.btnCam.classList.toggle('disabled', !callState.isVideoEnabled);
            DOM.container.classList.toggle('camera-off', !callState.isVideoEnabled);
        }
    };

    DOM.btnScreen.onclick = async () => {
        try {
            if (!callState.isScreenSharing) {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack  = screenStream.getVideoTracks()[0];
                const sender       = callState.peerConnection.getSenders()
                                        .find(s => s.track.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
                callState.isScreenSharing = true;
                DOM.btnScreen.classList.add('disabled');

                screenTrack.onended = () => {
                    const vTrack = callState.localStream.getVideoTracks()[0];
                    if (sender && vTrack) sender.replaceTrack(vTrack);
                    callState.isScreenSharing = false;
                    DOM.btnScreen.classList.remove('disabled');
                };
            } else {
                const vTrack = callState.localStream.getVideoTracks()[0];
                const sender = callState.peerConnection.getSenders()
                                    .find(s => s.track.kind === 'video');
                if (sender && vTrack) sender.replaceTrack(vTrack);
                callState.isScreenSharing = false;
                DOM.btnScreen.classList.remove('disabled');
            }
        } catch (e) { console.error('Screen Share Error:', e); }
    };

    DOM.btnPip.onclick = async () => {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (DOM.remoteVid.readyState === 4) {
                await DOM.remoteVid.requestPictureInPicture();
            }
        } catch (e) { console.error('PiP Error:', e); }
    };

    DOM.btnReject.onclick = () => hangUp(true);

    // ==========================================
    // 11. WEBSOCKET EVENT LISTENERS — untouched
    // ==========================================
    window.IdlyPlugins.messageHandlers['video_offer'] = async function(data) {
        if (callState.isReceiving || callState.callStatus !== 'idle') {
            safeSend({ type: 'video_hangup', receiver: data.sender });
            return;
        }

        callState.isReceiving = true;
        callState.callStatus  = 'ringing';

        if (getTargetUser() !== data.sender && typeof window.switchChat === 'function') {
            window.switchChat(data.sender);
        }

        DOM.peerName.innerText = `@${data.sender}`;
        DOM.status.innerText   = data.isVideo ? 'Incoming Video Call...' : 'Incoming Audio Call...';

        if (!data.isVideo) DOM.container.classList.add('audio-mode');
        else               DOM.container.classList.remove('audio-mode');

        DOM.modal.classList.add('active');

        // Show accept button + incoming UI
        DOM.btnAccept.style.display = 'flex';
        DOM.acceptLbl.style.display = 'block';
        DOM.incomingLbl.classList.add('visible');

        DOM.btnAccept.onclick = async () => {
            DOM.btnAccept.style.display = 'none';
            DOM.acceptLbl.style.display = 'none';
            DOM.incomingLbl.classList.remove('visible');
            DOM.status.innerText = 'Connecting secure channel...';

            const mediaReady = await setupMedia(data.isVideo !== false);
            if (!mediaReady) { hangUp(true); return; }

            createPeerConnection(data.sender);
            await callState.peerConnection.setRemoteDescription(
                new RTCSessionDescription(data.offer)
            );

            const answer = await callState.peerConnection.createAnswer();
            await callState.peerConnection.setLocalDescription(answer);

            safeSend({ type: 'video_answer', receiver: data.sender, answer });
        };
    };

    window.IdlyPlugins.messageHandlers['video_answer'] = async function(data) {
        if (!callState.peerConnection) return;
        await callState.peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.answer)
        );
    };

    window.IdlyPlugins.messageHandlers['video_ice_candidate'] = async function(data) {
        if (!callState.peerConnection) return;
        try {
            await callState.peerConnection.addIceCandidate(
                new RTCIceCandidate(data.candidate)
            );
        } catch (e) { console.error('ICE error', e); }
    };

    window.IdlyPlugins.messageHandlers['video_hangup'] = function(data) {
        notify(`Call ended by @${data.sender}.`, 'error');
        hangUp(false);
    };

    window.addEventListener('offline', () => {
        if (callState.callStatus === 'connected') DOM.status.innerText = 'Network Offline...';
    });
    window.addEventListener('online', () => {
        if (callState.callStatus === 'connected') DOM.status.innerText = '';
    });

    console.log("Mobile WebRTC UI Ready.");
})();