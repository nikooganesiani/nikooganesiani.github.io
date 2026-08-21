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

    // Встроенный fallback рендерер карточки, если на главной нет глобального createProductCardHTML
    const renderCard = (p) => {
        if (typeof window.createProductCardHTML === 'function') {
            return window.createProductCardHTML(p, 'rec');
        }
        
        const price = p.price || 0;
        const oldPrice = p.oldPrice || p.old_price || '';
        const img = (p.images && p.images[0]) ? p.images[0] : (p.image || '/assets/img/placeholder.webp');
        const url = p.url || `/product/${p.sku || p.id}/`;

        return `
            <a href="${url}" class="shrink-0 w-[200px] max-lg:w-[160px] snap-start bg-white rounded-2xl p-3 border border-slate-100 flex flex-col justify-between hover:shadow-lg transition-all duration-200 text-inherit no-underline group"
               data-sku="${p.sku || ''}"
               data-name="${p.name || ''}"
               data-price="${price}"
               data-old-price="${oldPrice}"
               data-cat="${p.category || (p.categories ? p.categories[0] : '') || ''}"
               data-subcat="${p.subcategory || (p.subcategories ? p.subcategories[0] : '') || ''}">
                <div class="relative w-full aspect-square mb-2.5 rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center">
                    <img src="${img}" alt="${p.name || ''}" class="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" loading="lazy">
                </div>
                <div class="flex-1 flex flex-col justify-between">
                    <span class="text-[0.88rem] font-semibold text-slate-800 line-clamp-2 mb-2 leading-tight">${p.name || ''}</span>
                    <div class="flex items-baseline gap-2">
                        <span class="text-[1.1rem] font-black text-slate-950">${price} ₾</span>
                        ${oldPrice ? `<span class="text-[0.85rem] text-slate-400 line-through font-semibold">${oldPrice} ₾</span>` : ''}
                    </div>
                </div>
            </a>
        `;
    };

    fetch(apiUrl)
        .then(response => {
            if (!response.ok) throw new Error('Network error');
            return response.json();
        })
        .then(data => {
            const productsList = Array.isArray(data) ? data : (data.products || []);
            if (!productsList.length) return;

            const recentProducts = recentIds
                .map(id => productsList.find(p => String(p.id) === String(id) || String(p.sku) === String(id)))
                .filter(Boolean);

            if (recentProducts.length > 0) {
                recentScroll.innerHTML = recentProducts.map(p => renderCard(p)).join('');
                
                // Отображение секции
                recentSection.classList.remove('hidden');
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
