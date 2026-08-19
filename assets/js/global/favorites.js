/**
 * Управление списком избранных товаров.
 * Обеспечивает синхронизацию между LocalStorage и пользовательским интерфейсом.
 */
class FavoritesManager {
  constructor(options = {}) {
    this.storageKey = options.storageKey || 'enka_favorites';
    this.btnSelector = options.btnSelector || '[data-action="toggle-favorite"]';
    this.counterSelector = options.counterSelector || '.favorites-counter';
    this.activeClass = options.activeClass || 'is-active';
    
    // Инициализация состояния
    this.favorites = this._loadFromStorage();
    
    // Запуск слушателей
    this._initEvents();
    this.updateUI();
  }

  /**
   * Приватный метод: загрузка данных из LocalStorage
   * @returns {Map} Коллекция избранных товаров (Map используется для быстрого поиска и хранения объектов)
   */
  _loadFromStorage() {
    try {
      const data = localStorage.getItem(this.storageKey);
      const parsedData = data ? JSON.parse(data) : [];
      // Ожидается, что храним массив объектов { id, title, price, etc. }
      return new Map(parsedData.map(item => [item.id, item]));
    } catch (error) {
      console.error('Ошибка чтения Favorites из LocalStorage:', error);
      return new Map();
    }
  }

  /**
   * Приватный метод: сохранение данных в LocalStorage
   */
  _saveToStorage() {
    try {
      const dataArray = Array.from(this.favorites.values());
      localStorage.setItem(this.storageKey, JSON.stringify(dataArray));
    } catch (error) {
      console.error('Ошибка записи Favorites в LocalStorage (возможно, превышена квота):', error);
    }
  }

  /**
   * Инициализация событий с использованием делегирования
   */
  _initEvents() {
    // Слушаем клики по всему документу для динамически добавленных элементов
    document.addEventListener('click', (event) => {
      const btn = event.target.closest(this.btnSelector);
      if (!btn) return;

      event.preventDefault();
      
      // Собираем данные о товаре из data-атрибутов кнопки
      const productData = {
        id: btn.dataset.id,
        title: btn.dataset.title || '',
        price: btn.dataset.price || 0,
        image: btn.dataset.image || ''
      };

      if (!productData.id) {
        console.warn('Кнопка избранного не содержит data-id');
        return;
      }

      this.toggle(productData);
    });

    // Синхронизация между соседними вкладками браузера
    window.addEventListener('storage', (event) => {
      if (event.key === this.storageKey) {
        this.favorites = this._loadFromStorage();
        this.updateUI();
      }
    });
  }

  /**
   * Переключение статуса товара (добавить/удалить)
   * @param {Object} product - Данные товара
   */
  toggle(product) {
    if (this.favorites.has(product.id)) {
      this.favorites.delete(product.id);
    } else {
      this.favorites.set(product.id, product);
    }
    
    this._saveToStorage();
    this.updateUI();
  }

  /**
   * Получить все избранные товары в виде массива
   * @returns {Array}
   */
  getAll() {
    return Array.from(this.favorites.values());
  }

  /**
   * Тотальное обновление UI: счетчики в шапке и состояния кнопок на странице
   */
  updateUI() {
    // 1. Обновляем все счетчики на странице (например, в хедере)
    const counters = document.querySelectorAll(this.counterSelector);
    counters.forEach(counter => {
      counter.textContent = this.favorites.size;
      // Дополнительно можно скрывать/показывать бейдж, если 0
      counter.style.display = this.favorites.size > 0 ? 'inline-block' : 'none';
    });

    // 2. Обновляем состояния всех кнопок-сердечек на текущей странице
    const buttons = document.querySelectorAll(this.btnSelector);
    buttons.forEach(btn => {
      const id = btn.dataset.id;
      if (this.favorites.has(id)) {
        btn.classList.add(this.activeClass);
        btn.setAttribute('aria-label', 'Удалить из избранного');
        // Опционально: смена иконки на залитую
      } else {
        btn.classList.remove(this.activeClass);
        btn.setAttribute('aria-label', 'Добавить в избранное');
        // Опционально: смена иконки на пустую
      }
    });
  }
}

// Экспорт для модульной системы, или инициализация в браузере
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FavoritesManager;
} else {
  // Автоматический запуск при загрузке DOM
  document.addEventListener('DOMContentLoaded', () => {
    window.Favorites = new FavoritesManager({
      storageKey: 'enka_favorites_v1', // Версионирование ключа полезно при смене структуры данных
      btnSelector: '.js-favorite-btn',
      counterSelector: '.js-favorite-counter',
      activeClass: 'favorite-active'
    });
  });
}
