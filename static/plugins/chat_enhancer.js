(function() {
    console.log("Chat Enhancer Plugin Loaded");

    // 1. Hook into your existing message system
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
                if (msg.content.startsWith("http")) {
                    bubble.innerHTML = `<a href="${msg.content}" target="_blank" style="color:#6366f1;">${msg.content}</a>`;
                } else {
                    bubble.textContent = msg.content;
                }
            }
        }
    };

    // 2. Real-time Server Sync (For Delete/Pin/etc)
    if (!window.IdlyPlugins.messageHandlers) window.IdlyPlugins.messageHandlers = {};
    
    // Server says delete this message
    window.IdlyPlugins.messageHandlers["delete_ui"] = (data) => {
        const msgEl = document.querySelector(`[data-msg-id="${data.id}"]`);
        if (msgEl) msgEl.remove();
    };

    // 3. Context Menu Actions
    window.contextReply = () => {
        if (contextMenuTarget) {
            // Assumes setReply is defined in your main index.html
            if (typeof setReply === 'function') {
                setReply(contextMenuTarget.sender, contextMenuTarget.content, contextMenuTarget.id);
            }
        }
        document.getElementById('context-menu').classList.remove('active');
    };

    window.contextForward = () => {
        if (contextMenuTarget) {
            const input = document.getElementById('msgInput');
            input.value = `Forwarded: ${contextMenuTarget.content}`;
            input.focus();
        }
        document.getElementById('context-menu').classList.remove('active');
    };

    window.contextPin = () => {
        if (contextMenuTarget) {
            window.IdlyPlugins.sendToSocket({ type: 'pin_message', id: contextMenuTarget.id });
            if (typeof showToast === 'function') showToast("Message Pinned", "success");
        }
        document.getElementById('context-menu').classList.remove('active');
    };

    window.contextDelete = () => {
        if (!contextMenuTarget) return;
        
        const id = contextMenuTarget.id;
        const msgEl = document.querySelector(`[data-msg-id="${id}"]`);
        
        if (msgEl) {
            msgEl.remove();
            // Notify server to delete from DB
            window.IdlyPlugins.sendToSocket({ type: 'delete_message', id: id });
        }
        document.getElementById('context-menu').classList.remove('active');
        document.addEventListener('click', (e) => {
        const menu = document.getElementById('context-menu');
        // If the menu exists AND is active AND the click was NOT on the menu itself
        if (menu && menu.classList.contains('active') && !e.target.closest('#context-menu')) {
            menu.classList.remove('active');
        }
    });
    };
})();