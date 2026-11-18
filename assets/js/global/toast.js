window.globalToastTimeout = null;

window.showToast = function(msg, actionData = null) {
    try {
        const toast = document.getElementById('globalToast');
        if (!toast) return;

        toast.innerHTML = msg || '';

        if (actionData) {
            toast.classList.add('cursor-pointer');
            toast.classList.remove('cursor-default');
            toast.innerHTML += ' ' + (window.EnkaIcons?.render('chevron-right', 18, 'auto', 'ml-2 opacity-90 shrink-0') || '') + '';

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
