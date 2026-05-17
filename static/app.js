// --- HOOK SYSTEM ---
window.ChatHooks = {
    onMessageRender: [],
    onMessageSend: [],
    onUIReady: [],
    
    trigger(hookName, payload) {
        let result = payload;
        if (this[hookName]) {
            this[hookName].forEach(callback => {
                result = callback(result);
            });
        }
        return result;
    }
};

// --- PLUGIN LOADER ---
const activePlugins = [
    '/static/plugins/example_plugin.js' 
];

activePlugins.forEach(pluginUrl => {
    const script = document.createElement('script');
    script.src = pluginUrl;
    script.onload = () => console.log(`[Plugin Loaded] ${pluginUrl}`);
    document.body.appendChild(script);
});

// --- CORE APP STATE ---
let ws;
let heartbeat;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let myUsername = "";
let myPicBase64 = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";
let currentChat = "Public";
let userList = [];
let isTyping = false;
let typingTimeout;
let currentlyTypingUsers = new Set();
let indicatorTimeout;
let replyingTo = null;
let contextMenuTarget = null;
let messageStore = [];

const emojis = ['😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤔', '😮', '😢', '😡', '🤯', '🥳', '😎', '🤫', '👀', '👋', '🙏', '💪', '🎉', '✨', '💯', '🚀', '🔥', '❤️', '👍', '👎', '☕', '🍕', '🍔', '🎵', '😴', '🤗', '😏', '🫡', '💀', '👻', '🤖', '🌈', '⭐', '💡', '📌', '🎯', '🏆', '🧠', '💎', '🌟'];
const DEFAULT_AVATAR = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";

window.onload = () => {
    loadTheme();
    initEmojiPicker();
    loadSession();
    const inputField = document.getElementById("msgInput");
    inputField.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMsg(); });
    document.addEventListener('click', () => { const ctx = document.getElementById('context-menu'); if (ctx) ctx.classList.remove('active'); });
    document.addEventListener('click', (e) => { const picker = document.getElementById('emoji-picker'); if (picker && picker.classList.contains('active')) { if (!e.target.closest('.emoji-picker') && !e.target.closest('.input-action-btn')) { picker.classList.remove('active'); } } });
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', () => { document.documentElement.style.setProperty('--vh', `${window.visualViewport.height * 0.01}px`); }); }
    setTimeout(() => window.ChatHooks.trigger('onUIReady', null), 500);
};

function loadSession() {
    try {
        const savedName = localStorage.getItem("idly_user");
        const savedPic = localStorage.getItem("idly_pic");
        const savedChat = localStorage.getItem("idly_chat");
        if (savedName) { document.getElementById("username").value = savedName; myUsername = savedName; }
        if (savedPic) { myPicBase64 = savedPic; document.getElementById("login-preview").src = savedPic; }
        if (savedChat) currentChat = savedChat;
    } catch (e) {}
}

function initEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    picker.innerHTML = '';
    emojis.forEach(e => {
        const btn = document.createElement('button');
        btn.className = 'emoji-btn'; btn.innerText = e;
        btn.onclick = (ev) => { ev.stopPropagation(); insertEmoji(e); };
        picker.appendChild(btn);
    });
}

function insertEmoji(emoji) {
    const input = document.getElementById('msgInput');
    const start = input.selectionStart; const end = input.selectionEnd;
    const text = input.value;
    input.value = text.substring(0, start) + emoji + text.substring(end);
    input.selectionStart = input.selectionEnd = start + emoji.length;
    input.focus();
}

function connect() {
    myUsername = document.getElementById("username").value.trim();
    if (!myUsername) { showToast("Please enter a username", "error"); return; }
    try { localStorage.setItem("idly_user", myUsername); localStorage.setItem("idly_pic", myPicBase64); localStorage.setItem("idly_chat", currentChat); } catch(e) {}
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-container").style.display = "flex";
    updateFooterProfile(); updateHeader();
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${protocol}://${window.location.host}/ws/${myUsername}`);

    ws.onopen = function() {
        updateConnectionStatus(true); reconnectAttempts = 0;
        this.send(JSON.stringify({ type: "connect_init", pic: myPicBase64, target: currentChat }));
        heartbeat = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" })); }, 25000);
        showToast("Connected successfully", "success");
    };

    ws.onmessage = (event) => {
        try {
            let data = JSON.parse(event.data);
            data = window.ChatHooks.trigger('onMessageRender', data);
            if (!data) return; 
            handleWsMessage(data);
        } catch (err) {}
    };

    ws.onclose = () => { clearInterval(heartbeat); updateConnectionStatus(false); attemptReconnect(); };
    ws.onerror = () => { updateConnectionStatus(false); showToast("Connection error", "error"); };
}

function attemptReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) { showToast("Could not reconnect.", "error"); return; }
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
    reconnectAttempts++; updateConnectionStatus(false); showToast(`Reconnecting in ${delay/1000}s...`, "error");
    setTimeout(() => { connect(); }, delay);
}

function updateConnectionStatus(connected) {
    const dot = document.getElementById('connection-dot');
    const text = document.getElementById('connection-text');
    if (dot && text) {
        if (connected) { dot.className = 'connection-dot'; text.textContent = 'Connected'; }
        else { dot.className = 'connection-dot disconnected'; text.textContent = reconnectAttempts > 0 ? 'Reconnecting...' : 'Disconnected'; }
    }
}

function handleWsMessage(data) {
    switch(data.type) {
        case "history": renderHistory(data); break;
        case "chat": handleIncomingChat(data); break;
        case "user_list": handleUserList(data); break;
        case "typing": handleTypingIndicator(data); break;
    }
}

function renderHistory(data) {
    const msgs = document.getElementById("messages"); msgs.innerHTML = ""; messageStore = [];
    if (!data.data || data.data.length === 0) { msgs.innerHTML = `<div class="welcome-message"><h3>Welcome to ${currentChat === 'Public' ? 'Public Lobby' : currentChat}!</h3><p>No messages yet.</p></div>`; }
    else { data.data.forEach(m => drawMessage(m, false)); scrollToBottom(); }
}

function handleIncomingChat(data) {
    const isPublic = data.receiver === "Public"; const isForMe = data.receiver === myUsername; const isFromMe = data.sender === myUsername;
    let show = false;
    if (currentChat === "Public" && isPublic) show = true;
    else if (currentChat !== "Public") { if (isFromMe && data.receiver === currentChat) show = true; if (data.sender === currentChat && isForMe) show = true; }
    if (show) { drawMessage(data, true); scrollToBottom(); } else if (!isFromMe) { showToast(`New message`, "success"); }
}

function drawMessage(msg, isNew = true) {
    const msgs = document.getElementById("messages");
    const welcomeEl = msgs.querySelector('.welcome-message'); if (welcomeEl) welcomeEl.remove();
    const div = document.createElement("div"); div.className = "message-group";
    const isMe = msg.sender === myUsername; if (isMe) div.classList.add("own-message");
    const safePic = msg.profile_pic || DEFAULT_AVATAR;
    const timeStr = msg.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgId = msg.id || 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    messageStore.push({ id: msgId, sender: msg.sender, content: msg.content, timestamp: timeStr });

    const isImage = msg.content && (msg.content.startsWith("data:image") || (msg.content.includes("http") && msg.content.match(/\.(jpeg|jpg|gif|png|webp)/i)));
    const isFile = msg.content && msg.content.startsWith("data:text/plain"); 
    
    let contentHtml = "";
    if (isImage) { contentHtml = `<img src="${msg.content}" class="msg-image" onclick="openLightbox('${msg.content.replace(/'/g, "\\'")}')">`; }
    else if (isFile) { contentHtml = `<a href="${msg.content}" download="${escapeHtml(msg.fileName || 'document.txt')}" class="file-bubble" onclick="event.stopPropagation()"><div class="file-icon">📄</div><div class="file-info"><div class="file-name">${escapeHtml(msg.fileName || 'document.txt')}</div><div class="file-download-text">Click to download</div></div></a>`; }
    else { contentHtml = `<div class="msg-bubble">${escapeHtml(msg.content)}</div>`; }

    let replyHtml = "";
    if (msg.reply_to) {
        const replyTextDisplay = msg.reply_to_text ? escapeHtml(msg.reply_to_text.substring(0, 80)) : 'Attachment';
        replyHtml = `<div class="msg-reply-context" onclick="scrollToMessage('${msg.reply_to_id || ''}')"><strong>${escapeHtml(msg.reply_to_name || 'Unknown')}</strong><br><span style="color:var(--text-muted)">${replyTextDisplay}</span></div>`;
    }

    if (isMe) {
        div.innerHTML = `<div class="message" data-me="true" data-msg-id="${msgId}" oncontextmenu="showMessageContext(event, '${msgId}', '${escapeHtml(msg.content).replace(/'/g, "\\'")}', '${escapeHtml(msg.sender)}')"><div class="msg-avatar-spacer"><img src="${safePic}" class="msg-avatar"></div><div class="msg-content"><div class="msg-header"><span class="msg-time">${timeStr}</span><span class="msg-name">You</span></div>${replyHtml}${contentHtml}</div></div>`;
    } else {
        div.innerHTML = `<div class="message" data-me="false" data-msg-id="${msgId}" oncontextmenu="showMessageContext(event, '${msgId}', '${escapeHtml(msg.content).replace(/'/g, "\\'")}', '${escapeHtml(msg.sender)}')"><div class="msg-avatar-spacer"><img src="${safePic}" class="msg-avatar"></div><div class="msg-content"><div class="msg-header"><span class="msg-name">${escapeHtml(msg.sender)}</span><span class="msg-time">${timeStr}</span></div>${replyHtml}${contentHtml}</div></div>`;
    }
    msgs.appendChild(div);
}

