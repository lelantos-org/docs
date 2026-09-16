# Package subpaths

`@lelantos-org/sdk` publishes eleven typed entry points. Every exported name has exactly **one** home: the SDK's CI fails if a name is published from two subpaths, so there is never a choice to make about where to import something from.

Most applications import only from the root.

| Import | Contents | Stability |
|---|---|---|
| `@lelantos-org/sdk` | `connect`, the `WalletApi` / `ReadOnlyWalletApi` types and every option, quote, and result type; amounts (`parseAmount`, `formatAmount`, `toBaseUnits`, `fromBaseUnits`) and brands; `NETWORKS`; logging; `configureWasm`; key helpers (`generateMnemonic`, `deriveNskFromSigner`, `deriveNskFromPasskey`, viewing-key codec, `parseAddress`); every error class and `isWalletError` | semver |
| `@lelantos-org/sdk/watch` | `connectWatch` | semver |
| `@lelantos-org/sdk/x402` | x402 payers: `x402`, `shieldedExact`, `unshieldedExact`, budgets | semver |
| `@lelantos-org/sdk/advanced` | `createWallet`, `createWatchWallet`, `WalletConfig`; the `ChainReader` / `ChainAdapter` ports, the viem adapter and reader, signers, `supports*` guards; `Submitter` / `HttpRelayerSubmitter`; note stores and sources; tree and nullifier persistence; coin selectors; scanners; `hasTokenMeta`, `outAmount` | semver, integrator tier |
| `@lelantos-org/sdk/prover` | `Prover`, `WasmProver`, `SnarkjsProver`, `WorkerProver`, `browserWorkerProver`; artifact resolution and caching; `configureProverThreads` | semver, integrator tier |
| `@lelantos-org/sdk/protocol` | fees (`depositTotals`, `withdrawNet`, `withdrawNetFor`, `grossForNet`, `depositFeeAssetRefusal`), deposit pulls, denominations, units (`RAY`, `toCircuitUnits`, `toTokenUnitsAtRate`), swap sizing, circuit shapes, relayer wire types, bundle builders, Permit2 signing | semver, integrator tier |
| `@lelantos-org/sdk/primitives` | hex, bytes, field, randomness; Poseidon and Jubjub; keys and addresses; note encryption; FMD | semver, integrator tier |
| `@lelantos-org/sdk/services` | `RelayerClient`, `DepositStream`, `FmdClient`, `fetchSwapQuote`, the shared HTTP client | semver, integrator tier |
| `@lelantos-org/sdk/workers/prover` | the prover worker's entry module, for `new Worker(new URL(…))` | semver |
| `@lelantos-org/sdk/workers/scanner` | the scanner worker's entry module | semver |
| `@lelantos-org/sdk/internal` | `walletInternals`, circuit internals, the stored-note codec, sync engine pieces, test hooks | **unstable** |

The raw wasm-pack modules are also exported as `@lelantos-org/sdk/wasm/{prover,jubjub,poseidon}` and `…/wasm` for bundler setups that resolve wasm assets themselves.

## Stability tiers

- **semver** — the application surface. Breaking changes follow the pre-1.0 policy in [Versioning](/guide/installation#versioning).
- **semver, integrator tier** — covered too, but shaped by the SDK's internals, so expect wider changes than on the root.
- **unstable** — `@lelantos-org/sdk/internal` can change in any release, including patches. Pin an exact version and the `@lelantos-org/circuits` version when relying on it.

## Where to find things

| You want to | Import from |
|---|---|
| connect, move value, read balances, format amounts, handle errors | `@lelantos-org/sdk` |
| show a balance from a viewing key | `@lelantos-org/sdk/watch` |
| pay an HTTP 402 from the pool | `@lelantos-org/sdk/x402` |
| build a wallet with a custom submitter, selector, note source, or fee override | `@lelantos-org/sdk/advanced` |
| implement a chain adapter, note store, or persistence backend | `@lelantos-org/sdk/advanced` |
| run proving in a worker you construct, or manage the artifact cache | `@lelantos-org/sdk/prover` |
| compute fees, pulls, or denominations without a wallet | `@lelantos-org/sdk/protocol` |
| derive keys, decode addresses, register an FMD subscription | `@lelantos-org/sdk/primitives` |
| talk to the relayer, FMD server, or quoter directly | `@lelantos-org/sdk/services` |
| reach a wallet's note store, prover, or `markSpent` | `@lelantos-org/sdk/internal` |

```ts twoslash
import { connect, formatAmount, isWalletError, type WalletApi } from "@lelantos-org/sdk";
import { connectWatch } from "@lelantos-org/sdk/watch";
import { createWallet, ViemChainAdapter } from "@lelantos-org/sdk/advanced";
import { browserWorkerProver } from "@lelantos-org/sdk/prover";
import { depositTotals, RAY } from "@lelantos-org/sdk/protocol";
import { cryptoContext, decodeAddress } from "@lelantos-org/sdk/primitives";
import { DepositStream, FmdClient } from "@lelantos-org/sdk/services";
import { x402 } from "@lelantos-org/sdk/x402";
```

## Bundle size

The root entry is lazy: importing `connect` does not bundle the spend path, the prover, or the deposit family until they are first used. `@lelantos-org/sdk/watch` never reaches the prover or the relayer submitter. Each entry has a size budget checked in the SDK's CI, so importing from the root is not a bundle-size penalty.

## x402 payments

`x402(wallet, options)` wraps `fetch` so that an HTTP `402 Payment Required` is paid from the shielded pool and the request retried once. A budget is required.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
import { isWalletError } from "@lelantos-org/sdk";
import { x402 } from "@lelantos-org/sdk/x402";

await wallet.sync();
const pay = x402(wallet, {
    budget: { total: "5", perRequest: "0.5" }, // human units, per asset
    allowHosts: ["api.example.com"],
});

try {
    const data = await pay("https://api.example.com/premium").then((r) => r.json());
} catch (err) {
    if (isWalletError(err, "X402_PAYMENT")) console.warn("not paid:", err.reason);
    else throw err;
}
```

To send the wrapped requests through your own `fetch` (a proxy, instrumentation), pass `http: { fetch }`, as with `connect`.

Payments are shielded transfers by default. `allowUnshielded: true` also pays servers that accept only standard EVM `exact`, by unshielding into a throwaway address; it is off by default.

## Next

- [Pluggable interfaces](/guide/interfaces)
- [Migrating from 0.38](/guide/migration-0.38-to-0.39#subpaths)
