(function() {
    console.log("Loading WebRTC A/V Call Engine (UI Overhaul)...");

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
            if (typeof ws !== "undefined" && ws.readyState === 1) ws.send(JSON.stringify(payload));
            else if (window.ws && window.ws.readyState === 1) window.ws.send(JSON.stringify(payload));
            else notify("WebSocket connection lost.", "error");
        } catch (e) { console.error("Socket error", e); }
    }

    // ==========================================
    // 2. STATE MANAGEMENT
    // ==========================================
    const callState = {
        peerConnection: null, localStream: null, remoteStream: null,
        callStatus: 'idle', isReceiving: false, isMuted: false,
        isVideoEnabled: true, isScreenSharing: false,
        timerInterval: null, startTime: null, audioContext: null, analyser: null
    };

    const servers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    // ==========================================
    // 3. OVERHAULED CSS
    // ==========================================
    const styles = `
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        #phone-modal {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100dvh;
            background: #08090c; z-index: 10000; display: none; flex-direction: column;
            opacity: 0; transition: opacity 0.4s cubic-bezier(0.16,1,0.3,1); overflow: hidden;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        #phone-modal.active { display: flex; opacity: 1; }

        /* ── Remote Video ── */
        .phone-remote-vid {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            object-fit: cover; z-index: 1; background: #08090c;
            transition: filter 0.3s, box-shadow 0.4s;
        }
        .phone-remote-vid.speaking {
            box-shadow: inset 0 0 0 4px rgba(52,211,153,0.7), inset 0 0 60px rgba(52,211,153,0.08);
        }

        /* ── Local Video (PiP) ── */
        .phone-local-vid {
            position: absolute; top: 90px; right: 20px;
            width: 120px; height: 170px; object-fit: cover;
            border-radius: 16px; border: 2px solid rgba(255,255,255,0.12);
            background: #15161a; z-index: 50;
            box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06);
            transition: opacity 0.35s, transform 0.15s ease, box-shadow 0.3s;
            cursor: grab; touch-action: none;
        }
        .phone-local-vid:hover {
            box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.15);
        }
        .phone-local-vid:active { cursor: grabbing; transform: scale(1.04); }

        .audio-mode .phone-remote-vid, .audio-mode .phone-local-vid { opacity: 0; pointer-events: none; }
        .camera-off .phone-remote-vid, .camera-off .phone-local-vid {
            backdrop-filter: blur(30px); opacity: 0; pointer-events: none;
        }

        /* ── Animated Background for Audio Calls ── */
        .phone-bg-gradient {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;
            background: radial-gradient(ellipse at 30% 20%, rgba(79,70,229,0.18) 0%, transparent 50%),
                        radial-gradient(ellipse at 70% 80%, rgba(139,92,246,0.14) 0%, transparent 50%),
                        radial-gradient(ellipse at 50% 50%, rgba(16,185,129,0.08) 0%, transparent 60%),
                        #08090c;
            opacity: 0; transition: opacity 0.6s;
        }
        .audio-mode .phone-bg-gradient, .camera-off .phone-bg-gradient { opacity: 1; }

        .phone-bg-orb {
            position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0;
            transition: opacity 0.8s; z-index: 0;
        }
        .phone-bg-orb.orb1 {
            width: 300px; height: 300px; top: 10%; left: 15%;
            background: rgba(79,70,229,0.25); animation: orbFloat1 8s ease-in-out infinite;
        }
        .phone-bg-orb.orb2 {
            width: 250px; height: 250px; bottom: 25%; right: 10%;
            background: rgba(16,185,129,0.2); animation: orbFloat2 10s ease-in-out infinite;
        }
        .phone-bg-orb.orb3 {
            width: 200px; height: 200px; top: 50%; left: 50%;
            background: rgba(139,92,246,0.18); animation: orbFloat3 12s ease-in-out infinite;
        }
        .audio-mode .phone-bg-orb, .camera-off .phone-bg-orb { opacity: 1; }

        @keyframes orbFloat1 {
            0%, 100% { transform: translate(0,0) scale(1); }
            33% { transform: translate(30px,-20px) scale(1.1); }
            66% { transform: translate(-20px,30px) scale(0.95); }
        }
        @keyframes orbFloat2 {
            0%, 100% { transform: translate(0,0) scale(1); }
            50% { transform: translate(-40px,-30px) scale(1.15); }
        }
        @keyframes orbFloat3 {
            0%, 100% { transform: translate(-50%,-50%) scale(1); }
            50% { transform: translate(calc(-50% + 30px), calc(-50% - 25px)) scale(1.08); }
        }

        /* ── Avatar Container ── */
        .phone-avatar-container {
            position: absolute; top: 36%; left: 50%; transform: translate(-50%, -50%);
            z-index: 10; display: none; flex-direction: column; align-items: center; gap: 24px;
        }
        .audio-mode .phone-avatar-container, .camera-off .phone-avatar-container { display: flex; }

        .phone-avatar-ring {
            position: relative; width: 180px; height: 180px;
            display: flex; align-items: center; justify-content: center;
        }
        .phone-avatar-ring::before {
            content: ''; position: absolute; inset: -8px; border-radius: 50%;
            border: 2px solid rgba(79,70,229,0.3);
            animation: avatarPulseOuter 3s ease-in-out infinite;
        }
        .phone-avatar-ring::after {
            content: ''; position: absolute; inset: -18px; border-radius: 50%;
            border: 1px solid rgba(139,92,246,0.15);
            animation: avatarPulseOuter 3s ease-in-out 0.5s infinite;
        }

        .phone-avatar {
            width: 140px; height: 140px; border-radius: 50%;
            background: linear-gradient(145deg, #4f46e5 0%, #7c3aed 50%, #a78bfa 100%);
            display: flex; align-items: center; justify-content: center; color: white;
            box-shadow: 0 0 40px rgba(79,70,229,0.35), 0 0 80px rgba(79,70,229,0.15),
                        inset 0 -4px 12px rgba(0,0,0,0.2), inset 0 4px 12px rgba(255,255,255,0.1);
            position: relative;
        }
        .phone-avatar svg { width: 64px; height: 64px; fill: currentColor; opacity: 0.9; }

        @keyframes avatarPulseOuter {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.08); opacity: 0.5; }
        }

        /* ── Sound Wave Bars (Audio Mode) ── */
        .phone-wave-bars {
            display: flex; align-items: center; gap: 5px; height: 40px;
        }
        .phone-wave-bar {
            width: 4px; border-radius: 4px;
            background: linear-gradient(to top, #6366f1, #a78bfa);
            animation: waveBar 1.2s ease-in-out infinite;
        }
        .phone-wave-bar:nth-child(1) { height: 12px; animation-delay: 0s; }
        .phone-wave-bar:nth-child(2) { height: 20px; animation-delay: 0.1s; }
        .phone-wave-bar:nth-child(3) { height: 32px; animation-delay: 0.2s; }
        .phone-wave-bar:nth-child(4) { height: 24px; animation-delay: 0.3s; }
        .phone-wave-bar:nth-child(5) { height: 36px; animation-delay: 0.15s; }
        .phone-wave-bar:nth-child(6) { height: 18px; animation-delay: 0.25s; }
        .phone-wave-bar:nth-child(7) { height: 28px; animation-delay: 0.05s; }

        .phone-wave-bars.ringing .phone-wave-bar { animation-duration: 0.6s; }

        @keyframes waveBar {
            0%, 100% { transform: scaleY(0.4); opacity: 0.5; }
            50% { transform: scaleY(1); opacity: 1; }
        }

        /* ── Header ── */
        .phone-header {
            position: absolute; top: 0; left: 0; width: 100%;
            padding: 44px 24px 24px; text-align: center; color: white; z-index: 20;
            background: linear-gradient(180deg, rgba(8,9,12,0.85) 0%, rgba(8,9,12,0.4) 70%, transparent 100%);
        }
        .phone-header h2 {
            margin: 0; font-size: 26px; font-weight: 600; letter-spacing: 0.3px;
            text-shadow: 0 2px 8px rgba(0,0,0,0.5);
        }
        .phone-status-line {
            display: flex; align-items: center; justify-content: center; gap: 8px;
            margin-top: 8px;
        }
        .phone-status-dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: #f59e0b; transition: background 0.3s;
        }
        .phone-status-dot.connecting { background: #f59e0b; animation: statusBlink 1.2s infinite; }
        .phone-status-dot.connected { background: #34d399; animation: none; }
        .phone-status-dot.ringing { background: #818cf8; animation: statusBlink 0.8s infinite; }
        .phone-status-dot.failed { background: #f87171; animation: none; }

        @keyframes statusBlink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }

        .phone-status-text {
            font-size: 15px; font-weight: 400; opacity: 0.75;
            text-shadow: 0 1px 4px rgba(0,0,0,0.5);
        }
        .phone-timer {
            font-size: 15px; font-weight: 500; opacity: 0.9;
            font-variant-numeric: tabular-nums; display: none;
            background: rgba(255,255,255,0.08); padding: 4px 16px;
            border-radius: 20px; backdrop-filter: blur(8px);
            border: 1px solid rgba(255,255,255,0.06);
            margin-top: 10px;
        }
        .phone-timer.visible { display: inline-block; }

        /* ── Incoming Ring Animation ── */
        .phone-ring-container {
            position: absolute; top: 36%; left: 50%; transform: translate(-50%, -50%);
            z-index: 15; display: none;
        }
        .phone-ring-container.active { display: block; }
        .ring-circle {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
            border-radius: 50%; border: 2px solid rgba(79,70,229,0.4);
            animation: ringExpand 2.5s ease-out infinite;
        }
        .ring-circle:nth-child(2) { animation-delay: 0.8s; }
        .ring-circle:nth-child(3) { animation-delay: 1.6s; }

        @keyframes ringExpand {
            0% { width: 80px; height: 80px; opacity: 0.8; }
            100% { width: 320px; height: 320px; opacity: 0; }
        }

        /* ── Controls ── */
        .phone-controls {
            position: absolute; bottom: 0; left: 0; width: 100%;
            padding: 24px 20px; z-index: 100;
            background: linear-gradient(0deg, rgba(8,9,12,0.92) 0%, rgba(8,9,12,0.6) 60%, transparent 100%);
            display: flex; flex-direction: column; align-items: center; gap: 20px;
            padding-bottom: max(env(safe-area-inset-bottom, 20px), 20px);
        }

        .phone-tools {
            display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;
            background: rgba(255,255,255,0.04); padding: 10px 16px;
            border-radius: 24px; backdrop-filter: blur(16px);
            border: 1px solid rgba(255,255,255,0.06);
        }

        .phone-actions {
            display: flex; gap: 48px; justify-content: center; width: 100%;
            padding-top: 4px;
        }

        .p-btn {
            width: 56px; height: 56px; border-radius: 50%; border: none;
            display: flex; align-items: center; justify-content: center;
            background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.85);
            backdrop-filter: blur(12px); cursor: pointer;
            transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
            box-shadow: 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06);
            position: relative; outline: none;
        }
        .p-btn:hover {
            background: rgba(255,255,255,0.14);
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .p-btn:active { transform: scale(0.92) translateY(0); }
        .p-btn:focus-visible {
            box-shadow: 0 0 0 3px rgba(99,102,241,0.5);
        }
        .p-btn svg { width: 22px; height: 22px; fill: currentColor; }

        .p-btn.disabled {
            background: rgba(239,68,68,0.12); color: #f87171;
            box-shadow: 0 2px 8px rgba(239,68,68,0.1), inset 0 1px 0 rgba(239,68,68,0.1);
        }
        .p-btn.disabled:hover {
            background: rgba(239,68,68,0.18);
        }

        .p-btn-label {
            position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%);
            font-size: 10px; font-weight: 500; white-space: nowrap;
            color: rgba(255,255,255,0.45); opacity: 0;
            transition: opacity 0.2s; pointer-events: none;
        }
        .p-btn:hover .p-btn-label { opacity: 1; }

        .btn-accept {
            background: linear-gradient(145deg, #22c55e, #16a34a); color: white;
            width: 72px; height: 72px;
            box-shadow: 0 4px 20px rgba(34,197,94,0.35), inset 0 1px 0 rgba(255,255,255,0.15);
            display: none; animation: acceptBounce 2s ease-in-out infinite;
        }
        .btn-accept:hover {
            background: linear-gradient(145deg, #16a34a, #15803d);
            box-shadow: 0 8px 30px rgba(34,197,94,0.45);
        }
        .btn-accept svg { width: 32px; height: 32px; }

        .btn-reject {
            background: linear-gradient(145deg, #ef4444, #dc2626); color: white;
            width: 72px; height: 72px;
            box-shadow: 0 4px 20px rgba(239,68,68,0.35), inset 0 1px 0 rgba(255,255,255,0.15);
        }
        .btn-reject:hover {
            background: linear-gradient(145deg, #dc2626, #b91c1c);
            box-shadow: 0 8px 30px rgba(239,68,68,0.45);
        }
        .btn-reject svg { width: 32px; height: 32px; }

        @keyframes acceptBounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
        }

        /* ── Toast ── */
        .phone-toast {
            position: fixed; top: 24px; left: 50%; transform: translateX(-50%) translateY(-100px);
            z-index: 10001; background: rgba(30,31,36,0.95); color: white;
            padding: 12px 24px; border-radius: 14px; font-size: 14px; font-weight: 500;
            backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.08);
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            transition: transform 0.4s cubic-bezier(0.16,1,0.3,1);
            font-family: 'Inter', system-ui, sans-serif;
        }
        .phone-toast.show { transform: translateX(-50%) translateY(0); }

        /* ── Desktop ── */
        @media (min-width: 768px) {
            #phone-modal {
                align-items: center; justify-content: center;
                background: rgba(4,5,7,0.88); backdrop-filter: blur(16px);
            }
            .phone-remote-vid {
                position: relative; width: 960px; max-width: 88vw; height: 72vh;
                border-radius: 24px; overflow: hidden;
                box-shadow: 0 25px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
            }
            .phone-controls {
                position: absolute; width: 960px; max-width: 88vw;
                border-radius: 0 0 24px 24px; bottom: 14vh;
            }
            .phone-header {
                position: absolute; width: 960px; max-width: 88vw;
                border-radius: 24px 24px 0 0; top: 14vh;
            }
            .phone-local-vid {
                top: calc(14vh + 28px); right: calc(6vw + 28px);
                width: 160px; height: 220px; border-radius: 20px;
            }
            .phone-avatar { width: 160px; height: 160px; }
            .phone-avatar svg { width: 72px; height: 72px; }
            .phone-avatar-ring { width: 200px; height: 200px; }
            .p-btn { width: 60px; height: 60px; }
            .p-btn svg { width: 24px; height: 24px; }
            .btn-accept, .btn-reject { width: 76px; height: 76px; }
        }

        @media (min-width: 1200px) {
            .phone-remote-vid { width: 1100px; height: 78vh; }
            .phone-controls, .phone-header { width: 1100px; max-width: 90vw; }
        }

        /* ── Reduced Motion ── */
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
        }

        /* ── Header Buttons ── */
        .av-call-btn {
            background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
            color: rgba(255,255,255,0.7); border-radius: 10px; padding: 8px;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s; outline: none;
        }
        .av-call-btn:hover {
            background: rgba(79,70,229,0.15); border-color: rgba(79,70,229,0.3);
            color: rgba(255,255,255,0.95);
        }
        .av-call-btn:focus-visible {
            box-shadow: 0 0 0 2px rgba(99,102,241,0.5);
        }
        .av-call-btn svg { width: 18px; height: 18px; fill: currentColor; }
    </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styles);

    // ==========================================
    // 4. INJECT HTML UI
    // ==========================================
    const modalHtml = `
        <div id="phone-modal">
            <!-- Animated Background Orbs -->
            <div class="phone-bg-gradient"></div>
            <div class="phone-bg-orb orb1"></div>
            <div class="phone-bg-orb orb2"></div>
            <div class="phone-bg-orb orb3"></div>

            <!-- Header -->
            <div class="phone-header">
                <h2 id="phone-name">@User</h2>
                <div class="phone-status-line">
                    <div class="phone-status-dot" id="phone-status-dot"></div>
                    <span class="phone-status-text" id="phone-status">Calling...</span>
                </div>
                <div class="phone-timer" id="phone-timer">00:00</div>
            </div>

            <!-- Videos -->
            <video id="phone-remote-vid" class="phone-remote-vid" autoplay playsinline></video>
            <video id="phone-local-vid" class="phone-local-vid" autoplay playsinline muted></video>

            <!-- Ring Animation (Incoming) -->
            <div class="phone-ring-container" id="phone-ring-container">
                <div class="ring-circle"></div>
                <div class="ring-circle"></div>
                <div class="ring-circle"></div>
            </div>

            <!-- Avatar + Wave (Audio Mode) -->
            <div class="phone-avatar-container">
                <div class="phone-avatar-ring">
                    <div class="phone-avatar">
                        <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    </div>
                </div>
                <div class="phone-wave-bars" id="phone-wave-bars">
                    <div class="phone-wave-bar"></div>
                    <div class="phone-wave-bar"></div>
                    <div class="phone-wave-bar"></div>
                    <div class="phone-wave-bar"></div>
                    <div class="phone-wave-bar"></div>
                    <div class="phone-wave-bar"></div>
                    <div class="phone-wave-bar"></div>
                </div>
            </div>

            <!-- Controls -->
            <div class="phone-controls">
                <div class="phone-tools">
                    <button id="phone-btn-mic" class="p-btn" aria-label="Toggle Microphone">
                        <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                        <span class="p-btn-label">Mute</span>
                    </button>
                    <button id="phone-btn-cam" class="p-btn" aria-label="Toggle Camera">
                        <svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                        <span class="p-btn-label">Camera</span>
                    </button>
                    <button id="phone-btn-screen" class="p-btn" aria-label="Share Screen">
                        <svg viewBox="0 0 24 24"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>
                        <span class="p-btn-label">Share</span>
                    </button>
                    <button id="phone-btn-pip" class="p-btn" aria-label="Picture in Picture">
                        <svg viewBox="0 0 24 24"><path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/></svg>
                        <span class="p-btn-label">PiP</span>
                    </button>
                </div>
                <div class="phone-actions">
                    <button id="phone-btn-accept" class="p-btn btn-accept" aria-label="Accept Call">
                        <svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
                    </button>
                    <button id="phone-btn-reject" class="p-btn btn-reject" aria-label="End Call">
                        <svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
                    </button>
                </div>
            </div>

            <!-- Toast -->
            <div class="phone-toast" id="phone-toast"></div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // ==========================================
    // 5. INJECT HEADER START BUTTONS
    // ==========================================
    const headerActions = document.querySelector('.chat-header-actions');
    if (headerActions) {
        const videoBtn = document.createElement('button');
        videoBtn.className = 'av-call-btn';
        videoBtn.title = 'Video Call';
        videoBtn.setAttribute('aria-label', 'Start Video Call');
        videoBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
        videoBtn.onclick = () => initCall(true);

        const audioBtn = document.createElement('button');
        audioBtn.className = 'av-call-btn';
        audioBtn.title = 'Audio Call';
        audioBtn.setAttribute('aria-label', 'Start Audio Call');
        audioBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>`;
        audioBtn.onclick = () => initCall(false);

        headerActions.insertBefore(videoBtn, headerActions.firstChild);
        headerActions.insertBefore(audioBtn, headerActions.firstChild);
    }

    // ==========================================
    // 6. DOM ELEMENTS MAP
    // ==========================================
    const DOM = {
        modal: document.getElementById('phone-modal'),
        localVid: document.getElementById('phone-local-vid'),
        remoteVid: document.getElementById('phone-remote-vid'),
        btnAccept: document.getElementById('phone-btn-accept'),
        btnReject: document.getElementById('phone-btn-reject'),
        status: document.getElementById('phone-status'),
        statusDot: document.getElementById('phone-status-dot'),
        peerName: document.getElementById('phone-name'),
        timer: document.getElementById('phone-timer'),
        btnMic: document.getElementById('phone-btn-mic'),
        btnCam: document.getElementById('phone-btn-cam'),
        btnScreen: document.getElementById('phone-btn-screen'),
        btnPip: document.getElementById('phone-btn-pip'),
        ringContainer: document.getElementById('phone-ring-container'),
        waveBars: document.getElementById('phone-wave-bars'),
        toast: document.getElementById('phone-toast')
    };

    // ==========================================
    // 7. TOAST SYSTEM
    // ==========================================
    let toastTimeout;
    function showToast(msg) {
        clearTimeout(toastTimeout);
        DOM.toast.innerText = msg;
        DOM.toast.classList.add('show');
        toastTimeout = setTimeout(() => DOM.toast.classList.remove('show'), 3500);
    }

    // ==========================================
    // 8. DRAG-AND-DROP ENGINE
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
    function dragEnd() { initialX = currentX; initialY = currentY; isDragging = false; }
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

    DOM.modal.addEventListener("mousedown", dragStart, false);
    DOM.modal.addEventListener("mouseup", dragEnd, false);
    DOM.modal.addEventListener("mousemove", drag, false);
    DOM.modal.addEventListener("touchstart", dragStart, { passive: false });
    DOM.modal.addEventListener("touchend", dragEnd, false);
    DOM.modal.addEventListener("touchmove", drag, { passive: false });

    // ==========================================
    // 9. AUDIO ANALYSER (GLOW EFFECT)
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
                for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                let average = sum / bufferLength;
                if (average > 30) DOM.remoteVid.classList.add('speaking');
                else DOM.remoteVid.classList.remove('speaking');
                requestAnimationFrame(checkLevel);
            }
            checkLevel();
        } catch (e) {}
    }

    // ==========================================
    // 10. STATUS DOT HELPER
    // ==========================================
    function setStatus(text, state) {
        DOM.status.innerText = text;
        DOM.statusDot.className = 'phone-status-dot';
        if (state) DOM.statusDot.classList.add(state);
    }

    // ==========================================
    // 11. CORE ENGINE & LIFECYCLE
    // ==========================================
    function startTimer() {
        callState.startTime = Date.now();
        DOM.timer.classList.add('visible');
        callState.timerInterval = setInterval(() => {
            const secs = Math.floor((Date.now() - callState.startTime) / 1000);
            const m = Math.floor(secs / 60).toString().padStart(2, '0');
            const s = (secs % 60).toString().padStart(2, '0');
            DOM.timer.innerText = `${m}:${s}`;
        }, 1000);
    }

    function resetUI() {
        clearInterval(callState.timerInterval);
        DOM.timer.classList.remove('visible');
        DOM.timer.innerText = "00:00";
        DOM.modal.classList.remove('active', 'audio-mode', 'camera-off');
        DOM.remoteVid.classList.remove('speaking');
        DOM.localVid.srcObject = null;
        DOM.remoteVid.srcObject = null;
        DOM.ringContainer.classList.remove('active');
        DOM.waveBars.classList.remove('ringing');
        callState.callStatus = 'idle';
        callState.isReceiving = false;
        callState.isMuted = false;
        callState.isScreenSharing = false;

        DOM.btnMic.classList.remove('disabled');
        DOM.btnCam.classList.remove('disabled');
        DOM.btnScreen.classList.remove('disabled');
        DOM.btnAccept.style.display = 'none';
        setStatus('', '');

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
                video: videoEnabled, audio: true
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
            switch (callState.peerConnection.connectionState) {
                case 'connected':
                    callState.callStatus = 'connected';
                    setStatus('Connected', 'connected');
                    DOM.waveBars.classList.remove('ringing');
                    startTimer();
                    setupActiveSpeaker();
                    break;
                case 'connecting':
                    setStatus('Connecting...', 'connecting');
                    break;
                case 'disconnected':
                    setStatus('Connection Lost', 'failed');
                    setTimeout(() => hangUp(true), 2000);
                    break;
                case 'failed':
                    setStatus('Call Failed', 'failed');
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
        setStatus('Calling...', 'connecting');
        DOM.modal.classList.add('active');
        DOM.btnAccept.style.display = 'none';
        DOM.waveBars.classList.add('ringing');

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
    // 12. BUTTON CONTROLS
    // ==========================================
    DOM.btnMic.onclick = () => {
        if (!callState.localStream) return;
        const track = callState.localStream.getAudioTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            callState.isMuted = !track.enabled;
            DOM.btnMic.classList.toggle('disabled', callState.isMuted);
            showToast(callState.isMuted ? 'Microphone muted' : 'Microphone unmuted');
        }
    };

    DOM.btnCam.onclick = () => {
        if (!callState.localStream) return;
        const track = callState.localStream.getVideoTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            callState.isVideoEnabled = track.enabled;
            DOM.btnCam.classList.toggle('disabled', !callState.isVideoEnabled);
            DOM.modal.classList.toggle('camera-off', !callState.isVideoEnabled);
            showToast(callState.isVideoEnabled ? 'Camera on' : 'Camera off');
        }
    };

    DOM.btnScreen.onclick = async () => {
        try {
            if (!callState.isScreenSharing) {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.getVideoTracks()[0];
                const sender = callState.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
                callState.isScreenSharing = true;
                DOM.btnScreen.classList.add('disabled');
                showToast('Screen sharing started');

                screenTrack.onended = () => {
                    const videoTrack = callState.localStream.getVideoTracks()[0];
                    if (sender && videoTrack) sender.replaceTrack(videoTrack);
                    callState.isScreenSharing = false;
                    DOM.btnScreen.classList.remove('disabled');
                    showToast('Screen sharing stopped');
                };
            } else {
                const videoTrack = callState.localStream.getVideoTracks()[0];
                const sender = callState.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender && videoTrack) sender.replaceTrack(videoTrack);
                callState.isScreenSharing = false;
                DOM.btnScreen.classList.remove('disabled');
                showToast('Screen sharing stopped');
            }
        } catch (e) {
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
    // 13. WEBSOCKET EVENT LISTENERS
    // ==========================================
    window.IdlyPlugins.messageHandlers['video_offer'] = async function (data) {
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
        const isVideo = data.isVideo !== false;
        setStatus(isVideo ? 'Incoming Video Call...' : 'Incoming Audio Call...', 'ringing');

        if (!isVideo) DOM.modal.classList.add('audio-mode');
        else DOM.modal.classList.remove('audio-mode');

        DOM.modal.classList.add('active');
        DOM.btnAccept.style.display = 'flex';
        DOM.ringContainer.classList.add('active');
        DOM.waveBars.classList.add('ringing');

        DOM.btnAccept.onclick = async () => {
            DOM.btnAccept.style.display = 'none';
            DOM.ringContainer.classList.remove('active');
            setStatus('Connecting...', 'connecting');

            const mediaReady = await setupMedia(isVideo);
            if (!mediaReady) { hangUp(true); return; }

            createPeerConnection(data.sender);
            await callState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

            const answer = await callState.peerConnection.createAnswer();
            await callState.peerConnection.setLocalDescription(answer);

            safeSend({ type: "video_answer", receiver: data.sender, answer: answer });
        };
    };

    window.IdlyPlugins.messageHandlers['video_answer'] = async function (data) {
        if (!callState.peerConnection) return;
        await callState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    };

    window.IdlyPlugins.messageHandlers['video_ice_candidate'] = async function (data) {
        if (!callState.peerConnection) return;
        try {
            await callState.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) { console.error("ICE error", e); }
    };

    window.IdlyPlugins.messageHandlers['video_hangup'] = function (data) {
        showToast(`Call ended by @${data.sender}`);
        hangUp(false);
    };

    window.addEventListener('offline', () => {
        if (callState.callStatus === 'connected') setStatus('Network Offline...', 'failed');
    });
    window.addEventListener('online', () => {
        if (callState.callStatus === 'connected') setStatus('Connected', 'connected');
    });

    console.log("WebRTC A/V Call Engine Ready (UI Overhaul).");
})();