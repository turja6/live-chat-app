(function() {
    console.log("Message Formatter Plugin Loaded");

    // The Parser: Detects links and code, converts them to HTML
    function formatMessage(text) {
        if (typeof text !== 'string') return text;

        // 1. Detect Links: (e.g., https://google.com)
        // Wraps them in an <a> tag
        const linkRegex = /(https?:\/\/[^\s]+)/g;
        let formatted = text.replace(linkRegex, '<a href="$1" target="_blank" style="color:#818cf8; text-decoration:underline;">$1</a>');

        // 2. Detect Code Blocks: (e.g., `code here`)
        // Wraps them in a <code> tag with dark background
        const codeRegex = /`([^`]+)`/g;
        formatted = formatted.replace(codeRegex, '<code style="background:#232328; padding:2px 5px; border-radius:4px; font-family:monospace; color:#f4f4f5;">$1</code>');

        return formatted;
    }

    // Connect to the UI: We listen for the custom event we created in the loader
    window.addEventListener('pluginsLoaded', () => {
        // We need to slightly patch drawMessage to use innerHTML instead of just drawing raw text
        const originalDrawMessage = window.drawMessage;
        
        window.drawMessage = function(msg, isNew) {
            // Check if the message content needs formatting
            if (msg.content && typeof msg.content === 'string' && !msg.content.startsWith('data:')) {
                msg.content = formatMessage(msg.content);
            }
            originalDrawMessage(msg, isNew);
            
            // Fix: Find the newly created bubble and set it to innerHTML
            const bubbles = document.querySelectorAll('.msg-bubble');
            const lastBubble = bubbles[bubbles.length - 1];
            if (lastBubble) {
                lastBubble.innerHTML = msg.content;
            }
        };
    });
})();