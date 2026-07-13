const fs = require('fs');
const path = require('path');

console.log('🚀 Script started...');

const catalogPath = path.join(process.cwd(), 'application/json', 'catalog.json'); 
// Исправил путь, так как в твоем первом сообщении JSON лежал в папке application/json

const productsDir = path.join(process.cwd(), '_products');

if (!fs.existsSync(productsDir)) {
  fs.mkdirSync(productsDir, { recursive: true });
  console.log('📁 Created _products directory');
}

if (!fs.existsSync(catalogPath)) {
  console.error('❌ ERROR: catalog.json NOT FOUND at path:', catalogPath);
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const products = catalog.products || [];

console.log(`📦 Found ${products.length} products in catalog.`);

if (products.length === 0) {
  console.error('❌ ERROR: No products to generate!');
  process.exit(1);
}

products.forEach(product => {
  const content = `---
layout: product
id: "${product.id}"
name: "${product.name}"
price: "${product.price}"
image: "${product.image}"
description: "${product.description}"
warranty: "${product.warranty || '12 თვე'}"
permalink: /${product.id}/
---
`;

  fs.writeFileSync(path.join(productsDir, `${product.id}.md`), content);
  console.log(`✅ Generated: ${product.id}.md`);
});

console.log('✨ All pages generated successfully!');
