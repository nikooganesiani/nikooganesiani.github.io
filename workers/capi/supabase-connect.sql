-- Run after supabase-outbox.sql. Uses existing pg_net, pg_cron, Vault and pgcrypto.
-- Deploy the updated storefront before the final response switch at the end.
begin;
alter table public.enka_purchase_outbox add column request_id bigint;

create function enka.capture_purchase_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_order enka.orders; v_items jsonb; v_total numeric;
begin
  if new.action <> 'created' then return new; end if;
  select * into strict v_order from enka.orders where id = new.order_id;
  if v_order.channel <> 'website' or v_order.request_key is null then return new; end if;
  select jsonb_agg(jsonb_build_object('id', coalesce(nullif(p.attributes->>'site_id',''), i.sku),
    'quantity', i.quantity, 'item_price', i.unit_price) order by i.sku),
    sum(i.unit_price * i.quantity)
  into v_items, v_total
  from enka.order_items i left join enka.products p on p.sku = i.sku where i.order_id = v_order.id;
  perform public.enqueue_enka_purchase(jsonb_build_object('order_id', v_order.id::text,
    'created_at', v_order.created_at, 'currency', v_order.currency, 'value', v_total,
    'phone', v_order.phone, 'items', coalesce(v_items, '[]'::jsonb)));
  return new;
end $$;
revoke all on function enka.capture_purchase_created() from public, anon, authenticated;
create trigger enka_capture_purchase_created after insert on enka.order_events
for each row when (new.action = 'created') execute function enka.capture_purchase_created();

create function enka.dispatch_purchases() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_job public.enka_purchase_outbox; v_response net._http_response;
  v_secret text; v_timestamp text; v_signature text; v_answer jsonb;
  v_result text; v_request bigint; v_count integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('enka:purchase-dispatch', 0)) then return 0; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'enka_capi_order_webhook_secret';
  if v_secret is null then raise exception 'Purchase webhook secret is not configured'; end if;
  update public.enka_purchase_outbox set state = 'failed', payload = null, request_id = null,
    last_error = 'event_expired' where state in ('pending','leased') and created_at < now() - interval '7 days';
  delete from public.enka_purchase_outbox where created_at < now() - interval '90 days';

  for v_job in select * from public.enka_purchase_outbox where state = 'leased' and request_id is not null for update skip locked loop
    select * into v_response from net._http_response where id = v_job.request_id;
    if not found and v_job.next_attempt_at > now() then continue; end if;
    v_answer := null;
    begin v_answer := v_response.content::jsonb; exception when others then v_answer := null; end;
    v_result := case when v_response.status_code between 200 and 299 and v_answer->>'ok' = 'true'
      and v_answer->>'event_id' = 'purchase_' || v_job.order_id
      then case when v_answer->>'state' = 'failed' then 'failed' else 'accepted' end
      when v_response.status_code = 400 then 'failed' else 'pending' end;
    update public.enka_purchase_outbox set state = v_result,
      payload = case when v_result in ('accepted','failed') then null else payload end,
      last_error = case when v_result = 'accepted' then null else 'http_' || coalesce(v_response.status_code::text, 'timeout') end,
      request_id = null, claim_token = null,
      next_attempt_at = now() + interval '1 minute' * least(60, power(2, least(attempts,6)))
    where order_id = v_job.order_id;
  end loop;

  for v_job in select * from public.enka_purchase_outbox where state = 'pending' and next_attempt_at <= now()
    order by next_attempt_at limit 20 for update skip locked loop
    begin
      v_timestamp := floor(extract(epoch from clock_timestamp()))::bigint::text;
      v_signature := encode(extensions.hmac(v_timestamp || '.' || v_job.payload::text, v_secret, 'sha256'), 'hex');
      v_request := net.http_post(url := 'https://capi.enkaelectronics.com.ge/server/order-created',
        body := v_job.payload,
        headers := jsonb_build_object('Content-Type','application/json','X-Enka-Timestamp',v_timestamp,'X-Enka-Signature',v_signature),
        timeout_milliseconds := 15000);
      update public.enka_purchase_outbox set state = 'leased', attempts = attempts + 1,
        request_id = v_request, next_attempt_at = now() + interval '2 minutes', last_error = null
      where order_id = v_job.order_id;
      v_count := v_count + 1;
    exception when others then
      update public.enka_purchase_outbox set attempts = attempts + 1, next_attempt_at = now() + interval '5 minutes',
        last_error = 'dispatch_error' where order_id = v_job.order_id;
    end;
  end loop;
  return v_count;
end $$;
revoke all on function enka.dispatch_purchases() from public, anon, authenticated;

select cron.schedule('enka-purchase-dispatch', '* * * * *', 'select enka.dispatch_purchases();');
commit;
