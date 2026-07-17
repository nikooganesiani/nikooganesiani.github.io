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
  // 1. Формируем блок характеристик (specs) для Jekyll
  let specsYaml = "";
  if (product.specs) {
    specsYaml = "specs:\n";
    Object.entries(product.specs).forEach(([key, value]) => {
      specsYaml += `  "${key}": "${value}"\n`; // Кавычки важны для корректного YAML
    });
  }

  // 2. Формируем список изображений
  let imagesYaml = "images:\n";
  if (Array.isArray(product.images) && product.images.length > 0) {
    product.images.forEach(img => {
      imagesYaml += `  - "${img}"\n`;
    });
  } else {
    // Если в JSON только одна старая строка image, превращаем её в массив
    imagesYaml += `  - "${product.image}"\n`;
  }

  // 3. Создаем контент файла
  const content = `---
layout: product
id: "${product.id}"
sku: "${product.sku || product.id}"
name: "${product.name}"
brand: "${product.brand || 'ENKA'}"
price: "${product.price}"
oldPrice: "${product.oldPrice || ''}"
${imagesYaml}
${specsYaml}
description: "${product.description || ''}"
longDescription: "${product.longDescription || product.description || ''}"
warranty: "${product.warranty || '12 თვე'}"
permalink: /${product.id}/
---
`;
  fs.writeFileSync(path.join(productsDir, `${product.id}.md`), content);
});
