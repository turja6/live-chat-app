(function() {
    console.log("Message Formatter Plugin Loaded");

    // The Parser Function
    function formatMessage(content) {
        // 1. Detect Links (e.g., https://google.com)
        const linkRegex = /(https?:\/\/[^\s]+)/g;
        let formatted = content.replace(linkRegex, '<a href="$1" target="_blank" style="color:#818cf8; text-decoration:underline;">$1</a>');

        // 2. Detect Code Blocks (e.g., `print("hello")`)
        const codeRegex = /`([^`]+)`/g;
        formatted = formatted.replace(codeRegex, '<code style="background:#232328; padding:2px 5px; border-radius:4px; font-family:monospace; color:#f4f4f5;">$1</code>');

        return formatted;
    }

    // 3. Inject into the chat system
    // We override the internal drawMessage logic by using the IdlyPlugins registry
    const originalDrawMessage = window.drawMessage; // Keep original
    window.drawMessage = function(msg, isNew) {
        // Apply the format BEFORE drawing
        if (msg.content && typeof msg.content === 'string' && !msg.content.startsWith('data:')) {
            msg.content = formatMessage(msg.content);
        }
        originalDrawMessage(msg, isNew);
    };
})();