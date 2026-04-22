/* PLUGIN: IdlyCall Message Reactions 
    Description: Adds Discord-style hover-to-react bars and aggregated emoji chips.
*/

class IdlyCallReactions {
    constructor(socket, username) {
        this.ws = socket;
        this.myUser = username;
        this.emojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '💯'];
        this.init();
    }

    init() {
        // 1. Monitor the chat-stream for new message bubbles
        const chatStream = document.getElementById('chat-stream');
        if (!chatStream) return;

        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.classList && node.classList.contains('message')) {
                        this.addHoverBar(node);
                    }
                });
            });
        });

        observer.observe(chatStream, { childList: true });

        // 2. Apply to messages already loaded (from history)
        document.querySelectorAll('.message').forEach(msg => this.addHoverBar(msg));
        console.log("Plugin: Reactions Engine Active");
    }

    addHoverBar(messageElement) {
        if (messageElement.querySelector('.reaction-bar')) return;

        // Create the hidden hover bar
        const bar = document.createElement('div');
        bar.className = 'reaction-bar';
        
        this.emojis.forEach(emoji => {
            const btn = document.createElement('span');
            btn.innerText = emoji;
            btn.title = `React with ${emoji}`;
            btn.onclick = (e) => {
                e.stopPropagation();
                this.sendReaction(messageElement, emoji);
            };
            bar.appendChild(btn);
        });

        messageElement.appendChild(bar);
    }

    sendReaction(messageElement, emoji) {
        // We identify the message by its ID (if available) or its timestamp text
        const msgId = messageElement.getAttribute('data-msg-id') || 
                      messageElement.querySelector('.msg-time')?.innerText;

        if (!msgId) return;

        const payload = {
            type: "reaction",
            msg_id: msgId,
            emoji: emoji,
            receiver: window.currentChat // Pulls from your global state in script.js
        };

        this.ws.send(JSON.stringify(payload));
    }

    /**
     * Called by the core script.js when a "reaction" event is received
     */
    static updateUI(data) {
        const messages = document.querySelectorAll('.message');
        let targetMsg = null;

        // Search for the correct message bubble in the UI
        messages.forEach(m => {
            const time = m.querySelector('.msg-time')?.innerText;
            if (m.getAttribute('data-msg-id') === data.msg_id || time === data.msg_id) {
                targetMsg = m;
            }
        });

        if (!targetMsg) return;

        let badgeContainer = targetMsg.querySelector('.badge-container');
        if (!badgeContainer) {
            badgeContainer = document.createElement('div');
            badgeContainer.className = 'badge-container';
            // Append badges inside the content wrapper of the message
            targetMsg.querySelector('div').appendChild(badgeContainer);
        }

        // Update or Create emoji badge
        let badge = badgeContainer.querySelector(`[data-emoji="${data.emoji}"]`);
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'reaction-badge';
            badge.setAttribute('data-emoji', data.emoji);
            badge.innerHTML = `${data.emoji} <span class="count">1</span>`;
            badgeContainer.appendChild(badge);
        } else {
            const countSpan = badge.querySelector('.count');
            countSpan.innerText = parseInt(countSpan.innerText) + 1;
        }
    }
}

// Initializing the plugin manually after script.js connects
// (This is triggered by the hook we left in script.js)