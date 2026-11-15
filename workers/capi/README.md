# Meta Purchase: Cloudflare + Supabase

Google Advanced Consent Mode реализован отдельно в `assets/js/global/google-analytics.js`. Этот каталог отвечает за серверный Meta Purchase. В GA4 принятый заказ с оплатой при получении остаётся `generate_lead`; серверный GA4 Measurement Protocol не используется.

## Рабочая цепочка

1. `enka-intake/public` сохраняет заказ через существующую SQL-транзакцию `enka.web_intake` → `enka.intake`. Turnstile, idempotency-key и ограничения частоты сохраняются.
2. `enka.intake` записывает строки с серверными ценами, затем событие `created` в `enka.order_events`. Новый триггер `enka_capture_purchase_created` записывает снимок заказа в `public.enka_purchase_outbox` в этой же транзакции. При откате заказа очередь также откатывается. Старые заказы не добавляются задним числом.
3. `enka-purchase-dispatch` в pg_cron раз в минуту вызывает `enka.dispatch_purchases()`. Функция подписывает запрос секретом из Vault и ставит его в pg_net; сетевой запрос выполняется после коммита. Обрабатывается до 20 событий за запуск. Ошибки и истёкшие lease повторяются; ручной вызов может ускорить обработку.
4. Worker `my-meta-capi` принимает запрос на `/server/order-created`, проверяет HMAC, сохраняет его в отдельном Durable Object на заказ и отвечает 202. Следующий запуск Supabase проверяет ответ pg_net и отмечает передачу ответственности Worker. `accepted` в Supabase ещё не означает доставку в Meta.
5. Durable Object доставляет Purchase в Meta с постоянными `event_id = purchase_<order_id>` и исходным `event_time`. Сетевые ошибки, 429, 5xx и transient-ошибки повторяются с задержкой от минуты до часа. Ошибки не меняют результат оформления заказа.

`supabase-outbox.sql` создаёт таблицу с RLS и функцию enqueue; `supabase-connect.sql` подключает проверенную схему ENKA, триггер и Cron. `supabase-switch.sql` добавляет `purchase_delivery: "server"` в успешный ответ только при наличии outbox. Обе формы сайта используют этот признак, чтобы пропустить браузерный Purchase. Они также используют стабильный ID заказа для GA4 lead. Worker var `SERVER_PURCHASE_ONLY: "true"` после переключения закрывает прежний публичный вход для Purchase; PageView/ViewContent сохраняют прежний режим согласия.

## Данные и сроки

Payload формируется из `enka.orders`, `enka.order_items` и `enka.products.attributes.site_id`. Цена берётся из `unit_price` сохранённого заказа; сумма — из строк без отдельной доставки. Имя, email, IP сервера Supabase и browser cookies в новом серверном событии не используются. Worker нормализует телефон и передаёт в Meta только SHA-256. Хеш остаётся идентификатором, а не анонимными данными.

Серверный Purchase не проверяет флаг согласия на аналитические cookies. Пользовательский текст об этой обработке добавлен на страницу конфиденциальности в KA/RU/EN. Google получает события с текущим статусом Consent Mode и не получает контактные поля заказа.

После принятия события Worker удаляет payload из Supabase outbox. В Worker хеш удаляется после окончательного успеха/ошибки. Предельный срок повторов — 7 дней; статусы и ID сохраняются 90 дней. Уборка в Supabase выполняется заданием Cron, в Worker — alarm. Постоянные ошибки дают `failed`; их нужно отслеживать. При потере ответа Meta может получить повтор с тем же ID: доставка имеет семантику at least once с дедупликацией Meta, без обещания безусловного exactly once.

## Серверный контракт

`POST https://capi.enkaelectronics.com.ge/server/order-created`

```json
{
  "order_id": "UUID-записи-заказа",
  "created_at": "2026-11-15T11:00:00.000Z",
  "currency": "GEL",
  "value": 89,
  "phone": "+995555123456",
  "items": [{ "id": "site-product-id", "quantity": 1, "item_price": 89 }]
}
```

Используйте реальные факты сохранённого заказа; пример не отправляйте в рабочую Meta. Не посылайте сумму и товары из браузера. Worker проверяет сумму строк, типы, телефон, время и размер тела.

Заголовки: `X-Enka-Timestamp` — Unix seconds; `X-Enka-Signature` — lowercase hex HMAC-SHA256 от `timestamp + '.' + rawJsonBody`. Допуск времени — 5 минут. Общий секрет: `ORDER_WEBHOOK_SECRET` в Worker и `enka_capi_order_webhook_secret` в Supabase Vault. Его нельзя размещать в браузере или репозитории. `sign-request.mjs` — совместимый подписыватель для защищённых серверных проверок. Игнорируемая локальная копия — `.local/capi-webhook-secret.json`.

202 означает сохранение в Durable Object. Повтор ID возвращает 200 и текущее состояние. Для статуса: подписанный `POST /server/order-status` с `{"order_id":"…"}`; состояния `pending`, `delivered`, `failed`, неизвестный ID — 404. В ответе нет контактов. Статус Supabase можно проверить SQL без чтения payload:

```sql
select state, count(*), min(created_at) as oldest
from public.enka_purchase_outbox group by state;
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'enka-purchase-dispatch')
order by start_time desc limit 10;
```

Слежение за `failed` в Worker выполняется через status endpoint и Cloudflare logs. Ответ pg_net хранится отдельно от outbox по правилам pg_net; HMAC временной подписи не заменяет секрет, сам секрет в HTTP не передаётся.

## Публикация и восстановление

```powershell
./admin/node_modules/.bin/wrangler.cmd deploy --dry-run --config workers/capi/wrangler.jsonc
./admin/node_modules/.bin/wrangler.cmd deploy --keep-vars --config workers/capi/wrangler.jsonc
```

Секреты `PIXEL_ID`, `FB_ACCESS_TOKEN`, `ORDER_WEBHOOK_SECRET` сохраняются. Домен — `capi.enkaelectronics.com.ge`. `legacy.mjs` — исходник рабочего Worker до доработки; новый путь не использует старое подавление покупок по IP/телефону.

Первая опубликованная версия с серверным входом: `65f35748-531f-4501-8efe-92aad8c1b270`. Версия до изменений: `44b0a08e-1960-44c2-a10e-5a16de0423ab`. После миграции Durable Object старый код можно восстановить новым deployment с сохранением namespace/binding; Cloudflare может ограничивать прямой rollback через миграцию. Скачанный исходник — `.local/my-meta-capi-source.txt`. Резервная копия Edge Function — `.local/supabase-intake-original/source/index.ts`.

Для остановки серверной цепочки сначала отключите триггер/расписание и верните прежнюю SQL-обёртку `public.enka_web_intake`, затем отключите `SERVER_PURCHASE_ONLY`, чтобы браузерный путь снова принимал Purchase. Pending-события при этом сохраняются: перед возобновлением учитывайте возможные дубли. Не удаляйте таблицы заказов, их строки или историю.

Каталог `workers` исключён из Jekyll. SQL-миграции проверяются в PostgreSQL внутри `BEGIN … ROLLBACK`; локальные поведенческие проверки — `tests/server-purchase.test.cjs`, `tests/google-analytics.test.cjs`, `tests/product.test.cjs`. Публикация сайта проходит существующий workflow GitHub Actions (ручной запуск также обновляет Cloudflare Pages).
