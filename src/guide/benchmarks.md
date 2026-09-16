# Benchmarks

Proof generation is the most expensive client-side operation. These measurements use the `bench` harness, which runs the same `WorkerProver` and prover worker entry point (`@lelantos-org/sdk/workers/prover`) as a wallet.

| Parameter | Value |
|---|---|
| Date | 2026-09-12 |
| SDK | 0.36.0 |
| Circuit | `TRANSACT_4X6`, Merkle depth 11, ~48 MB zkey |
| Network | HTTPS over LAN |
| Method | one warm-up run, then median of 5 timed runs from `lelantos:prover:wasm` logs |

## WASM prover (browser)

| Device | Threads | Total | Witness | Groth16 | Prepare |
|---|---|---|---|---|---|
| macOS&nbsp;·&nbsp;Chrome&nbsp;150 | 16 | **599&nbsp;ms** | 213&nbsp;ms | 385&nbsp;ms | 248&nbsp;ms · warm |
| iPhone&nbsp;·&nbsp;Safari&nbsp;18.5 | 4 | 2591&nbsp;ms | 227&nbsp;ms | 2363&nbsp;ms | 6433&nbsp;ms · cold |
| macOS&nbsp;·&nbsp;Chrome&nbsp;150 | 1 | 3812&nbsp;ms | 203&nbsp;ms | 3609&nbsp;ms | 164&nbsp;ms · warm |

- **Threads** is the size of the thread pool actually created.
- **Prepare** is artifact download and parsing, measured outside the proof timing. *Warm* means the zkey was already in the Cache API; *cold* means it was downloaded.
- The Mac has 16 cores and 32 GB of memory; the iPhone has 4 cores.

Observations:

- Witness generation is single-threaded and takes 203–227 ms on all devices.
- Groth16 is 64% of total time at 16 threads, 91% at 4 threads, and 95% at 1 thread. Going from 1 to 16 threads speeds up Groth16 by 5.1× and the total by 6.4×.
- The single-threaded row reflects a page without cross-origin isolation. In that configuration the SDK uses snarkjs instead.
- On the iPhone, cold artifact preparation (6.4 s) exceeds proving time. It occurs once per session; `wallet.warmProver()` (or `prover: { warmup: "eager" }`) and the Cache API move it out of the first transaction. Over the public internet, download time depends on bandwidth.

::: info Circuit versions
The 16-thread row uses circuits 0.14.0. The iPhone and single-thread rows use circuits 0.12.1, which was slower: 0.14.0 reduced Groth16 on the Mac from 703 ms to 385 ms. Treat those two rows as upper bounds.
:::

## Native prover (relayer)

The relayer proves natively on a larger circuit. Only the cost breakdown has been measured:

- Multi-scalar multiplications: **86%** of proving time. The six 2^17 FFTs: **14%**.
- `taceo-groth16` is ~**1.7×** faster than `ark-groth16`, both at 113k constraints on 16 threads and on the 4x6 zkey.

These figures are not comparable with the WASM table: the circuit and arithmetic backend differ.

## Measuring in your application

Enable `debug` logging for the prover namespaces to record the same phases:

```ts twoslash
import { configureLogging, consoleSink } from "@lelantos-org/sdk";

configureLogging({
    level: "debug",
    sink: consoleSink(),
    namespaces: ["lelantos:prover:*"],
});
```

The `effective` field on `lelantos:prover:wasm` records the thread count. If timings are far above the table, check it first: a failed thread-pool initialization is the usual cause.

## Next

- [Browser usage](/guide/browser)
- [Logging](/guide/logging)
