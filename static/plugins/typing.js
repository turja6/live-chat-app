/* static/plugins/typing.js */
(function() {
    let typingTimer;
    const input = document.getElementById('msg-input');
    
    if (input) {
        input.addEventListener('input', () => {
            if (window.currentChat !== "Public" && window.ws && window.ws.readyState === WebSocket.OPEN) {
                window.ws.send(JSON.stringify({ type: "typing", receiver: window.currentChat }));
            }
        });
    }

    // Hook into the main handleServerEvents (Monkey-patching for modularity)
    const originalHandler = window.handleServerEvents;
    window.handleServerEvents = function(data) {
        if (data.type === "typing" && data.sender === window.currentChat) {
            showTypingIndicator(data.sender);
        }
        if (originalHandler) originalHandler(data);
    };

    function showTypingIndicator(sender) {
        let indicator = document.getElementById('typing-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'typing-indicator';
            indicator.style = "position:absolute; top:-25px; left:20px; font-size:0.8rem; color:var(--accent); font-style:italic; transition: 0.3s;";
            document.querySelector('.input-wrapper').appendChild(indicator);
        }
        
        indicator.innerText = `${sender} is typing...`;
        indicator.style.opacity = "1";

        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            indicator.style.opacity = "0";
        }, 2000);
    }
    console.log("Plugin Loaded: Typing Indicators");
})();