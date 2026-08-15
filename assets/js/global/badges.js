window.updateBadges = function() {
    try {
        const favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
        const orders = JSON.parse(localStorage.getItem('myOrders') || '[]');

        const favCount = Array.isArray(favs) ? favs.length : 0;
        const ordersCount = Array.isArray(orders) ? orders.length : 0;

        document.querySelectorAll('.fav-badge').forEach((el) => {
            if (!el) return;
            el.innerText = String(favCount);
            el.style.display = favCount > 0 ? 'flex' : 'none';
        });

        document.querySelectorAll('.orders-badge').forEach((el) => {
            if (!el) return;
            el.innerText = String(ordersCount);
            el.style.display = ordersCount > 0 ? 'flex' : 'none';
        });
    } catch (error) {
        console.error('Error updating badges:', error);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.updateBadges?.());
} else {
    window.updateBadges?.();
}
