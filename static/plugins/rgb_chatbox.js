(function() {
    // 1. Create the styles
    const rgbStyles = document.createElement('style');
    rgbStyles.innerHTML = `
        /* The RGB border animation */
        @keyframes rgb-border {
            0% { border-color: #ff0000; box-shadow: 0 0 5px #ff0000; }
            33% { border-color: #00ff00; box-shadow: 0 0 5px #00ff00; }
            66% { border-color: #0000ff; box-shadow: 0 0 5px #0000ff; }
            100% { border-color: #ff0000; box-shadow: 0 0 5px #ff0000; }
        }

        /* Apply to the input wrapper when focused */
        .input-wrapper:focus-within {
            animation: rgb-border 3s infinite alternate;
            border-width: 2px;
        }

        /* Make the Send button glow */
        .send-btn {
            box-shadow: 0 0 10px rgba(99, 102, 241, 0.5);
            transition: box-shadow 0.3s;
        }
        .send-btn:hover {
            box-shadow: 0 0 20px #6366f1;
        }
    `;
    document.head.appendChild(rgbStyles);
    
    console.log("RGB Effect Plugin Loaded!");
})();