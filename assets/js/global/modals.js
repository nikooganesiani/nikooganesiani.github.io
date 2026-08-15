window.openAppModal = function(id) {
    try {
        const modal = typeof id === 'string' ? document.getElementById(id) : id;
        if (!modal) return;

        document.documentElement?.classList.add('modal-open');
        modal.style.display = 'flex';
        void modal.offsetHeight;
        modal.classList.add('active');

        if (id === 'searchModalMobile') {
            setTimeout(() => {
                document.getElementById('mobileSearchInput')?.focus?.();
            }, 100);
        }
    } catch (error) {
        console.error('Error opening modal:', error);
    }
};

window.closeAppModal = function(id) {
    try {
        const modal = typeof id === 'string' ? document.getElementById(id) : id;
        if (!modal) return;

        modal.classList.remove('active');

        if (modal.id === 'trackingModal') {
            const url = new URL(window.location.href);
            if (url.searchParams.has('orderstatus')) {
                url.searchParams.delete('orderstatus');
                window.history.pushState(null, '', url.pathname + url.search);
            }
        }

        if (!document.querySelector('.modal.active')) {
            document.documentElement?.classList.remove('modal-open');
        }

        setTimeout(() => {
            if (modal && !modal.classList.contains('active')) {
                modal.style.display = 'none';
            }
        }, 400);
    } catch (error) {
        console.error('Error closing modal:', error);
    }
};
