(function() {
    console.log("Chatbox Style Plugin Loading...");

    // 1. Inject the CSS
    const style = document.createElement('style');
    style.innerHTML = `
        /* Paste the CSS from your search bar code here */
        /* Note: Ensure you scope these styles to your chat input */
        .input-wrapper { background: transparent !important; border: none !important; }
        .input-wrapper:focus-within { box-shadow: none !important; }
        
        #poda { display: flex; align-items: center; justify-content: center; width: 100%; }
        /* Add the rest of the .input, #poda, #main, .white, .border, .glow CSS here */
    `;
    document.head.appendChild(style);

    // 2. Wrap your existing input in the new structure
    const inputWrapper = document.querySelector('.input-wrapper');
    const msgInput = document.getElementById('msgInput');
    
    // Create the container structure
    const newContainer = document.createElement('div');
    newContainer.id = 'poda';
    newContainer.innerHTML = `
        <div class="glow"></div>
        <div class="darkBorderBg"></div>
        <div class="darkBorderBg"></div>
        <div class="darkBorderBg"></div>
        <div class="white"></div>
        <div class="border"></div>
        <div id="main"></div>
    `;
    
    // Move the input into the new #main div
    const mainDiv = newContainer.querySelector('#main');
    mainDiv.appendChild(msgInput);
    
    // Replace the old wrapper with the new animated one
    inputWrapper.parentNode.replaceChild(newContainer, inputWrapper);
})();