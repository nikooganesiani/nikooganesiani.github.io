(() => {
    const initProgressBar = () => {
        const progressBar = document.getElementById('topProgressBar');
        if (!progressBar) return;

        progressBar.style.transform = 'scaleX(0.3)';

        window.addEventListener('load', () => {
            if (!progressBar) return;
            progressBar.style.transform = 'scaleX(1)';
            setTimeout(() => {
                if (progressBar) progressBar.style.opacity = '0';
            }, 400);
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProgressBar);
    } else {
        initProgressBar();
    }
})();
