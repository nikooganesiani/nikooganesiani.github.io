# Meta Purchase: Cloudflare + Supabase

Google Advanced Consent Mode реализован в `assets/js/global/google-analytics.js`. Этот каталог отвечает за серверный Meta Purchase и серверный GA4 `generate_lead` для принятого заказа COD. Google sender включён в production 15 ноября 2026 после создания API secret и проверки конфигурации.

Рабочее подключение включено 15 ноября 2026 года. Cloudflare Pages опубликован workflow [1086](https://github.com/nikooganesiani/nikooganesiani.github.io/actions/runs/43710399560), исходный коммит `8655f14`. Финальная версия CAPI Worker — `ab21bf42-0258-4380-b3d7-62240807ef65`, `SERVER_PURCHASE_ONLY: "true"`. Триггер Supabase включён, Cron активен; последние три запуска при проверке завершились `succeeded`. Контактные данные и секреты в репозиторий не включены.

Проверены: атомарность заказа и outbox, повтор idempotency-key и ответ сервера внутри транзакции с откатом; подпись из Vault до Worker; блокировка публичного Purchase; локальный workerd с SQLite Durable Object, реальным alarm и имитацией ответа Meta (одна доставка и подавление повтора). Искусственные Purchase в рабочую Meta не отправлялись; на момент включения очередь была пуста.

## Рабочая цепочка

### Контекст заказа (15 ноября 2026)

`measurement-context.js` сохраняет разрешённые click IDs/UTM до 30 дней только при согласии. Отзыв очищает память и хранилище, включая незавершённый async snapshot. Формы обращаются к `/orders` этого Worker. Прокси сохраняет Turnstile и idempotency-key, очищает контекст, получает IP из `CF-Connecting-IP` и UA из входящего запроса. Контекст подписывается HMAC от `intake.<timestamp>.<lowercase request key>.<raw context>`; ключ существует только на сервере.

Миграция `supabase-measurement.sql` применена после успешной проверки `measurement-rollback-test.sql` с ROLLBACK. Обёртка проверяет подпись/время, передаёт старой функции только разрешённые UTM, сохраняет первый контекст в закрытой RLS-таблице и обогащает outbox в той же транзакции. Изменение рекламных меток при повторе ключа не изменяет первую атрибуцию. Очистка контекста — 30 дней, Cron `enka-measurement-purge`.

Purchase использует хеш телефона плюс фактические IP/UA и очищенный URL. fbp/fbc добавляются только при `ad_storage=granted`; произвольные поля из браузера не пересылаются. Это улучшает доступные сигналы сопоставления, но не гарантирует числовой EMQ. Реальный Purchase/EMQ ещё требует наблюдения первого настоящего заказа.

Проверены Node-тесты, реальный локальный workerd/SQLite с mock Meta, прокси в workerd и живой `/orders` с заведомо невалидным заказом (422, без создания заказа). Для fetch в Workers используется `redirect: manual`: режим `error` в этой среде приводит к TypeError; 3xx запрещены явно.

1. `enka-intake/public` сохраняет заказ через существующую SQL-транзакцию `enka.web_intake` → `enka.intake`. Turnstile, idempotency-key и ограничения частоты сохраняются.
2. `enka.intake` записывает строки с серверными ценами, затем событие `created` в `enka.order_events`. Новый триггер `enka_capture_purchase_created` записывает снимок заказа в `public.enka_purchase_outbox` в этой же транзакции. При откате заказа очередь также откатывается. Старые заказы не добавляются задним числом.
3. `enka-purchase-dispatch` в pg_cron раз в минуту вызывает `enka.dispatch_purchases()`. Функция подписывает запрос секретом из Vault и ставит его в pg_net; сетевой запрос выполняется после коммита. Обрабатывается до 20 событий за запуск. Ошибки и истёкшие lease повторяются; ручной вызов может ускорить обработку.
4. Worker `my-meta-capi` принимает запрос на `/server/order-created`, проверяет HMAC, сохраняет его в отдельном Durable Object на заказ и отвечает 202. Следующий запуск Supabase проверяет ответ pg_net и отмечает передачу ответственности Worker. `accepted` в Supabase ещё не означает доставку в Meta.
5. Durable Object доставляет Purchase в Meta с постоянными `event_id = purchase_<order_id>` и исходным `event_time`. Сетевые ошибки, 429, 5xx и transient-ошибки повторяются с задержкой от минуты до часа. Ошибки не меняют результат оформления заказа.

`supabase-outbox.sql` создаёт таблицу с RLS и функцию enqueue; `supabase-connect.sql` подключает проверенную схему ENKA, триггер и Cron. `supabase-switch.sql` добавляет `purchase_delivery: "server"` в успешный ответ только при наличии outbox. Обе формы сайта используют этот признак, чтобы пропустить браузерный Purchase. Они также используют стабильный ID заказа для GA4 lead. Worker var `SERVER_PURCHASE_ONLY: "true"` после переключения закрывает прежний публичный вход для Purchase; PageView/ViewContent сохраняют прежний режим согласия.

## Данные и сроки

### Google lead: включён 15 ноября 2026

Проверенный ресурс GA4 `564345213`, поток `16342950626`, Measurement ID `G-KHQG9C6JQF`. Он связан с Google Ads ENKA `236-431-8833`. Существующая основная конверсия `ENKA — Принятая заявка (GA4)` (`7903353253`) импортирует `generate_lead`, учёт «Одна», окно клика 90 дней, атрибуция на основе данных. Три прежние Website Purchase остаются в аккаунте; они не используются новым кодом.

`supabase-google-lead.sql` первоначально применён с выключенным флагом. После отдельного разрешения пользователя подтверждено условие Google о пользовательских данных, создан ключ `ENKA server leads` и сохранён в Worker как `GA4_API_SECRET`. `public.enka_measurement_settings.google_lead_enabled=true` подтверждён SELECT; при включении pending=0, failed=0. Активная версия Worker после загрузки секрета — `0300669a-4794-48a5-b475-093db8abaf07` (100%). Временный локальный файл ключа удалён. Значение ключа не включено в репозиторий или отчёт.

Фронтенд и защита от дублей опубликованы коммитом `f93f9cf`; Cloudflare Pages workflow `43716417487` завершился успешно. Повторная проверка payload через официальный debug endpoint после настройки ключа вернула HTTP 200 и пустой `validationMessages`. Это проверка схемы, а не подтверждение обработки реальной конверсии. Первый настоящий server lead и его атрибуцию ещё нужно наблюдать по реальному заказу.

При включении обёртка назначает Google серверу только при согласии analytics/ad_user_data, реальных client_id/session_id и подписанном `google_server_capable=true`. Этот признак устанавливается только при наличии нового браузерного API `supportsServerDelivery`; старые открытые вкладки продолжают браузерный lead, чтобы не задвоить его при обновлении. Назначение сохраняется на заказ навсегда и не меняется при повторе запроса. Ответ `google_delivery=server` подавляет браузерный lead в обеих формах.

Worker сначала сохраняет Google payload в отдельный SQLite Durable Object, затем подтверждает общий outbox. Google получает только client_id, session_id, время, каноническую сумму GEL, стабильный event_id и признаки lead; имя/телефон/IP/UA/Meta cookies ему не передаются. При отказе или отсутствии Google IDs сохраняется браузерный cookieless lead.

Measurement Protocol не документирует дедупликацию `generate_lead` по event_id. Поэтому sender фиксирует попытку до сети и не повторяет неопределённый исход: `pending` → `sending` → `http_accepted` / `failed` / `uncertain`. `http_accepted` означает HTTP 2xx, а не обработанную или атрибутированную конверсию. Неопределённые результаты требуют проверки, автоматическое повторение может задвоить lead. Payload удаляется после попытки, tombstone хранится 90 дней; события старше 72 часов не отправляются. Это сознательный предел надёжности MP, а не обещание exactly once. Для будущего расширения enhanced/offline Ads нужен отдельный Data Manager API.

Статус `/server/order-status` содержит поле `google`. Проверки: `tests/google-lead.test.cjs`, browser suppression, PostgreSQL `google-lead-rollback-test.sql`, реальный локальный workerd с двумя SQLite objects и mock внешних сервисов. Официальный `/debug/mp/collect` вернул `validationMessages: []`; debug не создаёт production-конверсии и не проверяет подлинность API secret.

Payload формируется из `enka.orders`, `enka.order_items` и `enka.products.attributes.site_id`. Цена берётся из `unit_price` сохранённого заказа; сумма — из строк без отдельной доставки. Имя, email и IP сервера Supabase не используются. Worker нормализует и хеширует телефон SHA-256; дополнительные сигналы из подписанного контекста описаны выше. Хеш остаётся идентификатором, а не анонимными данными.

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
