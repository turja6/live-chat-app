(function() {
    console.log("Chat Enhancer Plugin Loaded");

    // 1. Fix the Display (No more raw HTML)
    const originalDrawMessage = window.drawMessage;
    window.drawMessage = function(msg, isNew) {
        originalDrawMessage(msg, isNew);
        const bubbles = document.querySelectorAll('.msg-bubble');
        const bubble = bubbles[bubbles.length - 1];
        if (bubble) {
            // Check if link, otherwise plain text (No HTML escaping issues)
            if (msg.content.startsWith("http")) {
                bubble.innerHTML = `<a href="${msg.content}" target="_blank" style="color:#6366f1;">Link</a>`;
            } else {
                bubble.textContent = msg.content;
            }
        }
    };

    // 2. Replace Emojis with Icons (SVG)
    // Add logic here to replace common text :) with icons if needed, 
    // but keeping it simple as requested.

    // 3. Context Menu Actions (Icons replaced by text/labels)
    window.contextReply = function() {
        if (contextMenuTarget) {
            replyingTo = { sender: contextMenuTarget.sender, content: contextMenuTarget.content, id: contextMenuTarget.id };
            document.getElementById('reply-to-name').innerText = contextMenuTarget.sender;
            document.getElementById('reply-preview').classList.add('active');
        }
        document.getElementById('context-menu').classList.remove('active');
    };

    window.contextForward = function() {
        if (contextMenuTarget) {
            document.getElementById('msgInput').value = `Forwarded: ${contextMenuTarget.content}`;
            document.getElementById('msgInput').focus();
        }
        document.getElementById('context-menu').classList.remove('active');
    };

    window.contextPin = function() {
        window.IdlyPlugins.sendToSocket({ type: 'pin', id: contextMenuTarget.id });
        document.getElementById('context-menu').classList.remove('active');
    };
})();