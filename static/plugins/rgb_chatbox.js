(function() {
    console.log("RGB Chatbox Plugin Loaded");

    // 1. Inject the RGB Animation Styles
    const style = document.createElement('style');
    style.innerHTML = `
        .rgb-container {
            position: relative;
            padding: 3px; /* The thickness of the glow */
            border-radius: 9999px; /* Matches your input-wrapper */
            background: linear-gradient(45deg, #ff0000, #ff7300, #fffb00, #48ff00, #00ffd5, #002bff, #7a00ff, #ff00c8, #ff0000);
            background-size: 400%;
            animation: rgb-animation 20s linear infinite;
        }
        @keyframes rgb-animation {
            0% { background-position: 0 0; }
            50% { background-position: 400% 0; }
            100% { background-position: 0 0; }
        }
        /* Make sure the inner background stays dark */
        .input-wrapper { background: var(--bg-secondary) !important; }
    `;
    document.head.appendChild(style);

    // 2. Wrap the chat input in the RGB container
    const inputWrapper = document.querySelector('.input-wrapper');
    if (inputWrapper) {
        const container = document.createElement('div');
        container.className = 'rgb-container';
        
        // Move the input wrapper inside the glowing container
        inputWrapper.parentNode.insertBefore(container, inputWrapper);
        container.appendChild(inputWrapper);
    }
})();