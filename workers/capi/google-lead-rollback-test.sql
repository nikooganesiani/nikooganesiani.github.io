-- Append after supabase-google-lead.sql with its final COMMIT removed.
-- Append after supabase-measurement.sql with its final COMMIT removed.
update public.enka_measurement_settings set google_lead_enabled=true where id=1;
do $$
declare
  k uuid := gen_random_uuid(); item jsonb; r jsonb; r2 jsonb; snap jsonb;
  secret text; stamp text; raw text; signature text; attribution jsonb;
begin
  select decrypted_secret into strict secret from vault.decrypted_secrets where name='enka_capi_order_webhook_secret';
  stamp := floor(extract(epoch from clock_timestamp()))::bigint::text;
  raw := '{"version":1,"google_server_capable":true,"consent":{"analytics_storage":"granted","ad_storage":"granted","ad_user_data":"granted","ad_personalization":"granted"},"utm":{"utm_source":"rollback-test"},"google":{"client_id":"123.456","session_id":"123"},"meta":{"fbp":"fb.1.123.456"},"client_ip_address":"203.0.113.1","client_user_agent":"Rollback test","page_url":"https://enkaelectronics.com.ge/"}';
  signature := encode(extensions.hmac('intake.'||stamp||'.'||k::text||'.'||raw,secret,'sha256'),'hex');
  attribution := jsonb_build_object('utm_source','rollback-test','__enka_measurement',raw,'__enka_timestamp',stamp,'__enka_signature',signature);
  select jsonb_build_array(jsonb_build_object('site_id',attributes->>'site_id','quantity',1)) into item
    from enka.products where active and price>0 and attributes->>'site_id' is not null order by sku limit 1;
  if item is null then raise exception 'No product for test'; end if;
  begin
    perform public.enka_web_intake(k,'Integration ROLLBACK only','+995555000000','measurement-rollback-test',item,
      attribution || jsonb_build_object('__enka_signature',repeat('0',64)));
    raise exception 'Invalid signature accepted';
  exception when sqlstate '22023' then null; end;
  r := public.enka_web_intake(k,'Integration ROLLBACK only','+995555000000','measurement-rollback-test',item,attribution);
  r2 := public.enka_web_intake(k,'Integration ROLLBACK only','+995555000000','measurement-rollback-test',item,attribution);
  if r->>'google_delivery' is distinct from 'server' then raise exception 'Missing Google ownership'; end if; if r <> r2 or r->>'purchase_delivery' <> 'server' then raise exception 'Idempotency/ownership failed'; end if;
  select payload into strict snap from public.enka_purchase_outbox where order_id=r->>'id';
  if snap->'measurement' <> raw::jsonb then raise exception 'Context not atomically enriched'; end if;
  if (select count(*) from public.enka_order_measurement where order_id=r->>'id') <> 1 then raise exception 'Duplicate context'; end if;
  raw := replace(raw,'rollback-test','new-campaign');
  signature := encode(extensions.hmac('intake.'||stamp||'.'||k::text||'.'||raw,secret,'sha256'),'hex');
  attribution := jsonb_build_object('utm_source','new-campaign','__enka_measurement',raw,'__enka_timestamp',stamp,'__enka_signature',signature);
  r2 := public.enka_web_intake(k,'Integration ROLLBACK only','+995555000000','measurement-rollback-test',item,attribution);
  if r <> r2 then raise exception 'Changed context broke idempotency'; end if;
  if (select context->'utm'->>'utm_source' from public.enka_order_measurement where order_id=r->>'id') <> 'rollback-test' then
    raise exception 'Retry overwrote original attribution'; end if;
  if has_table_privilege('anon','public.enka_order_measurement','SELECT')
    or has_function_privilege('anon','public.enka_web_intake(uuid,text,text,text,jsonb,jsonb)','EXECUTE') then raise exception 'Public access'; end if;
end $$;
rollback;
select 'measurement_signature_order_outbox_idempotency_verified_rolled_back' as result;
