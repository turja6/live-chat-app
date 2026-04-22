/**
 * Link Previews Plugin
 * Generates preview cards for URLs shared in chat
 * Uses Open Graph meta tags or fallback icons
 */

(function() {
    'use strict';
    
    console.log("[PLUGIN] ✅ Link previews plugin loaded");
    
    const CACHE_DURATION = 3600000; // Cache for 1 hour
    const previewCache = new Map();
    
    /**
     * Initialize link preview scanning
     */
    function initLinkPreviews() {
        const chatStream = document.getElementById('chat-stream');
        
        if (!chatStream) {
            console.warn("[PREVIEWS] Chat stream not found");
            return;
        }
        
        // Use MutationObserver to detect new messages
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        scanForLinks(node);
                    }
                });
            });
        });
        
        observer.observe(chatStream, {
            childList: true,
            subtree: true
        });
        
        // Also scan existing messages
        scanExistingMessages();
        
        console.log("[PREVIEWS] ✓ Initialized");
    }
    
    /**
     * Scan existing messages for links
     */
    function scanExistingMessages() {
        const messages = document.querySelectorAll('.msg-content');
        messages.forEach(msg => {
            processLinksInElement(msg);
        });
    }
    
    /**
     * Scan a node for links
     * @param {Node} node
     */
    function scanForLinks(node) {
        if (node.classList?.contains('msg-content')) {
            processLinksInElement(node);
        }
        
        // Also check children
        if (node.querySelectorAll) {
            node.querySelectorAll('.msg-content').forEach(processLinksInElement);
        }
    }
    
    /**
     * Process links in an element
     * @param {HTMLElement} element
     */
    function processLinksInElement(element) {
        if (!element || !element.innerHTML) return;
        
        // Find URLs in text
        const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
        const urls = element.innerHTML.match(urlRegex);
        
        if (!urls) return;
        
        // Deduplicate
        const uniqueUrls = [...new Set(urls)];
        
        uniqueUrls.forEach(url => {
            generatePreview(url, element);
        });
    }
    
    /**
     * Generate preview card for URL
     * @param {string} url
     * @param {HTMLElement} parentElement
     */
    async function generatePreview(url, parentElement) {
        // Check cache first
        if (previewCache.has(url)) {
            const cached = previewCache.get(url);
            if (Date.now() - cached.timestamp < CACHE_DURATION) {
                insertPreviewCard(parentElement, url, cached.data);
                return;
            }
        }
        
        // Try to fetch metadata (may fail due to CORS)
        try {
            // Use a CORS proxy service or fetch directly
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
            
            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            
            clearTimeout(timeout);
            
            if (!response.ok) throw new Error('Failed to fetch');
            
            const data = await response.json();
            
            // Extract Open Graph data
            const ogData = extractOpenGraph(data);
            
            // Cache it
            previewCache.set(url, {
                timestamp: Date.now(),
                data: ogData
            });
            
            insertPreviewCard(parentElement, url, ogData);
            
        } catch (error) {
            console.warn(`[PREVIEWS] Could not fetch preview for ${url}: ${error.message}`);
            
            // Insert generic preview
            insertPreviewCard(parentElement, url, {
                title: extractDomain(url),
                description: url,
                image: null
            });
        }
    }
    
    /**
     * Extract Open Graph data from fetched HTML
     * @param {Object} data - Fetched data
     * @returns {Object} OG data
     */
    function extractOpenGraph(data) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(data.contents || '', 'text/html');
        
        const getMeta = (property) => {
            const el = doc.querySelector(`meta[property="${property}"]`) ||
                        doc.querySelector(`meta[name="${property}"]`);
            return el ? (el.getAttribute('content') || el.getAttribute('value')) : null;
        };
        
        return {
            title: getMeta('og:title') || doc.querySelector('title')?.textContent || '',
            description: getMeta('og:description') || getMeta('description') || '',
            image: getMeta('og:image') || getMeta('image') || '',
            url: getMeta('og:url') || data.status_url || ''
        };
    }
    
    /**
     * Extract domain from URL
     * @param {string} url
     * @returns {string}
     */
    function extractDomain(url) {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return url;
        }
    }
    
    /**
     * Insert preview card into DOM
     * @param {HTMLElement} parent
     * @param {string} url
     * @param {Object} data
     */
    function insertPreviewCard(parent, url, data) {
        // Check if we already inserted a preview for this URL
        const existingPreview = parent.querySelector(`.link-preview[data-url="${CSS.escape(url)}"]`);
        if (existingPreview) return;
        
        // Create preview card
        const card = document.createElement('a');
        card.className = 'link-preview';
        card.href = url;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.setAttribute('data-url', url);
        
        const hasImage = data.image && data.image.length > 0;
        
        card.innerHTML = `
            <div class="preview-content">
                ${hasImage ? `<img src="${escapeHTML(data.image)}" alt="" class="preview-image" loading="lazy" onerror="this.style.display='none'">` : ''}
                <div class="preview-info">
                    <div class="preview-title">${escapeHTML(data.title || 'Link')}</div>
                    <div class="preview-url">${extractDomain(url)}</div>
                    ${data.description ? `<div class="preview-desc">${escapeHTML(data.description.substring(0, 120))}${data.description.length > 120 ? '...' : ''}</div>` : ''}
                </div>
            </div>
        `;
        
        // Append after parent
        parent.appendChild(card);
    }
    
    /**
     * Escape HTML entities
     */
    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    // Polyfill for CSS.escape if needed
    if (!CSS.escape) {
        CSS.escape = function(str) {
            return str.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
        };
    }
    
    // Inject CSS
    const styles = document.createElement('style');
    styles.textContent = `
        .link-preview {
            display: block;
            margin-top: 8px;
            max-width: 400px;
            border-radius: 10px;
            overflow: hidden;
            background: var(--surface-mid, #141617);
            border: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
            text-decoration: none;
            color: inherit;
            transition: all 0.2s ease;
            animation: slideInPreview 0.25s ease;
        }
        
        .link-preview:hover {
            border-color: var(--border-hover, rgba(255,255,255,0.12));
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        
        .preview-content {
            display: flex;
            gap: 12px;
            padding: 12px;
        }
        
        .preview-image {
            width: 100px;
            height: 70px;
            object-fit: cover;
            border-radius: 6px;
            flex-shrink: 0;
            background: var(--surface-dark, #0e1011);
        }
        
        .preview-info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 4px;
        }
        
        .preview-title {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary, #f0f2f5);
            line-height: 1.3;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .preview-url {
            font-size: 11px;
            color: var(--text-muted, #6b7280);
        }
        
        .preview-desc {
            font-size: 12px;
            color: var(--text-secondary, #9ca3af);
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        
        @keyframes slideInPreview {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(styles);
    
    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLinkPreviews);
    } else {
        initLinkPreviews();
    }
    
    // Expose
    window.LinkPreviewsPlugin = {
        cache: previewCache,
        clearCache: () => previewCache.clear()
    };
})();