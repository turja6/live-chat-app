/* ==========================================
   IDLYCALL CORE ENGINE - FINAL FIX
   ========================================== */

let ws;
let myUsername = localStorage.getItem("chat_username");
let myPicBase64 = localStorage.getItem("chat_pic") || "";
let currentChat = "Public";

// Safe Audio Check
const getChatSound = () => document.getElementById("chatSound");

function manualLogin() {
    console.log("Login triggered...");
    const input = document.getElementById("usernameInput");
    
    if (!input) {
        console.error("CRITICAL: usernameInput element not found in HTML!");
        alert("System Error: Login input missing. Check your index.html");
        return;
    }
    
    const val = input.value.trim();
    if (!val) {
        alert("Please enter a username!");
        return;
    }

    myUsername = val;
    localStorage.setItem("chat_username", myUsername);
    
    // Unlock audio for browser
    const snd = getChatSound();
    if (snd) { snd.play().catch(() => {}); snd.pause(); }

    startApp();
}

function startApp() {
    console.log("Starting App for user:", myUsername);
    const loginScreen = document.getElementById("login-screen");
    const appContainer = document.getElementById("app-container");

    if (loginScreen) loginScreen.style.display = "none";
    if (appContainer) appContainer.style.display = "flex";

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${protocol}://${window.location.host}/ws/${myUsername}`);

    ws.onopen = () => {
        console.log("WebSocket Connected Successfully!");
        ws.send(JSON.stringify({ pic: myPicBase64 }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "chat") {
            const snd = getChatSound();
            if (data.sender !== myUsername && snd) snd.play().catch(() => {});
            drawMessage(data.message, data.sender, data.profile_pic, data.timestamp);
        } else if (data.type === "user_list") {
            updateSidebar(data.data);
        }
    };

    ws.onerror = (err) => console.error("WebSocket Error:", err);
}

function drawMessage(text, sender, pic, time) {
    const stream = document.getElementById('chat-stream');
    if (!stream) return;
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `
        <img src="${pic || '/static/IC.png'}" class="msg-avatar">
        <div>
            <span class="msg-sender">${sender}</span><span class="msg-time">${time || ''}</span>
            <div class="msg-content">${text}</div>
        </div>
    `;
    stream.appendChild(div);
    stream.scrollTop = stream.scrollHeight;
}

function updateSidebar(users) {
    const container = document.getElementById('user-list-container');
    if(!container) return;
    container.innerHTML = users.map(u => `
        <div class="user-item" onclick="switchChat('${u.username}')">
            <img src="${u.profile_pic || '/static/IC.png'}">
            <span>${u.username}</span>
        </div>
    `).join('');
}

function switchChat(target) {
    currentChat = target;
    document.getElementById("chatHeaderTitle").innerText = target;
    document.getElementById("chat-stream").innerHTML = "";
    ws.send(JSON.stringify({ type: "get_history", target: target }));
}

function sendMyMessage() {
    const inp = document.getElementById("msg-input");
    if(!inp || !inp.value.trim()) return;
    ws.send(JSON.stringify({ type: "chat", receiver: currentChat, message: inp.value }));
    inp.value = "";
}

// FORCE GLOBAL ACCESS
window.manualLogin = manualLogin;
window.sendMyMessage = sendMyMessage;
window.switchChat = switchChat;

console.log("IDLYCALL BRAIN LOADED AND READY.");