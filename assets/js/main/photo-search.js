(() => {
  'use strict';
  const MODEL = 'mobilenet-v2-100-224-v1';
  const MAX_BYTES = 10 * 1024 * 1024;
  const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const cancelled = () => new DOMException('Search cancelled', 'AbortError');

  function validateFile(file) {
    if (!file || !TYPES.has(file.type)) throw new Error('აირჩიეთ JPG, PNG ან WebP ფოტო.');
    if (!file.size || file.size > MAX_BYTES) throw new Error('ფოტოს ზომა უნდა იყოს 10 MB-მდე.');
  }
  function normalize(values) {
    const norm = Math.hypot(...values);
    if (!norm || values.some(value => !Number.isFinite(value))) throw new Error('Invalid image embedding');
    return Array.from(values, value => value / norm);
  }
  function similarity(a, b) {
    if (a.length !== b.length) return -1;
    return a.reduce((score, value, index) => score + value * b[index], 0);
  }
  function rank(query, candidates) {
    const scored = candidates.map(item => ({ ...item, score: similarity(query, item.vector) }))
      .filter(item => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score);
    const minimum = Math.max(0.45, (scored[0]?.score || 0) - 0.15);
    return scored.filter(item => item.score >= minimum).slice(0, 9);
  }
  // Exposed separately so ranking and upload limits can be checked without a model download.
  window.PhotoSearch = { validateFile, normalize, similarity, rank };

  let modelPromise;
  const scriptPromises = new Map();
  function loadScript(src) {
    if (scriptPromises.has(src)) return scriptPromises.get(src);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => { script.remove(); scriptPromises.delete(src); reject(new Error('Model script timeout')); }, 30000);
      script.src = src;
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); scriptPromises.delete(src); reject(new Error('Model script unavailable')); };
      document.head.append(script);
    });
    scriptPromises.set(src, promise);
    return promise;
  }
  function loadModel() {
    if (!modelPromise) modelPromise = (async () => {
      await loadScript('/assets/vendor/photo-search/tf.min.js');
      await loadScript('/assets/vendor/photo-search/mobilenet.min.js');
      await window.tf.ready();
      let timer;
      try {
        return await Promise.race([
          window.mobilenet.load({ version: 2, alpha: 1.0 }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Model timeout')), 75000); })
        ]);
      } finally { clearTimeout(timer); }
    })().catch(error => { modelPromise = null; throw error; });
    return modelPromise;
  }
  function readImage(url, signal, remote = false) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(cancelled()); return; }
      const image = new Image();
      if (remote) image.crossOrigin = 'anonymous';
      const finish = (error) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        image.onload = image.onerror = null;
        error ? reject(error) : resolve(image);
      };
      const abort = () => { image.src = ''; finish(cancelled()); };
      const timer = setTimeout(() => { image.src = ''; finish(new Error('Image timeout')); }, 12000);
      signal.addEventListener('abort', abort, { once: true });
      image.onload = () => finish();
      image.onerror = () => finish(new Error('Image unavailable'));
      image.src = url;
    });
  }
  async function embedding(model, image) {
    // Downsample before creating tensors; a high resolution phone photo must not exhaust the GPU.
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('Image dimensions too large');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 224;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 224, 224);
    const scale = Math.min(224 / image.naturalWidth, 224 / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    ctx.drawImage(image, (224 - width) / 2, (224 - height) / 2, width, height);
    const tensor = model.infer(canvas, true);
    try { return normalize(Array.from(await tensor.data())); } finally { tensor.dispose(); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('photoSearchModal');
    if (!modal) return;
    document.querySelectorAll('[data-photo-search]').forEach(button => button.addEventListener('click', () => {
      window.openAppModal('photoSearchModal', button);
    }));
    let stylesheet;
    modal.addEventListener('modal:open', () => {
      if (stylesheet) return;
      stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = '/assets/vendor/photo-search/loader.css';
      stylesheet.onerror = () => { stylesheet.remove(); stylesheet = null; };
      document.head.append(stylesheet);
    });
    modal.addEventListener('modal:open', () => initialize(modal), { once: true });
  });

  function initialize(modal) {
    const get = suffix => document.getElementById('photoSearch' + suffix);
    const fileInput = get('File'), status = get('Status'), grid = get('Grid');
    const dropzone = get('Dropzone'), loading = get('Loading'), results = get('Results');
    const selected = get('Selected'), preview = get('Preview'), retry = get('Retry');
    let controller, objectURL, lastFile, revision = 0;
    const resultProducts = new Map();
    window.EnkaSearchHistory?.trackResults(grid, card => resultProducts.get(card.dataset.productId));
    let statusTimers = [];
    const text = value => window.enkaI18n?.t(value) || value;
    const say = value => { status.textContent = text(value); };
    const releasePreview = () => { if (objectURL) URL.revokeObjectURL(objectURL); objectURL = null; preview.removeAttribute('src'); };
    function stopLoading() {
      statusTimers.forEach(clearTimeout); statusTimers = [];
      loading.hidden = true; modal.classList.remove('is-searching'); grid.removeAttribute('aria-busy');
    }
    function cancel() {
      ++revision;
      controller?.abort();
      controller = null;
      stopLoading();
    }
    get('Choose').addEventListener('click', () => fileInput.click());
    get('Replace').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { const file = fileInput.files[0]; fileInput.value = ''; if (file) search(file); });
    retry.addEventListener('click', () => { if (lastFile) search(lastFile); });
    ['dragenter', 'dragover'].forEach(event => dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add('is-dragging'); }));
    ['dragleave', 'drop'].forEach(event => dropzone.addEventListener(event, e => {
      e.preventDefault(); dropzone.classList.remove('is-dragging');
      if (event === 'drop' && e.dataTransfer.files[0]) search(e.dataTransfer.files[0]);
    }));
    modal.addEventListener('modal:close', () => {
      cancel(); releasePreview(); lastFile = null; selected.hidden = true; dropzone.hidden = false;
      retry.hidden = results.hidden = true; grid.replaceChildren(); resultProducts.clear(); say('');
    });
    async function search(file) {
      if (!modal.classList.contains('active')) return;
      const moveFocus = [get('Choose'), retry].includes(document.activeElement);
      cancel();
      const run = revision;
      try { validateFile(file); } catch (error) { say(error.message); return; }
      const request = new AbortController();
      controller = request;
      const signal = request.signal;
      const ensureActive = () => { if (signal.aborted || revision !== run) throw cancelled(); };
      retry.hidden = results.hidden = true;
      grid.replaceChildren();
      resultProducts.clear();
      lastFile = file;
      releasePreview();
      objectURL = URL.createObjectURL(file);
      const url = objectURL;
      preview.src = url; get('Filename').textContent = file.name;
      selected.hidden = false;
      if (moveFocus) get('Replace').focus({ preventScroll: true });
      dropzone.hidden = true; loading.hidden = false;
      modal.classList.add('is-searching');
      say('ვეძებთ');
      statusTimers = [
        setTimeout(() => { if (revision === run) say('კიდევ ცოტა'); }, 6000),
        setTimeout(() => { if (revision === run) say('ვამზადებთ შედეგებს'); }, 14000)
      ];
      grid.setAttribute('aria-busy', 'true');
      let deadline;
      try {
        const timeout = new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Model download timeout')), 90000); });
        const [model, image, catalog, index] = await Promise.race([
          Promise.all([loadModel(), readImage(url, signal), window.fetchCatalogCached(),
            fetch('/assets/data/photo-search-index.json', { signal }).then(response => {
              if (!response.ok) throw new Error('Index unavailable');
              return response.json();
            })]), timeout
        ]);
        clearTimeout(deadline); ensureActive();
        statusTimers.forEach(clearTimeout); statusTimers = [];
        say('ვამზადებთ შედეგებს');
        const query = await embedding(model, image); ensureActive();
        const products = catalog.products.filter(p => window.productStock(p.stockStatus) !== 'out_of_stock');
        if (index.model !== MODEL || !Array.isArray(index.items)) throw new Error('Invalid index');
        const indexed = new Map(index.items.map(item => [item.id, item]));
        const candidates = products.flatMap(product => {
          const item = indexed.get(String(product.id));
          // Exclude changed photos until the next build, rather than silently searching stale vectors.
          const photos = Array.isArray(product.images) ? product.images : [product.image];
          return item && photos.includes(item.image) && Array.isArray(item.vector) &&
            item.vector.length === query.length && item.vector.every(Number.isFinite) ? [{ product, vector: item.vector }] : [];
        });
        ensureActive();
        if (!candidates.length) throw new Error('Catalog images unavailable');
        const matches = rank(query, candidates);
        if (!matches.length) { say('მსგავსი პროდუქტი ვერ მოიძებნა. სცადეთ პროდუქტის უფრო მკაფიო ფოტო.'); return; }
        for (const { product } of matches) resultProducts.set(String(product.id), product);
        grid.innerHTML = matches.map(item => window.createProductCardHTML(item.product, 'photo')).join('');
        window.syncFavButtons?.();
        results.hidden = false;
        say(candidates.length < products.length ? 'ნაჩვენებია მსგავსი პროდუქტები. ზოგიერთი ფოტო ვერ დამუშავდა.' : 'ძიება დასრულდა.');
      } catch (error) {
        if (error.name === 'AbortError' || revision !== run) return;
        say('ფოტოთი ძიება ვერ მოხერხდა. შეამოწმეთ კავშირი ან სცადეთ სხვა ფოტო.');
        retry.hidden = false;
      } finally {
        clearTimeout(deadline);
        request.abort();
        if (revision === run) { controller = null; stopLoading(); }
      }
    }
  }
})();
