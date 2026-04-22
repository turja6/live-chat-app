/**
 * Reactions Plugin - Emoji Reactions for Messages
 * Adds ❤️ 👍 😂 😮 😢 to any message
 */

(function() {
    'use strict';
    
    console.log("[PLUGIN] ✅ Reactions plugin loaded");
    
    // Available reactions
    const REACTIONS = [
        { emoji: '❤️', name: 'love', color: '#ef4444' },
        { emoji: '👍', name: 'like', color: '#3b82f6' },
        { emoji: '😂', name: 'laugh', color: '#eab308' },
        { emoji: '😮', name: 'wow', color: '#8b5cf6' },
        { emoji: '😢', name: 'sad', color: '#6b7280' },
        { emoji: '🔥', name: 'fire', color: '#f97316' }
    ];
    
    // Store reactions per message ID
    const messageReactions = {};
    
    /**
     * Initialize reactions on page load
     */
    function initReactions() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupReactionListeners);
        } else {
            setupReactionListeners();
        }
    }
    
    /**
     * Setup click listeners on messages
     */
    function setupReactionListeners() {
        // Use event delegation on chat stream
        const chatStream = document.getElementById('chat-stream');
        
        if (!chatStream) {
            console.warn("[REACTIONS] Chat stream not found");
            return;
        }
        
        // Listen for clicks on messages
        chatStream.addEventListener('click', function(e) {
            const messageEl = e.target.closest('.message');
            
            if (messageEl && !e.target.closest('.reaction-bar')) {
                showReactionMenu(messageEl, e);
            }
        });
        
        // Close reaction menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.reaction-menu')) {
                hideAllReactionMenus();
            }
        });
        
        console.log("[REACTIONS] ✓ Listeners attached");
    }
    
    /**
     * Show reaction popup near clicked message
     * @param {HTMLElement} messageEl - Message element
     * @param {Event} event - Click event
     */
    function showReactionMenu(messageEl, event) {
        // Remove existing menus first
        hideAllReactionMenus();
        
        // Generate unique ID for message if not exists
        if (!messageEl.dataset.msgId) {
            messageEl.dataset.msgId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        }
        
        // Create reaction menu container
        const menu = document.createElement('div');
        menu.className = 'reaction-menu';
        menu.dataset.forMessage = messageEl.dataset.msgId;
        
        // Add reaction buttons
        REACTIONS.forEach(reaction => {
            const btn = document.createElement('button');
            btn.className = 'reaction-btn';
            btn.innerHTML = `<span>${reaction.emoji}</span>`;
            btn.title = reaction.name;
            btn.dataset.reaction = reaction.name;
            btn.style.setProperty('--hover-color', reaction.color);
            
            // Count existing reactions
            const count = getMessageReactionCount(messageEl.dataset.msgId, reaction.name);
            if (count > 0) {
                const countBadge = document.createElement('span');
                countBadge.className = 'reaction-count';
                countBadge.textContent = count;
                btn.appendChild(countBadge);
            }
            
            btn.onclick = (e) => {
                e.stopPropagation();
                toggleReaction(messageEl, reaction);
                hideAllReactionMenus();
            };
            
            menu.appendChild(btn);
        });
        
        // Position menu near click
        const rect = messageEl.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.left = `${Math.min(event.clientX, window.innerWidth - 200)}px`;
        menu.style.top = `${rect.top - 60}px`;
        menu.style.zIndex = '9999';
        
        document.body.appendChild(menu);
        
        // Animate in
        requestAnimationFrame(() => {
            menu.classList.add('visible');
        });
    }
    
    /**
     * Hide all open reaction menus
     */
    function hideAllReactionMenus() {
        const menus = document.querySelectorAll('.reaction-menu');
        menus.forEach(menu => {
            menu.classList.remove('visible');
            setTimeout(() => menu.remove(), 150);
        });
    }
    
    /**
     * Toggle a reaction on a message
     * @param {HTMLElement} messageEl - Message element
     * @param {Object} reaction - Reaction object
     */
    function toggleReaction(messageEl, reaction) {
        const msgId = messageEl.dataset.msgId;
        
        if (!messageReactions[msgId]) {
            messageReactions[msgId] = {};
        }
        
        // Toggle
        if (messageReactions[msgId][reaction.name]) {
            delete messageReactions[msgId][reaction.name];
        } else {
            messageReactions[msgId][reaction.name] = {
                emoji: reaction.emoji,
                user: localStorage.getItem('chat_username') || 'Anonymous',
                time: new Date().toISOString()
            };
        }
        
        // Update visual indicator on message
        updateMessageReactionIndicator(messageEl);
        
        // Here you would send to server:
        /*
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({
                type: 'reaction',
                message_id: msgId,
                reaction: reaction.name,
                emoji: reaction.emoji
            }));
        }
        */
        
        console.log(`[REACTIONS] ${reaction.emoji} toggled on ${msgId}`);
    }
    
    /**
     * Get count of specific reaction on message
     */
    function getMessageReactionCount(msgId, reactionName) {
        if (!messageReactions[msgId]) return 0;
        return Object.keys(messageReactions[msgId]).filter(r => r === reactionName).length;
    }
    
    /**
     * Update visual reaction indicator on message
     */
    function updateMessageReactionIndicator(messageEl) {
        let indicator = messageEl.querySelector('.reaction-indicator');
        const msgId = messageEl.dataset.msgId;
        
        if (!indicator && messageReactions[msgId] && Object.keys(messageReactions[msgId]).length > 0) {
            indicator = document.createElement('div');
            indicator.className = 'reaction-indicator';
            messageEl.appendChild(indicator);
        }
        
        if (indicator) {
            const reactions = messageReactions[msgId] || {};
            const totalReactions = Object.keys(reactions).length;
            
            if (totalReactions === 0) {
                indicator.remove();
                return;
            }
            
            // Show top 3 reactions
            const topReactions = Object.entries(reactions)
                .slice(0, 3)
                .map(([name, data]) => data.emoji)
                .join('');
            
            indicator.innerHTML = `
                <span class="reaction-emojis">${topReactions}</span>
                <span class="reaction-total">${totalReactions}</span>
            `;
        }
    }
    
    // Inject styles
    const styles = document.createElement('style');
    styles.textContent = `
        .reaction-menu {
            background: rgba(14, 16, 18, 0.98);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 8px;
            display: flex;
            gap: 4px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            opacity: 0;
            transform: translateY(10px) scale(0.95);
            transition: all 0.15s ease;
        }
        
        .reaction-menu.visible {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
        
        .reaction-btn {
            background: transparent;
            border: none;
            padding: 6px 8px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 20px;
            position: relative;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            gap: 2px;
        }
        
        .reaction-btn:hover {
            background: var(--hover-color, rgba(255,122,0,0.15));
            transform: scale(1.2);
        }
        
        .reaction-count {
            font-size: 10px;
            color: var(--text-secondary, #9ca3af);
            font-weight: 600;
        }
        
        .reaction-indicator {
            position: absolute;
            bottom: 4px;
            left: 52px;
            background: rgba(14, 16, 18, 0.9);
            border-radius: 10px;
            padding: 2px 8px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            border: 1px solid rgba(255,255,255,0.08);
        }
        
        .reaction-emojis {
            letter-spacing: -2px;
        }
        
        .reaction-total {
            color: var(--text-muted, #6b7280);
            font-weight: 500;
            margin-left: 2px;
        }
    `;
    document.head.appendChild(styles);
    
    // Initialize
    initReactions();
    
    // Expose globally if needed
    window.ReactionsPlugin = {
        REACTIONS,
        getMessageReactions: () => messageReactions
    };
})();