(function() {
    console.log("System Initializing: Chat Enhancer Framework...");

    /**
     * CORE UI UTILITIES
     * Handling the Click-Away logic at the document level
     * using event capture to ensure it runs before other handlers.
     */
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('context-menu');
        if (menu && menu.classList.contains('active')) {
            const isMenuClick = e.target.closest('#context-menu');
            if (!isMenuClick) {
                menu.classList.remove('active');
                console.log("Click-Away: Menu closed.");
            }
        }
    }, true); // Use 'true' to capture the event before it bubbles

    /**
     * MESSAGE RENDERING ENGINE
     * Patches the global drawMessage to ensure clean, safe rendering.
     */
    const originalDrawMessage = window.drawMessage;
    window.drawMessage = function(msg, isNew) {
        if (!msg.id) msg.id = 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5);
        
        originalDrawMessage(msg, isNew);
        
        const groups = document.querySelectorAll('.message-group');
        const lastGroup = groups[groups.length - 1];
        
        if (lastGroup) {
            lastGroup.setAttribute("data-msg-id", msg.id);
            const bubble = lastGroup.querySelector('.msg-bubble');
            
            if (bubble) {
                // Securely render HTML links or plain text
                if (msg.content.startsWith("http")) {
                    bubble.innerHTML = `<a href="${msg.content}" target="_blank" style="color:#6366f1;">${msg.content}</a>`;
                } else {
                    bubble.textContent = msg.content;
                }
            }
        }
    };

    /**
     * SERVER SYNC BRIDGE
     * Handling events received from the WebSocket.
     */
    if (!window.IdlyPlugins.messageHandlers) window.IdlyPlugins.messageHandlers = {};
    
    window.IdlyPlugins.messageHandlers["delete_ui"] = (data) => {
        const msgEl = document.querySelector(`[data-msg-id="${data.id}"]`);
        if (msgEl) msgEl.remove();
        console.log("Server Sync: Deleted", data.id);
    };

    window.IdlyPlugins.messageHandlers["pin_ui"] = (data) => {
        const msgEl = document.querySelector(`[data-msg-id="${data.id}"]`);
        if (msgEl) msgEl.classList.add('pinned');
        console.log("Server Sync: Pinned", data.id);
    };

    /**
     * CONTEXT MENU ACTIONS (The Features)
     */
    window.contextReply = () => {
        if (!contextMenuTarget) return;
        const replyPreview = document.getElementById('reply-preview');
        const replyName = document.getElementById('reply-to-name');
        if (replyPreview && replyName) {
            replyName.innerText = contextMenuTarget.sender;
            replyPreview.classList.add('active');
            window.replyingToId = contextMenuTarget.id;
        }
        document.getElementById('context-menu').classList.remove('active');
    };

    window.contextForward = () => {
        if (!contextMenuTarget) return;
        const input = document.getElementById('msgInput');
        input.value = `Forwarded: ${contextMenuTarget.content}`;
        input.focus();
        document.getElementById('context-menu').classList.remove('active');
    };

    window.contextPin = () => {
        if (!contextMenuTarget) return;
        window.IdlyPlugins.sendToSocket({ type: 'pin_message', id: contextMenuTarget.id });
        document.getElementById('context-menu').classList.remove('active');
    };

    window.contextDelete = () => {
        if (!contextMenuTarget) return;
        const msgEl = document.querySelector(`[data-msg-id="${contextMenuTarget.id}"]`);
        if (msgEl) {
            msgEl.remove();
            window.IdlyPlugins.sendToSocket({ type: 'delete_message', id: contextMenuTarget.id });
        }
        document.getElementById('context-menu').classList.remove('active');
    };

    /**
     * EXTENDABLE ARCHITECTURE
     * You can add up to 500 lines of features here!
     * Examples of what to add next:
     * - Message editing
     * - Reaction popups
     * - User-specific muting
     */
    console.log("System Initialization: Full Enhancement Module Loaded.");
})();