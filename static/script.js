/**
 * IdlyCall Pro - Core Application Script
 * High-performance WebSocket chat client
 */

// State
let ws = null;
let myUsername = localStorage.getItem("chat_username") || "";
let myPicBase64 = localStorage.getItem("chat_pic") || "";
let currentChat = "Public";

// Default avatar fallback
const DEFAULT_AVATAR = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';

// ==========================================
// IMAGE PROCESSING
// ==========================================
function processImage(e, targetId) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(ev) {
        const el = document.getElementById(targetId);
        if (el) el.src = ev.target.result;
        myPicBase64 = ev.target.result;
    };
    reader.readAsDataURL(file);
}

// ==========================================
// AUTHENTICATION
// ==========================================
window.manualLogin = function() {
    const input = document.getElementById("usernameInput");
    const name = input?.value.trim();

    if (!name) {
        input?.focus();
        return;
    }

    myUsername = name;
    localStorage.setItem("chat_username", name);
    startApp();
};

// ==========================================
// APP INITIALIZATION
// ==========================================
function startApp() {
    // Toggle views
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-container").style.display = "flex";

    // Establish WebSocket
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/${encodeURIComponent(myUsername)}`);

    ws.onopen = () => {
        console.log("[WS] Connected");
        ws.send(JSON.stringify({ pic: myPicBase64 }));
    };

    ws.onmessage = (e) => {
        try {
            const d = JSON.parse(e.data);

            switch (d.type) {
                case "chat":
                    if (d.sender !== myUsername) playNotificationSound();
                    renderMessage(d.message, d.sender, d.profile_pic, d.timestamp);
                    break;

                case "user_list":
                    renderUserList(d.data);
                    break;

                case "history":
                    if (Array.isArray(d.messages)) {
                        d.messages.forEach(m => 
                            renderMessage(m.message, m.sender, m.profile_pic, m.timestamp)
                        );
                    }
                    break;

                default:
                    console.log("[WS] Unknown type:", d.type);
            }
        } catch (err) {
            console.error("[WS] Parse error:", err);
        }
    };

    ws.onclose = (e) => {
        console.log("[WS] Disconnected:", e.code);
        // Auto-reconnect after 3s (unless intentional close)
        if (e.code !== 1000 && myUsername) {
            setTimeout(() => {
                if (document.getElementById("app-container").style.display !== "none") {
                    startApp();
                }
            }, 3000);
        }
    };

    ws.onerror = (err) => {
        console.error("[WS] Error:", err);
    };
}

// ==========================================
// SOUND
// ==========================================
function playNotificationSound() {
    const audio = document.getElementById("chatSound");
    if (audio) audio.play().catch(() => {});
}

// ==========================================
// SANITIZATION
// ==========================================
function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ==========================================
// MESSAGE RENDERING (Optimized DOM ops)
// ==========================================
function renderMessage(text, sender, pic, time) {
    const container = document.getElementById("chat-stream");
    if (!container) return;

    // Build fragment to minimize reflows
    const frag = document.createDocumentFragment();

    const msgEl = document.createElement("div");
    msgEl.className = "message";

    const avatarSrc = pic || DEFAULT_AVATAR;

    msgEl.innerHTML = `
        <img class="msg-avatar" src="${avatarSrc}" alt="" loading="lazy">
        <div class="msg-body">
            <div class="msg-meta">
                <span class="msg-sender">${escapeHTML(sender)}</span>
                <span class="msg-time">${time || ""}</span>
            </div>
            <div class="msg-content">${escapeHTML(text)}</div>
        </div>
    `;

    frag.appendChild(msgEl);
    container.appendChild(frag);

    // Smart scroll - only scroll if near bottom
    requestAnimationFrame(() => {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        if (isNearBottom) {
            container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        }
    });
}

// ==========================================
// USER LIST RENDERING
// ==========================================
function renderUserList(users) {
    const container = document.getElementById("user-list-container");
    if (!container) return;

    if (!users || users.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:16px;text-align:center;font-size:13px;">No users online</p>';
        return;
    }

    const html = users.map(u => `
        <div class="user-item" onclick="switchChat('${escapeHTML(u.username)}')">
            <img src="${u.profile_pic || DEFAULT_AVATAR}" alt="" loading="lazy">
            <span>${escapeHTML(u.username)}</span>
        </div>
    `).join("");

    container.innerHTML = html;
}

// ==========================================
// CHAT SWITCHING
// ==========================================
window.switchChat = function(target) {
    currentChat = target;

    const title = document.getElementById("chatHeaderTitle");
    if (title) title.textContent = target;

    const stream = document.getElementById("chat-stream");
    if (stream) stream.innerHTML = "";

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "get_history", target }));
    }

    closeMobileSidebar();
};

// ==========================================
// SEND MESSAGE
// ==========================================
window.sendMyMessage = function() {
    const input = document.getElementById("msg-input");
    const text = input?.value.trim();

    if (!text) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert("Not connected");
        return;
    }

    ws.send(JSON.stringify({
        type: "chat",
        receiver: currentChat,
        message: text
    }));

    input.value = "";
    input.focus();
};

// ==========================================
// MOBILE SIDEBAR
// ==========================================
window.toggleMobileSidebar = function() {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;

    const isOpen = sidebar.classList.contains("open");
    sidebar.classList.toggle("open");

    if (window.innerWidth <= 768) {
        document.body.style.overflow = isOpen ? "" : "hidden";
    }
};

function closeMobileSidebar() {
    const sidebar = document.getElementById("sidebar");
    if (sidebar && window.innerWidth <= 768 && sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
        document.body.style.overflow = "";
    }
}

// ==========================================
// EVENT LISTENERS
// ==========================================

// Enter key to send
document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement.id === "msg-input") {
        e.preventDefault();
        window.sendMyMessage();
    }
});

// Click outside to close mobile sidebar
document.addEventListener("click", (e) => {
    if (window.innerWidth > 768) return;

    const sidebar = document.getElementById("sidebar");
    const menuBtn = document.querySelector(".mobile-menu");

    if (
        sidebar?.classList.contains("open") &&
        !sidebar.contains(e.target) &&
        menuBtn && !menuBtn.contains(e.target)
    ) {
        closeMobileSidebar();
    }
});

// Reset on resize
window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
        document.body.style.overflow = "";
        document.getElementById("sidebar")?.classList.remove("open");
    }
});

// Cleanup
window.addEventListener("beforeunload", () => {
    if (ws) ws.close(1000);
});

// Ready log
console.log("%c✓ IdlyCall Pro", "color:#FF7A00;font-weight:bold;font-size:14px;");