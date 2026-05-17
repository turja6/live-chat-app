// Example Plugin
(function InitExamplePlugin() {
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

    window.ChatHooks.onMessageRender.push(function(msg) {
        if (msg.type === "chat" && msg.content && !msg.content.startsWith("data:")) {
            msg.content = msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        }
        return msg;
    });
})();
