# Browser usage

The SDK runs in browsers with the same API as on Node. Browser applications need a few additional steps:

1. Allow WebAssembly in the Content Security Policy, and serve the page cross-origin isolated.
2. Keep the bundler from rewriting the SDK's wasm glue.
3. Provide the prover artifact URLs.
4. Run proving and trial decryption in Web Workers.

## Content Security Policy and isolation

The WASM prover requires `'wasm-unsafe-eval'` in `script-src`. Neither `eval` nor `new Function` is used:

```
script-src 'self' 'wasm-unsafe-eval';
```

Multi-threaded proving and the scanner pool use `SharedArrayBuffer`, which browsers gate behind cross-origin isolation. Set these headers on the document:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without cross-origin isolation, the SDK proves with snarkjs instead of single-threaded WASM, which is faster in that case, and logs a warning on `lelantos:wallet:prover`.

## Bundler configuration

Bundlers that pre-bundle the SDK rewrite the wasm-pack glue's `new URL("<crate>_bg.wasm", import.meta.url)` into a path that does not exist at runtime. The SDK catches that and falls back to slower JS, so the symptom is not an error but a wallet roughly ten times slower at sync. In Vite:

```ts twoslash
// ---cut-start---
declare function defineConfig(config: {
    optimizeDeps?: { exclude?: string[] };
    worker?: { format?: "es" | "iife" };
}): unknown;
// ---cut-end---
export default defineConfig({
    optimizeDeps: { exclude: ["@lelantos-org/sdk"] },
    worker: { format: "es" },
});
```

Every such degradation is logged, and SDK logging is off until you install a sink, so enable it at least in development — see [Logging](/guide/logging). If excluding the package is not an option, pass pre-resolved module URLs as `wasm` to `connect()`.

## Prover artifacts

On Node, the prover loads artifacts from `@lelantos-org/circuits`. In a browser there is no default: host the circuit and proving key and pass their URLs.

```ts twoslash
// ---cut-start---
import type { Eip1193ProviderLike } from "@lelantos-org/sdk";
declare const provider: Eip1193ProviderLike;
declare const address: `0x${string}`;
declare const rpcUrl: string;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

const wallet = await connect({
    network: "base",
    rpcUrl,
    provider,
    address,
    prover: {
        artifacts: {
            circuit: "https://cdn.example.com/4x6.wasm",
            zkey: "https://cdn.example.com/4x6_final.zkey",
        },
    },
});
```

Alternatively, set `prover: { cdn }` to a base URL that serves `<shape>.wasm` and `<shape>_final.zkey`; the SDK derives both file names from the circuit shape.

Nothing is downloaded at `connect()`. With the default `warmup: "lazy"`, artifacts are fetched at the first proof; call `wallet.warmProver()` when the user opens a send form, or set `warmup: "eager"` to start in the background right after connecting. A missing artifact configuration surfaces then, as `PROVER_ARTIFACTS_MISSING`.

### Circuit shape

The SDK ships one circuit, `TRANSACT_4X6`: four inputs and six outputs, with a ~48 MB zkey and a ~4 MB witness circuit. Six outputs fit the payment, change, a relayer fee in a second asset, and that asset's change in one transaction.

::: warning The pool's verifier must match the circuit
A pool deployed with a verifier for a different shape cannot be used. The SDK cannot detect the verifier at `connect()`; the mismatch appears as a rejected proof at submission.
:::

## Keeping the main thread free

Proving and trial decryption are CPU-bound and block the thread they run on. Run both in Web Workers by passing worker factories to `connect()`. The SDK publishes the worker entry points as `@lelantos-org/sdk/workers/prover` and `@lelantos-org/sdk/workers/scanner`.

```ts twoslash
// ---cut-start---
import type { Eip1193ProviderLike } from "@lelantos-org/sdk";
declare const provider: Eip1193ProviderLike;
declare const address: `0x${string}`;
declare const rpcUrl: string;
declare const circuit: string;
declare const zkey: string;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

const wallet = await connect({
    network: "base",
    rpcUrl,
    provider,
    address,
    prover: {
        artifacts: { circuit, zkey },
        // The `new Worker(new URL(...))` expression must sit at your own call site
        // so the bundler emits a worker chunk for it.
        worker: () =>
            new Worker(new URL("@lelantos-org/sdk/workers/prover", import.meta.url), {
                type: "module",
            }),
    },
    scanner: {
        workers: () =>
            new Worker(new URL("@lelantos-org/sdk/workers/scanner", import.meta.url), {
                type: "module",
            }),
        size: 4, // default 2–8, by hardware concurrency
    },
});

// Each worker owns a WASM heap. Release them when tearing the wallet down.
await wallet.dispose();
```

A DOM `Worker` satisfies the SDK's `WorkerLike` type directly; no cast or adapter is needed.

::: warning Write `new Worker(new URL(..., import.meta.url))` at the call site
Both options take a factory function, not a worker or a URL. Bundlers emit a worker chunk only when this exact expression appears in your source. Passing the URL through a helper function hides it from the bundler; Vite then inlines the worker as a `data:` URL and its imports fail at runtime.

