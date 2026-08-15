window.createProductCardHTML = function(p, prefix = 'sim') {
    let imgs = p.images || (p.image ? [p.image] : []);
    imgs = imgs.filter(img => !img.includes('youtube.com') && !img.includes('youtu.be'));
    if (imgs.length === 0) imgs.push('/img/no-image.png');
    
    const hasMultipleImages = imgs.length > 1;
    let discountBadge = '';
    
    if (p.oldPrice) {
        const oldVal = parseInt(String(p.oldPrice).replace(/[^0-9]/g, ''));
        const newVal = parseInt(String(p.price).replace(/[^0-9]/g, ''));
        if (oldVal > newVal) {
            const percent = Math.round(((oldVal - newVal) / oldVal) * 100);
            discountBadge = `<div class="absolute top-2.5 left-2.5 bg-red-500 text-white px-2 py-1 rounded-md text-[0.75rem] font-bold z-[5] shadow-[0_4px_12px_rgba(239,68,68,0.25)] pointer-events-none">-${percent}%</div>`;
        }
    }
    
    const productDataAttr = JSON.stringify(p).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
    const uniqueId = `${prefix}-${p.id}`;
    
    let dotsHtml = '';
    let arrowsHtml = '';
    if (hasMultipleImages) {
        dotsHtml = `<div class="absolute bottom-2.5 left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none max-lg:hidden" id="dots-${uniqueId}">
            ${imgs.map((_, i) => `<div class="w-1.5 h-1.5 rounded-full bg-slate-900/25 backdrop-blur-[2px] transition-all duration-300 dot ${i === 0 ? 'active !bg-blue-600 scale-[1.3]' : ''}"></div>`).join('')}
        </div>`;
        arrowsHtml = `
            <button class="absolute top-1/2 -translate-y-1/2 left-2 w-7 h-7 bg-white/95 border-none rounded-full flex items-center justify-center cursor-pointer text-slate-900 opacity-0 transition-all duration-200 z-20 outline-none hover:text-blue-600 active:scale-85 max-lg:hidden card-nav-arrow prev group-hover/card:opacity-100" aria-label="წინა" onclick="scrollCardGallery('${uniqueId}', -1, event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-4 h-4"><path d="m15 18-6-6 6-6"></path></svg></button>
            <button class="absolute top-1/2 -translate-y-1/2 right-2 w-7 h-7 bg-white/95 border-none rounded-full flex items-center justify-center cursor-pointer text-slate-900 opacity-0 transition-all duration-200 z-20 outline-none hover:text-blue-600 active:scale-85 max-lg:hidden card-nav-arrow next group-hover/card:opacity-100" aria-label="შემდეგი" onclick="scrollCardGallery('${uniqueId}', 1, event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-4 h-4"><path d="m9 18 6-6-6-6"></path></svg></button>
        `;
    }

    return `
    <div class="flex-[0_0_calc(25%-12px)] max-lg:flex-[0_0_calc(33.333%-8px)] max-sm:flex-[0_0_calc(50%-6px)] snap-start min-w-0 flex flex-col relative group/card product-card">
        <div class="relative w-full aspect-square overflow-hidden rounded-t-2xl border-none">
            ${discountBadge}
            <button class="absolute top-2.5 right-2.5 max-sm:top-1.5 max-sm:right-1.5 max-sm:w-[26px] max-sm:h-[26px] bg-transparent border-none w-[30px] h-[30px] rounded-full flex items-center justify-center cursor-pointer text-slate-400 transition-all duration-200 outline-none z-10 active:scale-85 btn-fav-card [&.active]:text-red-500 [&.active>svg]:fill-current" aria-label="დამატება რჩეულებში" onclick="toggleFav(event, this)" title="დამატება რჩეულებში">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </button>
            ${arrowsHtml}
            <div class="flex w-full h-full overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden product-images-track max-lg:overflow-x-hidden max-lg:snap-none" id="track-${uniqueId}">
                ${imgs.map(img => `
                    <div class="flex-[0_0_100%] w-full h-full snap-start flex items-center justify-center">
                        <a href="/product/${p.id}/" style="display:contents;" draggable="false">
                            <img class="w-full h-full object-cover" src="${img}" alt="${p.name}" width="800" height="800" loading="lazy" onerror="this.onerror=null; this.src='/img/no-image.png'" draggable="false">
                        </a>
                    </div>
                `).join('')}
            </div>
            ${dotsHtml}
        </div>
        <div class="bg-white rounded-b-2xl pt-4 pb-4 px-4 max-sm:pt-3 max-sm:pb-3 max-sm:px-3 flex flex-col flex-1 product-info">
            <div class="bg-transparent border-none p-0 h-[2.6rem] max-sm:h-[2.3rem] flex items-start mb-2 max-sm:mb-1.5 transition-opacity duration-200 cursor-pointer hover:opacity-80" onclick="location.href='/product/${p.id}/'">
                <div class="text-[1rem] max-sm:text-[0.8rem] font-bold text-slate-900 leading-snug tracking-tight line-clamp-2 overflow-hidden text-ellipsis">${p.name}</div>
            </div>
            <div class="flex flex-row items-end gap-1.5 flex-wrap mb-4 max-sm:mb-2.5 min-h-[2.2rem] max-sm:min-h-auto max-sm:p-0">
                <div class="text-[1.5rem] max-sm:text-[1.1rem] font-bold text-blue-600 tracking-tight leading-none">${String(p.price).replace(/₾/g, '')}₾</div>
                ${p.oldPrice ? `<span class="text-[0.85rem] max-sm:text-[0.75rem] leading-snug mb-[2px] line-through decoration-slate-400 decoration-[1px] text-slate-400">${String(p.oldPrice).replace(/₾/g, '')}₾</span>` : ''}
            </div>
            <button class="bg-blue-600 text-white border-none p-3 max-sm:p-2 rounded-lg max-sm:rounded-md cursor-pointer font-bold text-[0.95rem] max-sm:text-[0.8rem] transition-all duration-200 flex items-center justify-center gap-1.5 hover:bg-blue-700 active:scale-95 outline-none w-full mt-auto" aria-label="ყიდვა" onclick='window.openOrderForm(${productDataAttr})'>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="max-sm:w-3.5 max-sm:h-3.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                ყიდვა
            </button>
        </div>
    </div>`;
};

