# Logging

The SDK emits no log output by default. Logging requires both a level and a sink.

## Enabling logging

```ts twoslash
import { configureLogging, consoleSink } from "@lelantos-org/sdk";

configureLogging({ level: "debug", sink: consoleSink() });
```

Call `configureLogging` once, before `connect()`. The configuration is global and applies to all loggers immediately.

| Field | Description |
|---|---|
| `level` | most verbose level to emit; default `"silent"` |
| `sink` | destination for records; **without a sink nothing is emitted** |
| `namespaces` | glob or list of namespaces to include; default all |

Levels, from least to most verbose: `silent`, `error`, `warn`, `info`, `debug`, `trace`.

## Filtering by namespace

A full sync at `debug` produces thousands of records. Namespaces are colon-delimited and accept globs:

```ts twoslash
import { configureLogging, consoleSink } from "@lelantos-org/sdk";

configureLogging({
    level: "debug",
    sink: consoleSink(),
    namespaces: ["lelantos:prover:*", "lelantos:http"],
});
```

| Namespace | Records |
|---|---|
| `lelantos:http` | HTTP requests, status codes, retries |
| `lelantos:wallet:sync` | sync progress: pages, matches, checkpoints |
| `lelantos:wallet:connect` / `:prover` | connect steps, prover backend selection and fallbacks |
| `lelantos:callback` / `lelantos:wallet:state` | a throwing `onPhase`, `onProgress`, or `subscribe` listener, logged and swallowed |
| `lelantos:wallet:chunks` | tree and nullifier chunk feeds |
| `lelantos:sync:scan` / `lelantos:sync:pool` | trial decryption and the worker pool |
| `lelantos:wallet:selection` | selected and excluded notes |
| `lelantos:wallet:spend` / `:deposit` / `:notes` | spend, deposit, and note store operations |
| `lelantos:prover:wasm` | witness and Groth16 timings, thread count |
| `lelantos:prover:artifacts` / `:cache` | artifact loading and Cache API hits |
| `lelantos:prover:worker` / `lelantos:worker:rpc` | worker prover and worker RPC |
| `lelantos:relayer:deposits` | deposit event stream |
| `lelantos:storage` | note store reads and writes |
| `lelantos:crypto:poseidon` / `lelantos:wasm:rayon` | hash backend selection and thread pool setup |

## Custom sinks

A sink is a function that receives a `LogRecord`:

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

`consoleSink()` prefixes each line with the time since the previous record (`+Nms`). Options: `{ timestamps: false }` removes the prefix; `{ console }` sets the output target.

## Configuration from environment variables

`loggingFromEnv()` reads `LELANTOS_LOG` (namespaces) and `LELANTOS_LOG_LEVEL` (level; defaults to `debug` when only `LELANTOS_LOG` is set). It returns `null` when neither variable is set.

`loggingFromEnv()` returns a configuration without a sink and does not apply it. Add a sink and pass the result to `configureLogging`:

```ts twoslash
import { configureLogging, consoleSink } from "@lelantos-org/sdk";
import { loggingFromEnv } from "@lelantos-org/sdk/advanced";

const fromEnv = loggingFromEnv();
if (fromEnv) configureLogging({ ...fromEnv, sink: consoleSink() });
```

```bash
LELANTOS_LOG='lelantos:sync:*' LELANTOS_LOG_LEVEL=trace node ./my-script.mjs
```

## Logging in Web Workers

`configureLogging` on the main thread does not apply inside workers. The prover and scanner workers receive the level and namespace filter that is active when they are created, so configure logging **before** `connect()`.

Records from workers are forwarded to the main-thread sink without being filtered again.

## Environment variables

| Variable | Effect | Programmatic equivalent |
|---|---|---|
| `LELANTOS_LOG` | namespace filter | `configureLogging({ namespaces })` |
| `LELANTOS_LOG_LEVEL` | log level | `configureLogging({ level })` |
| `LELANTOS_PROVER_THREADS` | WASM prover thread count | `prover: { threads }` or `configureProverThreads(n)` |
| `LELANTOS_PROVER_ARTIFACTS_DIR` | directory containing `<shape>.wasm` and `<shape>_final.zkey` | `prover: { artifacts }` on `connect()` |

Programmatic settings take precedence over environment variables.

## Next

- [Troubleshooting](/guide/troubleshooting)
- [Errors](/guide/errors)
