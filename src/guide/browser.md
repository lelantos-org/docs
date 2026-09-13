# Browser usage

Everything the SDK does in Node it also does in a browser, with three differences that need setting up explicitly: the Content Security Policy has to permit WASM, prover artifacts have no default source, and the two CPU-bound jobs — proving and trial decryption — belong off the main thread.

## Content Security Policy

The WASM prover needs `'wasm-unsafe-eval'` in your `script-src`. Without it the module will not instantiate.

```
script-src 'self' 'wasm-unsafe-eval';
```

Multi-threaded proving additionally needs cross-origin isolation, which is a pair of response headers on the document:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Prover artifacts have no browser default

On Node, `connect()` resolves artifacts from the companion `@lelantos-org/circuits` package. **There is no browser equivalent** — the companion is on GitHub Packages, which is not CDN-proxiable — so a browser caller must say where the circuit and proving key live.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
declare const signer: never;
declare const rpcUrl: string;
// ---cut-end---
const wallet = await connect({
    signer,
    network: "mainnet",
    rpcUrl,
    proverArtifacts: {
        circuit: "https://cdn.example.com/4x6.wasm",
        zkey: "https://cdn.example.com/4x6_final.zkey",
    },
});
```

Or point `proverArtifactsCdn` at a base URL serving `<shape>.wasm` and `<shape>_final.zkey` at its root, and the SDK derives both names from the configured shape.

## Keeping the main thread free

Two jobs are CPU-bound and will block the UI if left where they are: generating a proof, and trial-decrypting the note feed. Move both into workers.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
declare const wasmUrl: string;
declare const zkeyUrl: string;
declare const signer: never;
declare const rpcUrl: string;
// ---cut-end---
import { browserWorkerProver } from "@lelantos-org/sdk/prover";
import { browserWorkerScanner } from "@lelantos-org/sdk/sync";

const wallet = await connect({
    signer,
    network: "mainnet",
    rpcUrl,
    prover: browserWorkerProver({
        // The `new Worker(...)` expression must sit at your own ESM call site
        // so the bundler can see it.
        worker: () =>
            new Worker(new URL("@lelantos-org/sdk/prover-worker", import.meta.url), {
                type: "module",
            }),
        paths: { circuit: wasmUrl, zkey: zkeyUrl },
    }),
    scanner: browserWorkerScanner({
        worker: () =>
            new Worker(new URL("@lelantos-org/sdk/scanner-worker", import.meta.url), {
                type: "module",
            }),
        size: 4, // defaults to navigator.hardwareConcurrency, clamped 2–8
    }),
});

// Each worker owns a WASM heap. Release them when tearing the wallet down.
await wallet.dispose();
```

::: warning Spawn the worker in your own module, with `new URL(..., import.meta.url)`
Both options take a **factory** — `() => new Worker(...)` — rather than a URL, and the `new Worker(new URL(...), ...)` expression must be written literally at your call site. Bundlers emit a worker chunk only for that exact form; a URL threaded through a helper is invisible to them, and Vite will inline the worker entry as a `data:` URL whose relative imports then fail at runtime. The factory is also what lets `WorkerPoolScanner` respawn a dead worker, and it accommodates the other spellings a bundler may require — `import W from "…?worker"`, then `() => new W()`.
:::

::: tip Passing a custom `prover` skips artifact resolution
`proverArtifacts` and `proverArtifactsCdn` configure the *default* prover. When you supply a `prover`, its own `paths` are the only thing consulted.
:::

## Prover performance

- The **WASM prover is the default**. It parses the zkey once per session and reuses it across proofs; snarkjs is the automatic fallback when the WASM module cannot load.
- **Without cross-origin isolation** the SDK routes to snarkjs, which benches faster than single-threaded WASM.
- `prove()` **blocks its calling thread** even with rayon workers — which is why the worker prover above is not merely an optimisation.

