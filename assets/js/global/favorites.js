/**
 * favorites.js
 * Данные избранного берутся из API каталога, а не из вёрстки карточки.
 */

(function () {
  'use strict';

  var CATALOG_API = 'https://api.enkaelectronics.com.ge/catalog';
  var STORAGE_KEY = 'myFavs';
  var CATALOG_CACHE_KEY = 'catalogCache_v1';
  var CATALOG_TTL_MS = 5 * 60 * 1000;

  var catalogMemory = null;
  var catalogPromise = null;

  function getFavLink(btn) {
    var card = btn && btn.closest ? btn.closest('.product-card') : null;
    if (card) {
      var aEl =
        card.querySelector('a.product-link, a[href*="/product/"], a:not(.btn-fav):not(.btn-fav-card)') ||
        card.querySelector('a');
      if (aEl && aEl.getAttribute('href')) {
        try {
          return new URL(aEl.getAttribute('href'), window.location.origin).pathname;
        } catch (e) {
          return aEl.getAttribute('href');
        }
      }
    }
    return window.location.pathname;
  }

  function readAttr(el, names) {
    if (!el) return '';
    for (var i = 0; i < names.length; i++) {
      var val = el.getAttribute(names[i]);
      if (val) return String(val).trim();
    }
    return '';
  }

  function extractSlug(link) {
    if (!link) return '';
    try {
      var path = link;
      if (/^https?:\/\//i.test(link)) {
        path = new URL(link).pathname;
      }
      var match = path.match(/\/product(?:s)?\/([^\/?#]+)/i);
      if (match) return decodeURIComponent(match[1]);

      var queryMatch = String(link).match(/[?&](?:sku|id)=([^&]+)/i);
      if (queryMatch) return decodeURIComponent(queryMatch[1]);

      return path.replace(/\/+$/, '').split('/').pop() || '';
    } catch (e) {
      return '';
    }
  }

  function extractNumericId(value) {
    if (!value) return '';
    var str = String(value);
    if (/^\d+$/.test(str)) return str;
    var tail = str.match(/(\d{3,})$/);
    return tail ? tail[1] : '';
  }

  function collectHints(btn) {
    var card = btn && btn.closest ? btn.closest('.product-card, [data-sku], [data-id], [data-product-id]') : null;
    var link = getFavLink(btn);
    var slug = extractSlug(link);

    var sku =
      readAttr(btn, ['data-sku', 'data-product-sku']) ||
      readAttr(card, ['data-sku', 'data-product-sku', 'data-article']);

    var id =
      readAttr(btn, ['data-id', 'data-product-id']) ||
      readAttr(card, ['data-id', 'data-product-id', 'data-product']);

    if (!sku) sku = extractNumericId(slug);
    if (!id) id = extractNumericId(slug) || sku;

    var name = '';
    if (card) {
      var nameEl = card.querySelector('.product-name, .product-title, .card-title');
      if (nameEl) name = nameEl.innerText.trim();
    } else {
      var titleEl = document.querySelector('.title-desktop, .title-mobile, h1.product-title-h1, h1');
      if (titleEl) name = titleEl.innerText.trim();
    }

    return {
      sku: sku ? String(sku) : '',
      id: id ? String(id) : '',
      slug: slug ? String(slug) : '',
      link: link || '',
      name: name || ''
    };
  }

  function normalizeList(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.products)) return data.products;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.catalog)) return data.catalog;
    if (Array.isArray(data.data)) return data.data;
    return [];
  }

  function readCachedCatalog() {
    try {
      var raw = sessionStorage.getItem(CATALOG_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) return null;
      if (Date.now() - parsed.ts > CATALOG_TTL_MS) return null;
      return parsed.items;
    } catch (e) {
      return null;
    }
  }

  function writeCachedCatalog(items) {
    try {
      sessionStorage.setItem(
        CATALOG_CACHE_KEY,
        JSON.stringify({ ts: Date.now(), items: items })
      );
    } catch (e) {}
  }

  function getCatalog() {
    if (catalogMemory) return Promise.resolve(catalogMemory);
    if (catalogPromise) return catalogPromise;

    var cached = readCachedCatalog();
    if (cached) {
      catalogMemory = cached;
      return Promise.resolve(cached);
    }

    catalogPromise = fetch(CATALOG_API, { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('Catalog HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var items = normalizeList(data);
        catalogMemory = items;
        writeCachedCatalog(items);
        return items;
      })
      .catch(function (err) {
        catalogPromise = null;
        throw err;
      });

    return catalogPromise;
  }

  function same(a, b) {
    if (a == null || b == null || a === '' || b === '') return false;
    return String(a).trim() === String(b).trim();
  }

  function normalizeName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findProduct(catalog, hints) {
    if (!Array.isArray(catalog) || !catalog.length) return null;

    var i;
    var p;

    if (hints.sku) {
      for (i = 0; i < catalog.length; i++) {
        p = catalog[i];
        if (same(p.sku, hints.sku) || same(p.id, hints.sku)) return p;
      }
    }

    if (hints.id) {
      for (i = 0; i < catalog.length; i++) {
        p = catalog[i];
        if (same(p.id, hints.id) || same(p.sku, hints.id)) return p;
      }
    }

    if (hints.slug) {
      var slugNum = extractNumericId(hints.slug);
      for (i = 0; i < catalog.length; i++) {
        p = catalog[i];
        if (same(p.sku, hints.slug) || same(p.id, hints.slug)) return p;
        if (slugNum && (same(p.sku, slugNum) || same(p.id, slugNum))) return p;
      }
    }

    if (hints.name) {
      var target = normalizeName(hints.name);
      var exact = null;
      var partial = null;
      for (i = 0; i < catalog.length; i++) {
        p = catalog[i];
        var n = normalizeName(p.name);
        if (!n) continue;
        if (n === target) {
          exact = p;
          break;
        }
        if (!partial && (n.indexOf(target) !== -1 || target.indexOf(n) !== -1)) {
          partial = p;
        }
      }
      if (exact) return exact;
      if (partial) return partial;
    }

    return null;
  }

  function formatPrice(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number') {
      if (!isFinite(value) || value <= 0) return null;
      return String(value) + ' ₾';
    }
    var cleaned = String(value).replace(/₾/g, '').trim();
    if (!cleaned || cleaned === '0') return null;
    return cleaned + ' ₾';
  }

  function getProductImage(product) {
    var images = product && product.images;
    if (!images) return '';
    if (typeof images === 'string') return images;
    if (Array.isArray(images) && images.length) {
      var first = images[0];
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object') {
        return first.url || first.src || first.image || first.path || '';
      }
    }
    return '';
  }

  function buildFavItem(product, hints) {
    var sku = product.sku != null ? String(product.sku) : hints.sku || '';
    var id = product.id != null ? String(product.id) : hints.id || sku;
    var link = hints.link || (sku ? '/product/' + sku : window.location.pathname);

    return {
      id: id,
      sku: sku,
      name: product.name || hints.name || 'პროდუქტი',
      brand: product.brand || '',
      price: formatPrice(product.price) || '0 ₾',
      oldPrice: formatPrice(product.oldPrice),
      img: getProductImage(product),
      images: product.images || [],
      categories: product.categories || [],
      subcategories: product.subcategories || [],
      description: product.description || '',
      specs: product.specs || null,
      link: link
    };
  }

  function loadFavs() {
    try {
      var favs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(favs) ? favs : [];
    } catch (e) {
      return [];
    }
  }

  function saveFavs(favs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
    if (typeof window.updateBadges === 'function') window.updateBadges();
  }

  function identitiesOf(item, extraHints) {
    var set = {};
    function add(v) {
      if (v != null && String(v).trim() !== '') set[String(v).trim()] = true;
    }
    if (item) {
      add(item.sku);
      add(item.id);
      add(item.link);
      add(extractSlug(item.link));
      add(extractNumericId(item.sku));
      add(extractNumericId(item.id));
      add(extractNumericId(item.link));
    }
    if (extraHints) {
      add(extraHints.sku);
      add(extraHints.id);
      add(extraHints.link);
      add(extraHints.slug);
    }
    return set;
  }

  function findFavIndex(favs, hints) {
    var keys = identitiesOf(null, hints);
    for (var i = 0; i < favs.length; i++) {
      var itemKeys = identitiesOf(favs[i]);
      for (var k in keys) {
        if (itemKeys[k]) return i;
      }
    }
    return -1;
  }

  function hintsFromItem(item) {
    return {
      sku: item && item.sku ? String(item.sku) : '',
      id: item && item.id ? String(item.id) : '',
      slug: extractSlug(item && item.link),
      link: item && item.link ? item.link : '',
      name: item && item.name ? item.name : ''
    };
  }

  function setButtonsState(hints, isActive) {
    document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(function (otherBtn) {
      var otherHints = collectHints(otherBtn);
      var a = identitiesOf(null, hints);
      var b = identitiesOf(null, otherHints);
      var match = false;
      for (var k in a) {
        if (b[k]) {
          match = true;
          break;
        }
      }
      if (!match) return;
      if (isActive) otherBtn.classList.add('active');
      else otherBtn.classList.remove('active');
    });
  }

  window.toggleFav = function (event, btn) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!btn || btn.dataset.favBusy === '1') return;

    try {
      var hints = collectHints(btn);
      var favs = loadFavs();
      var existingIdx = findFavIndex(favs, hints);

      if (existingIdx > -1) {
        favs.splice(existingIdx, 1);
        saveFavs(favs);
        setButtonsState(hints, false);
        if (typeof window.showToast === 'function') window.showToast('წაშლილია რჩეულებიდან');
        return;
      }

      btn.dataset.favBusy = '1';
      btn.classList.add('is-loading');

      getCatalog()
        .then(function (catalog) {
          var product = findProduct(catalog, hints);
          if (!product) {
            throw new Error('Product not found in catalog');
          }

          var item = buildFavItem(product, hints);
          favs = loadFavs();
          if (findFavIndex(favs, hintsFromItem(item)) > -1) return item;

          favs.unshift(item);
          saveFavs(favs);
          setButtonsState(hintsFromItem(item), true);
          if (typeof window.showToast === 'function') {
            window.showToast('დამატებულია რჩეულებში', 'fav');
          }
          return item;
        })
        .catch(function (err) {
          console.error('Favorite add error:', err);
          if (typeof window.showToast === 'function') {
            window.showToast('ვერ მოხერხდა რჩეულებში დამატება');
          }
        })
        .then(function () {
          btn.dataset.favBusy = '0';
          btn.classList.remove('is-loading');
        });
    } catch (e) {
      btn.dataset.favBusy = '0';
      btn.classList.remove('is-loading');
      console.error('Favorite toggle error:', e);
    }
  };

  function syncFavButtons() {
    try {
      var favs = loadFavs();
      var allKeys = {};
      favs.forEach(function (item) {
        var keys = identitiesOf(item);
        for (var k in keys) allKeys[k] = true;
      });

      document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(function (btn) {
        var hints = collectHints(btn);
        var keys = identitiesOf(null, hints);
        var active = false;
        for (var k in keys) {
          if (allKeys[k]) {
            active = true;
            break;
          }
        }
        if (active) btn.classList.add('active');
        else btn.classList.remove('active');
      });
    } catch (e) {
      console.error('Favorite sync error:', e);
    }
  }

  function initFavorites() {
    syncFavButtons();
    getCatalog().catch(function () {});

    if (document.body) {
      var favObserver = new MutationObserver(function (mutations) {
        var hasAddedNodes = mutations.some(function (m) {
          return m.addedNodes.length > 0;
        });
        if (hasAddedNodes) syncFavButtons();
      });
      favObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.syncFavButtons = syncFavButtons;
  window.getFavoritesCatalog = getCatalog;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFavorites);
  } else {
    initFavorites();
  }
})();
