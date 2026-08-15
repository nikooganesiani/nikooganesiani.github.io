console.log('🚀 Скрипт progressBar.js успешно загружен браузером!');

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Событие DOMContentLoaded сработало');

  const np = document.getElementById('topProgressBar');
  
  if (!np) {
    console.error('❌ ОШИБКА: Элемент #topProgressBar НЕ НАЙДЕН в HTML!');
    return;
  }
  
  console.log('✅ Элемент #topProgressBar успешно найден:', np);

  // Настраиваем плавность
  np.style.transition = 'transform 0.4s ease-out, opacity 0.3s ease-out';
  np.style.opacity = '1';

  const finishProgress = () => {
    console.log('🏁 Запуск finishProgress (едем до 100%)');
    np.style.transform = 'scaleX(1)';
    
    setTimeout(() => {
      np.style.opacity = '0'; // Растворяем
      setTimeout(() => {
        np.style.transition = 'none';
        np.style.transform = 'scaleX(0)'; // Сбрасываем невидимым
        console.log('👻 Прогресс-бар сброшен и скрыт');
      }, 300);
    }, 400);
  };

  const startAndFinish = () => {
    console.log('➡️ Запуск startAndFinish (страница загрузилась мгновенно)');
    np.style.transform = 'scaleX(0.3)';
    setTimeout(finishProgress, 150);
  };

  if (document.readyState === 'complete') {
    console.log('⚡ Страница уже полностью загружена (document.readyState === complete)');
    startAndFinish();
  } else {
    console.log('⏳ Ждем полной загрузки страницы (window.load)...');
    np.style.transform = 'scaleX(0.3)';
    window.addEventListener('load', () => {
      console.log('✅ Событие window.load сработало!');
      finishProgress();
    });
  }

  // --- Отслеживание кликов ---
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    
    if (link && link.href) {
      console.log('🖱️ Клик по ссылке:', link.href);
      
      const isInternal = link.hostname === window.location.hostname;
      const isSamePageAnchor = isInternal && link.pathname === window.location.pathname && link.hash;
      const isNotBlank = link.target !== '_blank';
      const isNotTelMail = !link.href.startsWith('tel:') && !link.href.startsWith('mailto:');

      if (isInternal && !isSamePageAnchor && isNotBlank && isNotTelMail) {
        console.log('🚀 Запускаем анимацию загрузки новой страницы до 80%!');
        np.style.transition = 'none'; 
        np.style.transform = 'scaleX(0)';
        np.style.opacity = '1';

        setTimeout(() => {
          np.style.transition = 'transform 2s cubic-bezier(0.1, 0.8, 0.2, 1)';
          np.style.transform = 'scaleX(0.8)';
        }, 10);
      } else {
        console.log('🛑 Ссылка проигнорирована (внешняя, якорь, email/tel или target=_blank)');
      }
    }
  });
});
