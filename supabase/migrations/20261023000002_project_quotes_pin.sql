-- Project Portal backend, Step 6: pin a new Project Quote's deal id and
-- version. Closes baseline row B1-S-4. ADR 0174.
--
-- ⚠ STOP-AND-FLAG: a SECURITY DEFINER trigger on a table partners' quotes live
-- in. Applied by hand by Andy. Rollback: supabase/rollback/project-quotes-pin-rollback.sql.
--
-- B1-S-4: an internal session could INSERT a project_quotes row with any deal
-- id or version (RLS checks only the role and generated_by). The quote is
-- immutable and the owning partner downloads the latest version (ADR 0083), so
-- a forged "v99" would shadow the real quote for good.
--
-- The trigger, BEFORE INSERT, for every caller:
--   * a session that is neither internal nor admin is refused first, so it
--     learns nothing about a submission from the checks below (RLS refuses it
--     anyway);
--   * pipedrive_deal_id must equal the submission's own pipedrive_deal_id
--     (both bigint; a submission with no deal takes no quote);
--   * version must be max(version)+1 for the SUBMISSION. Versioning is per
--     submission (unique (submission_id, version), ADR 0061), and revisions
--     share their source's deal (ADRs 0040, 0173), so a per-deal count would
--     refuse a revision's first quote.
--
-- Races: generate.ts computes max+1, inserts, and re-assembles once on a 23505.
-- Two generates at once both compute N. If the first has not committed, the
-- second passes this trigger and the unique key refuses it with 23505. If the
-- first has committed, this trigger sees max = N and refuses the second with
-- 23505 too, so the existing retry still fires. A version above max+1 is a
-- skipped version and is refused with 23514.
--
-- It reads submissions and project_quotes as the function owner, so the
-- caller's RLS cannot hide a row from the check. search_path is empty and
-- every name is schema-qualified.

create or replace function public.project_quotes_pin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  submission_deal bigint;
  latest integer;
begin
  -- Service role and the dashboard carry no auth.uid().
  if caller is not null
     and not (public.is_internal(caller) or public.is_admin(caller)) then
    raise exception 'project_quotes: only internal users can generate a Project Quote'
      using errcode = '42501';
  end if;

  select s.pipedrive_deal_id into submission_deal
  from public.submissions s
  where s.id = new.submission_id;

  if submission_deal is null or new.pipedrive_deal_id is distinct from submission_deal then
    raise exception 'project_quotes: pipedrive_deal_id must equal the submission''s deal'
      using errcode = '23514';
  end if;

  select coalesce(max(q.version), 0) into latest
  from public.project_quotes q
  where q.submission_id = new.submission_id;

  if new.version <= latest then
    raise exception 'project_quotes: version % is already taken for this submission', new.version
      using errcode = '23505';
  end if;
  if new.version <> latest + 1 then
    raise exception 'project_quotes: the next version for this submission is %', latest + 1
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.project_quotes_pin() from public, anon, authenticated;

comment on function public.project_quotes_pin() is
  'ADR 0174 (B1-S-4): a new project_quotes row must carry its submission''s deal id '
  'and the next version for that submission.';

drop trigger if exists trg_project_quotes_pin on public.project_quotes;

create trigger trg_project_quotes_pin
  before insert on public.project_quotes
  for each row execute function public.project_quotes_pin();
