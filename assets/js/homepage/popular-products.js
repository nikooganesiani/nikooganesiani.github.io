document.addEventListener('DOMContentLoaded', function() {
    const popularSection = document.getElementById('popularSection');
    const popularScroll = document.getElementById('popularScroll');

    if (!popularSection || !popularScroll) return;

    const rawIds = popularSection.dataset.popularIds || '';
    const popularIds = rawIds.split(',').map(id => id.trim()).filter(Boolean);

    if (popularIds.length === 0) return;

    const apiUrl = window.CATALOG_API_URL || 'https://api.enkaelectronics.com.ge/catalog';

    fetch(apiUrl)
        .then(r => {
            if (!r.ok) throw new Error('Catalog fetch error');
            return r.json();
        })
        .then(data => {
            const productsList = (data && data.products) ? data.products : (Array.isArray(data) ? data : []);
            if (!productsList.length) return;

            // Находим товары согласно списку и сохраняем исходный порядок из YAML
            const popularProducts = popularIds
                .map(id => productsList.find(p => String(p.id) === String(id) || String(p.sku) === String(id)))
                .filter(Boolean);

            if (popularProducts.length > 0 && typeof window.createProductCardHTML === 'function') {
                popularScroll.innerHTML = popularProducts.map(p => window.createProductCardHTML(p, 'pop')).join('');
                popularSection.style.display = 'block';

                if (popularProducts.length <= 4) {
                    const arrowL = document.getElementById('popularArrowLeft');
                    const arrowR = document.getElementById('popularArrowRight');
                    if (arrowL) arrowL.style.display = 'none';
                    if (arrowR) arrowR.style.display = 'none';
                }
            }
        })
        .catch(err => {
            console.error('Error rendering popular products:', err);
        });
});
