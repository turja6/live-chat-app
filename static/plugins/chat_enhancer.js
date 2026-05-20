(function() {
    console.log("Chat Enhancer Plugin Loaded");

    // 1. Hook into your existing message system
    const originalDrawMessage = window.drawMessage;
    
    window.drawMessage = function(msg, isNew) {
        // Ensure the message has an ID if one wasn't provided
        if (!msg.id) msg.id = 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5);
        
        // Run the original function
        originalDrawMessage(msg, isNew);
        
        // Find the last bubble and the container
        const groups = document.querySelectorAll('.message-group');
        const lastGroup = groups[groups.length - 1];
        if (lastGroup) {
            // Apply the ID to the container so contextDelete can find it
            lastGroup.setAttribute("data-msg-id", msg.id);
            
            // Format content safely
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

    // 2. Fix the Delete logic
    window.contextDelete = () => {
        if (!contextMenuTarget) return;
        
        // Use the ID directly from the menu target
        const id = contextMenuTarget.id;
        const msgEl = document.querySelector(`[data-msg-id="${id}"]`);
        
        if (msgEl) {
            msgEl.remove();
            window.IdlyPlugins.sendToSocket({ type: 'delete_message', id: id });
            console.log("Deleted:", id);
        } else {
            console.error("Could not find message with ID:", id);
        }
        document.getElementById('context-menu').classList.remove('active');
    };

    // ... (Keep your Reply/Forward/Pin functions the same)
})();