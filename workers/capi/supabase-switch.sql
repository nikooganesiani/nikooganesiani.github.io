-- Apply only after the new storefront is published and outbox delivery verified.
-- Keep the original function signature, privileges and service-role-only API.
begin;
create or replace function public.enka_web_intake(p_key uuid, p_name text, p_phone text,
  p_source text, p_items jsonb, p_attribution jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  v_result := enka.web_intake(p_key, p_name, p_phone, p_source, p_items, p_attribution);
  if exists (select 1 from public.enka_purchase_outbox where order_id = v_result->>'id') then
    v_result := v_result || '{"purchase_delivery":"server"}'::jsonb;
  end if;
  return v_result;
end $$;
revoke all on function public.enka_web_intake(uuid,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.enka_web_intake(uuid,text,text,text,jsonb,jsonb) to service_role;
commit;
