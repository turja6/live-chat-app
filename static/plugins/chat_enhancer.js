(function() {
    console.log("Chat Enhancer Plugin Loaded");

    // 1. The Parser: Converts text to links/HTML securely
    function formatMessage(text) {
        if (text.startsWith("http")) {
            return `<a href="${text}" target="_blank" style="color:#6366f1; text-decoration:underline;">${text}</a>`;
        }
        return text;
    }
    function drawMessage(msg, isNew = true) {
    const msgs = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message-group";
    
    // IMPORTANT: This creates the ID attribute that contextDelete looks for!
    const msgId = msg.id || 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    div.setAttribute("data-msg-id", msgId);
    }

    // 2. Patch the Draw Function
    const originalDrawMessage = window.drawMessage;
    window.drawMessage = function(msg, isNew) {
        originalDrawMessage(msg, isNew);
        
        // Find the last bubble created and update it
        const bubbles = document.querySelectorAll('.msg-bubble');
        const bubble = bubbles[bubbles.length - 1];
        if (bubble) {
            bubble.innerHTML = formatMessage(msg.content);
        }
    };

    // 3. Define Context Actions (Global Window Scope)
    window.contextReply = () => {
        if (contextMenuTarget) setReply(contextMenuTarget.sender, contextMenuTarget.content, contextMenuTarget.id);
        document.getElementById('context-menu').classList.remove('active');
    };

    window.contextForward = () => {
        if (contextMenuTarget) {
            document.getElementById('msgInput').value = `Forwarded: ${contextMenuTarget.content}`;
            document.getElementById('msgInput').focus();
        }
        document.getElementById('context-menu').classList.remove('active');
    };

    window.contextPin = () => {
        window.IdlyPlugins.sendToSocket({ type: 'pin', id: contextMenuTarget.id });
        showToast("Pinned", "success");
        document.getElementById('context-menu').classList.remove('active');
    };

    window.contextDelete = () => {
        if (contextMenuTarget && contextMenuTarget.sender === myUsername) {
            const msgEl = document.querySelector(`[data-msg-id="${contextMenuTarget.id}"]`);
            if (msgEl) {
                msgEl.closest('.message-group').remove();
                window.IdlyPlugins.sendToSocket({ type: 'delete_message', id: contextMenuTarget.id });
            }
        }
        document.getElementById('context-menu').classList.remove('active');
    };
})();