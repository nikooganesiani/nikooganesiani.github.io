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
                    // Используем JSON.stringify для безопасного экранирования кавычек внутри ключей и значений
                    specsYaml += `  ${JSON.stringify(key)}: ${JSON.stringify(value)}\n`;
                });
            }

            let imagesYaml = "images:\n";
            // Добавлена проверка на случай, если у товара нет массива images, а есть только image (или вообще нет картинок)
            const imgs = product.images || (product.image ? [product.image] : []);
            imgs.forEach(img => {
                imagesYaml += `  - ${JSON.stringify(img)}\n`;
            });

            // Убрали ручные кавычки "", теперь JSON.stringify поставит их сам и заэкранирует все переносы строк
            const content = `---
layout: product
id: ${JSON.stringify(product.id)}
sku: ${JSON.stringify(product.sku || product.id)}
name: ${JSON.stringify(product.name)}
brand: ${JSON.stringify(product.brand || 'ENKA Electronics')}
price: ${JSON.stringify(product.price)}
oldPrice: ${JSON.stringify(product.oldPrice || '')}
${imagesYaml}
${specsYaml}
description: ${JSON.stringify(product.description || '')}
longDescription: ${JSON.stringify(product.longDescription || product.description || '')}
warranty: ${JSON.stringify(product.warranty || '12 თვე')}
categories: ${JSON.stringify(product.categories || [])}
subcategories: ${JSON.stringify(product.subcategories || [])}
---`;

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
        process.exit(1); 
    }
}

generatePages();
