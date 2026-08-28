# Architecture

The SDK is organised as a strict tier ladder: a module may import only from a **lower** tier, never a higher or equal one. This is enforced in CI by `scripts/check-layers.mjs` rather than merely documented, which is what makes the subpath imports below a real guarantee instead of a convention.

| Tier | Modules | Role |
|---|---|---|
| 0 | `core`, `log`, `worker`, `wasm`, `types-ambient` | primitives with no SDK dependencies |
| 1 | `crypto` | field arithmetic, Poseidon, Jubjub |
| 2 | `fmd`, `keys`, `notes` | key derivation, detection, note encryption |
| 3 | `protocol`, `circuit` | wire contracts and circuit shapes |
| 4 | `permit2`, `chain`, `prover`, `services` | outside world — chains, provers, HTTP |
| 5 | `bundle`, `sync` | transaction assembly, note synchronisation |
| 6 | `wallet` | the `WalletApi` surface |
| 7 | `presets`, `x402` | opinionated entry points |

## The three enforced rules

1. **No importing from a higher tier.** The ladder is acyclic by construction, which is what lets a browser bundler drop `services` when an app only uses primitives.
2. **No `export *` anywhere.** Every re-export is named. This is why `api-surface.json` can be a meaningful snapshot: a symbol is public *if and only if* a barrel forwards it by name.
3. **No leaf module below tier 3 may import a domain barrel.** Low-level code imports the specific file it needs, so pulling in `crypto` does not drag a barrel's whole transitive closure with it.

## Why this shows up in the API

Two consequences you will notice as a consumer:

- **Subpath imports are meaningful.** `@lelantos-org/sdk/crypto` really is tier 1 and pulls in nothing above it. The 30 subpaths in the exports map are not cosmetic packaging.
- **Branded types live in tier 0.** `AssetId`, `CircuitAmount`, and `Hex32` are declared in `core` precisely so every tier above can speak them without a cycle. See [Amounts](/guide/amounts).

## Why this matters for bundle size

The ladder being acyclic is what lets a bundler drop whole tiers. An application that imports only `@lelantos-org/sdk/crypto` pulls in tier 0 and tier 1 and nothing else — no HTTP clients, no chain adapter, no prover. Importing the root barrel pulls in everything.

If bundle size matters, import from the narrowest subpath that has what you need.

## Next

- [Pluggable interfaces](/guide/interfaces) — where the ladder is meant to be cut
- [API Reference](/reference/)
