document.addEventListener('DOMContentLoaded', function() {
    const pDataset = document.getElementById('productData')?.dataset || {};
    const oldPriceStr = pDataset.oldPrice || "";
    const priceStr = pDataset.price || "";

    if (oldPriceStr && oldPriceStr !== "") {
        const oldVal = parseInt(oldPriceStr.replace(/[^0-9]/g, ''));
        const newVal = parseInt(priceStr.replace(/[^0-9]/g, ''));
        if (oldVal > newVal) {
            const percent = Math.round(((oldVal - newVal) / oldVal) * 100);
            const badge = document.getElementById('saleBadge');
            if (badge) {
                badge.innerHTML = `-${percent}%`;
                badge.classList.remove('hidden');
                badge.classList.add('block');
            }
        }
    }

    fetch(window.CATALOG_API_URL)
    .then(r => { if (!r.ok) throw new Error('Error'); return r.json(); })
    .then(data => {
        const currentSub = pDataset.subcat || "";
        const currentCat = pDataset.cat || "";
        const currentSku = (pDataset.sku || "").trim();
        const urlId = window.location.pathname.replace(/\/$/, '').split('/').pop();
        const currentProduct = data.products.find(p => (currentSku !== "" && String(p.sku) === currentSku) || (urlId !== "" && String(p.id) === urlId));
        const actualProductId = currentProduct ? currentProduct.id : null;
        
        if (actualProductId) {
            let recentIds = JSON.parse(localStorage.getItem('recentIds') || '[]');
            recentIds = recentIds.filter(id => id !== actualProductId); 
            recentIds.unshift(actualProductId); 
            if (recentIds.length > 20) recentIds = recentIds.slice(0, 20);
            localStorage.setItem('recentIds', JSON.stringify(recentIds));
        }
        
        const rawStock = (currentProduct && currentProduct.stockStatus) ? String(currentProduct.stockStatus).trim().toLowerCase() : 'in_stock';
        const badgeTag = document.getElementById('dynamicStockBadgeTag');
        const mobileBadgeTag = document.getElementById('mobileDynamicStockBadgeTag');
        const btnContainer = document.getElementById('dynamicBuyButton');
        const formInputs = document.getElementById('dynamicFormInputs');
        
        let stockHtml = '';
        let btnHtml = '';

        if (rawStock === 'out_of_stock' || rawStock === 'მარაგი ამოიწურა') {
            stockHtml = `<div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.8rem] font-bold bg-[#fef2f2] text-red-500 border border-red-200 shadow-[0_4px_15px_rgba(239,68,68,0.1)]"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> მარაგი ამოიწურა</div>`;
            btnHtml = `<button type="button" class="w-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 border-none p-4 rounded-xl text-[1.1rem] font-bold cursor-pointer transition-all duration-300 flex items-center justify-center gap-2.5 outline-none active:scale-95 h-full" onclick="document.getElementById('recentScroll').scrollIntoView({behavior: 'smooth', block: 'center'})"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> იხილეთ მსგავსი</button>`;
        } else if (rawStock === 'soon' || rawStock.includes('მალე')) {
            stockHtml = `<div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.8rem] font-bold bg-[#fffbeb] text-amber-600 border border-amber-200 shadow-[0_4px_15px_rgba(217,119,6,0.1)]"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> მალე იქნება</div>`;
            btnHtml = `<button type="button" class="w-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 border-none p-4 rounded-xl text-[1.1rem] font-bold cursor-pointer transition-all duration-300 flex items-center justify-center gap-2.5 outline-none active:scale-95 h-full" onclick="document.getElementById('recentScroll').scrollIntoView({behavior: 'smooth', block: 'center'})"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> იხილეთ მსგავსი</button>`;
        } else {
            stockHtml = `<div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.8rem] font-bold bg-[#0B652D] text-[#F5FFF9] border border-green-200 shadow-[0_4px_15px_rgba(22,163,74,0.1)]"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> მარაგშია</div>`;
            if (formInputs) formInputs.innerHTML = `
                <input type="email" name="email_hp" id="inlineEmailHp" class="hidden" tabindex="-1" autocomplete="off">
                <div class="flex items-center px-4 gap-2.5 h-[50px] bg-slate-50 border border-slate-200 rounded-xl transition-all duration-200 overflow-hidden w-full box-border focus-within:bg-white focus-within:border-blue-600 group/input [&.error-border]:border-red-500 [&.error-border]:border-2" id="inlineNameWrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 shrink-0 text-slate-400"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <input type="text" id="inlineName" class="flex-1 min-w-0 bg-transparent border-none outline-none text-[15px] font-semibold text-slate-900 p-0 h-full placeholder:text-slate-400 placeholder:font-medium [&:-webkit-autofill]:shadow-[0_0_0_1000px_#f8fafc_inset] [&:-webkit-autofill]:text-slate-900 group-focus-within/input:[&:-webkit-autofill]:shadow-[0_0_0_1000px_#ffffff_inset]" placeholder="თქვენი სახელი" autocomplete="name">
                </div>
                <div class="flex items-center px-4 gap-2.5 h-[50px] bg-slate-50 border border-slate-200 rounded-xl transition-all duration-200 overflow-hidden w-full box-border focus-within:bg-white focus-within:border-blue-600 group/input [&.error-border]:border-red-500 [&.error-border]:border-2" id="inlinePhoneWrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 shrink-0 text-slate-400"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    <span class="shrink-0 font-bold text-slate-500 text-[15px]">+995</span>
                    <input type="tel" id="inlinePhone" class="flex-1 min-w-0 bg-transparent border-none outline-none text-[15px] font-semibold text-slate-900 p-0 h-full placeholder:text-slate-400 placeholder:font-medium [&:-webkit-autofill]:shadow-[0_0_0_1000px_#f8fafc_inset] [&:-webkit-autofill]:text-slate-900 group-focus-within/input:[&:-webkit-autofill]:shadow-[0_0_0_1000px_#ffffff_inset]" placeholder="555 55 55 55" inputmode="numeric" autocomplete="tel">
                </div>
            `;
            btnHtml = `
                <button type="submit" id="submitInlineOrderBtn" aria-label="ყიდვა" class="w-full bg-blue-600 text-white border-none p-4 rounded-xl text-[1.1rem] font-bold cursor-pointer transition-all duration-300 flex items-center justify-center gap-2.5 outline-none hover:bg-blue-700 hover:shadow-[0_10px_20px_rgba(37,99,235,0.3)] active:scale-95 active:shadow-none">
                    <svg id="inlineOrderIcon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                    <span id="inlineOrderText">ყიდვა</span>
                </button>
                <div class="flex justify-center mb-2.5 text-slate-600 text-[0.9rem] font-semibold text-center border border-slate-200 rounded-[9px] bg-[#fbfdff] p-2.5">
                    შეუკვეთე ახლა, გადაიხადე მიღებისას
                </div>
            `;
        }

        if (badgeTag) badgeTag.innerHTML = stockHtml;
        if (mobileBadgeTag) mobileBadgeTag.innerHTML = stockHtml;
        if (btnContainer) btnContainer.innerHTML = btnHtml;

        const subcatSection = document.getElementById('subcatSection');
        const subcatScroll = document.getElementById('subcatScroll');
        let subcatProducts = [];
        
        if (subcatSection && subcatScroll && currentSub) {
            subcatProducts = data.products.filter(p => p.id !== actualProductId && p.stockStatus !== 'out_of_stock' && p.subcategories && p.subcategories.includes(currentSub)).slice(0, 30);
            if (subcatProducts.length > 0) {
                subcatSection.style.display = 'block';
                subcatScroll.innerHTML = subcatProducts.map(p => window.createProductCardHTML(p, 'subc')).join('');
                if (subcatProducts.length <= 4) {
                    const arrowL = document.getElementById('subcatArrowLeft');
                    const arrowR = document.getElementById('subcatArrowRight');
                    if (arrowL) arrowL.style.display = 'none';
                    if (arrowR) arrowR.style.display = 'none';
                }
            }
        }

        const catSection = document.getElementById('catSection');
        const catScroll = document.getElementById('catScroll');
        
        if (catSection && catScroll && currentCat) {
            let catProducts = data.products.filter(p => p.id !== actualProductId && p.stockStatus !== 'out_of_stock' && p.categories && p.categories.includes(currentCat) && !subcatProducts.some(sp => sp.id === p.id)).slice(0, 30);
            if (catProducts.length > 0) {
                catSection.style.display = 'block';
                catScroll.innerHTML = catProducts.map(p => window.createProductCardHTML(p, 'cat')).join('');
                if (catProducts.length <= 4) {
                    const arrowL = document.getElementById('catArrowLeft');
                    const arrowR = document.getElementById('catArrowRight');
                    if (arrowL) arrowL.style.display = 'none';
                    if (arrowR) arrowR.style.display = 'none';
                }
            }
        }

        const recentSection = document.getElementById('recentlyViewedSection');
        const recentScroll = document.getElementById('recentScroll');
        if (recentSection && recentScroll) {
            let recentIds = JSON.parse(localStorage.getItem('recentIds') || '[]');
            recentIds = recentIds.filter(id => id !== actualProductId); 
            const recentProducts = recentIds.map(id => data.products.find(p => p.id === id)).filter(Boolean);
            
            if (recentProducts.length > 0) {
                recentSection.style.display = 'block';
                recentScroll.innerHTML = recentProducts.map(p => window.createProductCardHTML(p, 'rec')).join('');
                if (recentProducts.length <= 4) {
                    const arrowL = document.getElementById('recentArrowLeft');
                    const arrowR = document.getElementById('recentArrowRight');
                    if (arrowL) arrowL.style.display = 'none';
                    if (arrowR) arrowR.style.display = 'none';
                }
            }
        }
    });
});
