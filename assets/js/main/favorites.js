function syncFavButtons() {
    let favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
    document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(btn => {
        // Убираем проверку btn.dataset.favInit
        let link = "";
        let card = btn.closest('.product-card');
        if (card) {
            let a = card.querySelector('a');
            if (a) link = a.getAttribute('href') || '';
        } else {
            link = window.location.pathname;
        }
        
        if (link && favs.some(f => f.link === link)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
        // Убираем btn.dataset.favInit = "true"
    });
}

const favObserver = new MutationObserver((mutations) => {
    let changed = false;
    mutations.forEach(m => { 
        if (m.addedNodes.length) changed = true; 
    });
    if (changed) {
        // Добавляем небольшую задержку для DOM
        setTimeout(syncFavButtons, 0);
    }
});

favObserver.observe(document.body, { childList: true, subtree: true });

window.addEventListener('load', syncFavButtons);
// Добавляем слушатель для события storage
window.addEventListener('storage', (e) => {
    if (e.key === 'myFavs') {
        syncFavButtons();
    }
});
