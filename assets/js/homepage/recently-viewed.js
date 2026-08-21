document.addEventListener('DOMContentLoaded', function() {
    const recentSection = document.getElementById('recentlyViewedSection');
    const recentScroll = document.getElementById('recentScroll');

    if (!recentSection || !recentScroll) return;

    let recentIds = [];
    try {
        recentIds = JSON.parse(localStorage.getItem('recentIds') || '[]');
    } catch (e) {
        recentIds = [];
    }

    if (!Array.isArray(recentIds) || recentIds.length === 0) return;

    const apiUrl = window.CATALOG_API_URL || 'https://api.enkaelectronics.com.ge/catalog';

    fetch(apiUrl)
        .then(r => {
            if (!r.ok) throw new Error('Catalog fetch error');
            return r.json();
        })
        .then(data => {
            const productsList = (data && data.products) ? data.products : (Array.isArray(data) ? data : []);
            if (!productsList.length) return;

            const recentProducts = recentIds
                .map(id => productsList.find(p => String(p.id) === String(id)))
                .filter(Boolean);

            if (recentProducts.length > 0 && typeof window.createProductCardHTML === 'function') {
                recentScroll.innerHTML = recentProducts.map(p => window.createProductCardHTML(p, 'rec')).join('');
                recentSection.style.display = 'block';

                if (recentProducts.length <= 4) {
                    const arrowL = document.getElementById('recentArrowLeft');
                    const arrowR = document.getElementById('recentArrowRight');
                    if (arrowL) arrowL.style.display = 'none';
                    if (arrowR) arrowR.style.display = 'none';
                }
            }
        })
        .catch(err => {
            console.error('Error rendering recently viewed products:', err);
        });
});
