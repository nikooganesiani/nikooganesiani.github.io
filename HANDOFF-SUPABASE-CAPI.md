# Передача контекста: Supabase, Meta CAPI и Consent Mode

Дата: 15 ноября 2026 года. Проект Supabase: `zilumtvyowzgpwswewtj` — ENKA ERP.
Репозиторий: `nikooganesiani/nikooganesiani.github.io`.

## Цель и итог

Убрать зависимость измерения покупок от кнопки «Принять все» и отдельного браузерного запроса после оформления. Серверный Meta Purchase теперь связан с успешным созданием заказа, сохраняется транзакционно и доставляется через Cloudflare Worker с повторами и дедупликацией. Интеграция опубликована и включена.

## Что изменено в Supabase

| Объект | Изменение и назначение |
| --- | --- |
| `public.enka_purchase_outbox` | Новая очередь событий. `order_id` — первичный ключ; содержит `payload`, `state`, `attempts`, `next_attempt_at`, `last_error`, `created_at`, `request_id`, служебный `claim_token`. RLS включён; доступ `anon`/`authenticated` закрыт, права выданы `service_role`. |
| `public.enqueue_enka_purchase(jsonb)` | Добавляет событие; `ON CONFLICT (order_id) DO NOTHING` предотвращает повторную запись одного заказа. Вызов закрыт для публичных ролей. |
| `enka.capture_purchase_created()` | Новая trigger-функция: формирует снимок заказа из сохранённых серверных данных. |
| `enka_capture_purchase_created` | Включённый `AFTER INSERT` trigger на `enka.order_events`, только для `action = 'created'`. Обрабатывает заказы с `channel = 'website'` и непустым `request_key`. |
| `enka.dispatch_purchases()` | Подписывает и ставит HTTP-запросы в `pg_net`, проверяет ответы, повторяет неудачные попытки, очищает истёкшие данные. Защищена от одновременного запуска advisory-lock. |
| Cron `enka-purchase-dispatch` | Активен; раз в минуту вызывает `select enka.dispatch_purchases();`, до 20 новых отправок за запуск. |
| Vault `enka_capi_order_webhook_secret` | Добавлен общий секрет подписи запросов в Worker. Значение в эту сводку и репозиторий не включено. |
| `public.enka_web_intake(uuid,text,text,text,jsonb,jsonb)` | SQL-обёртка заменена на PL/pgSQL `SECURITY DEFINER`, `search_path = ''`; выполнение разрешено только `service_role`. Вызывает прежнюю `enka.web_intake` и добавляет `purchase_delivery: "server"` в ответ при наличии outbox для заказа. |

Использованы уже установленные `pg_net`, `pg_cron`, Vault и `pgcrypto`. Новая Edge Function не создавалась; исходник существующей `enka-intake` не менялся. Внутренние `enka.web_intake`, `enka.intake`, проверки Turnstile, idempotency-key и лимиты частоты сохранены. Старые заказы задним числом в очередь не добавлялись.

## Как проходит заказ

```text
Форма сайта → enka-intake/public → public.enka_web_intake
  → enka.web_intake → enka.intake
  → заказ + строки с серверными ценами + order_events.created
  → trigger → outbox в той же транзакции
  → COMMIT
  → pg_cron / pg_net → подписанный запрос в Cloudflare Worker
  → Durable Object → Meta CAPI Purchase
```

Событие `created` записывается после сохранения строк заказа. Payload берёт ID, время, телефон и валюту из `enka.orders`, количество и цену из `enka.order_items`, ID товара — из `enka.products.attributes.site_id` с fallback на SKU. Сумма вычисляется из строк заказа; цена из браузера не используется.

Заказ и outbox коммитятся вместе. Ошибка записи outbox откатит транзакцию; сетевые ошибки доставки обрабатываются асинхронно и не мешают созданию заказа. Повтор существующего idempotency-key не создаёт новый заказ или второй outbox.

## Доставка, данные и состояния

