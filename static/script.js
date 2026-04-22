/* ============================================
   IdlyCall Pro - Main Application Script
   WebSocket Chat Client with UI Management
============================================ */

// ============================================
// GLOBAL STATE VARIABLES
// ============================================

let ws;                          // WebSocket connection instance
let myUsername = localStorage.getItem("chat_username") || "";
let myPicBase64 = localStorage.getItem("chat_pic") || "";
let currentChat = "Public";      // Current active chat/channel

// ============================================
// IMAGE PROCESSING HANDLER
// ============================================

/**
 * Processes image file upload and converts to base64
 * @param {Event} e - File input change event
 * @param {string} tid - Target image element ID to update
 */
function processImage(e, tid) {
    const file = e.target.files[0];
    
    // Validate file exists
    if (!file) return;
    
    // Create FileReader to convert image to base64
    const reader = new FileReader();
    
    reader.onload = function(ev) {
        // Update preview image source
        const targetElement = document.getElementById(tid);
        if (targetElement) {
            targetElement.src = ev.target.result;
        }
        
        // Store base64 data globally
        myPicBase64 = ev.target.result;
    };
    
    reader.onerror = function() {
        console.error('Error reading file');
        alert('Failed to process image. Please try another file.');
    };
    
    // Read the file as data URL (base64)
    reader.readAsDataURL(file);
}

// ============================================
// LOGIN / AUTHENTICATION
// ============================================

/**
 * Handles manual login form submission
 * Validates username and initializes application
 */
window.manualLogin = function() {
    const input = document.getElementById("usernameInput");
    
    // Validate input element exists
    if (!input) {
        console.error('Username input not found');
        return;
    }
    
    // Validate username is not empty
    const trimmedName = input.value.trim();
    if (!trimmedName) {
        alert('Please enter a username!');
        
        // Shake animation for feedback
        input.style.animation = 'shake 0.5s ease';
        setTimeout(() => {
            input.style.animation = '';
        }, 500);
        
        input.focus();
        return;
    }
    
    // Store credentials
    myUsername = trimmedName;
    localStorage.setItem("chat_username", myUsername);
    
    // Initialize the main application
    startApp();
};

// ============================================
// APPLICATION INITIALIZATION
// ============================================

/**
 * Initializes the main chat application
 * Sets up WebSocket connection and UI state
 */
function startApp() {
    // Hide login screen
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.style.display = 'none';
    }
    
    // Show main app container
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.style.display = 'flex';
    }
    
    // Determine WebSocket protocol based on page security
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    
    // Construct WebSocket URL with username parameter
    const wsUrl = `${protocol}://${location.host}/ws/${encodeURIComponent(myUsername)}`;
    
    // Initialize WebSocket connection
    try {
        ws = new WebSocket(wsUrl);
        
        // Setup connection event handlers
        setupWebSocketHandlers();
        
    } catch (error) {
        console.error('WebSocket connection failed:', error);
        alert('Failed to connect to server. Please refresh the page.');
    }
}

/**
 * Configures all WebSocket event handlers
 */
