# 0153 — Companies, contacts and projects are internal-only tables keyed by Pipedrive id; the calc link is a side table

- **Status**: Accepted (written, not yet applied; Step 1 of [the brief](../Portal-Project%20revamp/claude-code-brief-project-portal-backend.md))
- **Date**: 2026-10-16
- **Related**: 0112 (side table instead of a `submissions` column), 0151 (partners self-update guard), 0152 (how a contact's login sees quotes), 0055 (policy wrapping)

## Context

The Project Portal needs companies (Pipedrive orgs labeled "Arxys Security Partner"), contacts
(persons under them), a link from a portal login to its contact, projects, and a link from a calc to
its project. Step 0 found that the name-based org and person upserts created duplicate Pipedrive
orgs, and that partners could once update every column of their own row (fixed by 0151).

Three shape questions: who may write the synced tables, where the calc-to-project link lives, and
how to keep a contact's company consistent on the rows that copy it.

## Options considered

- **Synced tables writable by internal users** vs **sync-only (service_role) with internal SELECT**.
  Hand edits would be overwritten by the next sync; sync-only removes that trap.
- **`project_id` column on `submissions`** vs **`project_submissions` side table**. Partners can
  update any column of their own submission through PostgREST, so a column would let them attach
  or detach a calc. The side table has no partner grant (same reasoning as 0112).
- **Company check on `projects.primary_contact_id`**: composite FK (blocks or silently moves the
  project when the sync moves a person) vs a check trigger on write only.
- **`partner_contact_links.company_id`**: free column vs composite FK to `contacts (id, company_id)`
  with `on update cascade`, so the link always shows the contact's current company.

## Decision

- `companies`, `contacts`, `company_name_aliases`: keyed by Pipedrive id (unique), internal and
  admin SELECT only, written by the Step 2 sync as service_role. Rows are deactivated, never deleted.
- `partner_contact_links`: `partner_id` is the primary key (one contact per login). Internal and admin
  read and write; no partner access. `company_id` follows the contact through a composite FK.
- `projects`, `project_contacts`, `project_submissions`: internal and admin read and write.
  `project_submissions.submission_id` is the primary key (one project per calc); several calcs per
  project are allowed, and `calc_role` reserves `option` / `phase`.
- The primary contact must belong to the project's company when it is set (trigger, `23514`). A
  later move in Pipedrive does not change the project.
- Attribution columns (`created_by`, `linked_by`, `added_by`) must equal `auth.uid()` when set.
- Deletes: a calc's link cascades with the calc; a project with calcs cannot be deleted; a deleted
  login drops its link.

## Consequences

**Positive:** partners cannot read or change any project data by construction. No name-based
lookup anywhere in the new schema. Link rows cannot disagree with their contact's company.

**Negative:** company and contact edits must go through Pipedrive and the sync, never a portal form.
A project keeps its original company after its contact moves, so a report by "contact's current
company" and one by "project company" can differ.

**When to revisit:** if reps need to fix a company or contact in the portal before Pipedrive (then
add admin write policies), or if a calc ever needs to sit in two projects.