- Endpoint: `POST https://capi.enkaelectronics.com.ge/server/order-created`.
- Подпись: HMAC-SHA256 от `timestamp + '.' + rawJsonBody`; заголовки `X-Enka-Timestamp`, `X-Enka-Signature`. Worker допускает расхождение времени до 5 минут.
- Секрет в Worker называется `ORDER_WEBHOOK_SECRET`; он соответствует секрету Vault.
- В outbox и запросе Supabase → Worker телефон присутствует в исходном виде. Worker нормализует его и передаёт в Meta SHA-256. Имя, email, browser cookies и IP сервера Supabase в новом событии не используются. Хеш телефона остаётся идентификатором.
- Supabase: `pending` → `leased` → `accepted` либо повтор/`failed`. **`accepted` означает сохранение события в Worker, а не подтверждение Meta.** Payload удаляется при обработке успешного ответа Worker.
- Worker: `pending` → `delivered` / `failed`; отдельный Durable Object на заказ, постоянный `event_id = purchase_<order_id>`, исходный `event_time`.
- Повторы ограничены 7 днями, статусы/ID хранятся 90 дней. После завершения доставки Worker удаляет payload, оставляя запись для дедупликации. Семантика — at least once с дедупликацией Meta.

## Изменения в общем контексте системы

- Google переведён на **Advanced Consent Mode v2**: тег загружается сразу с четырьмя статусами `denied`; согласие обновляет их на `granted`, отзыв возвращает `denied`. Включён `ads_data_redaction`; просмотры при смене согласия не дублируются.
- Серверный Meta Purchase не зависит от выбора аналитических cookies. Meta PageView/ViewContent по-прежнему требуют согласия.
- Обе формы сайта пропускают браузерный Purchase при `purchase_delivery: "server"`. Worker настроен с `SERVER_PURCHASE_ONLY: "true"` и отвергает Purchase на старом публичном входе с `403`.
- В GA4 принятый заказ с оплатой при получении остаётся `generate_lead`. Серверный GA4 Measurement Protocol не внедрялся.
- Уведомления о данных обновлены в KA/RU/EN. Секреты не публикуются; каталог `workers` исключён из Jekyll.

## Статус и проверки

Основной коммит: `8655f14`; финальная конфигурация и документация: `0424fac` — оба в `main`, CI успешен. Cloudflare Pages опубликован [workflow №1086](https://github.com/nikooganesiani/nikooganesiani.github.io/actions/runs/43710399560). Активная версия CAPI Worker: `ab21bf42-0258-4380-b3d7-62240807ef65`.

Проверены 154 автоматических теста, сборка и переводы; атомарность заказа/outbox и повтор idempotency-key — в PostgreSQL с полным `ROLLBACK`; подпись Vault → Worker; блокировка публичного Purchase. Локально проверены SQLite Durable Object, alarm, доставка с имитацией ответа Meta и подавление дубля.

На момент финальной проверки очередь была пуста, последние три запуска Cron — `succeeded`. Искусственные Purchase в рабочую Meta не отправлялись; фактический приём первого реального события Meta после переключения ещё не подтверждён.

## Где смотреть и что учитывать следующему агенту

- SQL: [supabase-outbox.sql](workers/capi/supabase-outbox.sql), [supabase-connect.sql](workers/capi/supabase-connect.sql), [supabase-switch.sql](workers/capi/supabase-switch.sql). Первые две миграции уже применены; повторно запускать их целиком не нужно.
- Полное описание, контракт и восстановление: [workers/capi/README.md](workers/capi/README.md).
- Проверять отдельно ошибки/задержки Supabase outbox и конечный статус Worker через подписанный `POST /server/order-status` с `{"order_id":"…"}`. Не считать `accepted` в Supabase успешной доставкой Meta.
- При изменении схемы заказа или расчёта цен проверить trigger-функцию и сопоставление `site_id` с рекламным каталогом. При откате согласованно менять SQL-обёртку, trigger/Cron и `SERVER_PURCHASE_ONLY`, учитывая pending-события и риск дублей.

```sql
select state, count(*), min(created_at) as oldest
from public.enka_purchase_outbox group by state;

select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'enka-purchase-dispatch')
order by start_time desc limit 10;
```
