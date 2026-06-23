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

    // Токены из переменных окружения Vercel
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.error('❌ Токены не настроены в Vercel');
      return res.status(500).json({ error: 'Ошибка на сервере' });
    }

    // Отправка в Telegram
    const message = `🆕 НОВЫЙ ЗАКАЗ!\n\n👤 Имя: ${name}\n📞 Телефон: ${phone}\n📦 Товар: SmartBalance Pro\n💰 Цена: 44 ₾`;

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('❌ Ошибка Telegram:', result);
      return res.status(500).json({ error: 'Ошибка отправки в Telegram' });
    }

    console.log('✅ Заказ отправлен в Telegram');
    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Ошибка:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
