# ENKA: контекст для продолжения настройки рекламного измерения

Дата: 15.11.2026, Asia/Tbilisi. Рабочая папка: `C:\Users\Nick\Documents\ChatGPT\ENKA`.
Репозиторий: `https://github.com/nikooganesiani/nikooganesiani.github.io`, ветка `main`.

## Задание пользователя и текущее состояние

Пользователь скоро запускает Google Ads и Meta и попросил довести измерение до максимально качественной реализации: серверные конверсии Google, улучшение Meta EMQ, сохранение контекста рекламного перехода и проверка целей/атрибуции/дублей. Работа НЕ завершена. Пользователь сейчас попросил только сохранить контекст и переходит в новый чат.

Предыдущая фаза уже опубликована и работает. Текущая фаза имеет лишь начатые локальные изменения — они НЕ протестированы, НЕ закоммичены и НЕ опубликованы. Не выдавать их за рабочее подключение.

## Что уже включено в production

- Магазин Jekyll: `https://enkaelectronics.com.ge`. Две формы: быстрая и на странице товара. Оплата при получении.
- Google Advanced Consent Mode v2: Google-тег грузится сразу с `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization = denied`; принятие/отзыв меняют статусы. Есть `ads_data_redaction`, события не воспроизводятся повторно при смене согласия.
- GA4 Measurement ID в `_config.yml`: `G-KHQG9C6JQF`, ранее указан stream ID `16342950626`. Google получает браузерный `generate_lead` после успешного ответа заказа. Серверного Google Measurement Protocol / Google Ads upload / Data Manager пока НЕТ. Импорт GA4 в Ads пока не подтверждён.
- Серверный Meta Purchase: Supabase → подписанный запрос → Cloudflare Worker → Durable Object → Meta CAPI. Отправка по созданию заказа, независимо от выбора аналитических cookies.
- Стабильный `event_id = purchase_<order_id>`, серверные товары/цены, повторы временных ошибок. Браузерный Purchase пропускается, когда ответ заказа содержит `purchase_delivery: "server"`. Старый публичный вход Worker отвергает Purchase с 403 (`SERVER_PURCHASE_ONLY: "true"`). Meta PageView/ViewContent остаются зависимыми от согласия.
- Сейчас новый серверный Purchase использует для сопоставления ТОЛЬКО SHA-256 телефона (`user_data.ph`). Нет fbp/fbc/IP/User-Agent/name/external_id. Надёжность доставки НЕ равна качеству атрибуции. Высокий EMQ не обещан и не измерен для нового Purchase.
- Искусственные Purchase в рабочую Meta не отправлялись. Проверка настоящего приёма первого нового Purchase Meta ещё не подтверждена.

## Supabase: уже применённые изменения

Проект `zilumtvyowzgpwswewtj` (ENKA ERP). Заказ:

```text
assets/js/global/order-intake.js
→ https://zilumtvyowzgpwswewtj.supabase.co/functions/v1/enka-intake/public
→ public.enka_web_intake → enka.web_intake → enka.intake
→ enka.orders + enka.order_items + enka.order_events(action='created')
→ trigger → public.enka_purchase_outbox в той же транзакции
```

