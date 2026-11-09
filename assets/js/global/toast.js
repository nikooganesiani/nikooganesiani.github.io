window.globalToastTimeout = null;

window.showToast = function(msg, actionData = null) {
    try {
        const toast = document.getElementById('globalToast');
        if (!toast) return;

        toast.innerHTML = msg || '';

        if (actionData) {
            toast.classList.add('cursor-pointer');
            toast.classList.remove('cursor-default');
            toast.innerHTML += ' <svg width="18" height="18" class="ml-2 opacity-90 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M8.3 4.3a1 1 0 0 1 1.4 0l7 7a1 1 0 0 1 0 1.4l-7 7a1 1 0 1 1-1.4-1.4l6.3-6.3-6.3-6.3a1 1 0 0 1 0-1.4"/></svg>';

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
            toast.classList.add('cursor-default');
            toast.classList.remove('cursor-pointer');
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
