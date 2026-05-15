<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Documentation discipline

This project uses the three-document system described in [`docs/README.md`](docs/README.md). When working on this codebase you are expected to keep these documents in sync as you go — not as a separate "documentation pass" at the end.

After every meaningful unit of work (a completed task, a fix, a decision):

1. **Append to [`docs/JOURNAL.md`](docs/JOURNAL.md)** with the date, what was done, and — if relevant — a "Detours & fixes" subsection capturing what was tried and abandoned, what broke, and what the root cause was. Newest entry at top.
2. **Update [`docs/RUNBOOK.md`](docs/RUNBOOK.md)** *only* if the happy path to recreate the project from zero has changed. The runbook stays linear and copy-pasteable; never let detours leak into it.
3. **Write an ADR in [`docs/decisions/`](docs/decisions/)** when a non-obvious choice is made — a library, a workflow, a pattern, a deliberate scope cut. ADRs are short (~30–60 lines): Context, Options considered, Decision, Consequences. Numbered sequentially; never reuse a number.

When *NOT* to write:

- Trivial fixes (`fixed typo in variable name`) — these go in git history, nowhere else.
- Things that are self-evident from reading the code in six months — don't restate them.
- Work-in-progress mid-task — capture once the work is at a stable checkpoint.

When you finish a task, check whether each of the three docs needs an update. Don't ask the user — make the call yourself based on what you just changed, and write the update before reporting the task as done.
