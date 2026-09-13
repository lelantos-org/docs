# Benchmarks

Proof generation is the one operation in the SDK whose cost a user feels directly, so it is the one worth quoting numbers for. Everything below was measured with the `bench` harness, which drives the same `WorkerProver` over `@lelantos-org/sdk/prover-worker` that a wallet uses — there is no bench-local reimplementation of the prover.

Recorded 2026-09-12 against SDK 0.36.0, over HTTPS on a LAN. Each row is one run: an uncounted warm-up plus 5 timed iterations, reported as the median of the per-iteration `lelantos:prover:wasm` records. The circuit is `TRANSACT_4X6` at Merkle depth 11 — the one shipped shape, with a ~48 MB zkey.

## WASM

| Device | Threads | Total | Witness | Groth16 | Prepare |
|---|---|---|---|---|---|
| macOS&nbsp;·&nbsp;Chrome&nbsp;150 | 16 | **599&nbsp;ms** | 213&nbsp;ms | 385&nbsp;ms | 248&nbsp;ms · warm |
| iPhone&nbsp;·&nbsp;Safari&nbsp;18.5 | 4 | 2591&nbsp;ms | 227&nbsp;ms | 2363&nbsp;ms | 6433&nbsp;ms · cold |
| macOS&nbsp;·&nbsp;Chrome&nbsp;150 | 1 | 3812&nbsp;ms | 203&nbsp;ms | 3609&nbsp;ms | 164&nbsp;ms · warm |

The Mac reports 16 cores and 32 GB, the phone 4 cores. *Threads* is what the rayon pool actually came up with, which is why one row reads 1. *Prepare* is artifact fetch and parse, outside the timed window, tagged with whether the Cache API already held the zkey.

Reading it:

- **Groth16 is the whole story as cores run out.** It is 64% of the prove at 16 threads, 91% on the 4-thread phone, and 95% of the single-threaded run. Witness generation is single-threaded and barely moves — 203-227 ms across all three.
- **Threads buy the parallel half, and only that half.** One thread to sixteen is 5.1x on Groth16 and 6.4x on the prove.
- **The single-threaded row is not a configuration to ship.** It is what the WASM prover does when `initThreadPool` is rejected, which is the case on a page that is not cross-origin isolated — and at 3812 ms it is why the SDK routes to snarkjs there instead.
- **Prepare is the phone's real cost.** Fetching and parsing the zkey cold took 6.4 s there against a few hundred milliseconds warm on the Mac. That is the window `proverWarmup: "eager"` and the Cache API exist to hide, and it is paid once per session rather than per proof.

The prepare column is a cold LAN fetch from the bench host; over the public internet it is bounded by bandwidth rather than by parsing.

::: info Two caveats on the rows above
The phone and single-thread rows were taken against circuits 0.12.1 rather than the 0.14.0 the top row uses, which cut Groth16 on the Mac from 703 ms to 385 ms. No 0.14.0 run exists on either, so read both as an upper bound rather than a current figure.

SDK 0.35.0 is what the harness pins. 0.36.0 only widened which types the barrels re-export, leaving the prover byte-identical, so the numbers are quoted against it unchanged.
:::

## Native

The rows above are the WASM prover in a browser, which is the only prover the SDK ships. The relayer proves natively, on its own larger circuit, and no wall-clock for it is published — what has been measured there is the shape of the cost rather than its duration:

- The MSMs are **86%** of proving time and the six size-2^17 FFTs the other **14%**.
- Swapping `ark-groth16` for `taceo-groth16` is worth **~1.7x** at 113k constraints on 16 threads, and the same ~1.7x holds natively on this 4x6 zkey, where neither WASM's memory penalty nor a 4-thread ceiling applies.

Native figures are not comparable row-for-row with the table above: different circuit, and a different arithmetic backend — the deployed prover builds with the ADX/BMI2 Montgomery path, which is a no-op on an ARM host.

## Measuring your own

Both phases are logged at `debug` on `lelantos:prover:wasm`, so a wallet can report the same split without the harness:

```ts twoslash
import { configureLogging, consoleSink } from "@lelantos-org/sdk";

configureLogging({
    level: "debug",
    sink: consoleSink(),
    namespaces: ["lelantos:prover:*"],
});
```

Thread count lands on `lelantos:prover:wasm` too, as the `effective` field — worth checking first when a number comes in far above these, since a rejected `initThreadPool` is the usual cause.

## Next

- [Browser usage](/guide/browser) — cross-origin isolation, artifact hosting and caching.
- [Logging](/guide/logging) — namespaces, levels and sinks.
