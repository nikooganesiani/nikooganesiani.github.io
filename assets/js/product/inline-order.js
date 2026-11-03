document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const form = document.getElementById('inlineOrderForm');
  if (!form) return;
  const nameInput = document.getElementById('inlineName');
  const phoneInput = document.getElementById('inlinePhone');
  const button = document.getElementById('submitInlineOrderBtn');
  const buttonText = document.getElementById('inlineOrderButtonText');
  const error = document.getElementById('inlineOrderError');
  const fields = document.getElementById('inlineOrderFields');
  let submitting = false;

  function inputError(input, message = '') {
    const el = document.getElementById(input.id + 'Error');
    input.toggleAttribute('aria-invalid', !!message);
    if (message) input.setAttribute('aria-invalid', 'true');
    el.textContent = message;
    el.hidden = !message;
  }
  function showError(message) {
    error.textContent = message;
    error.hidden = !message;
  }
  nameInput.addEventListener('input', () => inputError(nameInput));
  phoneInput.addEventListener('input', () => {
    window.formatPhoneInput(phoneInput);
    inputError(phoneInput);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || window.enkaOrderPending || button.disabled || fields.disabled || form.dataset.available !== 'true') return;
    if (document.getElementById('inlineEmailHp').value) return;
    showError('');
    inputError(nameInput);
    inputError(phoneInput);
    const name = nameInput.value.trim();
    let phoneRaw = phoneInput.value.replace(/\D/g, '');
    if (phoneRaw.startsWith('995')) phoneRaw = phoneRaw.slice(3);
    if (phoneRaw.startsWith('0')) phoneRaw = phoneRaw.slice(1);
    const invalidName = name.length < 2 || name.length > 100;
    const invalidPhone = !/^5\d{8}$/.test(phoneRaw);
    if (invalidName) inputError(nameInput, 'გთხოვთ, მიუთითოთ თქვენი სახელი (მინიმუმ 2 სიმბოლო).');
    if (invalidPhone) inputError(phoneInput, 'მიუთითეთ 9-ნიშნა მობილურის ნომერი, რომელიც იწყება 5-ით.');
    if (invalidName || invalidPhone) { (invalidName ? nameInput : phoneInput).focus(); return; }
    const product = { ...window.currentProduct };
    if (!product.id || !(Number(product.price) > 0) || product.stockStatus !== 'in_stock') return;
    const phone = '+995' + phoneRaw;
    const guard = checkOrderSpamGuard(name, phone, product.id);
    const confirmation = { name, phone, product: product.name, price: product.price, oldPrice: product.oldPrice };
    if (!guard.allowed) {
      if (guard.reason === 'duplicate_exact') window.showOrderConfirm?.({ ...confirmation, save: false });
      else showError(guard.reason === 'cooldown' ? 'გთხოვთ, მოითმინოთ რამდენიმე წამი და სცადოთ ხელახლა.' : 'შეკვეთების ლიმიტი ამოწურულია. სცადეთ მოგვიანებით ან დაგვირეკეთ.');
      return;
    }
    submitting = true;
    window.enkaOrderPending = true;
    fields.disabled = true;
    button.disabled = true;
    buttonText.textContent = 'იგზავნება…';
    form.setAttribute('aria-busy', 'true');
    try {
      const eventId = 'purchase_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      const response = await fetch(window.WORKER_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'EnkaOrderForm' },
        body: JSON.stringify({ event_name: 'Purchase', name, phone, product: product.name, price: product.price, product_id: product.id, event_id: eventId, source: 'Страница товара' })
      });
      const result = await response.clone().json().catch(() => null);
      if (!response.ok || result?.ok === false || result?.success === false || result?.error) throw new Error('Order rejected');
      recordSuccessfulOrder(guard.exactSignature);
      try {
        Promise.resolve(window.sendCapiEvent?.('Purchase', { value: Number(product.price), currency: 'GEL', content_name: product.name, content_ids: [product.id], content_type: 'product', num_items: 1 }, eventId, { name, phone })).catch(() => {});
      } catch { /* Analytics must not change an accepted order. */ }
      window.showOrderConfirm?.(confirmation);
    } catch {
      showError('შეკვეთის დადასტურება ვერ მოხერხდა. სცადეთ ხელახლა ან დაგვირეკეთ: +995 551 17 89 90.');
    } finally {
      submitting = false;
      window.enkaOrderPending = false;
      fields.disabled = form.dataset.available !== 'true';
      button.disabled = fields.disabled;
      buttonText.textContent = 'ყიდვა';
      form.removeAttribute('aria-busy');
    }
  });
});
