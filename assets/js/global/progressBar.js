document.addEventListener('DOMContentLoaded', () => {
  const np = document.getElementById('topProgressBar');
  if (!np) return;

  // 1. Мгновенно делаем полосу видимой и ставим на 10% без анимации
  np.style.transition = 'none';
  np.style.opacity = '1';
  np.style.transform = 'scaleX(0.1)'; 

  // 2. МАГИЯ: Принудительный Reflow. Заставляем браузер реально нарисовать эти 10% на экране!
  void np.offsetWidth; 

  // 3. Включаем плавную анимацию для дальнейших шагов
  np.style.transition = 'transform 0.4s ease-out, opacity 0.3s ease-out';

  const finishProgress = () => {
    np.style.transform = 'scaleX(1)'; // Ползем до 100%
    setTimeout(() => {
      np.style.opacity = '0'; // Растворяемся
      setTimeout(() => {
        np.style.transition = 'none'; // Убираем анимацию для сброса
        np.style.transform = 'scaleX(0)'; // Незаметно возвращаем в 0
      }, 300);
    }, 400); // Ждем завершения transform
  };

  // 4. Логика загрузки (даем задержку в 100мс, чтобы глаз успел заметить движение)
  if (document.readyState === 'complete') {
    np.style.transform = 'scaleX(0.3)';
    setTimeout(finishProgress, 100); 
  } else {
    np.style.transform = 'scaleX(0.3)';
    window.addEventListener('load', () => {
      setTimeout(finishProgress, 100);
    });
  }

  // --- Отслеживание кликов (имитация загрузки SPA) ---
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.href) {
      const isInternal = link.hostname === window.location.hostname;
      const isSamePageAnchor = isInternal && link.pathname === window.location.pathname && link.hash;
      const isNotBlank = link.target !== '_blank';
      const isNotTelMail = !link.href.startsWith('tel:') && !link.href.startsWith('mailto:');

      if (isInternal && !isSamePageAnchor && isNotBlank && isNotTelMail) {
        // Сбрасываем
        np.style.transition = 'none'; 
        np.style.transform = 'scaleX(0.1)';
        np.style.opacity = '1';
        
        // Снова принудительно заставляем отрисовать старт!
        void np.offsetWidth; 

        // И запускаем долгую анимацию до 80%, пока грузится следующая страница
        np.style.transition = 'transform 2s cubic-bezier(0.1, 0.8, 0.2, 1)';
        np.style.transform = 'scaleX(0.8)';
      }
    }
  });
});
