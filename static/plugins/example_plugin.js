// Example Plugin: Markdown formatter + Theme switch button
(function InitExamplePlugin() {
    
    // 1. Hook into UI Ready to mount elements
    window.ChatHooks.onUIReady.push(function() {
        const headerActions = document.getElementById("mount-header-actions");
        if (headerActions) {
            const btn = document.createElement("button");
            btn.className = "icon-btn";
            btn.innerHTML = "✨";
            btn.title = "Hello from Plugin!";
            btn.onclick = () => alert("Plugin Engine is working perfectly!");
            headerActions.prepend(btn);
        }
    });

    // 2. Hook into Message Render to inject formatting (e.g. bolding text)
    window.ChatHooks.onMessageRender.push(function(msg) {
        if (msg.type === "chat" && msg.content && !msg.content.startsWith("data:")) {
            // Very simple markdown bold parser for **text**
            msg.content = msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        }
        return msg;
    });

    console.log("🧩 Example Plugin successfully attached to hooks!");
})();