function handleUserList(data) { userList = data.users; renderSidebar(); }

function renderSidebar() {
    const container = document.getElementById("user-list-container");
    let html = `<div class="list-header">Channels</div><div class="user-item ${currentChat === 'Public' ? 'active' : ''}" onclick="switchChat('Public')"><div class="user-avatar-wrapper"><img src="https://cdn-icons-png.flaticon.com/512/1256/1256650.png" style="border-radius: 0;"></div><div class="user-info"><div class="name">Public Lobby</div></div></div>`;
    const onlineUsers = userList.filter(u => u.username !== myUsername && u.status === 'Online');
    const offlineUsers = userList.filter(u => u.username !== myUsername && u.status !== 'Online');
    html += `<div class="list-header">Online — ${onlineUsers.length}</div>`;
    onlineUsers.forEach(user => { html += createUserItem(user); });
    html += `<div class="list-header">Offline — ${offlineUsers.length}</div>`;
    offlineUsers.forEach(user => { html += createUserItem(user); });
    container.innerHTML = html;
}

function createUserItem(user) {
    const statusClass = user.status === "Online" ? "status-online" : "status-offline";
    const activeClass = currentChat === user.username ? "active" : "";
    const safePic = user.profile_pic || DEFAULT_AVATAR;
    return `<div class="user-item ${activeClass}" onclick="switchChat('${escapeHtml(user.username)}')"><div class="user-avatar-wrapper"><img src="${safePic}"><div class="status-indicator ${statusClass}"></div></div><div class="user-info"><div class="name">${escapeHtml(user.username)}</div></div></div>`;
}

function switchChat(target) {
    if (currentChat === target) return;
    currentChat = target;
    try { localStorage.setItem("idly_chat", currentChat); } catch(e) {}
    updateHeader(); renderSidebar(); cancelReply();
    document.getElementById("messages").innerHTML = `<div class="empty-state"><div class="empty-state-icon">💬</div><div class="empty-state-text">Loading messages...</div></div>`;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "get_history", target: currentChat }));
    closeSidebarMobile();
}

function sendMsg() {
    const input = document.getElementById("msgInput"); const text = input.value.trim(); if (!text) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
        let msgObj = { type: "chat", receiver: currentChat, pic: myPicBase64, content: text };
        if (replyingTo) {
            msgObj.reply_to_id = replyingTo.id; msgObj.reply_to_name = replyingTo.sender; msgObj.reply_to_text = replyingTo.content;
            replyingTo = null; document.getElementById('reply-preview').classList.remove('active');
        }
        msgObj = window.ChatHooks.trigger('onMessageSend', msgObj);
        if (!msgObj) return;
        ws.send(JSON.stringify(msgObj));
        input.value = ""; input.focus(); clearTimeout(typingTimeout); isTyping = false;
    } else { showToast("Not connected", "error"); }
}

function sendImage(e) {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast("Image too large. Max 10MB.", "error"); return; }
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas'); let width = img.width, height = img.height;
            if (width > 1000) { height *= 1000 / width; width = 1000; }
            if (height > 1000) { width *= 1000 / height; height = 1000; }
            canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            if (ws && ws.readyState === WebSocket.OPEN) {
                let msgObj = { type: "chat", receiver: currentChat, pic: myPicBase64, content: dataUrl };
                msgObj = window.ChatHooks.trigger('onMessageSend', msgObj);
                if (msgObj) ws.send(JSON.stringify(msgObj));
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file); e.target.value = '';
}

