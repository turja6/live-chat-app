/**
 * Typing Indicator Plugin
 * Shows "X is typing..." when someone is composing a message
 */

(function() {
    'use strict';
    
    console.log("[PLUGIN] ✅ Typing indicator plugin loaded");
    
    let typingTimeout = null;
    const TYPING_DURATION = 3000; // How long "typing..." shows after last keystroke
    const TYPING_DEBOUNCE = 500; // Debounce before sending typing event
    
    let lastKeystroke = 0;
    
    /**
     * Initialize typing detection
     */
    function initTypingIndicator() {
        const input = document.getElementById('msg-input');
        
        if (!input) {
            console.warn("[TYPING] Input field not found");
            return;
        }
        
        // Listen for keystrokes
        input.addEventListener('keydown', handleKeystroke);
        input.addEventListener('keyup', handleKeyup);
        
        // Stop typing when sending
        input.addEventListener('change', stopTyping);
        
        // Also listen for send button
        const sendBtn = document.querySelector('.send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('click', stopTyping);
        }
        
        console.log("[TYPING] ✓ Initialized");
    }
    
    /**
     * Handle keydown - detect typing start
     */
    function handleKeystroke(e) {
        // Ignore special keys
        if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
            return;
        }
        
        const now = Date.now();
        
        // Only consider it "typing" after a few characters or debounce
        if (now - lastKeystroke < TYPING_DEBOUNCE && e.key.length === 1) {
            return; // Too fast, probably normal typing
        }
        
        lastKeystroke = now;
        
        // Start/restart typing indicator
        startTyping();
    }
    
    /**
     * Handle keyup - continue showing typing
     */
    function handleKeyup(e) {
        if (e.key === 'Enter') {
            stopTyping();
        } else {
            // Keep showing typing indicator
            restartTypingTimer();
        }
    }
    
    /**
     * Start showing typing indicator
     */
    function startTyping() {
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        
        // Show typing UI locally (optional - for immediate feedback)
        showLocalTypingIndicator(true);
        
        // Send typing event to server
        sendTypingStatus(true);
        
        // Set timeout to auto-stop
        typingTimeout = setTimeout(stopTyping, TYPING_DURATION);
    }
    
    /**
     * Restart the timer
     */
    function restartTypingTimer() {
        if (typingTimeout) {
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(stopTyping, TYPING_DURATION);
        }
    }
    
    /**
     * Stop typing indicator
     */
    function stopTyping() {
        if (typingTimeout) {
            clearTimeout(typingTimeout);
            typingTimeout = null;
        }
        
        showLocalTypingIndicator(false);
        sendTypingStatus(false);
    }
    
    /**
     * Send typing status via WebSocket
     * @param {boolean} isTyping
     */
    function sendTypingStatus(isTyping) {
        if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
            // Don't send if we're in a public channel (no one cares)
            const currentChat = typeof currentChat !== 'undefined' ? currentChat : 'Public';
            
            if (currentChat !== 'Public') {
                ws.send(JSON.stringify({
                    type: 'typing',
                    is_typing: isTyping,
                    target: currentChat,
                    user: localStorage.getItem('chat_username') || 'Anonymous'
                }));
            }
        }
    }
    
    /**
     * Show/hide local typing indicator (for immediate feedback)
     * @param {boolean} show
     */
    function showLocalTypingIndicator(show) {
        let indicator = document.getElementById('typing-indicator');
        
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'typing-indicator';
            indicator.innerHTML = '<span class="typing-text">Typing...</span><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
            
            // Insert before input area
            const inputArea = document.querySelector('.input-area');
            if (inputArea) {
                inputArea.insertBefore(indicator, inputArea.firstChild);
            }
        }
        
        if (show) {
            indicator.classList.add('visible');
        } else {
            indicator.classList.remove('visible');
        }
    }
    
    /**
     * Show remote user typing indicator
     * @param {string} username
     */
    window.showRemoteTyping = function(username) {
        let indicator = document.getElementById('remote-typing-' + username.replace(/[^a-zA-Z0-9]/g, ''));
        
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'remote-typing-' + username.replace(/[^a-zA-Z0-9]/g, '');
            indicator.className = 'remote-typing-indicator';
            indicator.innerHTML = `<strong>${escapeHTML(username)}</strong> is typing...`;
            
            const stream = document.getElementById('chat-stream');
            if (stream) {
                stream.appendChild(indicator);
            }
        }
        
        // Show it
        indicator.style.display = 'block';
        
        // Auto-hide after TYPING_DURATION
        clearTimeout(indicator._hideTimeout);
        indicator._hideTimeout = setTimeout(() => {
            indicator.style.display = 'none';
        }, TYPING_DURATION);
        
        // Scroll to bottom to show it
        const stream = document.getElementById('chat-stream');
        if (stream) {
            stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
        }
    };
    
    /**
     * Escape HTML (utility)
     */
    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    // Inject CSS
    const styles = document.createElement('style');
    styles.textContent = `
        .typing-indicator {
            padding: 8px 24px;
            font-size: 13px;
            color: var(--text-muted, #6b7280);
            opacity: 0;
            height: 0;
            overflow: hidden;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .typing-indicator.visible {
            opacity: 1;
            height: auto;
        }
        
        .typing-dots span {
            animation: typingBounce 1.4s infinite;
            color: var(--accent, #FF7A00);
        }
        
        .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
        
        @keyframes typingBounce {
            0%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-4px); }
        }
        
        .remote-typing-indicator {
            padding: 8px 16px;
            margin: 4px 0;
            background: var(--glass-hover, rgba(255,255,255,0.06));
            border-radius: 8px;
            font-size: 13px;
            color: var(--text-secondary, #9ca3af);
            animation: fadeInUp 0.2s ease;
        }
        
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(styles);
    
    // Initialize when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTypingIndicator);
    } else {
        initTypingIndicator();
    }
    
    // Expose
    window.TypingPlugin = {
        showRemoteTyping: window.showRemoteTyping
    };
})();