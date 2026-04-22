/* static/plugins/reactions.js */
(function() {
    // Listen for double clicks on the chat stream
    document.getElementById('chat-stream').addEventListener('dblclick', function(e) {
        const messageBubble = e.target.closest('.message');
        if (!messageBubble) return;

        // In a real app, you'd use a message ID. Here we use the text as a simple identifier.
        const msgText = messageBubble.querySelector('.msg-content').innerText;
        
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({ 
                type: "reaction", 
                emoji: "❤️", 
                message_ref: msgText,
                receiver: window.currentChat 
            }));
        }
        
        // Optimistically show it for ourselves
        addReactionToUI(messageBubble, "❤️");
    });

    // Intercept incoming reactions from the server
    const originalHandler = window.handleServerEvents;
    window.handleServerEvents = function(data) {
        if (data.type === "reaction") {
            const allMessages = document.querySelectorAll('.message');
            allMessages.forEach(msg => {
                const textNode = msg.querySelector('.msg-content');
                if (textNode && textNode.innerText === data.message_ref) {
                    addReactionToUI(msg, data.emoji);
                }
            });
        }
        if (originalHandler) originalHandler(data);
    };

    function addReactionToUI(messageElement, emoji) {
        let badge = messageElement.querySelector('.reaction-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'reaction-badge';
            badge.style = "display:inline-block; margin-top:5px; background:rgba(255,122,0,0.2); border:1px solid var(--accent); border-radius:10px; padding:2px 8px; font-size:0.8rem; cursor:pointer;";
            badge.innerText = emoji + " 1";
            messageElement.querySelector('.msg-body').appendChild(badge);
        } else {
            let count = parseInt(badge.innerText.split(" ")[1]) || 1;
            badge.innerText = `${emoji} ${count + 1}`;
        }
    }
    console.log("Plugin Loaded: Message Reactions");
})();