# Architecture

The SDK is organized in tiers. A module may import only from lower tiers. `scripts/check-layers.mjs` enforces this in CI.

| Tier | Modules | Role |
|---|---|---|
| 0 | `core`, `errors`, `log`, `runtime` | primitives, the error taxonomy, logging, worker RPC and wasm loading; no protocol knowledge |
| 1 | `crypto` | field arithmetic, Poseidon, Jubjub |
| 2 | `fmd`, `keys`, `notes` | key derivation, detection, note encryption |
| 3 | `protocol`, `circuit` | wire formats, fee and denomination policy, circuit shapes and witness |
| 4 | `permit2`, `chain`, `prover`, `services` | the chain port and viem adapter, provers, HTTP clients |
| 5 | `bundle`, `sync` | transaction assembly, note synchronization, tree and nullifier mirrors |
| 6 | `wallet` | `connect`, the `WalletApi` object, operations |
| 7 | `x402`, `entry` | x402 payments, and the published subpath barrels |

## Enforced rules

1. **Imports go downward only.** A module imports from its own tier or below, never above, so the dependency graph has no cycles.
2. **No `export *`.** Every re-export is named. A symbol is public if and only if an `entry/*` barrel forwards it by name, and no name is published from two subpaths.
3. **Errors are leaves.** `errors/` imports only `core/`, so every tier can throw typed errors.
4. **Operations stay independent.** An operation in `wallet/ops/` never imports another, and the watch-only wallet never reaches the spend path.

## Implications for consumers

- **The root entry loads lazily.** `connect` and the wallet object are in the root, but the spend path, the prover, and the deposit family load on first use, so a balance-only page does not bundle them. `@lelantos-org/sdk/watch` reaches neither the prover nor the submitter at all. Bundle budgets for each entry are enforced in CI.
- **Branded types are defined in tier 0.** `AssetId`, `CircuitAmount`, and `Hex32` are declared in `core`, so every tier can use them. See [Amounts and assets](/guide/amounts#branded-types).
- **Subpaths are homes, not layers.** Each exported name has one subpath; see [Package subpaths](/guide/subpaths).

## Next

- [Pluggable interfaces](/guide/interfaces)
- [API reference](/reference/)
