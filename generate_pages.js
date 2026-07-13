const fs = require('fs');
const path = require('path');

// catalog.json в корне
const catalogPath = path.join(__dirname, 'catalog.json');
const productsDir = path.join(__dirname, '_products');

// Создаём папку _products если её нет
if (!fs.existsSync(productsDir)) {
  fs.mkdirSync(productsDir);
}

// Проверяем существование catalog.json
if (!fs.existsSync(catalogPath)) {
  console.error('❌ catalog.json not found!');
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

if (!catalog.products || catalog.products.length === 0) {
  console.log('⚠️ No products found');
  process.exit(0);
}

let generated = 0;

catalog.products.forEach(product => {
  if (!product.id || product.id === '') {
    console.log(`⚠️ Skipping product without ID: ${product.name}`);
    return;
  }

  const content = `---
id: "${product.id}"
name: "${product.name}"
price: "${product.price}"
image: "${product.image}"
description: "${product.description}"
warranty: "${product.warranty || '12 თვე'}"
categories: ${JSON.stringify(product.categories || [])}
layout: product
permalink: /${product.id}/
---

<!-- Product page: ${product.name} -->
`;

  const filePath = path.join(productsDir, `${product.id}.md`);
  fs.writeFileSync(filePath, content);
  console.log(`✅ Generated: ${product.id}.md`);
  generated++;
});

console.log(`\n✅ Done! Generated ${generated} product pages.`);
