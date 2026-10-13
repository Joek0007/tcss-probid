-- SF-7c: server-side floor so replace_quote_line_items can NEVER silently wipe a quote
-- that currently has line items unless the caller explicitly opts in (p_allow_clear).
-- Protects against every client path (present, future, stale, or buggy). A deliberate
-- "clear all items" passes p_allow_clear := true (the client does this only when the
-- quote's value is already 0, i.e. a genuine clear).
-- Apply in the Supabase SQL editor (DDL via MCP is classifier-blocked).

drop function if exists public.replace_quote_line_items(uuid, jsonb);

create or replace function public.replace_quote_line_items(
  p_quote_id uuid,
  p_items jsonb,
  p_allow_clear boolean default false
)
returns integer
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_count integer;
  v_existing integer;
  v_incoming integer;
begin
  if p_quote_id is null then
    raise exception 'replace_quote_line_items: p_quote_id is required' using errcode='22004';
  end if;

  v_incoming := coalesce(jsonb_array_length(coalesce(p_items, '[]'::jsonb)), 0);

  -- The floor: an EMPTY payload may not clear a populated quote unless explicitly allowed.
  if v_incoming = 0 and not coalesce(p_allow_clear, false) then
    select count(*) into v_existing from public.quote_line_items where quote_id = p_quote_id;
    if v_existing > 0 then
      raise exception
        'replace_quote_line_items: refusing to clear % existing line item(s) for quote % without p_allow_clear',
        v_existing, p_quote_id
        using errcode = 'P0001';
    end if;
  end if;

  -- Atomic replace within this function's single transaction.
  delete from public.quote_line_items where quote_id = p_quote_id;

  insert into public.quote_line_items
    (quote_id, sort_order, description, category, qty, unit, material_cost, labor_hours)
  select p_quote_id,
         coalesce((e->>'sort_order')::int, 0),
         coalesce(e->>'description', ''),
         nullif(e->>'category', ''),
         coalesce((e->>'qty')::numeric, 1),
         coalesce(nullif(e->>'unit', ''), 'ea'),
         coalesce((e->>'material_cost')::numeric, 0),
         coalesce((e->>'labor_hours')::numeric, 0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as e;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

grant execute on function public.replace_quote_line_items(uuid, jsonb, boolean) to authenticated;
grant execute on function public.replace_quote_line_items(uuid, jsonb, boolean) to service_role;
