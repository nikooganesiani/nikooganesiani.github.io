document.addEventListener('DOMContentLoaded', () => {
  const np = document.getElementById('topProgressBar');
  if (!np) return;

  np.style.opacity = '1';
  
  requestAnimationFrame(() => {
    np.style.transform = 'scaleX(0.4)';
  });

  const completeProgress = () => {
    np.style.transform = 'scaleX(1)';
    setTimeout(() => {
      np.style.opacity = '0';

      setTimeout(() => {
        np.style.transform = 'scaleX(0)';
      }, 400);
    }, 300);
  };

  if (document.readyState === 'complete') {
    completeProgress();
  } else {
    window.addEventListener('load', completeProgress, { once: true });
  }
});