The factory also lets the scanner pool restart a crashed worker. Bundler-specific forms work too, for example `import ProverWorker from "…?worker"` with `() => new ProverWorker()`.
:::

A proof blocks its calling thread even with multi-threading enabled, so a worker prover is required to keep the UI responsive.

### Pre-built workers

For settings the `ProverConfig` shorthand does not expose, build the worker prover yourself with `browserWorkerProver` from `@lelantos-org/sdk/prover` and pass it as `prover`. The same applies to `browserWorkerScanner` from `@lelantos-org/sdk/advanced`.

A `Prover` or `Scanner` instance you pass is yours: `wallet.dispose()`, and a `connect` that fails, leave it running. That lets one prover serve every wallet in a tab; release it yourself when you are done with it. Workers the SDK builds from `prover: { worker }` or `scanner: { workers }` are the wallet's and go with `dispose()`.

```ts twoslash
// ---cut-start---
import type { Eip1193ProviderLike } from "@lelantos-org/sdk";
declare const provider: Eip1193ProviderLike;
declare const address: `0x${string}`;
declare const rpcUrl: string;
declare const circuit: string;
declare const zkey: string;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";
import { browserWorkerScanner } from "@lelantos-org/sdk/advanced";
import { browserWorkerProver } from "@lelantos-org/sdk/prover";

const prover = browserWorkerProver({
    worker: () =>
        new Worker(new URL("@lelantos-org/sdk/workers/prover", import.meta.url), {
            type: "module",
        }),
    artifacts: { circuit, zkey },
    threads: 4,
    cacheArtifacts: false, // skip the worker's Cache API copy
});
const scanner = browserWorkerScanner({
    worker: () =>
        new Worker(new URL("@lelantos-org/sdk/workers/scanner", import.meta.url), {
            type: "module",
        }),
    size: 4,
});

const wallet = await connect({ network: "base", rpcUrl, provider, address, prover, scanner });

// Teardown: the wallet does not own the instances it was given.
await wallet.dispose();
await scanner.dispose();
prover.dispose();
```

## Threads and timing

Proving has two phases, both logged at `debug` on `lelantos:prover:wasm`:

| Phase | Threads |
|---|---|
| witness generation | single-threaded |
| Groth16 proof | parallelized; accounts for the difference between thread counts |

Set the thread count with `prover: { threads }`, `configureProverThreads(n)` from `@lelantos-org/sdk/prover`, or `threads` on `browserWorkerProver`. See [Benchmarks](/guide/benchmarks) for measured timings.

## Artifact caching

Downloaded artifacts are stored in the **Cache API** automatically when the browser supports it. The Cache API is shared across the origin, so the cache serves both page reloads and the prover worker.

::: danger The URL is the cache key
Cached artifacts are not revalidated. Publish new proving keys under a new URL.
:::

```ts twoslash
// ---cut-start---
import type { ArtifactCache } from "@lelantos-org/sdk/prover";
declare const myCache: ArtifactCache;
// ---cut-end---
import { requestPersistentStorage } from "@lelantos-org/sdk/advanced";
import { clearArtifactCache, configureArtifactCache } from "@lelantos-org/sdk/prover";

// Recommended once at startup: WebKit evicts Cache API storage after ~7 days
// without a visit, which silently restores the cold start. This covers every
// store the origin owns, so a persisted note or tree store benefits too.
await requestPersistentStorage();

await clearArtifactCache(); // reclaim ~90 MB, or force a re-download
configureArtifactCache(false); // opt out entirely
configureArtifactCache(myCache); // or store them in IndexedDB / OPFS / disk
```

A custom cache implements `ArtifactCache`: `get(url)` and `put(url, bytes)`. Neither method may throw; on a storage failure the SDK fetches from the network.

::: warning Configure caching inside the worker
`configureArtifactCache` on the main thread does not affect a worker prover, which runs in a separate module context. Pass `cacheArtifacts: false` to `browserWorkerProver` to disable caching in the worker. A custom `ArtifactCache` cannot be passed to the worker; install it in the worker's own code.
:::

## Persisting state across page loads

Without persistence, a browser wallet downloads the note feed, the Merkle tree, and the nullifier set on every page load. Configure all three under `storage`:

| Option | Persists | Guide |
|---|---|---|
| `storage.notes` | notes and the sync cursor | [Custom storage](/guide/storage) |
| `storage.tree` | Merkle tree | [Syncing](/guide/sync#persisting-the-tree-and-spent-set) |
| `storage.nullifiers` | spent-nullifier set | [Syncing](/guide/sync#persisting-the-tree-and-spent-set) |

## Switching accounts and networks

Call `wallet.dispose()` before replacing a wallet — on disconnect, account switch, or network switch. Workers are live threads and are not released when the wallet goes out of scope. `dispose()` releases only workers the SDK built; a `Prover` or `Scanner` instance you passed stays running until you dispose it (see [Pre-built workers](#pre-built-workers)). For UI bindings, see [Balances and state](/guide/state#react).

## Next

- [Node usage](/guide/node)
- [Benchmarks](/guide/benchmarks)
- [Custom storage](/guide/storage)
