const NORMALIZE_CHAR_MAP = {
    'a':'ა','b':'ბ','c':'ც','d':'დ','e':'ე','f':'ფ','g':'გ','h':'ჰ','i':'ი','j':'ჯ','k':'კ','l':'ლ','m':'მ','n':'ნ','o':'ო','p':'პ','q':'ქ','r':'რ','s':'ს','t':'ტ','u':'უ','v':'ვ','w':'წ','x':'ხ','y':'ყ','z':'ზ',
    'A':'ა','B':'ჩ','C':'ჩ','D':'დ','E':'ე','F':'ფ','G':'ღ','H':'ჰ','I':'ი','J':'ჟ','K':'კ','L':'ლ','M':'მ','N':'ნ','O':'ო','P':'პ','Q':'ქ','R':'ღ','S':'შ','T':'თ','U':'უ','V':'ვ','W':'ჭ','X':'ხ','Y':'ყ','Z':'ძ',
    'а':'ა','б':'ბ','в':'ვ','г':'გ','д':'დ','е':'ე','ё':'ე','ж':'ჟ','з':'ზ','и':'ი','й':'ი','к':'კ','л':'ლ','м':'მ','н':'ნ','о':'ო','п':'პ','р':'რ','с':'ს','т':'ტ','у':'უ','ф':'ფ','х':'ხ','ц':'ც','ч':'ჩ','ш':'შ','щ':'შ','ъ':'','ы':'ი','ь':'','э':'ე','ю':'იუ','я':'ია'
};

window.normalizeQuery = function(q) {
    if (!q) return '';
    let res = '';
    for (const char of q) {
        res += NORMALIZE_CHAR_MAP[char] ?? char;
    }
    return res.toLowerCase();
};

window.closeNavModal = function() {
    window.closeAppModal?.('navModal');
};

document.addEventListener('DOMContentLoaded', () => {
    try { window.updateBadges?.(); } catch(e) {}

    // Обработчики закрытия модального окна
    const navModal = document.getElementById('navModal');
    const closeBtn = document.getElementById('closeNavModalBtn');

    if (closeBtn) {
        closeBtn.addEventListener('click', window.closeNavModal);
    }
    if (navModal) {
        navModal.addEventListener('click', (e) => {
            if (e.target === navModal) window.closeNavModal();
        });
    }

    // Генерация структуры каталога
    try {
        const navContainer = document.getElementById('dynamicNavAccordion');
        if (navContainer && window.CATALOG_STRUCTURE && typeof window.CATALOG_STRUCTURE === 'object') {
            const cols = [[], []];
            let idx = 0;

            for (const [catId, catData] of Object.entries(window.CATALOG_STRUCTURE)) {
                if (!catData) continue;

                const subs = Array.isArray(catData.subs) ? catData.subs : [];
                const encodedCatId = encodeURIComponent(catId);

                const subLinks = subs.map(sub =>
                    `<a href="/category/?${encodedCatId}&sub=${encodeURIComponent(sub.id)}" class="no-underline text-slate-700 text-[0.85rem] font-medium py-2 px-3.5 rounded-xl bg-slate-100/80 border border-slate-200/70 transition-colors duration-150 select-none hover:text-white hover:bg-blue-600 hover:border-blue-600" draggable="false">${window.escapeHTML(sub.name)}</a>`
                ).join('');

                const countBadge = subs.length > 0
                    ? `<span class="bg-amber-400 text-slate-900 text-[0.75rem] font-extrabold px-2.5 py-0.5 rounded-full leading-tight">${subs.length}</span>`
                    : '';

                const itemHtml = `
                <div class="shrink-0 bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 rounded-2xl overflow-hidden transition-colors duration-150 [&.active]:bg-white [&.active]:border-blue-500/40 group/item">
                    <button type="button" class="w-full text-left flex items-center justify-between p-3.5 sm:p-4 cursor-pointer font-bold text-slate-800 text-[0.98rem] sm:text-[1.02rem] select-none" aria-expanded="false" aria-controls="catalog-panel-${encodedCatId}" onclick="this.setAttribute('aria-expanded', String(this.parentElement.classList.toggle('active')))">
                        <div class="flex items-center gap-3.5 min-w-0">
                            <div class="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0 transition-colors duration-150 group-[.active]/item:bg-blue-600 group-[.active]/item:text-white [&>svg]:w-5 [&>svg]:h-5">
                                ${catData.icon || ''}
                            </div>
                            <span class="truncate">${window.escapeHTML(catData.title || '')}</span>
                        </div>
                        <div class="flex items-center gap-2.5 shrink-0 ml-2">
                            ${countBadge}
                            <div class="w-7 h-7 rounded-lg bg-slate-200/60 group-[.active]/item:bg-blue-50 flex items-center justify-center transition-colors duration-150">
                                <svg class="w-4 h-4 text-slate-500 transition-transform duration-150 group-[.active]/item:rotate-180 group-[.active]/item:text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
                            </div>
                        </div>
                    </button>
                    <div id="catalog-panel-${encodedCatId}" class="hidden px-3.5 sm:px-4 pb-4 group-[.active]/item:block">
                        <div class="flex flex-wrap gap-2 border-t border-slate-100 pt-3.5">
                            <a href="/category/?${encodedCatId}" class="no-underline inline-flex items-center gap-1.5 text-blue-600 text-[0.85rem] font-bold py-2 px-3.5 rounded-xl bg-blue-50 border border-blue-200/60 transition-colors duration-150 select-none hover:text-white hover:bg-blue-600 hover:border-blue-600" draggable="false">
                                <span>ყველა</span>
                                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                            </a>
                            ${subLinks}
                        </div>
                    </div>
                </div>`;

                cols[idx % 2].push(itemHtml);
                idx++;
            }

            navContainer.innerHTML = `
                <div class="max-lg:contents flex flex-col gap-3.5">${cols[0].join('')}</div>
                <div class="max-lg:contents flex flex-col gap-3.5">${cols[1].join('')}</div>
            `;
            navContainer.className = "flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";
        }
    } catch(e) {
        console.error(e);
    }
});
