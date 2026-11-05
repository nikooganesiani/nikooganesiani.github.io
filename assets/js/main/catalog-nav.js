const NORMALIZE_CHAR_MAP = {
    'a':'ა','b':'ბ','c':'ც','d':'დ','e':'ე','f':'ფ','g':'გ','h':'ჰ','i':'ი','j':'ჯ','k':'კ','l':'ლ','m':'მ','n':'ნ','o':'ო','p':'პ','q':'ქ','r':'რ','s':'ს','t':'ტ','u':'უ','v':'ვ','w':'წ','x':'ხ','y':'ყ','z':'ზ',
    'A':'ა','B':'ჩ','C':'ჩ','D':'დ','E':'ე','F':'ფ','G':'ღ','H':'ჰ','I':'ი','J':'ჟ','K':'კ','L':'ლ','M':'მ','N':'ნ','O':'ო','P':'პ','Q':'ქ','R':'ღ','S':'შ','T':'თ','U':'უ','V':'ვ','W':'ჭ','X':'ხ','Y':'ყ','Z':'ძ',
    'а':'ა','б':'ბ','в':'ვ','г':'გ','д':'დ','е':'ე','ё':'ე','ж':'ჟ','з':'ზ','и':'ი','й':'ი','к':'კ','л':'ლ','м':'მ','н':'ნ','о':'ო','п':'პ','р':'რ','с':'ს','т':'ტ','у':'უ','ф':'ფ','х':'ხ','ц':'ც','ч':'ჩ','ш':'შ','щ':'შ','ъ':'','ы':'ი','ь':'','э':'ე','ю':'იუ','я':'ია'
};

window.normalizeQuery = function(q) {
    if (!q) return '';
    let res = '';
    for (const char of q) {
        res += NORMALIZE_CHAR_MAP[char] ?? char;
    }
    return res.toLowerCase();
};

window.closeNavModal = function() {
    window.closeAppModal?.('navModal');
};

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('dynamicNavAccordion');
  if (!container || !window.CATALOG_STRUCTURE) return;
  const escape = window.escapeHTML;
  const arrow = '<svg class="shrink-0 text-[#85909e] [transition:transform_180ms_ease] [.modal-category-toggle[aria-expanded=true]_&]:transform-[rotate(180deg)] motion-reduce:[transition:none]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const columns = [[], []];
  let index = 0;
  for (const [id, category] of Object.entries(window.CATALOG_STRUCTURE)) {
    if (!category) continue;
    const encoded = encodeURIComponent(id);
    const panelId = 'catalog-panel-' + encoded;
    const subs = Array.isArray(category.subs) ? category.subs : [];
    const links = subs.map(sub => '<a href="/category/?' + encoded + '&amp;sub=' + encodeURIComponent(sub.id) + '">' + escape(sub.name) + '</a>').join('');
    const item = '<section class="modal-category border border-solid border-[#e6eaf0] rounded-[14px] overflow-hidden [&.active]:border-[#ccd9ef]">' +
      '<button type="button" class="modal-category-toggle flex items-center gap-3 w-full min-h-18 p-3.5 text-[#344050] text-left text-[length:14px] font-semibold leading-[1.6] cursor-pointer [@media(hover:_hover)]:hover:bg-[#f8fafc] max-[640px]:min-h-16.5" aria-expanded="false" aria-controls="' + panelId + '">' +
      '<span class="flex items-center justify-center [flex:0_0_36px] h-9 rounded-[10px] bg-[#f1f5fc] text-brand [&_svg]:w-5 [&_svg]:h-5" aria-hidden="true">' + (category.icon || '') + '</span>' +
      '<span class="flex-1 min-w-0 [overflow-wrap:anywhere]">' + escape(category.title || '') + '</span>' +
      (subs.length ? '<span class="text-[length:12px] font-normal text-[#637082]" aria-hidden="true">' + subs.length + '</span>' : '') + arrow + '</button>' +
      '<div id="' + panelId + '" class="pt-0 pr-3.5 pb-3 pl-3.5 [&_a]:flex [&_a]:items-center [&_a]:justify-between [&_a]:gap-3 [&_a]:min-h-11.5 [&_a]:p-3 [&_a]:rounded-[9px] [&_a]:text-[length:13px] [&_a]:leading-[1.6] [&_a]:text-[#475569] [&_a]:no-underline [&_a]:[overflow-wrap:anywhere] [&_a:first-child]:text-brand [&_a:first-child]:font-semibold [@media(hover:_hover)]:[&_a:hover]:bg-[#f0f5ff] [@media(hover:_hover)]:[&_a:hover]:text-brand" hidden><a href="/category/?' + encoded + '">ყველა პროდუქტი</a>' + links + '</div></section>';
    columns[index++ % 2].push(item);
  }
  container.innerHTML = columns.map(items => '<div class="flex flex-col gap-3 min-w-0 max-[640px]:contents">' + items.join('') + '</div>').join('');
  container.addEventListener('click', event => {
    const toggle = event.target.closest('.modal-category-toggle');
    if (!toggle) return;
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.closest('.modal-category').classList.toggle('active', expanded);
    document.getElementById(toggle.getAttribute('aria-controls')).hidden = !expanded;
  });
});
