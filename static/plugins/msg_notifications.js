// --- static/plugins/msg_notifications.js ---
(function InitMessageNotifications() {
    'use strict';

    // 1. CONFIGURATION: Audio Track Path
    // This points directly to the local file asset uploaded to your project static tree
    const CUSTOM_SOUND_URL = '/static/media/message_pop.mp3'; 
    const notificationAudio = new Audio(CUSTOM_SOUND_URL);

    // 2. INITIALIZATION: Request Push Banner Permissions
    // Executes automatically on login screen render to secure permissions early
    function requestSystemPermissions() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log(`📡 System Notification Permission Status: ${permission}`);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', requestSystemPermissions);
    } else {
        requestSystemPermissions();
    }

    // 3. CORE ENGINE: Hook Setup & Message Interception
    if (!window.ChatHooks) window.ChatHooks = { onUIReady: [], onMessageRender: [] };

    window.ChatHooks.onMessageRender.push(function(msg) {
        // Guard Clause A: If the message packet is invalid, bypass processing
        if (!msg) return msg;

        // Guard Clause B: Strict separation from the WebRTC calling engine signals
        // We do not want text chimes triggering when background coordination data passes through
        const signalingTypes = ['call_offer', 'call_answer', 'ice_candidate', 'call_end'];
        if (signalingTypes.includes(msg.type)) {
            return msg; 
        }

        // Guard Clause C: Prevent loopback chimes
        // Do not play an alert chime or fire notifications for messages sent by yourself
        const currentLobbyUser = document.getElementById('username-display')?.innerText || ''; 
        if (msg.sender === currentLobbyUser) {
            return msg;
        }

        // --- ACTION A: PLAY CUSTOM CHIME ---
        try {
            // Rewind track instantly to allow overlapping audio if messages arrive in rapid succession
            notificationAudio.currentTime = 0; 
            notificationAudio.play();
        } catch (err) {
            // Modern browsers block autoplay audio streams until the user performs at least one interaction click
            console.log("🔊 Audio chime play deferred: Awaiting initial user page interaction gesture.");
        }

        // --- ACTION B: FIRE PUSH NOTIFICATION ---
        // Only trigger a push banner if the application tab is minimized or hidden in the background
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            const systemNotification = new Notification(`Message from ${msg.sender || 'User'}`, {
                body: msg.content || 'Sent a message attachment',
                icon: '/static/favicon.ico', // Fallback path configuration to your app icon
                tag: 'chat-message-sync'     // Collapses notification history stacking to prevent user screen spam
            });

            // Clicking the push banner refocuses the chat interface immediately
            systemNotification.onclick = function() {
                window.focus();
                this.close();
            };
        }

        // Return the message object unmodified so the layout engine draws it inside your message bubble viewport
        return msg;
    });

    console.log("✅ Successfully Loaded Frontend Plugin: msg_notifications.js");
})();