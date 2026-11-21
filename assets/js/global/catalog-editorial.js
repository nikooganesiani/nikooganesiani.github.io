(function () {
  'use strict';
  const fields = ['name', 'description', 'longDescription', 'warranty'];
  const georgian = /[\u10a0-\u10ff\u1c90-\u1cbf]/u;

  function hasGeorgian(product) {
    return fields.some(field => georgian.test(product[field] || '')) ||
      Object.entries(product.specs || {}).some(([label, value]) => georgian.test(label) || georgian.test(value));
  }

  function editCatalogProduct(product, editorial, locale) {
    if (!editorial || !['ru', 'en'].includes(locale)) return product;
    const result = { ...product };
    const edits = Object.hasOwn(editorial.products, product.id) ? editorial.products[product.id] : {};
    for (const field of fields) {
      const edit = edits[field];
      if (edit && result[field] === (edit[locale + 'Source'] ?? edit.ka)) result[field] = edit[locale];
    }
    // Use exact aliases from the published catalog so changes already made in Studio take precedence.
    const labels = editorial.labels[locale];
    const values = editorial.values[locale];
    result.specs = Object.fromEntries(Object.entries(product.specs || {}).map(([label, value]) => [
      Object.hasOwn(labels, label) ? labels[label] : label,
      Object.hasOwn(values, value) ? values[value] : value
    ]));
    if (Object.keys(result.specs).length !== Object.keys(product.specs || {}).length) {
      result.specs = product.specs;
    }
    return result;
  }

  const editor = { editCatalogProduct, hasGeorgian };
  if (typeof module === 'object' && module.exports) module.exports = editor;
  else window.enkaCatalogEditorial = editor;
})();
