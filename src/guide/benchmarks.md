# Benchmarks

Proof generation is the most expensive client-side operation. These measurements use the `bench` harness, which runs the same `WorkerProver` and prover worker entry point (`@lelantos-org/sdk/workers/prover`) as a wallet.

| Parameter | Value |
|---|---|
| Date | 2026-10-07 |
| Circuit | `TRANSACT_4X6`, Merkle depth 11, ~33 MB zkey |
| Network | HTTPS over LAN |
| Method | one warm-up run, then median of 5 timed runs from `lelantos:prover:wasm` logs |

## WASM prover (browser)

| Device | Threads | Total | Witness | Groth16 | Prepare |
|---|---|---|---|---|---|
| macOS&nbsp;·&nbsp;Chrome&nbsp;154 | 16 | **233&nbsp;ms** | 76&nbsp;ms | 156&nbsp;ms | 292&nbsp;ms · cold |
| iPhone&nbsp;·&nbsp;Safari&nbsp;18.5 | 4 | 1021&nbsp;ms | 75&nbsp;ms | 946&nbsp;ms | 3039&nbsp;ms · cold |
| iPhone&nbsp;·&nbsp;Safari&nbsp;18.5 | 4 | 1008&nbsp;ms | 78&nbsp;ms | 931&nbsp;ms | 173&nbsp;ms · warm |

- **Threads** is the size of the thread pool actually created.
- **Prepare** is artifact download and parsing, measured outside the proof timing. *Warm* means the zkey was already in the Cache API; *cold* means it was downloaded.
- The Mac has 16 cores and 32 GB of memory; the iPhone has 4 cores.

Observations:

- Witness generation is single-threaded and takes 75–78 ms on both devices.
- Groth16 is 67% of total time at 16 threads and 93% at 4 threads.
- A page without cross-origin isolation gets no thread pool, and the SDK uses snarkjs instead. That configuration is not measured here.
- On the iPhone, cold artifact preparation (3.0 s) exceeds proving time; with the artifacts in the Cache API it takes 173 ms. It occurs once per session; `wallet.warmProver()` (or `prover: { warmup: "eager" }`) and the Cache API move it out of the first transaction. Over the public internet, download time depends on bandwidth.

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
