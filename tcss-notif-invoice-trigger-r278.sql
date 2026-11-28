-- RUN ON: PROD only — staging already applied by Claude
-- ============================================================================
-- TCSS ProBid r278 — Invoice status notifications into the ONE engine
-- Fires the notification engine when an invoice's status changes (paid, void,
-- partial, sent, unpaid, draft). Recipients/channels/quiet-hours are then 100%
-- controlled by notification_rules, same as every other module.
-- Idempotent — safe to run more than once.
-- PRE-REQ: the notification engine (fn_notif_dispatch) exists in the project.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_notif_inv_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.status is distinct from OLD.status and coalesce(NEW.status,'') <> '' then
    perform public.fn_notif_dispatch(
      'inv','status', NEW.status, NEW.id::text,
      coalesce(nullif(NEW.num,''),'An invoice'),
      coalesce(nullif(NEW.customer_name,''),''),
      null::uuid, ''::text, ''::text);
  end if;
  return NEW;
exception when others then
  raise warning 'fn_notif_inv_status error: %', sqlerrm;
  return NEW;
end;
$function$;

DROP TRIGGER IF EXISTS trg_notif_inv_status ON public.app_invoices;
CREATE TRIGGER trg_notif_inv_status
  AFTER UPDATE OF status ON public.app_invoices
  FOR EACH ROW EXECUTE FUNCTION fn_notif_inv_status();

-- Sanity
select 'invoice trigger applied' as result,
  (select count(*) from pg_proc    where proname='fn_notif_inv_status')   as fn,
  (select count(*) from pg_trigger where tgname ='trg_notif_inv_status')  as trigger;
