window.contextDelete = function() {
    console.log("Delete clicked for ID:", contextMenuTarget?.id); // Debugging
    
    if (contextMenuTarget && contextMenuTarget.sender === myUsername) {
        // 1. Remove from UI
        const msgEl = document.querySelector(`[data-msg-id="${contextMenuTarget.id}"]`);
        if (msgEl) {
            const group = msgEl.closest('.message-group');
            if (group) {
                group.remove();
                console.log("Message removed from UI");
            }
        } else {
            console.error("Could not find message element with ID:", contextMenuTarget.id);
        }

        // 2. Notify Server
        window.IdlyPlugins.sendToSocket({ 
            type: 'delete_message', 
            id: contextMenuTarget.id 
        });
        console.log("Delete request sent to server");
    } else {
        console.warn("Delete aborted: Message does not belong to user or target is null");
    }
    
    document.getElementById('context-menu').classList.remove('active');
};