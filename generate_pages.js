const fs = require('fs');
const path = require('path');

const productsDir = path.join(process.cwd(), '_products');

if (!fs.existsSync(productsDir)) {
    fs.mkdirSync(productsDir, { recursive: true });
}

async function generatePages() {
    try {
        console.log('Скачиваем catalog.json с Cloudflare (без кэша)...');
        
        // ДОБАВЛЕН ОБХОД КЭША: ?t=Date.now() гарантирует, что GitHub скачает самую свежую базу!
        const response = await fetch('https://catalog-api.niko-oganesiani.workers.dev/catalog.json?t=' + Date.now(), {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
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

            // ДОБАВЛЕН stockStatus в генерацию страницы
            const content = `---
layout: product
id: "${product.id}"
sku: "${product.sku || product.id}"
name: "${product.name}"
brand: "${product.brand || 'ENKA Electronics'}"
price: "${product.price}"
oldPrice: "${product.oldPrice || ''}"
stockStatus: "${product.stockStatus || 'in_stock'}"
${imagesYaml}
${specsYaml}
description: "${product.description || ''}"
longDescription: "${product.longDescription || product.description || ''}"
warranty: "${product.warranty || '12 თვე'}"
categories: ${JSON.stringify(product.categories || [])}
subcategories: ${JSON.stringify(product.subcategories || [])}
---`;

            fs.writeFileSync(path.join(productsDir, `${product.id}.md`), content);
            console.log(`✅ File ready: ${product.id}.md (Status: ${product.stockStatus || 'in_stock'})`);
        });
        
        console.log(`🎉 Все страницы товаров (${products.length} шт.) успешно сгенерированы!`);
    } catch (error) {
        console.error('❌ Ошибка при генерации страниц:', error);
        process.exit(1); 
    }
}

generatePages();
