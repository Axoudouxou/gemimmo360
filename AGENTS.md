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

- Multi-step contract creation, payments with allocations, reallocation, receipt issuance and lease termination use authenticated PostgreSQL RPC transactions, so failed steps cannot leave partial business records.
- Shared operational role guards and lot status options live in operational-rules; the displayed permission matrix reflects enforced role guards, and only actions actually consuming matrix overrides are configurable.
