window.openFavorites = function(e) {
    if (e) e.preventDefault();
    renderFavorites();
    window.openAppModal('favModal');
};

window.removeFav = function(index) {
    let favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
    let removedLink = favs[index] ? favs[index].link : null;
    favs.splice(index, 1);
    localStorage.setItem('myFavs', JSON.stringify(favs));
    renderFavorites();
    updateBadges();
    if (removedLink) {
        document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(btn => {
            let link = "";
            let card = btn.closest('.product-card');
            if (card) {
                let a = card.querySelector('a');
                if (a) link = a.getAttribute('href');
            } else {
                link = window.location.pathname;
            }
            if (link === removedLink) btn.classList.remove('active');
        });
    }
};

function renderFavorites() {
    const list = document.getElementById('favList');
    let favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
    const countEl = document.getElementById('favModalCount');
    if (countEl) countEl.innerText = favs.length > 0 ? `(${favs.length})` : '';
    if (favs.length === 0) {
        list.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:2rem 0; font-weight:600;">რჩეულები ცარიელია</div>';
        return;
    }
    list.innerHTML = favs.map((f, i) => {
        let oldPHtml = (f.oldPrice && f.oldPrice !== 'null' && !f.oldPrice.includes('undefined')) ? `<span class="list-item-old-price" style="margin-left:6px;">${f.oldPrice}</span>` : '';
        return `<div class="list-item-card" onclick="location.href='${f.link}'" style="cursor:pointer;">
                    <img class="list-item-img" src="${f.img || '/img/no-image.png'}" alt="">
                    <div class="list-item-info">
                        <div class="list-item-title">${f.name}</div>
                        <div class="list-item-price">${f.price} ${oldPHtml}</div>
                    </div>
                    <button class="list-item-del-btn" onclick="event.stopPropagation(); window.removeFav(${i})"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                </div>`;
    }).join('');
}

window.toggleFav = function(event, btn) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    try {
        let name = "პროდუქტი",
            price = "0 ₾",
            oldPrice = null,
            img = "",
            link = window.location.pathname;
        const card = btn.closest('.product-card');

        if (card) {
            let nameEl = card.querySelector('.product-name');
            if (nameEl) name = nameEl.innerText;
            let priceEl = card.querySelector('.product-price');
            if (priceEl) price = priceEl.innerText.replace(/₾/g, '').trim() + ' ₾';
            let oldPriceEl = card.querySelector('.old-price, .modern-price-old');
            if (oldPriceEl) oldPrice = oldPriceEl.innerText.replace(/₾/g, '').trim() + ' ₾';
            let imgEl = card.querySelector('.product-image');
            if (imgEl) img = imgEl.src;
            let aEl = card.querySelector('a');
            if (aEl) link = aEl.getAttribute('href');
        } else {
            let titleEl = document.querySelector('.title-desktop');
            if (!titleEl || titleEl.offsetParent === null) {
                titleEl = document.querySelector('.title-mobile');
            }
            if (!titleEl || titleEl.offsetParent === null) {
                titleEl = document.querySelector('h1.product-title-h1');
            }
            if (titleEl) name = titleEl.innerText;
            let priceEl = document.querySelector('.modern-price-current');
            if (priceEl) price = priceEl.innerText.replace(/₾/g, '').trim() + ' ₾';
            let oldPriceEl = priceEl ? priceEl.parentNode.querySelector('.modern-price-old, .old-price') : null;
            if (oldPriceEl) oldPrice = oldPriceEl.innerText.replace(/₾/g, '').trim() + ' ₾';
            let imgEl = document.querySelector('.main-gallery-slide img, .product-main-img');
            if (imgEl) img = imgEl.src;
        }

        let favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
        let existingIdx = favs.findIndex(f => f.link === link);

        if (existingIdx > -1) {
            favs.splice(existingIdx, 1);
            btn.classList.remove('active');
            window.showToast('წაშლილია რჩეულებიდან');
        } else {
            favs.unshift({ name, price, oldPrice, img, link });
            btn.classList.add('active');
            window.showToast('დამატებულია რჩეულებში', 'fav');
        }

        localStorage.setItem('myFavs', JSON.stringify(favs));
        window.updateBadges();

        document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(otherBtn => {
            let otherLink = "";
            let otherCard = otherBtn.closest('.product-card');
            if (otherCard) {
                let a = otherCard.querySelector('a');
                if (a) otherLink = a.getAttribute('href');
            } else {
                otherLink = window.location.pathname;
            }
            if (otherLink === link) {
                if (existingIdx > -1) otherBtn.classList.remove('active');
                else otherBtn.classList.add('active');
            }
        });
    } catch (e) {
        console.error(e);
    }
};

window.updateBadges = function() {
    try {
        let favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
        let orders = JSON.parse(localStorage.getItem('myOrders') || '[]');
        document.querySelectorAll('.fav-badge').forEach(el => {
            el.innerText = favs.length;
            el.style.display = favs.length > 0 ? 'flex' : 'none';
        });
        document.querySelectorAll('.orders-badge').forEach(el => {
            el.innerText = orders.length;
            el.style.display = orders.length > 0 ? 'flex' : 'none';
        });
    } catch (e) {
        console.error(e);
    }
};

const favObserver = new MutationObserver((mutations) => {
    let favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
    let changed = false;
    mutations.forEach(m => {
        if (m.addedNodes.length) changed = true;
    });
    if (changed) {
        document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(btn => {
            if (btn.dataset.favInit) return;
            let link = "";
            let card = btn.closest('.product-card');
            if (card) {
                let a = card.querySelector('a');
                if (a) link = a.getAttribute('href');
            } else {
                link = window.location.pathname;
            }
            if (link && favs.some(f => f.link === link)) btn.classList.add('active');
            btn.dataset.favInit = "true";
        });
    }
});
favObserver.observe(document.body, { childList: true, subtree: true });

window.addEventListener('load', () => {
    let favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
    document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(btn => {
        let link = "";
        let card = btn.closest('.product-card');
        if (card) {
            let a = card.querySelector('a');
            if (a) link = a.getAttribute('href');
        } else {
            link = window.location.pathname;
        }
        if (link && favs.some(f => f.link === link)) btn.classList.add('active');
        btn.dataset.favInit = "true";
    });
});
