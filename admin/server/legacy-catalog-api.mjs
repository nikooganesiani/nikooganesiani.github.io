// Вспомогательные функции для фида
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatPrice(priceStr, currency = 'GEL') {
  const num = parseFloat(priceStr);
  if (isNaN(num)) return `0.00 ${currency}`;
  return `${num.toFixed(2)} ${currency}`;
}

export default {
  async fetch(request, env) {
    // 1. НАСТРОЙКА БЕЗОПАСНОГО CORS
    const allowedOrigins = [
      "https://admin.enkaelectronics.com.ge"
    ];

    const origin = request.headers.get("Origin");
    const isAllowedOrigin = allowedOrigins.includes(origin);

    const corsHeaders = {
      "Access-Control-Allow-Origin": request.method === "GET" ? "*" : (isAllowedOrigin ? origin : ""),
      "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // ЗАЩИТА ОТ ВЗЛОМА: Блокируем запросы на изменение не от доверенных источников
    if (request.method !== "GET" && request.method !== "OPTIONS" && !isAllowedOrigin) {
      return new Response(JSON.stringify({ error: "Доступ запрещен. Неизвестный источник." }), {
        status: 403,
        headers: corsHeaders
      });
    }

    // Обработка предварительного запроса браузера (CORS)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // 2. ЗАГРУЗКА КАРТИНКИ (POST /upload)
    if (request.method === "POST" && url.pathname === "/upload") {
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${env.SECRET_KEY}`) {
        return new Response(JSON.stringify({ error: "Нет доступа к загрузке" }), {
          status: 401,
          headers: corsHeaders,
        });
      }

      try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file) {
          return new Response(JSON.stringify({ error: "Файл не передан" }), {
            status: 400,
            headers: corsHeaders
          });
        }

        if (file.type !== "image/webp") {
          return new Response(JSON.stringify({ error: "Разрешен только формат .webp" }), {
            status: 400,
            headers: corsHeaders
          });
        }
        if (file.size > 200 * 1024) {
          return new Response(JSON.stringify({ error: "Файл слишком большой. Максимум 200 КБ." }), {
            status: 400,
            headers: corsHeaders
          });
        }

        const secureFileName = crypto.randomUUID() + ".webp";
        await env.IMAGES_BUCKET.put(secureFileName, file.stream(), {
          httpMetadata: { contentType: "image/webp" }
        });

        const PUBLIC_R2_URL = "https://img.enkaelectronics.com.ge";
        const imageUrl = `${PUBLIC_R2_URL}/${secureFileName}`;

        return new Response(JSON.stringify({ url: imageUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Ошибка загрузки: " + err.message }), {
          status: 500,
          headers: corsHeaders
        });
      }
    }

    // 3. ВЫДАЧА КАТАЛОГА (GET /catalog)
    if (request.method === "GET" && url.pathname === "/catalog") {
      const data = await env.CATALOG_KV.get("catalog", { type: "json" });
      return new Response(JSON.stringify(data || { products: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- НОВЫЙ МАРШРУТ: RSS-фид для Google Merchant Center ---
    if (request.method === "GET" && url.pathname === "/v1/feed.xml") {
      try {
        // Получаем данные из KV (то же хранилище, что и для /catalog)
        const catalogData = await env.CATALOG_KV.get("catalog", { type: "json" });
        const products = catalogData?.products || [];

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n';
        xml += '  <channel>\n';
        xml += '    <title>Enka Electronics</title>\n';
        xml += '    <link>https://enkaelectronics.com.ge</link>\n';
        xml += '    <description>Product feed for Google Merchant Center</description>\n';

        for (const product of products) {
          const link = `https://enkaelectronics.com.ge/product/${product.id}`;
          const mainImage = product.images?.[0] || '';
          const additionalImages = product.images?.slice(1) || [];

          xml += '    <item>\n';
          xml += `      <g:id>${escapeXml(product.id)}</g:id>\n`;
          xml += `      <g:title>${escapeXml(product.name)}</g:title>\n`;
          xml += `      <g:description><![CDATA[${product.description || ''}]]></g:description>\n`;
          xml += `      <g:link>${escapeXml(link)}</g:link>\n`;
          xml += `      <g:image_link>${escapeXml(mainImage)}</g:image_link>\n`;
          for (const img of additionalImages) {
            xml += `      <g:additional_image_link>${escapeXml(img)}</g:additional_image_link>\n`;
          }
          xml += `      <g:price>${formatPrice(product.price)}</g:price>\n`;
          // Если есть старая цена (oldPrice), можно добавить sale_price, но в вашем каталоге поле пустое
          // if (product.oldPrice) { ... }
          xml += '      <g:availability>in stock</g:availability>\n';
          xml += '      <g:condition>new</g:condition>\n';
          xml += `      <g:brand>${escapeXml(product.brand)}</g:brand>\n`;
          xml += `      <g:mpn>${escapeXml(product.sku)}</g:mpn>\n`;
          xml += '    </item>\n';
        }

        xml += '  </channel>\n';
        xml += '</rss>';

        return new Response(xml, {
          headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
        });
      } catch (err) {
        // В случае ошибки возвращаем пустой XML, чтобы Merchant Center не падал
        const fallbackXml = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>Enka Electronics</title>\n    <link>https://enkaelectronics.com.ge</link>\n    <description>Product feed (temporary error)</description>\n  </channel>\n</rss>';
        return new Response(fallbackXml, {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
        });
      }
    }

    // 4. ОБНОВЛЕНИЕ КАТАЛОГА (PUT /catalog)
    if (request.method === "PUT" && url.pathname === "/catalog") {
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${env.SECRET_KEY}`) {
        return new Response(JSON.stringify({ error: "Неверный пароль" }), {
          status: 401,
          headers: corsHeaders,
        });
      }

      const body = await request.json();
      await env.CATALOG_KV.put("catalog", JSON.stringify(body));

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Если путь не подошёл ни под одно условие
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  },
};