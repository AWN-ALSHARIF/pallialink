<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Reports live in the Cloud database; UI only calls `src/lib/store.ts`, whose in-memory cache is a read-only mirror refreshed after each write (never write whole datasets back — that caused stale-tab overwrites).
- All report writes go through security-definer DB functions (`submit_report`, `report_action`) that re-check role/assignment/status; tables grant authenticated SELECT only, gated by RLS `can_view_patient`. Demo personas are real auth accounts via `demoSignIn` server fn.
- All UI copy goes through `src/lib/i18n.ts` (Arabic default, RTL); never hardcode strings in components.