`connect()` starts the zkey fetch and parse in the background by default (`proverWarmup: "eager"`), so the first transaction skips the multi-second setup. Pass `proverWarmup: "lazy"` to defer it to the first `prove()` instead.

## Where the time goes

`prove()` splits into witness generation and the Groth16 proof. Both are logged at `debug` on `lelantos:prover:wasm`.

Cost scales with circuit arity. Measured figures for the one shipped shape are in [Benchmarks](/guide/benchmarks); they move with the host, the thread count and the circuits release, so treat them as the scale of the thing and measure your own targets from the `debug` log.

::: warning One shape, and it must match the deployed verifier
`TRANSACT_4X6` — four inputs, six outputs, 69 public-input coefficients, a ~48 MB zkey and a ~4 MB witness circuit. The six outputs are what let one spend carry its change, a shielded fee in a second asset, and that asset's change without a second round.

Narrower shapes are not built: each would cost a trusted-setup ceremony per release and 20-40 MB in every install, and none covers anything this one does not. **A pool on a narrower verifier cannot be served** — there are no keys to load, and a 4x6 proof carries six commitments, which such a verifier rejects.

The mismatch surfaces as a **rejected proof at submit time, not at connect**: the SDK cannot see which verifier a pool deployed.
:::

Witness generation is single-threaded and unaffected by thread count; Groth16 is the part rayon parallelises, and it carries the whole difference between one thread and sixteen — see [Benchmarks](/guide/benchmarks) for the measured split. Set the pool with `configureProverThreads(n)`, `LELANTOS_PROVER_THREADS`, or `threads` on `WorkerProver`.

## Artifact caching

The 4x6 zkey is ~48 MB. Downloaded artifacts persist to the **Cache API** automatically in any browser that has it — nothing to configure. Because the Cache API is origin-scoped rather than per-realm, this covers both a page reload and the prover worker.

::: danger The URL is the cache key
Serve new proving keys under a **new path**. There is no revalidation request — a round-trip on every load would defeat the point.
:::

```ts twoslash
// ---cut-start---
import type { ArtifactCache } from "@lelantos-org/sdk/prover";
declare const myCache: ArtifactCache;
// ---cut-end---
import { requestPersistentStorage } from "@lelantos-org/sdk/core";
import { clearArtifactCache, configureArtifactCache } from "@lelantos-org/sdk/prover";

// Recommended once at startup: WebKit evicts Cache API storage after ~7 days
// without a visit, which silently restores the cold start. This covers every
// store the origin owns, so a persisted note or tree store benefits too.
await requestPersistentStorage();

await clearArtifactCache(); // reclaim ~90 MB, or force a re-download
configureArtifactCache(false); // opt out entirely
configureArtifactCache(myCache); // or store them in IndexedDB / OPFS / disk
```

A custom cache implements `ArtifactCache` — `get(url)` and `put(url, bytes)`, **neither of which may throw**. A storage failure always degrades to a network fetch, never to a failed proof.

::: warning A Web Worker is a separate module realm
`configureArtifactCache` on the main thread does not reach a `WorkerProver`. The plain opt-out travels over the RPC alongside `threads`; a live `ArtifactCache` object cannot, so install a custom one inside the worker.

<!-- typecheck: skip -->
```ts
browserWorkerProver({ worker, paths, cacheArtifacts: false });
```
:::

## Persisting state across page loads

A browser wallet that keeps nothing re-downloads the note feed, the Merkle tree, and the spent-nullifier set on every load. Three options fix that, and all three are worth setting together:

| Option | Persists |
|---|---|
| `noteStore` | decrypted notes and the resume cursor |
| `treePersistence` | the Merkle tree |
| `nullifierPersistence` | the spent-nullifier set |

See [Custom storage](/guide/storage) and [Syncing](/guide/sync#persisting-the-tree-and-spent-set) for implementations.

## Next

- [Custom storage](/guide/storage) — surviving a page reload
- [Logging](/guide/logging) — reading the prover timings
- [Errors](/guide/errors)
