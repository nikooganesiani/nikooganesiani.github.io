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

    if (!window.CATALOG_API_URL) return;

    fetch(window.CATALOG_API_URL)
        .then(response => {
            if (!response.ok) throw new Error('Network error');
            return response.json();
        })
        .then(data => {
            if (!data || !Array.isArray(data.products)) return;

            const recentProducts = recentIds
                .map(id => data.products.find(p => String(p.id) === String(id)))
                .filter(Boolean);

            if (recentProducts.length > 0 && typeof window.createProductCardHTML === 'function') {
                recentSection.style.display = 'block';
                recentScroll.innerHTML = recentProducts.map(p => window.createProductCardHTML(p, 'rec')).join('');

                if (recentProducts.length <= 4) {
                    const arrowL = document.getElementById('recentArrowLeft');
                    const arrowR = document.getElementById('recentArrowRight');
                    if (arrowL) arrowL.style.display = 'none';
                    if (arrowR) arrowR.style.display = 'none';
                }
            }
        })
        .catch(err => {
            console.error('Error loading recently viewed products:', err);
        });
});

if (typeof window.scrollCarousel !== 'function') {
    window.scrollCarousel = function(containerId, direction) {
        const container = document.getElementById(containerId);
        if (container) {
            const scrollAmount = container.clientWidth * 0.75;
            container.scrollBy({
                left: direction * scrollAmount,
                behavior: 'smooth'
            });
        }
    };
}
