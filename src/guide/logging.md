# Logging and diagnostics

The SDK logs nothing by default. Not at `error`, not anywhere — a library that writes to a host application's console uninvited is a nuisance, so both a level **and** a sink have to be installed before a single record is emitted.

That makes turning logging on the first step in diagnosing almost anything: a sync that finds no notes, a proof that takes longer than expected, a relayer call that retries invisibly.

## Turning it on

```ts twoslash
import { configureLogging, consoleSink } from "@lelantos-org/sdk";

configureLogging({ level: "debug", sink: consoleSink() });
```

Call it once, before `connect()`. It is global — every logger in the process picks it up immediately.

| Field | Meaning |
|---|---|
| `level` | maximum level to emit; defaults to `"silent"` |
| `sink` | where records go. **Without one, nothing is emitted at any level** |
| `namespaces` | glob or list of namespaces to include; defaults to everything |

Levels, in order: `silent`, `error`, `warn`, `info`, `debug`, `trace`.

## Narrowing to what you care about

At `debug` across every namespace, a single sync is thousands of lines. Namespaces are colon-delimited and accept globs, so scope the output to the subsystem you are actually investigating.

```ts twoslash
import { configureLogging, consoleSink } from "@lelantos-org/sdk";

configureLogging({
    level: "debug",
    sink: consoleSink(),
    namespaces: ["lelantos:prover:*", "lelantos:http"],
});
```

The namespaces the SDK emits under:

| Namespace | What it reports |
|---|---|
| `lelantos:http` | every request, its status, and each retry |
| `lelantos:wallet:sync` | the sync as a whole — pages, hits, checkpoints |
| `lelantos:wallet:chunks` | the tree and nullifier chunk feeds |
| `lelantos:sync:scan` / `lelantos:sync:pool` | trial decryption, and the worker pool driving it |
| `lelantos:wallet:selection` | which notes the selector picked, and what it withheld |
| `lelantos:wallet:spend` / `:deposit` / `:notes` | the spend and deposit paths |
| `lelantos:prover:wasm` | witness-generation and Groth16 timings |
| `lelantos:prover:artifacts` / `:cache` | artifact resolution and Cache API hits |
| `lelantos:prover:worker` / `lelantos:worker:rpc` | the worker prover and its RPC channel |
| `lelantos:relayer:deposits` | the deposit SSE feed |
| `lelantos:storage` | note store reads and writes |
| `lelantos:crypto:poseidon` / `lelantos:wasm:rayon` | backend selection and thread-pool setup |

## Routing records somewhere else

A sink is a plain function taking a `LogRecord`, so shipping records to a structured logger takes no adapter.

```ts twoslash
// ---cut-start---
declare const pino: { error: (o: unknown) => void; warn: (o: unknown) => void; info: (o: unknown) => void; debug: (o: unknown) => void; trace: (o: unknown) => void };
// ---cut-end---
import { configureLogging, type LogSink } from "@lelantos-org/sdk";

const sink: LogSink = (r) => {
    pino[r.level]({ ns: r.ns, msg: r.msg, t: r.t, ...r.fields });
};

configureLogging({ level: "info", sink });
```

`consoleSink()` prefixes each line with `+Nms` since the previous record, which is usually what you want when reading timings. Pass `{ timestamps: false }` to drop it, or `{ console }` to redirect the output.

## Driving it from the environment

`loggingFromEnv()` reads `LELANTOS_LOG` (namespaces) and `LELANTOS_LOG_LEVEL` (level, defaulting to `debug` when only `LELANTOS_LOG` is set). It returns `null` when neither is set, and reads nothing at import time.

::: warning It does not apply itself
`loggingFromEnv()` only *computes* a configuration. Nothing in the SDK installs it for you, and it carries no sink — so wire both explicitly, or the variables have no effect.
:::

```ts twoslash
import { configureLogging, consoleSink } from "@lelantos-org/sdk";
import { loggingFromEnv } from "@lelantos-org/sdk/log";

const fromEnv = loggingFromEnv();
if (fromEnv) configureLogging({ ...fromEnv, sink: consoleSink() });
```

```bash
LELANTOS_LOG='lelantos:sync:*' LELANTOS_LOG_LEVEL=trace node ./my-script.mjs
```

## Logging inside a Web Worker

A worker is a separate module realm, so `configureLogging` on the main thread does not reach it. The prover and scanner workers are configured over their RPC channel from the level and namespace filter active when they are constructed — which is why `configureLogging` belongs **before** `connect()`, not after.

Records that cross back from a worker are pushed into the active sink as-is, without re-checking the filters, since the originating realm already applied them.

## Other environment variables

| Variable | Effect |
|---|---|
| `LELANTOS_LOG` | namespace filter (see above) |
| `LELANTOS_LOG_LEVEL` | log level (see above) |
| `LELANTOS_PROVER_THREADS` | rayon worker count for the WASM prover |
| `LELANTOS_PROVER_ARTIFACTS_DIR` | directory holding `<shape>.wasm` and `<shape>_final.zkey` |

Each has a programmatic equivalent — `configureProverThreads(n)`, and `proverArtifacts` on `connect()` — which takes precedence and is the better choice in a browser, where there is no environment to read.

## Next

- [Errors](/guide/errors) — the typed failures, once you know where they come from
- [Browser usage](/guide/browser) — reading the prover timings
