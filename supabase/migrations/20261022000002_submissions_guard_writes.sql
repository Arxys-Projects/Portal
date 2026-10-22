-- ADR 0167: stop partners from writing protected columns on public.submissions
-- (baseline audit B1-S-2 / B1-A-1, B1-S-13; closes B2-S-10 for new rows, while
-- B2-A-12's one shared name loader is still open).
--
-- The hole (confirmed live 2026-10-19 by the catalog snapshot):
--   * `authenticated` holds table-wide INSERT (20260515193702:166) and UPDATE,
--     DELETE (20260527182010:50) on submissions, with no column list;
--   * the INSERT and UPDATE policies (20260615000001:107, :119) check only
--     `partner_id = auth.uid()`;
--   * there was no trigger on the table.
-- So a signed-in partner could PATCH their own row over REST and set
--   - pipedrive_deal_id: a revise of that row then has the server overwrite
--     whatever Pipedrive deal the number points at (any partner's, any deal);
--   - on_behalf_of_partner_id: the SELECT policy and ADR 0083 then show the row
--     and its Project Quotes to that partner, labeled "Prepared by Arxys".
--     ADR 0152 makes this column the Project Portal visibility grant;
--   - parent_submission_id, created_at, email_sent_at, the banked figures;
--   - status from won/lost back to open, which then passes the delete guard.
--
-- The fix is a BEFORE INSERT OR UPDATE guard trigger (the ADR 0151 pattern):
--   * service_role (the app's admin client, every script) and direct SQL
--     (postgres in the dashboard, the FK's own ON DELETE SET NULL action) pass;
--   * an active admin (is_admin(auth.uid())) may write anything;
--   * any other caller, on UPDATE, may change only `status` and `is_preferred`.
--     Moving `status` away from won or lost also needs an active internal
--     user (Andy's decision 2026-10-19: won and lost are staff-only to reopen);
--   * any other caller, on INSERT, may not set pipedrive_deal_id,
--     email_sent_at, pdf_url, total_partner_price_usd or a created_at other
--     than the default; may set on_behalf_of_partner_id /
--     on_behalf_of_company_name only as an active internal user; and may set
--     parent_submission_id only to a row their own SELECT policy shows them.
-- A refusal raises 42501 (PostgREST returns HTTP 403) and names the column(s).
-- A column added to submissions later is UPDATE-protected automatically;
-- making one partner-editable is a deliberate edit to the allow-list below.
--
-- The app writes that this would refuse move to the service-role client in
-- the same change: the email_sent_at stamp and the pipedrive_deal_id link in
-- submitCalculation, and the same two stamps in the staff relink and resend
-- actions. Deploy that code BEFORE applying this file, or a fresh partner
-- submit will create a Pipedrive deal it cannot link.
--
-- Not closed here (ADR 0167, accepted): a partner's direct REST INSERT can
-- still bank sizing and price figures the server did not compute, and a staff
-- "Retry Pipedrive link" on that row carries them into the deal value. Closing
-- that means moving the INSERT itself to the service-role client.
--
-- SECURITY INVOKER on purpose, as in ADR 0151: the guard keys on
-- current_user, which inside a DEFINER function would be the owner and wave
-- every caller through. It needs no elevated rights: is_admin() and
-- is_internal() are SECURITY DEFINER with EXECUTE granted to authenticated,
-- and the guard returns before calling them for every other role, so
-- service_role needs no EXECUTE on either. The parent_submission_id check
-- reads submissions as the caller on purpose, so RLS decides what "visible"
-- means. search_path is pinned empty and every reference is qualified.
--
-- Unchanged: the submissions policies, the table grants, is_admin(),
-- is_internal(), and the delete guard (status = 'open'), which now holds
-- because a partner can no longer reopen a won or lost row.
--
-- ⚠ STOP-AND-FLAG (standing rule, ADR 0083 / 0089 convention): security-boundary
-- change on a live table. No `supabase db push` by the agent. Andy applies this
-- by hand in the Supabase dashboard SQL editor, after the app change is live.
-- See docs/apply-notes/0167-submissions-guard-writes.md for the steps and the
-- post-apply checks. No data is touched, so no backup is required.
-- Rollback: supabase/rollback/submissions-guard-writes-rollback.sql.

create or replace function public.submissions_guard_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid;
  refused text[] := '{}';
begin
  -- Only the roles PostgREST hands to end users are guarded. service_role and
  -- direct SQL are trusted. The FK's ON DELETE SET NULL on
  -- parent_submission_id runs as the table owner, so it passes here too.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  uid := auth.uid();

  -- is_admin() reads partners, which this statement cannot change. anon holds
  -- no EXECUTE on it (and no grant on submissions), so anon fails closed.
  if public.is_admin(uid) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Partner-editable columns: status and is_preferred. Everything else is
    -- written by the server as service_role, or by an admin.
    select coalesce(array_agg(n.key order by n.key), '{}')
      into refused
      from jsonb_each(to_jsonb(new)) as n
      join jsonb_each(to_jsonb(old)) as o using (key)
     where n.value is distinct from o.value
       and n.key not in ('status', 'is_preferred');

    if cardinality(refused) > 0 then
      raise exception 'only an admin can change % on a submission',
        array_to_string(refused, ', ')
        using errcode = '42501',
              hint = 'Partners may change only status and is_preferred.';
    end if;

    if old.status in ('won', 'lost')
       and new.status is distinct from old.status
       and not public.is_internal(uid) then
      raise exception 'only Arxys staff can change a % submission', old.status
        using errcode = '42501',
              hint = 'Won and lost submissions are reopened by Arxys staff.';
    end if;

    return new;
  end if;

  -- INSERT. Server-written columns, and columns no app path writes, start
  -- empty. created_at must be its default, now(), which is the transaction
  -- time and so equal here when the column was left out.
  if new.pipedrive_deal_id is not null then
    refused := array_append(refused, 'pipedrive_deal_id');
  end if;
  if new.email_sent_at is not null then
    refused := array_append(refused, 'email_sent_at');
  end if;
  if new.pdf_url is not null then
    refused := array_append(refused, 'pdf_url');
  end if;
  if new.total_partner_price_usd is not null then
    refused := array_append(refused, 'total_partner_price_usd');
  end if;
  if new.created_at is distinct from now() then
    refused := array_append(refused, 'created_at');
  end if;

  -- The on-behalf columns grant another partner read access (ADR 0054, 0152)
  -- and drive the "Prepared by Arxys" label. Only an active internal user
  -- files on someone's behalf.
  if (new.on_behalf_of_partner_id is not null or new.on_behalf_of_company_name is not null)
     and not public.is_internal(uid) then
    if new.on_behalf_of_partner_id is not null then
      refused := array_append(refused, 'on_behalf_of_partner_id');
    end if;
    if new.on_behalf_of_company_name is not null then
      refused := array_append(refused, 'on_behalf_of_company_name');
    end if;
  end if;

  -- Revision lineage may only point at a row the caller can already see.
  -- This read runs as the caller, so the SELECT policy decides. Without it,
  -- an admin relink of this row would update another partner's deal.
  if new.parent_submission_id is not null
     and not exists (
       select 1 from public.submissions s where s.id = new.parent_submission_id
     ) then
    refused := array_append(refused, 'parent_submission_id');
  end if;

  if cardinality(refused) > 0 then
    raise exception 'a partner cannot set % on a new submission',
      array_to_string(refused, ', ')
      using errcode = '42501',
            hint = 'These columns are written by the server.';
  end if;

  return new;
end;
$$;

comment on function public.submissions_guard_writes() is
  'ADR 0167: BEFORE INSERT OR UPDATE guard on public.submissions. A non-admin authenticated caller may UPDATE only status and is_preferred (won/lost stay put unless internal), and may not INSERT a deal id, email stamp, pdf_url, partner price, custom created_at, an on-behalf target (unless internal) or a parent row they cannot see. service_role and direct SQL pass.';

drop trigger if exists trg_submissions_guard_writes on public.submissions;

create trigger trg_submissions_guard_writes
before insert or update on public.submissions
for each row execute function public.submissions_guard_writes();

-- Trigger helper: fires from the trigger machinery regardless of the caller's
-- EXECUTE privilege, so no client role needs it (same as ADR 0151).
revoke execute on function public.submissions_guard_writes() from anon, authenticated, public;
