window.copyProductLink = function(btn) {
    try {
        if (btn?.style) {
            btn.style.transform = 'scale(0.9)';
            setTimeout(() => {
                if (btn?.style) btn.style.transform = '';
            }, 200);
        }

        const url = window.location.href;

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(url)
                .then(() => {
                    window.showToast?.('ბმული დაკოპირდა', { type: 'link', url });
                })
                .catch(() => {
                    fallbackCopyText(url);
                });
        } else {
            fallbackCopyText(url);
        }
    } catch (error) {
        console.error('Error copying product link:', error);
    }
};

function fallbackCopyText(url) {
    try {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
        window.showToast?.('ბმული დაკოპირდა', { type: 'link', url });
    } catch (err) {
        console.error('Fallback copy failed:', err);
    }
}
