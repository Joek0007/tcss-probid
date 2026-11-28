-- ============================================================================
-- TCSS ProBid — Fold quote approve/changes notifications into the ONE engine
-- Build r274 · 2026-11-27
-- RUN THIS IN THE SUPABASE SQL EDITOR ON **BOTH** PROJECTS:
--   • PROD    jzvoksidbelxibzbizvi
--   • STAGING dkqucgditvcthjgreeqd
-- Idempotent — safe to run more than once.
--
-- What it does:
--   1. Adds fn_notif_quote_approval() + trigger → routes quote 'Approved' /
--      'Changes Requested' into the shared notification engine (fn_notif_dispatch),
--      exactly like PO / WO / RFQ / Tool. Recipients, channels, quiet-hours are
--      now 100% controlled by notification_rules (the Notification Rules screen).
--   2. RETIRES the two hardwired triggers that bypassed the engine, so a quote
--      response notifies ONLY through the engine (no double-notify).
--
-- PRE-REQ: the engine must already exist in the project (notification_rules,
-- notification_outbox, fn_notif_dispatch). Prod has it; staging was mirrored r274.
-- ============================================================================

-- 1) New engine-routed quote trigger -----------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notif_quote_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.approval_status is distinct from OLD.approval_status
     and NEW.approval_status in ('approved','changes_requested') then
    perform public.fn_notif_dispatch(
      'quote','status',
      case when NEW.approval_status='approved' then 'Approved' else 'Changes Requested' end,
      NEW.id::text,
      coalesce(nullif(NEW.quote_number,''),'A proposal'),
      coalesce(nullif(NEW.customer_name,''),''),
      NEW.created_by,
      -- {comment}: the customer's change note (or signer on approval)
      case when NEW.approval_status='changes_requested'
           then coalesce(NEW.approval_note,'')
           else coalesce(nullif(NEW.approved_by_name,''),'') end,
      -- {author}: who acted
      case when NEW.approval_status='approved'
           then coalesce(nullif(NEW.approved_by_name,''), NEW.customer_name, 'A client')
           else coalesce(NEW.customer_name,'A client') end
    );
  end if;
  return NEW;
exception when others then
  raise warning 'fn_notif_quote_approval error: %', sqlerrm;
  return NEW;
end;
$function$;

DROP TRIGGER IF EXISTS trg_notif_quote_approval ON public.quotes;
CREATE TRIGGER trg_notif_quote_approval
  AFTER UPDATE OF approval_status ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION fn_notif_quote_approval();

-- 2) Retire the hardwired pair (engine is now the single path) ----------------
DROP TRIGGER IF EXISTS trg_notify_office_bell_on_approval ON public.quotes;
DROP TRIGGER IF EXISTS trg_notify_quote_approval          ON public.quotes;
DROP FUNCTION IF EXISTS public.notify_office_bell_on_approval();
DROP FUNCTION IF EXISTS public.notify_quote_approval_change();

-- (The standalone edge function `notify-quote-approval` is now call-less and
--  goes dormant; leave it deployed. Guard + approval-token triggers are untouched.)

-- 3) Sanity -------------------------------------------------------------------
select 'quote fold-in applied' as result,
  (select count(*) from pg_proc where proname='fn_notif_quote_approval')      as new_fn,
  (select count(*) from pg_trigger where tgname='trg_notif_quote_approval')   as new_trigger,
  (select count(*) from pg_proc where proname='notify_office_bell_on_approval') as old_bell_fn_should_be_0,
  (select count(*) from pg_proc where proname='notify_quote_approval_change')   as old_email_fn_should_be_0;