function handleTyping() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!isTyping) { isTyping = true; ws.send(JSON.stringify({ type: "typing", receiver: currentChat })); }
    clearTimeout(typingTimeout); typingTimeout = setTimeout(() => { isTyping = false; }, 1500);
}

function handleTypingIndicator(data) {
    if (data.sender === myUsername) return;
    if (currentChat === "Public" && data.receiver === "Public") currentlyTypingUsers.add(data.sender);
    else if (currentChat === data.sender) currentlyTypingUsers.add(data.sender);
    updateTypingUI();
    clearTimeout(indicatorTimeout); indicatorTimeout = setTimeout(() => { currentlyTypingUsers.clear(); updateTypingUI(); }, 3000);
}

function updateTypingUI() {
    const indicator = document.getElementById("typing-indicator"); const textSpan = document.getElementById("typing-text");
    const users = Array.from(currentlyTypingUsers);
    if (users.length > 0) {
        textSpan.innerText = users.length === 1 ? `${users[0]} is typing` : (users.length === 2 ? `${users[0]} and ${users[1]} are typing` : "Several people are typing");
        indicator.classList.add('visible');
    } else { indicator.classList.remove('visible'); }
}

function setReply(sender, content, id) {
    replyingTo = { sender, content, id };
    document.getElementById('reply-to-name').innerText = sender;
    document.getElementById('reply-to-text').innerText = content ? content.substring(0, 50) : "Attachment";
    document.getElementById('reply-preview').classList.add('active'); document.getElementById('msgInput').focus();
}

function cancelReply() { replyingTo = null; document.getElementById('reply-preview').classList.remove('active'); }

function showMessageContext(e, id, content, sender) {
    e.preventDefault(); e.stopPropagation(); contextMenuTarget = { id, content, sender };
    const ctx = document.getElementById('context-menu'); const deleteBtn = document.getElementById('ctx-delete-btn');
    deleteBtn.style.display = sender === myUsername ? 'flex' : 'none';
    let left = e.clientX; let top = e.clientY;
    if (left + 160 > window.innerWidth) left = window.innerWidth - 170;
    if (top + 120 > window.innerHeight) top = window.innerHeight - 130;
    ctx.style.left = left + 'px'; ctx.style.top = top + 'px'; ctx.classList.add('active');
}

function contextReply() { if (contextMenuTarget) setReply(contextMenuTarget.sender, contextMenuTarget.content, contextMenuTarget.id); document.getElementById('context-menu').classList.remove('active'); }
function contextCopy() {
    if (contextMenuTarget && contextMenuTarget.content) {
        if (contextMenuTarget.content.startsWith("data:")) showToast("Cannot copy attachment", "error");
        else navigator.clipboard.writeText(contextMenuTarget.content).then(() => showToast("Copied", "success")).catch(() => showToast("Failed to copy", "error"));
    }
    document.getElementById('context-menu').classList.remove('active');
}
function contextDelete() {
    if (contextMenuTarget && contextMenuTarget.sender === myUsername) {
        const msgEl = document.querySelector(`[data-msg-id="${contextMenuTarget.id}"]`);
        if (msgEl) {
            const group = msgEl.closest('.message-group');
            if (group) { group.style.transition = 'opacity 0.3s, transform 0.3s'; group.style.opacity = '0'; group.style.transform = 'scale(0.95)'; setTimeout(() => group.remove(), 300); messageStore = messageStore.filter(m => m.id !== contextMenuTarget.id); }
        }
    } else showToast("Cannot delete", "error");
    document.getElementById('context-menu').classList.remove('active');
}

function escapeHtml(text) { return text ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") : ""; }
function scrollToBottom() { const msgs = document.getElementById("messages"); requestAnimationFrame(() => msgs.scrollTop = msgs.scrollHeight); }
function scrollToMessage(msgId) {
    if (!msgId) return;
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); const group = el.closest('.message-group'); if (group) { group.style.background = 'rgba(99, 102, 241, 0.15)'; setTimeout(() => { group.style.background = ''; }, 1500); } }
}

