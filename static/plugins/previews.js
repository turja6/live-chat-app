/* PLUGIN: Link Previews
   Description: Renders rich embeds for URLs found in messages.
*/

class LinkPreviews {
    static render(messageElement, previewData) {
        if (!previewData || messageElement.querySelector('.link-preview-card')) return;

        const card = document.createElement('div');
        card.className = 'link-preview-card';
        
        card.innerHTML = `
            <div class="preview-border"></div>
            <div class="preview-content">
                <div class="preview-site">${new URL(previewData.url).hostname}</div>
                <a href="${previewData.url}" target="_blank" class="preview-title">${previewData.title}</a>
                <div class="preview-desc">${previewData.description || ''}</div>
                ${previewData.image ? `<img src="${previewData.image}" class="preview-image">` : ''}
            </div>
        `;

        messageElement.querySelector('div').appendChild(card);
    }
}

console.log("Plugin: Link Previews Loaded");