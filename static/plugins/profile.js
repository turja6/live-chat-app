(function() {
    // 1. Add these styles dynamically
    const style = document.createElement('style');
    style.innerHTML = `
        .profile-modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; align-items: center; justify-content: center; }
        .profile-modal-overlay.active { display: flex; }
        .profile-modal { background: var(--bg-secondary); padding: 20px; border-radius: 12px; width: 300px; max-width: 90vw; color: var(--text-primary); box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
        .profile-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .profile-modal-header h3 { margin: 0; font-size: 18px; }
        .profile-modal-close { background: none; border: none; color: var(--text-muted); font-size: 24px; cursor: pointer; line-height: 1; }
        .profile-form-group { margin-bottom: 16px; }
        .profile-form-group label { display: block; font-size: 13px; margin-bottom: 6px; color: var(--text-muted); }
        .profile-settings-input { width: 100%; padding: 8px 10px; background: var(--bg-input, var(--bg-primary)); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px; box-sizing: border-box; font-family: inherit; font-size: 14px; resize: vertical; }
        .profile-modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
        .profile-btn { padding: 10px 16px; cursor: pointer; border: none; border-radius: 6px; font-family: inherit; font-size: 14px; font-weight: 500; }
        .profile-btn-primary { background: var(--accent-primary); color: white; }
        .profile-btn-secondary { background: var(--bg-tertiary, var(--bg-primary)); color: var(--text-primary); border: 1px solid var(--border-color); }
        #open-profile-btn { width: 100%; margin-top: 8px; padding: 10px; cursor: pointer; border: none; border-radius: 6px; background: var(--bg-tertiary, var(--bg-primary)); color: var(--text-primary); font-family: inherit; text-align: center; font-size: 14px; }
        #open-profile-btn:hover { background: var(--accent-primary); color: white; }
    `;
    document.head.appendChild(style);

    // 2. Wait for the DOM to be fully ready before injecting UI
    const initProfileUI = () => {
        
        // Inject the Modal HTML into the body
        const modalHTML = `
            <div id="profile-modal" class="profile-modal-overlay">
                <div class="profile-modal">
                    <div class="profile-modal-header">
                        <h3>Edit Profile</h3>
                        <button class="profile-modal-close" onclick="document.getElementById('profile-modal').classList.remove('active')">&times;</button>
                    </div>
                    <div class="profile-modal-body">
                        <div class="profile-form-group">
                            <label>Avatar URL</label>
                            <input type="text" id="profile-avatar-input" class="profile-settings-input" placeholder="https://example.com/pic.jpg">
                        </div>
                        <div class="profile-form-group">
                            <label>Location</label>
                            <input type="text" id="profile-location-input" class="profile-settings-input" placeholder="e.g. New York, Earth">
                        </div>
                        <div class="profile-form-group">
                            <label>Bio</label>
                            <textarea id="profile-bio-input" class="profile-settings-input" rows="4" placeholder="Tell us about yourself..."></textarea>
                        </div>
                    </div>
                    <div class="profile-modal-footer">
                        <button class="profile-btn profile-btn-secondary" onclick="document.getElementById('profile-modal').classList.remove('active')">Cancel</button>
                        <button class="profile-btn profile-btn-primary" id="save-profile-btn">Save Profile</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Inject the "Edit Profile" Button (Appends to the sidebar footer area)
        const profileBtnHTML = `<button id="open-profile-btn">✏️ Edit Profile</button>`;
        const footerArea = document.querySelector('.sidebar-footer'); 
        if (footerArea) {
            footerArea.insertAdjacentHTML('beforeend', profileBtnHTML);
        }

        // Event Listeners
        document.addEventListener('click', (e) => {
            if (e.target.id === 'open-profile-btn') {
                document.getElementById('profile-modal').classList.add('active');
            }
            if (e.target.id === 'save-profile-btn') {
                saveProfile();
            }
        });

        // Save Profile Logic
        function saveProfile() {
            const avatar_url = document.getElementById('profile-avatar-input').value.trim();
            const location = document.getElementById('profile-location-input').value.trim();
            const bio = document.getElementById('profile-bio-input').value.trim();

            // Send via the plugin WebSocket bridge
            window.IdlyPlugins.sendToSocket({
                type: "update_profile",
                avatar_url: avatar_url,
                location: location,
                bio: bio
            });

            // Close modal
            document.getElementById('profile-modal').classList.remove('active');
            
            // Optional: Use existing toast function if available
            if (typeof showToast === 'function') showToast("Profile updating...", "success");
        }

        // WebSocket Hook: Listen for profile updates from other users (or self-confirmation)
        window.IdlyPlugins.messageHandlers["profile_updated"] = (data) => {
            console.log(`[Plugin] Profile updated for ${data.username}`);
            
            // If the update is for the current user, update local state immediately
            if (data.username === myUsername) {
                if (data.avatar_url && data.avatar_url !== myPicBase64) {
                    myPicBase64 = data.avatar_url;
                    if (typeof updateFooterProfile === 'function') updateFooterProfile();
                }
            }
            
            // Update sidebar to reflect new avatars/statuses
            if (typeof renderSidebar === 'function') renderSidebar(); 
        };
    };

    // Run initialization
    if (document.readyState === "complete" || document.readyState === "interactive") {
        initProfileUI();
    } else {
        document.addEventListener("DOMContentLoaded", initProfileUI);
    }
})();