window.updateDots = function(uniqueId, trackEl) {
    if (trackEl._isUpdating) return;
    trackEl._isUpdating = true;
    window.requestAnimationFrame(() => {
        const index = Math.round(trackEl.scrollLeft / trackEl.clientWidth);
        const dots = document.querySelectorAll(`#dots-${uniqueId} .dot`);
        dots.forEach((d, i) => {
            if (i === index) {
                d.classList.add('active', '!bg-blue-600', 'scale-[1.3]');
            } else {
                d.classList.remove('active', '!bg-blue-600', 'scale-[1.3]');
            }
        });
        trackEl._isUpdating = false;
    });
};

window.scrollCardGallery = function(id, dir, e) {
    e.preventDefault(); e.stopPropagation();
    const track = document.getElementById('track-' + id);
    if (!track) return;
    const width = track.clientWidth;
    const maxScroll = track.scrollWidth - track.clientWidth;
    
    if (dir === 1 && track.scrollLeft >= maxScroll - 5) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (dir === -1 && track.scrollLeft <= 5) {
        track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' });
    } else {
        track.scrollBy({ left: dir * width, behavior: 'smooth' });
    }
};

window.scrollCarousel = function(containerId, direction) {
    const scroll = document.getElementById(containerId);
    if (!scroll) return;
    const card = scroll.querySelector('.product-card');
    const scrollAmount = card ? card.offsetWidth + 16 : 300;
    
    const maxScroll = scroll.scrollWidth - scroll.clientWidth;
    if (direction === 1 && scroll.scrollLeft >= maxScroll - 10) {
        scroll.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (direction === -1 && scroll.scrollLeft <= 10) {
        scroll.scrollTo({ left: scroll.scrollWidth, behavior: 'smooth' });
    } else {
        scroll.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
    }
};

document.addEventListener('scroll', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('product-images-track')) {
        const id = e.target.id.replace('track-', '');
        window.updateDots(id, e.target);
    }
}, true);
