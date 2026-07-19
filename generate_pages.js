const fs = require('fs');
const path = require('path');

const catalogPath = path.join(process.cwd(), 'catalog.json'); 
const productsDir = path.join(process.cwd(), '_products');

if (!fs.existsSync(productsDir)) {
  fs.mkdirSync(productsDir, { recursive: true });
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const products = catalog.products || [];

products.forEach(product => {
  let specsYaml = "specs:\n";
  if (product.specs) {
    Object.entries(product.specs).forEach(([key, value]) => {
      specsYaml += `  "${key}": "${value}"\n`;
    });
  }

  let imagesYaml = "images:\n";
  const imgs = product.images || [product.image];
  imgs.forEach(img => {
    imagesYaml += `  - "${img}"\n`;
  });

const content = `---
layout: product
id: "${product.id}"
sku: "${product.sku || product.id}"
name: "${product.name}"
brand: "${product.brand || 'ENKA Electronics'}"
price: "${product.price}"
oldPrice: "${product.oldPrice || ''}"
${imagesYaml}
${specsYaml}
description: "${product.description || ''}"
longDescription: "${product.longDescription || product.description || ''}"
warranty: "${product.warranty || '12 თვე'}"
categories: ${JSON.stringify(product.categories || [])}
subcategories: ${JSON.stringify(product.subcategories || [])}
---`;

  fs.writeFileSync(path.join(productsDir, `${product.id}.md`), content);
  console.log(`✅ File ready: ${product.id}.md`);
});
