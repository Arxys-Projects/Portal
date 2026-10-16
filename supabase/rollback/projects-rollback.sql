-- Rollback for 20261016000003_projects.sql (ADR 0153).
--
-- Run this before rolling back 20261016000002. No pre-existing object changes:
-- submissions gained no column (the link is a side table), so nothing on
-- submissions needs restoring. Every submission stays exactly as it is; it just
-- stops belonging to a project.
--
-- DATA LOSS: projects, their extra contacts, and which calcs belong to which
-- project. Dump first if any exist:
--
--   copy (select * from public.projects)            to '/tmp/projects.csv'            with (format csv, header);
--   copy (select * from public.project_submissions) to '/tmp/project_submissions.csv' with (format csv, header);

drop table if exists public.project_submissions;
drop table if exists public.project_contacts;
drop table if exists public.projects;
drop function if exists public.projects_check_primary_contact();
