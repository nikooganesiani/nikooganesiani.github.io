let _catalogCache = null;
let _catalogPromise = null;

window.fetchCatalogCached = function() {
    if (_catalogCache) return Promise.resolve(_catalogCache);
    if (!_catalogPromise) {
        const apiUrl = window.CATALOG_API_URL || 'https://api.enkaelectronics.com.ge/catalog';
        _catalogPromise = fetch(apiUrl)
            .then(res => { 
                if (!res.ok) throw new Error('Network error'); 
                return res.json(); 
            })
            .then(d => { 
                _catalogCache = d; 
                return d; 
            })
            .catch(err => {
                _catalogPromise = null;
                throw err;
            });
    }
    return _catalogPromise;
};

window.normalizeQuery = function(q) {
    if (!q) return '';
    const map = {
        'a':'ა','b':'ბ','c':'ც','d':'დ','e':'ე','f':'ფ','g':'გ','h':'ჰ','i':'ი','j':'ჯ','k':'კ','l':'ლ','m':'მ','n':'ნ','o':'ო','p':'პ','q':'ქ','r':'რ','s':'ს','t':'ტ','u':'უ','v':'ვ','w':'წ','x':'ხ','y':'ყ','z':'ზ',
        'A':'ა','B':'ჩ','C':'ჩ','D':'დ','E':'ე','F':'ფ','G':'ღ','H':'ჰ','I':'ი','J':'ჟ','K':'კ','L':'ლ','M':'მ','N':'ნ','O':'ო','P':'პ','Q':'ქ','R':'ღ','S':'შ','T':'თ','U':'უ','V':'ვ','W':'ჭ','X':'ხ','Y':'ყ','Z':'ძ',
        'а':'ა','б':'ბ','в':'ვ','г':'გ','д':'დ','е':'ე','ё':'ე','ж':'ჟ','з':'ზ','и':'ი','й':'ი','к':'კ','л':'ლ','м':'მ','н':'ნ','о':'ო','п':'პ','р':'რ','с':'ს','т':'ტ','у':'უ','ф':'ფ','х':'ხ','ц':'ც','ч':'ჩ','ш':'შ','щ':'შ','ъ':'','ы':'ი','ь':'','э':'ე','ю':'იუ','я':'ია'
    };
    let res = '';
    for (let char of q) { res += map[char] || char; }
    return res.toLowerCase();
};

document.addEventListener('DOMContentLoaded', () => {
    try { window.updateBadges?.(); } catch(e){}

    try {
        const navContainer = document.getElementById('dynamicNavAccordion');
        if (navContainer && window.CATALOG_STRUCTURE && typeof window.CATALOG_STRUCTURE === 'object') {
            const cols = [[], [], []];
            let idx = 0;
            for (const [catId, catData] of Object.entries(window.CATALOG_STRUCTURE)) {
                if (!catData) continue;
                
                const subLinks = (catData.subs || []).map(sub => 
                    `<a href="/category/?${encodeURIComponent(catId)}&sub=${encodeURIComponent(sub.id)}" class="no-underline text-slate-600 text-[0.85rem] font-semibold py-2 px-4 rounded-full bg-slate-100 transition-all duration-300 select-none active:scale-95 hover:text-white hover:bg-blue-600" draggable="false">${sub.name}</a>`
                ).join('');
                
                const itemHtml = `
                <div class="shrink-0 bg-transparent border-none rounded-xl overflow-hidden transition-all duration-300 [&.active]:bg-slate-50 group/item">
                    <div class="flex items-center justify-between p-4 cursor-pointer font-bold text-slate-800 text-[1.05rem] select-none transition-all duration-300 active:scale-95" onclick="this.parentElement?.classList.toggle('active')">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-transparent rounded-full flex items-center justify-center text-slate-500 transition-colors duration-300 group-[.active]/item:text-blue-600 [&>svg]:w-5 [&>svg]:h-5">
                                ${catData.icon || ''}
                            </div>
                            <span>${catData.title || ''}</span>
                        </div>
                        <svg class="w-5 h-5 text-slate-400 transition-transform duration-300 group-[.active]/item:rotate-180 group-[.active]/item:text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
                    </div>
                    <div class="hidden px-5 pb-5 group-[.active]/item:block animate-[fadeIn_0.4s_ease]">
                        <div class="flex flex-wrap gap-2 border-t border-dashed border-slate-200 pt-4 mt-1">
                            <a href="/category/?${encodeURIComponent(catId)}" class="no-underline text-slate-600 text-[0.85rem] font-semibold py-2 px-4 rounded-full bg-slate-100 transition-all duration-300 select-none active:scale-95 hover:text-white hover:bg-blue-600" draggable="false">ყველა</a>
                            ${subLinks}
                        </div>
                    </div>
                </div>`;
                cols[idx % 3].push(itemHtml);
                idx++;
            }
            navContainer.innerHTML = `<div class="max-lg:contents flex flex-col gap-6">${cols[0].join('')}</div><div class="max-lg:contents flex flex-col gap-6">${cols[1].join('')}</div><div class="max-lg:contents flex flex-col gap-6">${cols[2].join('')}</div>`;
            navContainer.className = "flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start flex-1 overflow-y-auto pr-1 pt-4 pb-4 -mt-4 -mb-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,transparent,black_1rem,black_calc(100%-1rem),transparent)]";
        }
    } catch(e) { console.error(e); }
});
