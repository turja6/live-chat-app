/* ==========================================
   IDLYCALL CORE ENGINE
   ========================================== */

let ws;
let myUsername = localStorage.getItem("chat_username");
let myPicBase64 = localStorage.getItem("chat_pic") || "";
let currentChat = "Public";

// Audio
const chatSound = document.getElementById("chatSound");

function manualLogin() {
    console.log("Login triggered...");
    const input = document.getElementById("usernameInput");
    if (!input) return console.error("Input box not found!");
    
    myUsername = input.value.trim();
    if (!myUsername) return alert("Enter a name!");

    localStorage.setItem("chat_username", myUsername);
    startApp();
}

function startApp() {
    const loginScreen = document.getElementById("login-screen");
    const appContainer = document.getElementById("app-container");

    if (loginScreen) loginScreen.style.display = "none";
    if (appContainer) appContainer.style.display = "flex";

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${protocol}://${window.location.host}/ws/${myUsername}`);

    ws.onopen = () => {
        console.log("WebSocket Connected!");
        ws.send(JSON.stringify({ pic: myPicBase64 }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "chat") {
            if (data.sender !== myUsername) chatSound.play().catch(() => {});
            drawMessage(data.message, data.sender, data.profile_pic, data.timestamp);
        } else if (data.type === "user_list") {
            updateSidebar(data.data);
        }
    };
}

function drawMessage(text, sender, pic, time) {
    const stream = document.getElementById('chat-stream');
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

function sendMyMessage() {
    const inp = document.getElementById("msg-input");
    if(!inp.value.trim()) return;
    ws.send(JSON.stringify({ type: "chat", receiver: currentChat, message: inp.value }));
    inp.value = "";
}

// Global hook for the button in HTML
window.manualLogin = manualLogin;
window.sendMyMessage = sendMyMessage;