- `public.enka_purchase_outbox`: PK `order_id`; payload/state/attempts/next_attempt_at/last_error/created_at/request_id/claim_token. RLS; публичные роли закрыты, доступ service_role.
- `public.enqueue_enka_purchase(jsonb)`: insert on conflict do nothing.
- `enka.capture_purchase_created()` и включённый trigger `enka_capture_purchase_created` AFTER INSERT на `enka.order_events`, только `created`, website + непустой request_key.
- Payload строится из `enka.orders` (id, created_at, phone, currency), `enka.order_items` (sku, quantity, unit_price), `enka.products.attributes.site_id` (fallback SKU). Сумма строк, без отдельной доставки.
- `enka.dispatch_purchases()` + активный pg_cron `enka-purchase-dispatch`, раз в минуту, до 20 новых отправок. pg_net выполняет HTTP после коммита. Ответы проверяются через `net._http_response`.
- Vault secret `enka_capi_order_webhook_secret`; одинаковое значение с Worker `ORDER_WEBHOOK_SECRET`. Значение НЕ включать в документы/репозиторий.
- `public.enka_web_intake(uuid,text,text,text,jsonb,jsonb)` заменена на PL/pgSQL SECURITY DEFINER, search_path=''; execute только service_role. Вызывает прежнюю enka.web_intake, добавляет `purchase_delivery:'server'`, если outbox существует.
- Внутренние `enka.web_intake`, `enka.intake` и исходник Edge Function не менялись. Turnstile, idempotency-key и rate limits сохранены.
- `enka.intake` сначала сохраняет строки (`enka.set_items`), затем вставляет order_events.created. Поэтому outbox получает окончательные серверные цены. Ошибка записи outbox откатывает заказ; сетевые ошибки доставки асинхронны.
- Повтор того же request_key возвращает тот же заказ; иной payload с этим ключом — конфликт. Внутренний fingerprint учитывает name/phone/source/items/разрешённые UTM.
- Внутренняя enka.intake допускает только шесть UTM в attribution: utm_source/medium/campaign/content/term/id. Новые вложенные поля напрямую в неё передавать НЕЛЬЗЯ — сначала валидация/извлечение в публичной обёртке.
- Edge Function уже допускает JSON `attribution` и прокидывает его в RPC. Это позволяет обойтись без изменения Edge Function при продуманной новой обёртке.
- Очередь Supabase: pending → leased → accepted / retry / failed. accepted означает лишь запись в Worker, НЕ приём Meta. Payload удаляется при обработке успешного ответа Worker. Повторы до 7 дней, метаданные до 90 дней.

SQL уже применены: `workers/capi/supabase-outbox.sql`, `supabase-connect.sql`, `supabase-switch.sql`. Повторно целиком не запускать CREATE-миграции. Подробности: `workers/capi/README.md` и отдельная сводка `HANDOFF-SUPABASE-CAPI.md`.

## Cloudflare и опубликованные версии

- Аккаунт: `b8f8a90d67127eea015da5c577c545f6`; Worker `my-meta-capi`; домен `https://capi.enkaelectronics.com.ge`.
- Активная на момент завершения предыдущей фазы версия: `ab21bf42-0258-4380-b3d7-62240807ef65`.
- Source: `workers/capi/worker.mjs`, `purchase.mjs`, `legacy.mjs`; config `wrangler.jsonc`. DO binding `PURCHASE_DELIVERY`, class `PurchaseDelivery`, SQLite migration `purchase-v1`.
- Secrets: PIXEL_ID, FB_ACCESS_TOKEN, ORDER_WEBHOOK_SECRET. Pixel/Dataset ID: `1499689204986172`. Новый серверный sender пока использует Graph API v21.0 (унаследовано; актуальность версии стоит проверить перед дальнейшим релизом).
- `/server/order-created`: HMAC-SHA256 от `timestamp + '.' + rawBody`, заголовки X-Enka-Timestamp/X-Enka-Signature, допуск 5 минут. `/server/order-status`: подписанный POST `{order_id}` → pending/delivered/failed.
- Работающий Wrangler: `./admin/node_modules/.bin/wrangler.cmd`, существующий OAuth вход. Для сетевых команд/записи вне workspace нужен sandbox escalation. Логи направлять в workspace: `$env:WRANGLER_LOG_PATH = "$PWD/.local/wrangler-consent.log"`.
- Публикация: `wrangler deploy --keep-vars --config workers/capi/wrangler.jsonc`. Секреты не печатать. Создавать новую migration при добавлении нового DO.
- Скачанный оригинал Worker: `.local/my-meta-capi-source.txt`, исходные настройки `.local/my-meta-capi-settings.json` (секреты там только именами). Backup Edge Function: `.local/supabase-intake-original/source/index.ts`. Локальная копия webhook-secret: `.local/capi-webhook-secret.json` — НЕ публиковать.

## Доступы: ВАЖНО, использовать Google Chrome пользователя

Пользователь прямо поправил агента: Analytics и Events Manager открыты **в его Google Chrome, не во встроенном браузере**. Не просить снова логиниться из-за неверной встроенной сессии.

