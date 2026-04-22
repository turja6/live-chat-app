/* PLUGIN: Typing Indicator
   Description: Shows when the other user is typing in a private chat.
*/

class TypingIndicator {
    constructor(socket, username) {
        this.ws = socket;
        this.myUser = username;
        this.typingTimeout = null;
        this.init();
    }

    init() {
        const input = document.getElementById('msg-input');
        if (!input) return;

        input.addEventListener('input', () => {
            if (window.currentChat !== "Public") {
                this.sendTypingSignal();
            }
        });
    }

    sendTypingSignal() {
        this.ws.send(JSON.stringify({
            type: "typing",
            receiver: window.currentChat
        }));
    }

    static display(data) {
        let indicator = document.getElementById('typing-text');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'typing-text';
            // Injects it right above the input area
            document.querySelector('.input-wrapper').prepend(indicator);
        }

        indicator.innerText = `${data.sender} is typing...`;
        indicator.style.opacity = "1";

        // Auto-hide after 3 seconds of no "typing" signals
        clearTimeout(window.typingTimer);
        window.typingTimer = setTimeout(() => {
            indicator.style.opacity = "0";
        }, 3000);
    }
}

console.log("Plugin: Typing Indicator Loaded");