(() => {
  const endpoint = "https://zilumtvyowzgpwswewtj.supabase.co/functions/v1/enka-intake/public";
  const pending = new Map();
  let widgetScript;

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!widgetScript) {
      widgetScript = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        const timeout = setTimeout(() => fail(), 10000);
        function fail() {
          clearTimeout(timeout);
          script.remove();
          reject(new Error("Turnstile could not load"));
        }
        script.addEventListener("load", () => {
          clearTimeout(timeout);
          if (window.turnstile) resolve(window.turnstile);
          else fail();
        }, { once: true });
        script.addEventListener("error", fail, { once: true });
        document.head.append(script);
      }).catch(error => {
        widgetScript = undefined;
        throw error;
      });
    }
    return widgetScript;
  }

  async function getToken(form) {
    const turnstile = await loadTurnstile();
    const container = document.createElement("div");
    form.append(container);
    let widgetId;
    let timeout;
    try {
      return await new Promise((resolve, reject) => {
        const fail = () => reject(new Error("Turnstile challenge did not complete"));
        timeout = setTimeout(fail, 110000);
        widgetId = turnstile.render(container, {
          sitekey: window.ENKA_TURNSTILE_SITE_KEY,
          action: "enka_order",
          appearance: "interaction-only",
          execution: "execute",
          "response-field": false,
          callback: resolve,
          "error-callback": fail,
          "expired-callback": fail,
          "timeout-callback": fail,
        });
        turnstile.execute(widgetId);
      });
    } finally {
      clearTimeout(timeout);
      if (widgetId !== undefined) turnstile.remove(widgetId);
      container.remove();
    }
  }

  async function requestIdentity(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return "enka.intake." + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function pendingKey(identity) {
    try {
      const saved = sessionStorage.getItem(identity);
      if (saved) return saved;
    } catch { /* Use in-memory state when browser storage is disabled. */ }
    if (pending.has(identity)) return pending.get(identity);
    const key = crypto.randomUUID();
    pending.set(identity, key);
    try { sessionStorage.setItem(identity, key); } catch { /* In-memory fallback. */ }
    return key;
  }

  window.submitEnkaOrder = async function (form, data) {
    if (!window.ENKA_TURNSTILE_SITE_KEY) throw new Error("Turnstile site key is missing");
    const payload = {
      name: data.name.trim(),
      phone: data.phone.replace(/\s+/g, ""),
      items: [{ site_id: String(data.product_id), quantity: 1, ...(data.expected_price != null ? { expected_price: data.expected_price } : {}) }],
    };
    const identity = await requestIdentity(payload);
    const key = pendingKey(identity);
    const token = await getToken(form);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ ...payload, turnstile_token: token }),
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) {
      const order = await response.clone().json();
      if (!order?.id || !Number.isSafeInteger(order.order_no)) throw new Error("Order response was incomplete");
      pending.delete(identity);
      try { sessionStorage.removeItem(identity); } catch { /* In-memory fallback. */ }
    }
    return response;
  };
})();
