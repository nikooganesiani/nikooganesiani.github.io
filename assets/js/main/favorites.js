window.toggleFav = function(event, btn) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!btn) return;
    try {
        let name = "პროდუქტი", price = "0 ₾", oldPrice = null, img = "", link = window.location.pathname;
        const card = btn.closest('.product-card');
        
        if (card) {
            let nameEl = card.querySelector('.product-name'); if (nameEl) name = nameEl.innerText;
            let priceEl = card.querySelector('.product-price'); if (priceEl) price = priceEl.innerText.replace(/₾/g, '').trim() + ' ₾';
            let oldPriceEl = card.querySelector('.old-price, .modern-price-old'); if (oldPriceEl) oldPrice = oldPriceEl.innerText.replace(/₾/g, '').trim() + ' ₾';
            let imgEl = card.querySelector('.product-image'); if (imgEl) img = imgEl.src;
            let aEl = card.querySelector('a'); if (aEl) link = aEl.getAttribute('href') || link;
        } else {
            let titleEl = document.querySelector('.title-desktop') || document.querySelector('.title-mobile') || document.querySelector('h1.product-title-h1');
            if (titleEl) name = titleEl.innerText;
            let priceEl = document.querySelector('.modern-price-current'); if (priceEl) price = priceEl.innerText.replace(/₾/g, '').trim() + ' ₾';
            
            let oldPriceEl = priceEl ? priceEl.parentNode?.querySelector('.modern-price-old, .old-price') : null; 
            if (oldPriceEl) oldPrice = oldPriceEl.innerText.replace(/₾/g, '').trim() + ' ₾';
            
            let imgEl = document.querySelector('.main-gallery-slide img, .product-main-img'); if (imgEl) img = imgEl.src;
        }

        let favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
        let existingIdx = favs.findIndex(f => f.link === link);

        if (existingIdx > -1) {
            favs.splice(existingIdx, 1);
            btn.classList.remove('active');
            window.showToast?.('წაშლილია რჩეულებიდან');
        } else {
            favs.unshift({ name, price, oldPrice, img, link });
            btn.classList.add('active');
            window.showToast?.('დამატებულია რჩეულებში', 'fav');
        }

        localStorage.setItem('myFavs', JSON.stringify(favs));
        window.updateBadges?.();

        document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(otherBtn => {
            let otherLink = "";
            let otherCard = otherBtn.closest('.product-card');
            if (otherCard) {
                let a = otherCard.querySelector('a');
                if (a) otherLink = a.getAttribute('href') || '';
            } else {
                otherLink = window.location.pathname;
            }
            if (otherLink === link) {
                if (existingIdx > -1) otherBtn.classList.remove('active');
                else otherBtn.classList.add('active');
            }
        });
    } catch(e) { console.error(e); }
};

function syncFavButtons() {
    let favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
    document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(btn => {
        if (btn.dataset.favInit) return;
        let link = "";
        let card = btn.closest('.product-card');
        if (card) {
            let a = card.querySelector('a');
            if (a) link = a.getAttribute('href') || '';
        } else {
            link = window.location.pathname;
        }
        if (link && favs.some(f => f.link === link)) btn.classList.add('active');
        btn.dataset.favInit = "true";
    });
}

const favObserver = new MutationObserver((mutations) => {
    let changed = false;
    mutations.forEach(m => { if (m.addedNodes.length) changed = true; });
    if (changed) syncFavButtons();
});
favObserver.observe(document.body, { childList: true, subtree: true });

window.addEventListener('load', syncFavButtons);
