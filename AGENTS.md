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
- All demo data and role-based access checks live in `src/lib/store.ts` (localStorage-backed); UI must only call its functions so a real backend can replace it later.
- All UI copy goes through `src/lib/i18n.ts` (Arabic default, RTL); never hardcode strings in components.
