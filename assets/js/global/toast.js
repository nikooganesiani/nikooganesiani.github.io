window.globalToastTimeout = null;

window.showToast = function(msg, actionData = null) {
    try {
        const toast = document.getElementById('globalToast');
        if (!toast) return;

        toast.innerHTML = msg || '';

        if (actionData) {
            toast.style.cursor = 'pointer';
            toast.innerHTML += ' <svg width="18" height="18" class="ml-2 opacity-90 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>';

            toast.onclick = function() {
                if (actionData === 'fav') {
                    window.openFavorites?.();
                } else if (actionData && actionData.type === 'link') {
                    const copiedTextEl = document.getElementById('copiedLinkText');
                    if (copiedTextEl) {
                        copiedTextEl.innerText = actionData.url || '';
                    }
                    window.openAppModal?.('linkModal');
                }
                toast.classList.remove('show');
            };
        } else {
            toast.style.cursor = 'default';
            toast.onclick = function() {
                toast.classList.remove('show');
            };
        }

        toast.classList.add('show');
        clearTimeout(window.globalToastTimeout);
        window.globalToastTimeout = setTimeout(() => {
            toast?.classList.remove('show');
        }, 4000);
    } catch (error) {
        console.error('Error showing toast:', error);
    }
};
