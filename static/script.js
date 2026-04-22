// ============================================
// IdlyCall Pro - Core Application Script
// Preserves your original functionality
// ============================================

let ws;
let myUsername = localStorage.getItem("chat_username") || "";
let myPicBase64 = localStorage.getItem("chat_pic") || "";
let currentChat = "Public";

// Image Processing (Original Function)
function processImage(e, tid) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(ev) {
        document.getElementById(tid).src = ev.target.result;
        myPicBase64 = ev.target.result;
    };
    reader.readAsDataURL(file);
}

// Login Handler (Original Function)
window.manualLogin = function() {
    const input = document.getElementById("usernameInput");
    if (!input || !input.value.trim()) {
        alert("Please enter a username!");
        return;
    }
    
    myUsername = input.value.trim();
    localStorage.setItem("chat_username", myUsername);
    startApp();
};

// Start Application (Original Logic)
function startApp() {
    // Hide login screen
    document.getElementById("login-screen").style.display = "none";
    
    // Show main app
    document.getElementById("app-container").style.display = "flex";
    
    // Setup WebSocket
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${protocol}://${location.host}/ws/${myUsername}`);
    
    ws.onopen = function() {
        console.log('Connected to server');
        ws.send(JSON.stringify({ pic: myPicBase64 }));
    };
    
    ws.onmessage = function(e) {
        try {
            const d = JSON.parse(e.data);
            
            if (d.type === "chat") {
                // Play sound for others' messages
                if (d.sender !== myUsername) {
                    playSound();
                }
                drawMessage(d.message, d.sender, d.profile_pic, d.timestamp);
                
            } else if (d.type === "user_list") {
                updateSidebar(d.data);
                
            } else if (d.type === "history") {
                // Load chat history
                if (d.messages) {
                    d.messages.forEach(msg => {
                        drawMessage(msg.message, msg.sender, msg.profile_pic, msg.timestamp);
                    });
                }
            }
        } catch (err) {
            console.error('Message parse error:', err);
        }
    };
    
    ws.onclose = function(e) {
        console.log('Disconnected:', e.code, e.reason);
        // Auto-reconnect after 3 seconds if not intentional
        if (e.code !== 1000 && myUsername) {
            setTimeout(() => {
                if (document.getElementById('app-container').style.display !== 'none') {
                    startApp();
                }
            }, 3000);
        }
    };
    
    ws.onerror = function(err) {
        console.error('WebSocket error:', err);
    };
}

// Play Notification Sound
function playSound() {
    const audio = document.getElementById('chatSound');
    if (audio) {
        audio.play().catch(function(e) {
            console.log('Sound blocked by browser');
        });
    }
}

// Draw Message (Original Function Enhanced)
function drawMessage(text, sender, pic, time) {
    const stream = document.getElementById('chat-stream');
    if (!stream) return;
    
    const div = document.createElement('div');
    div.className = 'message';
    
    const defaultAvatar = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';
    
    div.innerHTML = `
        <img src="${pic || defaultAvatar}" class="msg-avatar" alt="${sender}'s avatar">
        <div>
            <span class="msg-sender">${escapeHtml(sender)}</span><span class="msg-time">${time || ''}</span>
            <div class="msg-content">${escapeHtml(text)}</div>
        </div>
    `;
    
    stream.appendChild(div);
    
    // Auto-scroll to bottom
    requestAnimationFrame(() => {
        stream.scrollTop = stream.scrollHeight;
    });
}

// Escape HTML (Security Enhancement)
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Update Sidebar User List (Original Function)
function updateSidebar(users) {
    const container = document.getElementById('user-list-container');
    if (!container) return;
    
    const defaultAvatar = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';
    
    if (users && users.length > 0) {
        container.innerHTML = users.map(u => `
            <div class="user-item" onclick="switchChat('${escapeHtml(u.username)}')">
                <img src="${u.profile_pic || defaultAvatar}" width="30" height="30" style="border-radius:50%; margin-right:10px;">
                <span>${escapeHtml(u.username)}</span>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<p style="color: var(--text-dim); padding: 20px; text-align: center;">No users online</p>';
    }
}

// Switch Chat (Original Function + Mobile Close)
window.switchChat = function(target) {
    currentChat = target;
    
    const titleEl = document.getElementById('chatHeaderTitle');
    if (titleEl) titleEl.innerText = target;
    
    const stream = document.getElementById('chat-stream');
    if (stream) stream.innerHTML = '';
    
    // Request history from server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "get_history", target: target }));
    }
    
    // Close mobile sidebar after selection
    closeMobileSidebar();
};

// Send Message (Original Function)
window.sendMyMessage = function() {
    const inp = document.getElementById("msg-input");
    if (!inp || !inp.value.trim()) return;
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to server');
        return;
    }
    
    ws.send(JSON.stringify({
        type: "chat",
        receiver: currentChat,
        message: inp.value.trim()
    }));
    
    inp.value = '';
    inp.focus();
};

// Keyboard Enter to Send (Original Listener)
document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && document.activeElement.id === 'msg-input') {
        e.preventDefault();
        window.sendMyMessage();
    }
});

// ============================================
// MOBILE SIDEBAR ENHANCEMENTS (New Additions)
// ============================================

/**
 * Toggle mobile sidebar visibility
 * Call this from your mobile menu button
 */
window.toggleMobileSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    const isOpen = sidebar.classList.contains('open');
    sidebar.classList.toggle('open');
    
    // Lock body scroll on mobile when sidebar open
    if (window.innerWidth <= 768) {
        document.body.style.overflow = isOpen ? '' : 'hidden';
    }
};

/**
 * Close mobile sidebar (utility function)
 */
function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth <= 768 && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        document.body.style.overflow = '';
    }
}

// Click outside to close sidebar (Mobile)
document.addEventListener('click', function(e) {
    if (window.innerWidth > 768) return;
    
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.querySelector('.mobile-menu');
    
    if (sidebar && sidebar.classList.contains('open') && 
        !sidebar.contains(e.target) && 
        menuBtn && !menuBtn.contains(e.target)) {
        closeMobileSidebar();
    }
});

// Reset sidebar on window resize
window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
        document.body.style.overflow = '';
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('open');
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (ws) {
        ws.close(1000, 'Page closing');
    }
});

// Console branding
console.log('%c🔥 IdlyCall Pro Loaded', 'color: #FF7A00; font-size: 16px; font-weight: bold;');