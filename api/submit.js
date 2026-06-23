export default async function handler(req, res) {
  // Разрешаем только POST-запросы
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не разрешен' });
  }

  try {
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Имя и телефон обязательны' });
    }

    // ========== 1. ОТПРАВКА В TELEGRAM ==========
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (token && chatId) {
      const message = `🆕 НОВЫЙ ЗАКАЗ!\n\n👤 Имя: ${name}\n📞 Телефон: ${phone}\n📦 Товар: SmartBalance Pro\n💰 Цена: 44 ₾`;

      const tgResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });

      const tgResult = await tgResponse.json();
      if (tgResult.ok) {
        console.log('✅ Отправлено в Telegram');
      } else {
        console.error('❌ Ошибка Telegram:', tgResult);
      }
    }

    // ========== 2. ОТПРАВКА В GOOGLE SHEETS ==========
    const sheetsUrl = process.env.GOOGLE_SHEETS_URL;
    
    if (sheetsUrl) {
      const now = new Date();
      const timestamp = `${now.getDate().toString().padStart(2,'0')}.${(now.getMonth()+1).toString().padStart(2,'0')}.${now.getFullYear()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
      
      const sheetsResponse = await fetch(sheetsUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          phone: phone,
          product: 'SmartBalance Pro',
          price: '44',
          quantity: 1,
          timestamp: timestamp,
          source: 'Сайт'
        })
      });
      
      console.log('✅ Отправлено в Google Sheets');
    }

    // ========== 3. УСПЕШНЫЙ ОТВЕТ ==========
    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Ошибка:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
