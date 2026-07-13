// generate_pages.js
const fs = require('fs');
const path = require('path');

// Читаем каталог
const catalogPath = path.join(__dirname, '_data', 'catalog.json');
const productsDir = path.join(__dirname, '_products');

// Создаём папку _products если её нет
if (!fs.existsSync(productsDir)) {
  fs.mkdirSync(productsDir);
}

// Читаем JSON
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

// Проверяем товары
if (!catalog.products || catalog.products.length === 0) {
  console.log('❌ Нет товаров в catalog.json');
  process.exit(1);
}

// Создаём страницы для каждого товара
catalog.products.forEach(product => {
  // Пропускаем товары без ID
  if (!product.id || product.id === '') {
    console.log(`⚠️ Пропускаем товар без ID: ${product.name}`);
    return;
  }

  // Формируем содержимое .md файла
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

<!-- Страница товара ${product.name} -->
`;

  // Сохраняем файл
  const fileName = `${product.id}.md`;
  const filePath = path.join(productsDir, fileName);
  
  fs.writeFileSync(filePath, content);
  console.log(`✅ Создана страница: ${fileName} (${product.name})`);
});

console.log(`\n✅ Готово! Создано ${catalog.products.filter(p => p.id).length} страниц товаров.`);
console.log('📝 Запустите "bundle exec jekyll build" для сборки сайта.');
