let ws;
let myUsername = localStorage.getItem("chat_username");
let myPicBase64 = localStorage.getItem("chat_pic") || "";
let currentChat = "Public";

function processImage(e, tid) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
        document.getElementById(tid).src = ev.target.result;
        myPicBase64 = ev.target.result;
    };
    reader.readAsDataURL(file);
}

window.manualLogin = function() {
    const input = document.getElementById("usernameInput");
    if (!input || !input.value.trim()) return alert("Enter a name!");
    myUsername = input.value.trim();
    localStorage.setItem("chat_username", myUsername);
    startApp();
};

function startApp() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-container").style.display = "flex";

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${protocol}://${location.host}/ws/${myUsername}`);

    ws.onopen = () => ws.send(JSON.stringify({ pic: myPicBase64 }));

    ws.onmessage = (e) => {
        const d = JSON.parse(e.data);
        if (d.type === "chat") {
            if (d.sender !== myUsername) document.getElementById("chatSound").play().catch(()=>{});
            drawMessage(d.message, d.sender, d.profile_pic, d.timestamp);
        } else if (d.type === "user_list") {
            updateSidebar(d.data);
        }
    };
}

function drawMessage(text, sender, pic, time) {
    const stream = document.getElementById('chat-stream');
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `
        <img src="${pic || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}" class="msg-avatar">
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
    container.innerHTML = users.map(u => `
        <div class="user-item" onclick="window.switchChat('${u.username}')">
            <img src="${u.profile_pic || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}" width="30" height="30" style="border-radius:50%; margin-right:10px;">
            <span>${u.username}</span>
        </div>
    `).join('');
}

window.sendMyMessage = function() {
    const inp = document.getElementById("msg-input");
    if (!inp.value.trim()) return;
    ws.send(JSON.stringify({ type: "chat", receiver: currentChat, message: inp.value }));
    inp.value = "";
};

window.switchChat = function(target) {
    currentChat = target;
    document.getElementById("chatHeaderTitle").innerText = target;
    document.getElementById("chat-stream").innerHTML = "";
    ws.send(JSON.stringify({ type: "get_history", target: target }));
};

// Keyboard support
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && document.activeElement.id === 'msg-input') window.sendMyMessage();
});