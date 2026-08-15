let isZoomModalOpen = false;

window.zoomImagePC = function(e, img) {
    if (img.closest('#imageZoomModal')) return;
    if (window.innerWidth < 1024) return;
    img.style.transition = 'none'; 
    const rect = img.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    img.style.transformOrigin = `${x}% ${y}%`;
    img.style.transform = 'scale(2.2)';
};

window.resetZoomPC = function(img) {
    if (img.closest('#imageZoomModal')) return;
    if (window.innerWidth < 1024) return;
    img.style.transition = 'transform 0.3s ease'; 
    img.style.transform = 'scale(1)';
};

window.syncModalThumbs = function() {
    const track = document.getElementById('modalTrack');
    if (!track) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    const thumbs = document.querySelectorAll('#modalThumbStrip .modal-thumb');
    if (thumbs.length > 0) {
        thumbs.forEach(t => t.classList.remove('active', 'border-blue-600', 'opacity-100', 'scale-105'));
        if (thumbs[index]) {
            thumbs[index].classList.add('active', 'border-blue-600', 'opacity-100', 'scale-105');
            thumbs[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }
};

window.openImageZoom = function(img, index) {
    isZoomModalOpen = true; 
    if (img) {
        img.style.transition = 'none'; 
        img.style.transform = 'scale(1)';
    }
    const modal = document.getElementById('imageZoomModal');
    if (!modal) return;
    modal.classList.remove('hidden'); 
    modal.style.display = 'flex';
    modal.offsetHeight; 
    const modalTrack = document.getElementById('modalTrack');
    if (modalTrack) {
        modalTrack.style.scrollBehavior = 'auto';
        modalTrack.scrollLeft = index * modalTrack.clientWidth;
        void modalTrack.offsetWidth; 
        modalTrack.style.scrollBehavior = 'smooth';
        window.syncModalThumbs();
    }
    modal.classList.add('active'); 
};

window.closeImageZoom = function(e) {
    if (e) {
        const isThumbArea = e.target.closest('.modal-thumb-area');
        const isArrow = e.target.closest('.modal-nav-arrow');
        const isThumb = e.target.closest('.modal-thumb');
        if (isArrow || isThumbArea || isThumb) return;
    }
    isZoomModalOpen = false;
    const modal = document.getElementById('imageZoomModal');
    if (!modal) return;
    modal.classList.remove('active'); 
    setTimeout(() => { 
        modal.style.display = 'none'; 
        modal.classList.add('hidden'); 
    }, 300);
};

window.scrollModalGallery = function(dir, e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const track = document.getElementById('modalTrack');
    if (!track) return;
    const width = track.clientWidth;
    const maxScroll = track.scrollWidth - track.clientWidth;
    if (dir === 1 && track.scrollLeft >= maxScroll - 10) { 
        track.scrollTo({ left: 0, behavior: 'smooth' }); 
    } else if (dir === -1 && track.scrollLeft <= 10) { 
        track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' }); 
    } else { 
        track.scrollBy({ left: dir * width, behavior: 'smooth' }); 
    }
};

window.scrollToModalSlide = function(index, e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const track = document.getElementById('modalTrack');
    if (track) {
        const width = track.clientWidth;
        track.scrollTo({ left: index * width, behavior: 'smooth' });
    }
};

window.scrollToForm = function() {
    const target = document.getElementById('dynamicBuyButton');
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

document.addEventListener('DOMContentLoaded', function() {
    const modalTrackEl = document.getElementById('modalTrack');
    let modalScrollTimeout;
    if (modalTrackEl) {
        modalTrackEl.addEventListener('scroll', () => {
            if (modalScrollTimeout) return;
            modalScrollTimeout = window.requestAnimationFrame(() => {
                window.syncModalThumbs();
                modalScrollTimeout = null;
            });
        }, { passive: true });
    }

    const modalFullscreen = document.getElementById('imageZoomModal');
    let tsY = 0, tsX = 0;
    
    if (modalFullscreen) {
        modalFullscreen.addEventListener('touchstart', (e) => {
            tsY = e.touches[0].clientY;
            tsX = e.touches[0].clientX;
        }, { passive: true });

        modalFullscreen.addEventListener('touchmove', (e) => {
            const isTrack = e.target.closest('.modal-track') || e.target.closest('#modalThumbStrip');
            if (isTrack) {
                const diffY = Math.abs(e.touches[0].clientY - tsY);
                const diffX = Math.abs(e.touches[0].clientX - tsX);
                if (diffY > diffX) e.preventDefault();
            } else {
                e.preventDefault();
            }
        }, { passive: false });

        modalFullscreen.addEventListener('wheel', (e) => {
            const isTrack = e.target.closest('.modal-track') || e.target.closest('#modalThumbStrip');
            if (isTrack) {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.preventDefault();
            } else {
                e.preventDefault();
            }
        }, { passive: false });
    }
});

window.addEventListener('keydown', (e) => {
    if (isZoomModalOpen && [32, 33, 34, 38, 40].includes(e.keyCode)) {
        e.preventDefault();
    }
}, { passive: false });
