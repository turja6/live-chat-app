/* --- FIXED LOGIN LOGIC --- */
function manualLogin() {
    // 1. Get the username from the input box
    const input = document.getElementById("usernameInput");
    myUsername = input ? input.value.trim() : null;

    if (!myUsername) {
        alert("Please enter a username!");
        return;
    }

    // 2. Save to localStorage so you don't have to login every time
    localStorage.setItem("chat_username", myUsername);
    localStorage.setItem("chat_pic", myPicBase64);

    // 3. Play a silent sound to "unlock" audio in the browser (IMPORTANT for Discord sounds)
    chatSound.play().catch(() => {});
    chatSound.pause();

    // 4. Run the connection app
    startApp();
}

function startApp() {
    const loginScreen = document.getElementById("login-screen");
    const appContainer = document.getElementById("app-container");

    // Switch UI screens
    if (loginScreen) loginScreen.style.display = "none";
    if (appContainer) appContainer.style.display = "flex";

    // Connect WebSocket
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${protocol}://${window.location.host}/ws/${myUsername}`);

    ws.onopen = () => {
        ws.send(JSON.stringify({ pic: myPicBase64 }));
        console.log("Connected to IdlyCall Server");

        // --- SAFE PLUGIN LOADER ---
        // This ensures the app doesn't crash if a plugin file is missing
        if (typeof IdlyCallReactions !== 'undefined') {
            window.reactionsPlugin = new IdlyCallReactions(ws, myUsername);
        }
    };

    // Link the incoming message handler
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleIncomingData(data); // Create a central handler for cleanliness
    };
}

function handleIncomingData(data) {
    if (data.type === "chat") {
        handleIncomingChatMessage(data);
    } else if (data.type === "user_list") {
        updateSidebar(data.data);
    } else if (data.type === "history") {
        renderHistory(data.data);
    } else if (data.type === "reaction") {
        if (typeof IdlyCallReactions !== 'undefined') IdlyCallReactions.updateUI(data);
    } else if (data.type === "call_offer") {
        handleIncomingCall(data);
    } else if (data.type === "call_end") {
        forceEndCall();
    }
}