function setupWebSocketHandlers() {
    /**
     * Connection Opened
     * Send profile information to server
     */
    ws.onopen = function() {
        console.log('Connected to server');
        
        // Send profile picture if available
        const profileData = {
            pic: myPicBase64 || null
        };
        
        ws.send(JSON.stringify(profileData));
    };
    
    /**
     * Message Received from Server
     * Handles different message types (chat, user_list, etc.)
     */
    ws.onmessage = function(e) {
        try {
            const data = JSON.parse(e.data);
            
            switch (data.type) {
                case 'chat':
                    handleChatMessage(data);
                    break;
                    
                case 'user_list':
                    updateUserList(data.data);
                    break;
                    
                case 'history':
                    loadChatHistory(data.messages);
                    break;
                    
                case 'error':
                    console.error('Server error:', data.message);
                    alert(`Error: ${data.message}`);
                    break;
                    
                default:
                    console.log('Unknown message type:', data.type);
            }
            
        } catch (error) {
            console.error('Failed to parse message:', error);
        }
    };
    
    /**
     * Connection Closed
     * Handle disconnection gracefully
     */
    ws.onclose = function(event) {
        console.log('Disconnected from server', event.code, event.reason);
        
        // Attempt reconnection after delay if not intentional
        if (event.code !== 1000) {
            setTimeout(() => {
                if (myUsername && document.getElementById('app-container').style.display !== 'none') {
                    console.log('Attempting reconnection...');
                    startApp();
                }
            }, 3000);
        }
    };
    
    /**
     * Connection Error
     * Log and handle WebSocket errors
     */
    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

// ============================================
// MESSAGE HANDLING
// ============================================

/**
 * Processes incoming chat messages
 * Plays notification sound and renders message
 * @param {Object} data - Message data object
 */
function handleChatMessage(data) {
    const { message, sender, profile_pic, timestamp } = data;
    
    // Play notification sound for other users' messages
    if (sender !== myUsername) {
        playNotificationSound();
    }
    
    // Render message in chat stream
    drawMessage(message, sender, profile_pic, timestamp);
}

/**
 * Plays chat notification sound
 * Catches errors if audio fails to play (browser autoplay policies)
 */
function playNotificationSound() {
    const audioElement = document.getElementById('chatSound');
    
    if (audioElement) {
        audioElement.play().catch(function(error) {
            // Silently fail - browser may block autoplay
            console.log('Notification sound blocked:', error.message);
        });
    }
}

/**
 * Renders a message in the chat stream
 * @param {string} text - Message text content
 * @param {string} sender - Sender's username
 * {string} pic - Sender's profile picture URL (base64 or URL)
 * @param {string} time - Timestamp string
 */
function drawMessage(text, sender, pic, time) {
    const stream = document.getElementById('chat-stream');
    
    if (!stream) {
        console.error('Chat stream container not found');
        return;
    }
    
    // Create message container div
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    // Default avatar for missing pictures
    const defaultAvatar = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';
    const avatarSrc = pic || defaultAvatar;
    
    // Sanitize message text to prevent XSS
    const sanitizedText = escapeHtml(text);
    
    // Build message HTML structure (Discord-style flat layout)
    messageDiv.innerHTML = `
        <img src="${avatarSrc}" alt="${escapeHtml(sender)}'s avatar" class="msg-avatar">
        <div>
            <span class="msg-sender">${escapeHtml(sender)}</span><span class="msg-time">${time || ''}</span>
            <div class="msg-content">${sanitizedText}</div>
        </div>
    `;
    
    // Append message to stream
    stream.appendChild(messageDiv);
    
    // Auto-scroll to latest message
    requestAnimationFrame(() => {
        stream.scrollTop = stream.scrollHeight;
    });
}

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} unsafe - Unsafe string potentially containing HTML
 * @returns {string} Escaped safe string
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================
// USER LIST / SIDEBAR MANAGEMENT
// ============================================

/**
 * Updates the sidebar user list with current online users
 * @param {Array} users - Array of user objects {username, profile_pic}
 */
