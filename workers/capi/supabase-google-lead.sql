-- Apply once with google_lead_enabled=false; enable only after Worker secret and validation.
begin;
create table public.enka_measurement_settings (id integer primary key check (id=1), google_lead_enabled boolean not null default false);
alter table public.enka_measurement_settings enable row level security;
revoke all on public.enka_measurement_settings from public, anon, authenticated;
grant select, update on public.enka_measurement_settings to service_role;
insert into public.enka_measurement_settings(id) values(1);
alter table public.enka_order_measurement add column google_server boolean not null default false;
create or replace function public.enka_web_intake(p_key uuid, p_name text, p_phone text,
  p_source text, p_items jsonb, p_attribution jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_result jsonb; v_context jsonb; v_saved jsonb; v_raw text;
  v_timestamp text; v_signature text; v_secret text;
  v_google boolean := false;
  v_utm jsonb := '{}'::jsonb; v_key text;
begin
  if p_attribution is null or jsonb_typeof(p_attribution) <> 'object' then
    raise exception 'Invalid attribution' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_attribution) loop
    if v_key not in ('utm_source','utm_medium','utm_campaign','utm_content','utm_term','utm_id',
      '__enka_measurement','__enka_timestamp','__enka_signature') then
      raise exception 'Invalid attribution field' using errcode = '22023';
    end if;
    if v_key like 'utm_%' then v_utm := v_utm || jsonb_build_object(v_key, p_attribution->v_key); end if;
  end loop;
  if p_attribution ?| array['__enka_measurement','__enka_timestamp','__enka_signature'] then
    v_raw := p_attribution->>'__enka_measurement';
    v_timestamp := p_attribution->>'__enka_timestamp';
    v_signature := p_attribution->>'__enka_signature';
    if v_raw is null or octet_length(v_raw) > 8192
      or coalesce(v_timestamp,'') !~ '^[0-9]{10}$'
      or coalesce(v_signature,'') !~ '^[a-f0-9]{64}$' then
      raise exception 'Invalid measurement envelope' using errcode = '22023';
    end if;
    if abs(extract(epoch from clock_timestamp()) - v_timestamp::bigint) > 300 then
      raise exception 'Expired measurement envelope' using errcode = '22023';
    end if;
    select decrypted_secret into strict v_secret from vault.decrypted_secrets
      where name = 'enka_capi_order_webhook_secret';
    if v_signature <> encode(extensions.hmac('intake.' || v_timestamp || '.' || p_key::text || '.' || v_raw,
      v_secret, 'sha256'), 'hex') then
      raise exception 'Invalid measurement signature' using errcode = '22023';
    end if;
    v_context := v_raw::jsonb;
    if jsonb_typeof(v_context) is distinct from 'object' or v_context->>'version' is distinct from '1'
      or jsonb_typeof(v_context->'consent') is distinct from 'object'
      or jsonb_typeof(v_context->'utm') is distinct from 'object'
      or v_context->'utm' is distinct from v_utm then
      raise exception 'Invalid signed context' using errcode = '22023';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('enka:measurement:' || p_key::text, 0));
  select context into v_saved from public.enka_order_measurement where request_key = p_key;
  if v_saved is not null then v_utm := v_saved->'utm'; end if;
  -- Only the existing UTM schema reaches the original idempotency fingerprint.
  v_result := enka.web_intake(p_key, p_name, p_phone, p_source, p_items, v_utm);
  if exists (select 1 from public.enka_purchase_outbox where order_id = v_result->>'id') then
    if v_context is not null then
      select coalesce((select google_lead_enabled from public.enka_measurement_settings where id = 1), false)
        and v_context->>'google_server_capable' = 'true'
        and v_context->'consent'->>'analytics_storage' = 'granted'
        and v_context->'consent'->>'ad_user_data' = 'granted'
        and coalesce(v_context->'google'->>'client_id','') ~ '^[A-Za-z0-9_.-]{1,128}$'
        and coalesce(v_context->'google'->>'session_id','') ~ '^[0-9]{1,15}$'
        into v_google;
      insert into public.enka_order_measurement(order_id, request_key, context, google_server)
        values (v_result->>'id', p_key, v_context, coalesce(v_google,false)) on conflict (order_id) do nothing;
      select context, google_server into v_saved, v_google from public.enka_order_measurement where order_id = v_result->>'id';
      -- Trigger-created outbox and enrichment commit together; retries preserve first context.
      update public.enka_purchase_outbox set payload = payload || jsonb_build_object('measurement', v_saved, 'google_delivery', case when v_google then 'server' else 'browser' end)
        where order_id = v_result->>'id' and state = 'pending' and attempts = 0 and payload is not null;
    end if;
    v_result := v_result || '{"purchase_delivery":"server"}'::jsonb;
  end if;
  if exists (select 1 from public.enka_order_measurement where order_id = v_result->>'id' and google_server) then
    v_result := v_result || '{"google_delivery":"server"}'::jsonb;
  end if;
  return v_result;
end $$;
revoke all on function public.enka_web_intake(uuid,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.enka_web_intake(uuid,text,text,text,jsonb,jsonb) to service_role;


commit;
