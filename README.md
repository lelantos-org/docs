# Lelantos SDK documentation

Source for **https://docs.lelantos.xyz** — the developer documentation for
[`@lelantos-org/sdk`](https://github.com/lelantos-org/sdk).

Built with [VitePress](https://vitepress.dev). Guides are hand-written; the API
reference is generated from the SDK's shipped type declarations.

## Local development

The SDK is published to GitHub Packages with restricted access, so you need a
token with `read:packages` before installing.

```bash
echo "NODE_AUTH_TOKEN=$(gh auth token)" > .env.local

set -a && . ./.env.local && set +a
npm ci
npm run dev
```

`.npmrc` is committed and contains no secret — it reads `$NODE_AUTH_TOKEN` at
install time. `.env.local` holds the token itself and is gitignored. Never
commit a token.

## Which SDK version the docs describe

Whatever is pinned in `package.json` — currently `@lelantos-org/sdk` at an
exact version, so `package-lock.json` fixes it. To document a new release, bump
that dependency; nothing else needs to change.

The docs deliberately consume the **published package** rather than a source
checkout. The package ships prebuilt WASM (`files: ["dist", "wasm/*/pkg"]`), so
the docs build needs no Rust toolchain — a source checkout would, because
`#wasm/prover` and `#wasm/poseidon` cannot resolve without it.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | generate the reference, then serve with hot reload |
| `npm run build` | generate → both gates → build |
| `npm run gen:reference` | TypeDoc → `src/reference/` (gitignored) |
| `npm run check:api-coverage` | every public export appears in the reference |
| `npm run check:nav` | every guide page is reachable from the sidebar |
| `npm run check:fences` | every `ts` fence is typechecked or explicitly skipped |
| `npm run verify` | format + lint + full build |

## How snippets stay correct

Documentation is API surface. The SDK's own `check-docs.mjs` exists because the
README quickstart once accumulated three silent type errors, and this site
keeps that guarantee:

- **Twoslash** compiles every ` ```ts twoslash ` block during `vitepress build`.
  A type error fails the build. Readers also get hover type tooltips.
- **`check:fences`** closes the gap Twoslash leaves open. Twoslash is opt-in per
  fence, so a plain ` ```ts ` would render unchecked — this script fails the
  build unless every fence carries `twoslash` or an explicit
  `<!-- typecheck: skip -->` on the line before it.
- **`check:api-coverage`** derives the public surface from the installed `.d.ts`
  with the TypeScript compiler API and fails if any export is undocumented, so a
  new export cannot ship without docs.
- **`check:nav`** fails when a page in `src/guide/` is absent from the sidebar,
  or when a sidebar entry points at a page that does not exist. A page missing
  from the navigation still builds and still passes the dead-link check —
  readers just cannot find it — which is how two pages shipped orphaned.

## Layout

```
scripts/
  lib/sdk.mjs        what counts as public API — shared by the reference
                     generator and the coverage gate, which disagreed once
  lib/docs.mjs       markdown discovery, the TS fence scanner, failure output
src/.vitepress/
  config.ts          composition only
  config/            sidebar, footer markup, build info, twoslash options
  theme/tokens.css   the palette, ported from webapp-ui
  theme/footer.css   the footer row, ported from explorer-ui
```

`scripts/check-nav.mjs` imports `config/sidebar.ts` directly rather than
re-parsing it, so the navigation has one source of truth. Node 24 strips the
types on import.

Writing a snippet:

````md
```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({ /* … */ });
// ---cut-end---
await wallet.transfer({ to, amount: 100n });
```
````

Everything between `---cut-start---` and `---cut-end---` is compiled but hidden
from the reader, which is how a snippet stays both self-contained and short.
Use `// @errors: 2345` to assert that a block *should* fail to compile.

## Deployment

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every
push to `main`. The custom domain is set by `src/public/CNAME`; the DNS record
lives in `lelantos-org/infra` (`terraform/dns.tf`) as a standalone CNAME to
`lelantos-org.github.io` — not an entry in the `local.hosts` map, which points
at the VPS.
