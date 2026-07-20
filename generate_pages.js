Да, это именно то, о чём я говорил!

На строках 4 и 11 этот скрипт ищет физический файл catalog.json в корне проекта (fs.readFileSync). Если вы удалите файл catalog.json из репозитория GitHub, скрипт не сможет его прочитать и выдаст ошибку, сломав всю сборку в GitHub Actions.

Чтобы полностью отвязаться от локального файла, нам нужно научить этот скрипт скачивать каталог с Cloudflare прямо перед генерацией страниц. Node.js (на котором запускается этот скрипт в Actions) отлично поддерживает fetch.

Вы можете полностью заменить всё содержимое файла generate_pages.js на этот код (я обернул всё в асинхронную функцию и добавил скачивание):

JavaScript
const fs = require('fs');
const path = require('path');

const productsDir = path.join(process.cwd(), '_products');

if (!fs.existsSync(productsDir)) {
    fs.mkdirSync(productsDir, { recursive: true });
}

async function generatePages() {
    try {
        console.log('Скачиваем catalog.json с Cloudflare...');
        const response = await fetch('https://catalog-api.niko-oganesiani.workers.dev/catalog.json');
        
        if (!response.ok) {
            throw new Error(`Ошибка загрузки: ${response.status}`);
        }
        
        const catalog = await response.json();
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
        
        console.log('🎉 Все страницы товаров успешно сгенерированы!');
    } catch (error) {
        console.error('❌ Ошибка при генерации страниц:', error);
        // Если Cloudflare недоступен, роняем сборку GitHub Actions, чтобы не выкатить пустой сайт
        process.exit(1); 
    }
}

generatePages();
