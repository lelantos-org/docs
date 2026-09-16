# Installation

::: tip If you are an agent
You can find these docs as plain markdown: [llms.txt](https://docs.lelantos.xyz/llms.txt) indexes every page, [llms-full.txt](https://docs.lelantos.xyz/llms-full.txt) is the whole guide in one file, and any page is available by appending `.md` to its URL — for example [/guide/quickstart.md](https://docs.lelantos.xyz/guide/quickstart.md).
:::

`@lelantos-org/sdk` is published to **GitHub Packages**, not the public npm registry. A plain `npm install` returns a 404. Point the `@lelantos-org` scope at GitHub Packages and provide a token with the `read:packages` scope.

::: info Upgrading from 0.38
0.39 is a breaking redesign of the public API. See [Migrating from 0.38](/guide/migration-0.38-to-0.39).
:::

## 1. Configure the registry

Add an `.npmrc` to the consuming repository:

```
@lelantos-org:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

The token is read from the environment, so the file can be committed. Do not write the token into it.

## 2. Install

```bash
export NODE_AUTH_TOKEN=$(gh auth token)   # or a PAT with read:packages
npm install @lelantos-org/sdk viem @lelantos-org/circuits
```

| Package | Required | Provides |
|---|---|---|
| `viem` | **yes** (peer) | the chain adapter, signers, and key derivation from an EOA |
| `@lelantos-org/circuits` | no (peer) | prover artifacts, resolved automatically on Node. Browsers pass `prover: { artifacts }` or `prover: { cdn }` instead — see [Browser usage](/guide/browser#prover-artifacts) |
| `snarkjs`, `circom_runtime` | no (peer) | the JS witness calculator and fallback prover; imported lazily, only when a proof needs them |

## 3. Configure CI

Pass the built-in `GITHUB_TOKEN`:

```yaml
- run: npm ci
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Requirements

| Requirement | Detail |
|---|---|
| Runtime | Node 24+, current browsers, or Deno |
| Module format | ESM only (`"type": "module"`) |
| Platform APIs | Web Crypto and `fetch`; no `node:*` imports in browser-reachable code |
| TypeScript | `"moduleResolution": "nodenext"` or `"bundler"` |
| Browser CSP | `'wasm-unsafe-eval'` in `script-src` — see [Browser usage](/guide/browser) |

The package is exposed through an `exports` map of subpaths. TypeScript's legacy `"node"` resolution cannot read it, and imports such as `@lelantos-org/sdk/advanced` fail to resolve.

## Verify the install

```ts twoslash
import { VERSION } from "@lelantos-org/sdk";

console.log(VERSION);
```

## Package layout

Most applications import only from the root. Every exported name has exactly one home; see [Package subpaths](/guide/subpaths) for the full map.

| Entry point | Use it for |
|---|---|
| `@lelantos-org/sdk` | `connect()`, the `WalletApi` it returns, amounts, network presets, and every error class |
| `@lelantos-org/sdk/watch` | `connectWatch()` for viewing-key wallets |
| `@lelantos-org/sdk/advanced`, `/prover`, `/services` | replacing the chain adapter, prover, relayer submitter, stores, or selector |
| `@lelantos-org/sdk/protocol`, `/primitives` | fee arithmetic, keys, notes and bundle builders without a wallet |

Amounts are branded (`CircuitAmount`, `TokenAmount`); a plain `bigint` amount does not compile. See [Amounts and assets](/guide/amounts).

## Versioning

The SDK is pre-1.0: minor versions may contain breaking changes. Pin an exact version for reproducible builds, and check the [release notes](https://github.com/lelantos-org/sdk/releases) before upgrading.

## Next

- [Quickstart](/guide/quickstart)
- [Concepts](/guide/concepts)