function updateHeader() {
    const title = document.getElementById("chat-header-title"); const sub = document.getElementById("chat-header-subtitle");
    if (currentChat === "Public") { title.innerText = "# Public Lobby"; sub.innerText = "Everyone sees this"; }
    else { title.innerText = `@ ${currentChat}`; sub.innerText = "Direct Message"; }
}

function updateFooterProfile() {
    const avatarEl = document.getElementById("my-avatar-footer"); const nameEl = document.getElementById("my-username-footer");
    if (avatarEl) avatarEl.src = myPicBase64; if (nameEl) nameEl.innerText = myUsername;
}

function processImage(e, targetId) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas'); let width = img.width, height = img.height;
            if (width > 800) { height *= 800 / width; width = 800; }
            if (height > 800) { width *= 800 / height; height = 800; }
            canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height); const b64 = canvas.toDataURL('image/jpeg', 0.8);
            const target = document.getElementById(targetId); if (target) target.src = b64;
            if (targetId === 'login-preview') myPicBase64 = b64;
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function updateProfilePic(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas'); let width = img.width, height = img.height;
            if (width > 800) { height *= 800 / width; width = 800; }
            if (height > 800) { width *= 800 / height; height = 800; }
            canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height); const b64 = canvas.toDataURL('image/jpeg', 0.8);
            myPicBase64 = b64; updateFooterProfile();
            if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "update_profile", pic: myPicBase64, target: currentChat }));
            try { localStorage.setItem("idly_pic", myPicBase64); } catch(e) {}
            showToast("Profile picture updated", "success");
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file); e.target.value = '';
}

function filterUsers() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const items = document.querySelectorAll('.user-item');
    items.forEach(item => { const name = item.querySelector('.name'); if (name) item.style.display = name.innerText.toLowerCase().includes(query) ? 'flex' : 'none'; });
}

function forceSync() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        document.getElementById("messages").innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔄</div><div class="empty-state-text">Syncing messages...</div></div>`;
        ws.send(JSON.stringify({ type: "get_history", target: currentChat })); showToast("Syncing...", "success");
    }
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebar-overlay').classList.toggle('active'); }
function closeSidebarMobile() { if (window.innerWidth <= 768) { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('active'); } }
function toggleEmojiPicker() { document.getElementById('emoji-picker').classList.toggle('active'); }
function openSettings() { document.getElementById('settings-modal').classList.add('active'); }
function closeSettings() { document.getElementById('settings-modal').classList.remove('active'); }

function loadTheme() { const theme = localStorage.getItem('idly_theme') || 'dark'; document.body.setAttribute('data-theme', theme); document.getElementById('theme-toggle').checked = (theme === 'dark'); }
function toggleTheme() { const isDark = document.getElementById('theme-toggle').checked; const theme = isDark ? 'dark' : 'light'; document.body.setAttribute('data-theme', theme); localStorage.setItem('idly_theme', theme); }
function clearData() { if (confirm("Clear local data?")) { localStorage.clear(); location.reload(); } }
function openLightbox(src) { document.getElementById('lightbox-img').src = src; document.getElementById('lightbox').classList.add('active'); }
function closeLightbox() { document.getElementById('lightbox').classList.remove('active'); }

function showToast(message, type = "") {
    const container = document.getElementById('toast-container'); const toast = document.createElement('div');
    toast.className = 'toast'; if (type) toast.classList.add(type); toast.textContent = message; container.appendChild(toast);
    setTimeout(() => { toast.style.transition = 'opacity 0.3s, transform 0.3s'; toast.style.opacity = '0'; toast.style.transform = 'translateX(30px)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeLightbox(); closeSettings(); cancelReply(); document.getElementById('emoji-picker').classList.remove('active'); document.getElementById('context-menu').classList.remove('active'); closeSidebarMobile(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); const searchInput = document.getElementById('searchInput'); if (searchInput) searchInput.focus(); }
});
window.addEventListener('resize', () => { if (window.innerWidth > 768) { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('active'); } });
window.addEventListener('online', () => { showToast("You're back online", "success"); updateConnectionStatus(ws && ws.readyState === WebSocket.OPEN); });
window.addEventListener('offline', () => { showToast("You're offline", "error"); updateConnectionStatus(false); });
document.getElementById('app-container')?.addEventListener('contextmenu', (e) => { if (!e.target.closest('.message')) e.preventDefault(); });
