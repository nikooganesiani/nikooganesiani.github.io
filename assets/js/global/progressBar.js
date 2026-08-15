document.addEventListener('DOMContentLoaded', () => {
  const np = document.getElementById('topProgressBar');
  if (!np) return;

  // Шаг 1: Показываем старт загрузки (30%)
  np.style.transform = 'scaleX(0.3)';

  // Шаг 2: Когда всё (картинки, стили) полностью догрузилось — доводим до 100% и скрываем
  if (document.readyState === 'complete') {
    finishProgress(np);
  } else {
    window.addEventListener('load', () => finishProgress(np));
  }
});

function finishProgress(np) {
  np.style.transform = 'scaleX(1)';
  setTimeout(() => {
    np.style.opacity = '0';
  }, 400);
}
