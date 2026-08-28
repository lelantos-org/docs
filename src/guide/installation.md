# Installation

The package is published to **GitHub Packages** with restricted access, so a plain `npm install` will not find it — it resolves against the public npm registry and returns a 404. Installing requires pointing the `@lelantos-org` scope at GitHub Packages and supplying a token with the `read:packages` scope.

## 1. Add `.npmrc`

In the consuming repository:

```
@lelantos-org:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

::: tip
The token is read from the environment, so this file is safe to commit. Never inline the token itself.
:::

## 2. Export a token and install

```bash
export NODE_AUTH_TOKEN=$(gh auth token)   # or a PAT with read:packages
npm install @lelantos-org/sdk @lelantos-org/circuits
```

`@lelantos-org/circuits` is an **optional** peer dependency. When present, `connect()` resolves prover artifacts automatically on Node. Browser callers pass `proverArtifacts: { circuit, zkey }` to `connect()` instead — see [Browser usage](/guide/browser).

## 3. In CI

Pass the auto-provisioned `GITHUB_TOKEN`:

```yaml
- run: npm ci
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Runtime requirements

- **Node 24+**, modern browsers, or Deno
- Web Crypto and `fetch` only — the SDK contains **no `node:*` imports**, enforced in CI
- ESM only (`"type": "module"`)

Browsers additionally need `'wasm-unsafe-eval'` in `script-src`; see [Browser usage](/guide/browser).

## What you get

The package exposes three layers:

- **Wallet API** — `connect()` returns a `Wallet` implementing `WalletApi`, with single-call `deposit` / `transfer` / `withdraw` / `sync` / `balance`. This is the root barrel, and it is all most applications import.
- **Pluggable interfaces** — `ChainAdapter`, `NoteSource`, `Submitter`, `Prover`, `CoinSelector`, and `NoteStore` can each be replaced independently. See [Pluggable interfaces](/guide/interfaces).
- **Primitives** — keys, FMD, note encryption, witness builders, and the prover wrapper, on their own subpaths (`/keys`, `/crypto`, `/fmd`, `/notes`, `/bundle`, `/prover`, …) so the root barrel stays small.

Amounts and asset ids are **branded types on the way out and plain `bigint` on the way in**, so `wallet.asset(1n)` and `amount: 100n` need no ceremony while values the SDK returns stay type-distinct. See [Amounts](/guide/amounts).

## Verifying the install

```ts twoslash
import { VERSION } from "@lelantos-org/sdk";

console.log(VERSION);
```

If TypeScript cannot resolve the import, check that your `tsconfig.json` uses `"moduleResolution": "nodenext"` or `"bundler"`. The package publishes an exports map with 30 subpaths, and the legacy `"node"` resolution mode cannot read it.

## Stability

Pre-1.0. The API may change between minor versions without a semver major. Pin an exact version if you need reproducible builds.

## Next

- [Quickstart](/guide/quickstart)
- [Concepts](/guide/concepts)