- Native Chrome: app `Chrome`, window ID `66434` (перед действиями обновить inventory/handle).
- В Chrome открыты: Supabase SQL Editor, Cloudflare Quick Edit, GitHub, **Google Аналитика | Обзор в режиме реального времени**, **Events Manager**.
- GA4 владелец по словам пользователя: `enka.electronics.ge@gmail.com`. Реальная вкладка в Chrome показывает realtime; её URL/property ID ещё не прочитаны. Нужно начать с неё.
- Реальный Meta URL в Chrome:
  `https://eventsmanager.facebook.com/events_manager2/list/dataset/1499689204986172/overview?business_id=1109118038957468&act=1672548880562027&nav_source=ads_ecosystem_nav`
- На реальной странице Meta видны только View content и PageView: по 11 событий, **EMQ 5.8/10** у обоих, последний приём ~1 час назад. Это НЕ оценка нового Purchase; Purchase в видимом списке не было.
- Во встроенном браузере ошибочно проверялась другая сессия: GA4 показывал onboarding даже с нужным email, Meta — login. Эти выводы о доступах НЕ использовать. Был отправлен async-вопрос о прямой ссылке GA4; он теперь не нужен, сначала прочитать Chrome.
- Во встроенной сессии Ads под `niko.oganesiani@gmail.com` виден аккаунт `278-051-0704`: единственная Website-конверсия Purchase, Primary, Every, 30 days, Inactive/Misconfigured; GA4 import отсутствует. Проверить, что это нужный рекламный аккаунт, в пользовательском Chrome перед изменениями.

## Начатый план улучшения (ещё не применён)

1. Сохранять контекст рекламного перехода и согласие вместе с заказом; fbp/fbc и Google IDs использовать с учётом выбора пользователя.
2. Для настоящего IP/UA пропускать заказ через `/orders` в Cloudflare Worker, затем в прежний Supabase intake. Worker перезаписывает клиентские IP/UA фактическими заголовками входящего запроса и подписывает контекст. Turnstile по-прежнему проверяется Supabase.
3. Передавать подписанный контекст в существующем `attribution` через служебные ключи; публичная SQL-обёртка должна проверить подпись из Vault, извлечь/сохранить контекст, убрать служебные поля перед вызовом старой внутренней функции. Сохранение контекста и обогащение outbox — в той же транзакции, идемпотентно.
4. Обогатить Meta ph + настоящий UA/IP + доступные fbp/fbc; при необходимости имя из сохранённого заказа. Не подставлять IP/UA Supabase, случайные external_id, фиктивные email/имена и не обещать числовой EMQ.
5. Google: определить поддерживаемый серверный путь и основную цель, связать конверсию с кликом/заказом; не дублировать одну заявку браузерным импортом и новой серверной основной целью. GA4 lead и фактическая оплаченная покупка — разные стадии COD.
6. Проверить Test Events/Diagnostics, GA4/Ads goals/linking/enhanced conversions, серверные ответы и фактическое сопоставление. Не создавать фиктивные production Purchase ради проверки; использовать validateOnly/test mode.

### Новые локальные файлы/изменения — НЕ ГОТОВЫ

- NEW `assets/js/global/measurement-context.js`: snapshot consent, consent-gated 30-day local attribution, Google click IDs, fbp/fbc, UTM, bounded gtag get client_id/session_id (300 ms), очистка при отзыве. Требуются тесты, review race при смене согласия во время async snapshot, ограничение/очистка входного localStorage.
- MOD `_includes/scripts_main.html`: этот модуль подключён перед order-intake.
- MOD `assets/js/global/privacy.js`: purge дополнен ключом `enka_measurement_v1`.
- NEW `workers/capi/order-proxy.mjs`: `/orders`, строгий Origin, body limit, idempotency-key, исходные IP/UA из заголовков, whitelist контекста, HMAC `intake.<timestamp>.<idempotency-key>.<rawContext>`.
- Proxy пересылает attribution с `__enka_measurement` (JSON string), `__enka_timestamp`, `__enka_signature`, плюс UTM. **Рабочая SQL-обёртка ещё не умеет это принимать! До её миграции НЕ переключать frontend на proxy.**
- MOD `workers/capi/worker.mjs`: локально добавлен маршрут `/orders`.
- `assets/js/global/order-intake.js` пока НЕ менялся: обращается напрямую в Supabase, не вызывает snapshot, не передаёт measurement. Поэтому production не затронут.
- `purchase.mjs`, новая SQL-миграция контекста, Google sender/outbox и новые тесты пока НЕ написаны. Ничего из этой фазы не публиковалось.

