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
        // The URL must be built at the ESM call site so the bundler can see it.
        workerUrl: new URL("@lelantos-org/sdk/prover-worker", import.meta.url),
        paths: { circuit: wasmUrl, zkey: zkeyUrl },
    }),
    scanner: browserWorkerScanner({
        workerUrl: new URL("@lelantos-org/sdk/scanner-worker", import.meta.url),
        size: 4, // defaults to navigator.hardwareConcurrency, clamped 2–8
    }),
});

// Each worker owns a WASM heap. Release them when tearing the wallet down.
await wallet.dispose();
```

::: warning Build worker URLs with `new URL(..., import.meta.url)`
Bundlers detect that exact form and emit the worker as its own chunk. A URL assembled from a variable is invisible to them, and the worker will 404 in a production build while working in dev.
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

Cost scales with circuit arity, and the last measured figure is for a shape that no longer ships: on an Apple M3 Max (16 threads, Node, median of three warm runs) the 4x4 shape of SDK 0.26 took ~190 ms for the witness and ~735 ms for the proof, ~925 ms in total. 4x6 is wider, so treat that as a floor rather than an estimate, and measure your own targets from the `debug` log.

::: warning One shape, and it must match the deployed verifier
`TRANSACT_4X6` — four inputs, six outputs, 69 public-input coefficients, a ~48 MB zkey and a ~4 MB witness circuit. The six outputs are what let one spend carry its change, a shielded fee in a second asset, and that asset's change without a second round.

The narrower 2x2, 3x3 and 4x4 shapes were removed in circuits 0.12.0: each cost a trusted-setup ceremony per release and 20-40 MB in every install, and none covered anything this one does not. **A pool still on a narrower verifier cannot be served by this SDK version** — there are no keys to load, and a 4x6 proof carries six commitments, which such a verifier rejects.

The mismatch surfaces as a **rejected proof at submit time, not at connect**: the SDK cannot see which verifier a pool deployed.
:::

Witness generation is single-threaded and unaffected by thread count. Groth16 is the part rayon parallelises — measured at 3x3, on a 16-core Mac:

| Threads | 4 | 8 | 16 |
|---|---|---|---|
| Groth16 | 1288 ms | 774 ms | 665 ms |

Returns fall off sharply past 8 but have not vanished by 16, which is why the pool is not clamped low. Override with `configureProverThreads(n)`, `LELANTOS_PROVER_THREADS`, or `threads` on `WorkerProver`.

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
browserWorkerProver({ workerUrl, paths, cacheArtifacts: false });
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
