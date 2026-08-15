document.addEventListener('DOMContentLoaded', () => {
  const np = document.getElementById('topProgressBar');
  if (!np) return;

  np.style.transition = 'transform 0.4s ease-out, opacity 0.3s ease-out';
  np.style.opacity = '1';

  const finishProgress = () => {
    np.style.transform = 'scaleX(1)';
    setTimeout(() => {
      np.style.opacity = '0';
      setTimeout(() => {
        np.style.transition = 'none';
        np.style.transform = 'scaleX(0)';
      }, 300);
    }, 400);
  };

  const startAndFinish = () => {
    np.style.transform = 'scaleX(0.3)';
    setTimeout(finishProgress, 150);
  };

  if (document.readyState === 'complete') {
    startAndFinish();
  } else {
    np.style.transform = 'scaleX(0.3)';
    window.addEventListener('load', finishProgress);
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    
    if (link && link.href) {
      const isInternal = link.hostname === window.location.hostname;
      const isSamePageAnchor = isInternal && link.pathname === window.location.pathname && link.hash;
      const isNotBlank = link.target !== '_blank';
      const isNotTelMail = !link.href.startsWith('tel:') && !link.href.startsWith('mailto:');

      if (isInternal && !isSamePageAnchor && isNotBlank && isNotTelMail) {
        np.style.transition = 'none';
        np.style.transform = 'scaleX(0)';
        np.style.opacity = '1';

        setTimeout(() => {
          np.style.transition = 'transform 2s cubic-bezier(0.1, 0.8, 0.2, 1)';
          np.style.transform = 'scaleX(0.8)';
        }, 10);
      }
    }
  });
});
