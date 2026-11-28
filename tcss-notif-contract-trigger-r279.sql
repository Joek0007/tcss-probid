-- RUN ON: PROD only — staging already applied by Claude
-- ============================================================================
-- TCSS ProBid r279 — 'Contract' (Managed Services) status notifications → engine
-- Fires the notification engine when a recurring_contract's status changes
-- (active / cancelled / expired). The 'Contract' notification module = Managed
-- Services (the `contracts` table is unused). Idempotent.
-- PRE-REQ: fn_notif_dispatch exists.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_notif_ct_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.status is distinct from OLD.status and coalesce(NEW.status,'') <> '' then
    perform public.fn_notif_dispatch(
      'ct','status', NEW.status, NEW.id::text,
      coalesce(nullif(NEW.number,''),'A contract'),
      coalesce(nullif(NEW.client,''),''),
      null::uuid, ''::text, ''::text);
  end if;
  return NEW;
exception when others then
  raise warning 'fn_notif_ct_status error: %', sqlerrm;
  return NEW;
end;
$function$;

DROP TRIGGER IF EXISTS trg_notif_ct_status ON public.recurring_contracts;
CREATE TRIGGER trg_notif_ct_status
  AFTER UPDATE OF status ON public.recurring_contracts
  FOR EACH ROW EXECUTE FUNCTION fn_notif_ct_status();

select 'contract trigger applied' as result,
  (select count(*) from pg_proc    where proname='fn_notif_ct_status')  as fn,
  (select count(*) from pg_trigger where tgname ='trg_notif_ct_status') as trigger;