function updateSidebar(users) {
    const container = document.getElementById('user-list-container');
    
    if (!container) {
        console.error('User list container not found');
        return;
    }
    
    // Default avatar for missing pictures
    const defaultAvatar = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';
    
    // Generate user list HTML
    if (users && users.length > 0) {
        container.innerHTML = users.map(user => `
            <div class="user-item" onclick="switchChat('${escapeHtml(user.username)}')">
                <img src="${user.profile_pic || defaultAvatar}" 
                     alt="${escapeHtml(user.username)}'s avatar" 
                     width="30" 
                     height="30"
                     style="border-radius:50%; margin-right:10px;">
                <span>${escapeHtml(user.username)}</span>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<p style="color: var(--text-dim); padding: 20px; text-align: center;">No users online</p>';
    }
}

// ============================================
// CHAT SWITCHING
// ============================================

/**
 * Switches active chat/conversation
 * @param {string} target - Target username or channel name
 */
window.switchChat = function(target) {
    // Update current chat state
    currentChat = target;
    
    // Update header title
    const headerTitle = document.getElementById('chatHeaderTitle');
    if (headerTitle) {
        headerTitle.innerText = target;
    }
    
    // Clear current message stream
    const chatStream = document.getElementById('chat-stream');
    if (chatStream) {
        chatStream.innerHTML = '';
    }
    
    // Request chat history from server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: "get_history",
            target: target
        }));
    }
    
    // Close mobile sidebar after selection (if open)
    closeMobileSidebar();
};

/**
 * Loads historical messages into chat stream
 * @param {Array} messages - Array of past message objects
 */
function loadChatHistory(messages) {
    if (!messages || !Array.isArray(messages)) return;
    
    messages.forEach(msg => {
        drawMessage(msg.message, msg.sender, msg.profile_pic, msg.timestamp);
    });
}

// ============================================
// MESSAGE SENDING
// ============================================

/**
 * Sends a message to the current chat
 * Triggered by send button click or Enter key
 */
window.sendMyMessage = function() {
    const input = document.getElementById("msg-input");
    
    if (!input) {
        console.error('Message input not found');
        return;
    }
    
    // Get and trim message content
    const messageText = input.value.trim();
    
    // Don't send empty messages
    if (!messageText) return;
    
    // Check WebSocket connection status
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to server. Please wait for reconnection.');
        return;
    }
    
    // Construct message payload
    const messagePayload = {
        type: "chat",
        receiver: currentChat,
        message: messageText
    };
    
    // Send message via WebSocket
    try {
        ws.send(JSON.stringify(messagePayload));
        
        // Clear input field
        input.value = '';
        
        // Keep focus on input for continuous typing
        input.focus();
        
    } catch (error) {
        console.error('Failed to send message:', error);
        alert('Failed to send message. Please try again.');
    }
};

// ============================================
// MOBILE SIDEBAR FUNCTIONALITY
// ============================================

/**
 * Toggles mobile sidebar visibility
 * Manages body scroll lock for better UX
 */
window.toggleMobileSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    
    if (!sidebar) return;
    
    const isOpen = sidebar.classList.contains('open');
    
    // Toggle open class
    sidebar.classList.toggle('open');
    
    // Manage body scroll lock on mobile devices
    if (window.innerWidth <= 768) {
        if (!isOpen) {
            // Opening sidebar - lock body scroll
            document.body.style.overflow = 'hidden';
        } else {
            // Closing sidebar - restore scroll
            document.body.style.overflow = '';
        }
    }
};

/**
 * Closes mobile sidebar if it's currently open
 */
function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    
    if (sidebar && window.innerWidth <= 768 && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        document.body.style.overflow = '';
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

/**
 * Keyboard event handler for Enter key message sending
 * Attached to document for global listening
 */
document.addEventListener('keypress', function(e) {
    // Only trigger on Enter key when message input is focused
    if (e.key === 'Enter' && document.activeElement.id === 'msg-input') {
        e.preventDefault(); // Prevent form submission if within form
        window.sendMyMessage();
    }
});

/**
 * Click outside handler to close mobile sidebar
 * Listens for clicks outside sidebar area on mobile
 */
document.addEventListener('click', function(e) {
    // Only apply on mobile viewports
    if (window.innerWidth > 768) return;
    
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.querySelector('.mobile-menu');
    
    // Check if sidebar is open and click is outside
    if (sidebar && 
        sidebar.classList.contains('open') && 
        !sidebar.contains(e.target) && 
        menuBtn && 
        !menuBtn.contains(e.target)) {
        closeMobileSidebar();
    }
});

/**
 * Window resize handler
 * Resets sidebar state when resizing to desktop viewport
 */
window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
        // Ensure body scroll is restored on desktop
        document.body.style.overflow = '';
        
        // Remove open class from sidebar on desktop
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.remove('open');
        }
    }
});

/**
 * Page unload handler
 * Cleans up WebSocket connection before page closes
 */
window.addEventListener('beforeunload', function() {
    if (ws) {
        // Close WebSocket connection gracefully
        ws.close(1000, 'Page closing');
    }
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Debounce utility function for performance optimization
 * @param {Function} func - Function to debounce
 * @param {number} wait - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Formats timestamp to readable time string
 * @param {Date|string|number} timestamp - Date to format
 * @returns {string} Formatted time string (HH:MM format)
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${hours}:${minutes}`;
}

// ============================================
// INITIALIZATION ON DOM READY
// ============================================

/**
 * Document Ready Handler
 * Performs initial setup when DOM is fully loaded
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('IdlyCall Pro initialized');
    
    // Focus username input on login screen if present
    const usernameInput = document.getElementById('usernameInput');
    if (usernameInput && document.getElementById('login-screen').style.display !== 'none') {
        // Small delay to ensure animations complete
        setTimeout(() => {
            usernameInput.focus();
        }, 500);
    }
    
    // Add shake animation keyframe if not present (for login validation feedback)
    if (!document.querySelector('#shake-animation')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'shake-animation';
        styleSheet.textContent = `
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-10px); }
                50% { transform: translateX(10px); }
                75% { transform: translateX(-10px); }
            }
        `;
        document.head.appendChild(styleSheet);
    }
});

// ============================================
// CONSOLE BRANDING
// ============================================
console.log(
    '%c🔥 IdlyCall Pro %cv1.0 %c- Professional Chat UI',
    'color: #FF7A00; font-size: 16px; font-weight: bold;',
    'color: #8b929a; font-size: 12px;',
    'color: #ffffff; font-size: 12px;'
);