## Google API: обнаружено актуальное ограничение

На 15.11.2026 для **новой** интеграции offline/enhanced lead conversions нужно ориентироваться на **Data Manager API**, не на старый `Google Ads API UploadClickConversions`: новые adopters ограничены с 15.06.2026.

- Официально: `https://developers.google.com/google-ads/api/docs/conversions/upload-offline`.
- API: `POST https://datamanager.googleapis.com/v1/events:ingest`; OAuth scope `https://www.googleapis.com/auth/datamanager`; destinations/events/consent; есть `validateOnly: true`; успешная постановка возвращает requestId, затем нужен контроль результата, не путать его с принятой конверсией.
- Reference: `https://developers.google.com/data-manager/api/reference/rest/v1/events/ingest`.
- GA4 Measurement Protocol — возможный дополнительный путь, требует API secret и корректного client_id/session_id; не превращать denied Consent Mode в передачу пользовательских идентификаторов с сервера. Credentials/Cloud project/API secret пока не создавались.

## Проверки, публикация и ограничения инструментов

- Последние опубликованные коммиты: `8655f14` (основная фаза), `0424fac` (финальная конфигурация), main. CI оба success.
- Успешный ручной Cloudflare Pages deploy: `https://github.com/nikooganesiani/nikooganesiani.github.io/actions/runs/43710399560`. Push в main публикует GitHub Pages; **Cloudflare Pages публикуется workflow_dispatch**, `.github/workflows/main.yml`.
- Предыдущая фаза: 154 теста; build/site/translations прошли; SQL и создание заказа/outbox проверены с ROLLBACK; подпись Vault→Worker проверена намеренно неполным событием (400 Invalid created_at), без Meta Purchase.
- Локальный реальный workerd/SQLite DO тест с mock Meta: `.local/capi-runtime-check.cjs`. В Miniflare 5 нужен `convertV4MiniflareOptions`, Request adapter и совместимый undici Response.
- Тесты: `node --test tests/*.test.cjs admin/tests/*.test.mjs`. Сборка Ruby здесь: `./.local/ruby/rubyinstaller-4.0.9-1-x64/bin/ruby.exe -I vendor/gems/concurrent-ruby-1.3.8/lib/concurrent-ruby .local/build.rb`; затем check-site/check-translations. Generate требует сети/каталога.
- Untracked `.tokensave/`, `tokensave`, `tokensave.exe` — пользовательские инструменты, не включать в коммиты. HANDOFF-SUPABASE-CAPI.md тоже untracked, создан по просьбе пользователя.
- Соблюдать пользовательский AGENTS.md: tokensave_context/status/search до exploration, status может показывать stale_files=2, проверять source. Для файлов перед edit можно обычный read. Не делегировать субагентам без прямого разрешения.
- Навык computer-use уже прочитан в этом чате. Native Windows через `mcp__node_repl` + `@oai/sky`. Сначала inventory → уникальное окно → свежая state. Скриншот может показывать перекрывающее окно Discord/Codex: активировать Chrome перед вводом. AX focused_element иногда ошибочно остаётся адресной строкой — ориентироваться и на screenshot/caret.
- В Cloudflare Monaco `Ctrl+L` перехватывался редактором! Адресную строку выбирать мышью. Вкладка Quick Edit содержит несохранённый черновик; автоматическая проверка запрещала закрыть его с потерей изменений. Не закрывать/не деплоить неизвестный черновик. Использовать проверенный локальный source + Wrangler.
- Создание пустой native вкладки (`Ctrl+T`/Alt+Enter) несколько раз полностью останавливало Computer Use из-за невозможности определить URL. Избегать. Работать с уже открытыми непустыми вкладками; не навигировать вкладку с несохранёнными правками.
- Пользователь разрешил работу с ПК, необходимыми сайтами, миграции Supabase, Vault secret и публикацию main/Cloudflare Pages; это уже подтверждено, не спрашивать заново рутинные действия. Для нового расширения чувствительных доступов/API credentials учитывать обязательное action-time approval после подготовки конкретного действия.
- Все новые изменения сначала довести до тестируемого результата; не включать Google sender без credentials/цели и не переключать заказ на новый endpoint до проверки совместимой SQL-обёртки.
