window.addEventListener('click', (e) => {
    if (e.target?.classList?.contains('modal')) window.closeAppModal?.(e.target);
    if (e.target?.closest('.mobile-bottom-img')) window.scrollTo({ top: 0, behavior: 'smooth' });
});

let _tsX = 0, _tsY = 0;
document.addEventListener('touchstart', function(e) {
    if (e.changedTouches?.[0]) {
        _tsX = e.changedTouches[0].screenX;
        _tsY = e.changedTouches[0].screenY;
    }
}, {passive: true});

window.addEventListener('contextmenu', function(e) {
    if (e.target?.closest?.('button, a, .product-card, .category-btn, .sub-category-btn, .thumb-card, .similar-card')) {
        e.preventDefault();
    }
});

document.addEventListener('touchend', function(e) {
    setTimeout(function() {
        if (document.activeElement && document.activeElement !== document.body) {
            const tag = document.activeElement.tagName;
            if (tag === 'BUTTON' || tag === 'A' || document.activeElement.closest?.('.product-card, .similar-card, .thumb-card')) {
                document.activeElement.blur();
            }
        }
    }, 50);

    if (e.changedTouches?.[0]) {
        let _teX = e.changedTouches[0].screenX;
        let _teY = e.changedTouches[0].screenY;
        if (Math.abs(_teX - _tsX) < 10 && Math.abs(_teY - _tsY) < 10) {
            if (e.target?.closest?.('input, textarea')) return;
            const sel = window.getSelection();
            if (sel && sel.toString().length > 0) {
                const style = window.getComputedStyle(e.target);
                const userSel = style.userSelect || style.getPropertyValue('-webkit-user-select');
                if (userSel === 'none') {
                    sel.removeAllRanges();
                }
            }
        }
    }
}, {passive: true});
