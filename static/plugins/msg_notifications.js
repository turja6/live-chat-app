// --- static/plugins/msg_notifications.js ---
(function InitMessageNotifications() {
    'use strict';

    // 1. CONFIGURATION: Audio Track Path
    const CUSTOM_SOUND_URL = '/static/media/notification.mp3'; 
    const notificationAudio = new Audio(CUSTOM_SOUND_URL);

    // 2. INITIALIZATION: Request Push Banner Permissions early
    function requestSystemPermissions() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', requestSystemPermissions);
    } else {
        requestSystemPermissions();
    }

    // 3. CORE ENGINE: Hook Setup & Precise Message Interception
    if (!window.ChatHooks) window.ChatHooks = { onUIReady: [], onMessageRender: [] };

    window.ChatHooks.onMessageRender.push(function(msg) {
        // Guard Clause A: If the message packet is null/empty, pass through
        if (!msg) return msg;

        // Ensure we handle both stringified and object formats safely
        if (typeof msg === 'string') {
            try { msg = JSON.parse(msg); } catch(e) { return msg; }
        }

        // CRITICAL FIX 1: FILTER OUT BACKGROUND SIGNALS & SYSTEM HOOKS
        // Skip playing sound if it's a call event, a typing status packet, or a system ping
        const ignoredTypes = ['call_offer', 'call_answer', 'ice_candidate', 'call_end', 'typing', 'ping', 'status_update'];
        if (msg.type && ignoredTypes.includes(msg.type)) {
            return msg; 
        }

        // CRITICAL FIX 2: ENSURE IT IS AN INCOMING REAL CHAT MESSAGE
        // We only want alerts for standard text types. If the message has no actual text content, ignore it.
        if (!msg.message && !msg.content) {
            return msg;
        }

        // Guard Clause C: Prevent loopback chimes (Don't ring for messages you typed yourself)
        const currentLobbyUser = document.getElementById('username-display')?.innerText || ''; 
        if (msg.sender === currentLobbyUser) {
            return msg;
        }

        // --- ACTION A: PLAY CUSTOM CHIME (Only for true incoming texts now) ---
        try {
            notificationAudio.currentTime = 0; 
            notificationAudio.play();
        } catch (err) {
            console.log("🔊 Audio chime play deferred: Awaiting initial user page click.");
        }

        // --- ACTION B: FIRE PUSH NOTIFICATION ---
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            const displayText = msg.message || msg.content || 'Sent an attachment';
            const systemNotification = new Notification(`Message from ${msg.sender || 'User'}`, {
                body: displayText,
                icon: '/static/favicon.ico',
                tag: 'chat-message-sync' // Groups banners to prevent screen crowding
            });

            systemNotification.onclick = function() {
                window.focus();
                this.close();
            };
        }

        return msg;
    });

    console.log("🔔 Message Notification Engine Cleaned & Configured!");
})();