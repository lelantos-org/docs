# Errors

Every wallet method rejects with a `WalletError`, or with the `reason` of an `AbortSignal` you passed. Each error has a stable `code`, a `retryable` flag, and typed fields for the facts of that failure. Handle errors by `code`; message text is not part of the API.

`isWalletError(err, code)` is the recommended check. It narrows `err` to the class for that code, so its fields are typed, and it checks structure rather than class identity, so it also works when a bundle contains two copies of the SDK.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: string;
declare function retryLater(): void;
// ---cut-end---
import { isWalletError } from "@lelantos-org/sdk";

try {
    await wallet.transfer({ asset: "USDC", amount: "25", recipient });
} catch (err) {
    if (isWalletError(err, "INSUFFICIENT_COVER")) {
        await wallet.transfer({ asset: "USDC", amount: "25", recipient, autoConsolidate: true });
    } else if (isWalletError(err, "RELAYER_REJECTED")) {
        console.error(err.reason, err.status); // typed: RelayerRejectReason, number
        if (err.retryable) retryLater();
    } else if (isWalletError(err)) {
        switch (err.code) {
            case "RELAYER_TIMEOUT":
            case "RELAYER_FAILED":
                console.error(err.url, err.attempts);
                break;
            default:
                throw err;
        }
    } else {
        throw err; // your own AbortSignal's reason
    }
}
```

`WALLET_ERROR_CODES` lists every code at runtime. `AnyWalletError` is the union of all error classes, discriminated by `code`; `WalletErrorOf<C>` is the class for one code. New codes may be added in minor releases, so keep a `default` branch.

## Common fields

| Field | Meaning |
|---|---|
| `code` | the stable discriminator |
| `retryable` | the same call, unchanged, may succeed later without user action |
| `context` | `{ opId, op, url, method }`: the operation the failure belongs to — `op` names nested steps such as `"transfer:consolidate"` |
| `details` | optional diagnostic scalars; never secrets |
| `cause` | the underlying error, where there is one |

Amounts, asset ids, and addresses are typed fields, never part of the message, which reaches application logs verbatim. A non-SDK failure escaping a wallet method, such as a bug in a custom plugin, is wrapped as `INTERNAL` with the original as `cause`.

## Error codes

### Configuration and arguments

Fix the call or the wiring. None is retryable.

| Code | Class | Fields | Raised when |
|---|---|---|---|
| `WALLET_CONFIG` | `WalletConfigError` | `missing[]` | `connect` options are missing or invalid; every problem is listed at once |
| `NETWORK_NOT_DEPLOYED` | `NetworkNotDeployedError` | `network` | a placeholder preset was passed from JavaScript |
| `ENVIRONMENT` | `EnvironmentError` | | a platform capability is missing: Web Crypto, workers, `EventSource` |
| `INVALID_ARGUMENT` | `InvalidArgumentError` | `argument` | an argument the SDK cannot act on: a bad amount, address, asset, option, or an altered quote |
| `NO_EVM_ACCOUNT` | `NoEvmAccountError` | `operation` | a deposit, cancel, or allowance setup on a wallet without a signing chain layer |
| `UNSUPPORTED_OPERATION` | `UnsupportedOperationError` | `operation`, `missing[]` | the adapter, submitter, or network lacks what the operation needs; also any call on a disposed wallet |

### Funds

| Code | Class | Fields | Retryable |
|---|---|---|---|
| `INSUFFICIENT_BALANCE` | `InsufficientBalanceError` | `asset`, `available`, `required` | no: top up or send less |
| `NOTES_HELD` | `NotesHeldError` | `asset`, `required`, `spendable`, `held.{reserved,cooldown,dust}` (`value`, `count`), `reservedUntil?` | when reserved and cooling-down notes alone cover the shortfall; not when only dust would |
| `INSUFFICIENT_COVER` | `InsufficientCoverError` | `asset`, `target`, `consolidate[]` (`id`, `value`), `consolidateSum`, `consolidationAttempted`, `reason` (`"arity"` \| `"fee-slot"`) | no: consolidate, or pass `autoConsolidate: true` |
| `FEE_ASSET_NOT_QUOTED` | `FeeAssetNotQuotedError` | `asset`, `kind`, `accepted[]` | no: pick an accepted asset |

### Submission

| Code | Class | Fields | Retryable |
|---|---|---|---|
| `DEADLINE_PASSED` | `DeadlinePassedError` | `deadline` | no; nothing was sent |
| `QUOTE_STALE` | `QuoteStaleError` | `fields[]` | yes: re-quote and run the new quote — see [Swap](/guide/swap#executing) |
| `USER_REJECTED` | `UserRejectedError` | `action` (`"derive-key"` \| `"sign-permit"` \| `"send-tx"`) | no; nothing was signed or sent |
| `RELAYER_REJECTED` | `RelayerRejectedError` | `status`, `reason`, `body`, `reservedNoteIds`, `reservedUntil?` | per `reason` — see [Relayer rejections](#relayer-rejections) |
| `SPEND_OUTCOME_UNKNOWN` | `SpendOutcomeUnknownError` | `reservedNoteIds`, `reservedUntil`, `txHash?` | no — see [below](#spend-outcome-unknown) |

### Transport

| Code | Class | Fields | Retryable |
|---|---|---|---|
| `RELAYER_TIMEOUT`, `FMD_TIMEOUT`, `QUOTER_TIMEOUT` | `NetworkError` | `url`, `status?`, `body?`, `attempts[]` | yes |
| `RELAYER_FAILED`, `FMD_FAILED`, `QUOTER_FAILED` | `NetworkError` | `url`, `status?`, `body?`, `attempts[]` | no response, 408, 429, and 5xx |
| `WIRE_FORMAT` | `WireFormatError` | `path` | no: a server response broke the documented contract |

`status` and `body` describe the final attempt only; `attempts` holds every attempt, oldest first. An attempt without `status` got no response.

### Chain

| Code | Class | Fields | Retryable |
|---|---|---|---|
| `RPC_FAILED` | `ChainRpcError` | `method` | yes, unless the contract reverted the call |
| `TX_REVERTED` | `TxRevertedError` | `txHash`, `reason?` | no |
| `TX_MINING` | `TxMiningError` | `txHash?` | yes: the receipt did not arrive in time |
| `TREE_OUT_OF_SYNC` | `TreeOutOfSyncError` | `localRoot`, `mirrorRoot` | yes: the commitment feed disagrees with the pool even after a rebuild; nothing was spent |

### Prover and workers

| Code | Class | Fields | Retryable |
|---|---|---|---|
| `PROVER_FAILED` | `ProverError` | | no |
| `PROVER_UNAVAILABLE` | `ProverUnavailableError` | | no: `prover: "none"`, or the optional peer the backend needs is not installed |
| `PROVER_ARTIFACTS_MISSING` | `ProverArtifactsMissingError` | `tried[]`, `shape` | no — see [Browser usage](/guide/browser#prover-artifacts) |
| `PROVER_ARTIFACTS_FAILED` | `ProverArtifactsFailedError` | `source` | per HTTP status: not for 4xx |
| `WORKER_TIMEOUT` | `WorkerRpcError` | `method?` | yes |
| `WORKER_CRASHED`, `WORKER_FAILED` | `WorkerRpcError` | `method?` | no |

### Other

| Code | Class | Fields | Retryable |
|---|---|---|---|
| `X402_PAYMENT` | `X402PaymentError` | `reason`, `resource?` | no |
| `INTERNAL` | `InternalError` | `cause` | no: an SDK bug or a plugin's untyped throw; report it |

## Relayer rejections

`RELAYER_REJECTED` is a definite refusal. `reason` is parsed from the relayer's response; `body` is its text, kept off the message because it can echo the payload.

| `reason` | Retryable | Meaning |
|---|---|---|
| `nullifier-spent` | no | a note this spend consumes is already spent; the wallet resyncs its spent set before throwing |
| `nullifier-in-flight` | yes | another submission of the same note is pending at the relayer |
| `idempotency-key-reused` | yes | the request key collided; a retry draws a fresh one |
| `stale-estimate` | yes | the fee estimate moved; a retry re-quotes |
| `fee-missing`, `fee-too-low`, `fee-asset-rejected` | no | the fee note is absent, short, or in an asset the relayer does not take |
| `contract-rejected` | no | a pool guard refused the payload in pre-flight; no gas was spent |
| `reverted` | no | the transaction reached the chain and reverted |
| `bad-request` | no | the payload is malformed |
| `unknown-chain` | no | the relayer does not serve this chain |
| `unavailable`, `internal` | yes | the relayer cannot serve right now |
| `unknown` | no | a response this SDK version does not recognise |

On `nullifier-*` and `stale-estimate`, the spend's notes are reserved (`reservedNoteIds`) until `reservedUntil`, so a retry does not reselect them.

Calling `RelayerClient` from `@lelantos-org/sdk/services` directly, a fee refusal is an HTTP `402` `NetworkError`; detect it with `isShieldedFeeRejection(err)`.

## Spend outcome unknown

`SPEND_OUTCOME_UNKNOWN` means a spend was handed to the relayer and no definite answer came back: a timeout, a dropped connection, or a broadcast without a receipt. **It may have landed.**

The wallet reserves the spend's notes until the spent set shows them spent or `reservedUntil` passes. A blind retry therefore selects other notes — which would send the payment twice if the first attempt landed.

```ts twoslash
// ---cut-start---
import type { TransferOptions, WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const args: TransferOptions;
declare function askUser(message: string): Promise<boolean>;
// ---cut-end---
import { isWalletError } from "@lelantos-org/sdk";

try {
    await wallet.transfer(args);
} catch (err) {
    if (!isWalletError(err, "SPEND_OUTCOME_UNKNOWN")) throw err;

    // Give the indexer time, then check whether the reserved notes were spent.
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    await wallet.sync({ scope: "notes" });
    const spentIds = new Set((await wallet.notes({ spent: true })).map((n) => n.id));
    const landed = err.reservedNoteIds.every((id) => spentIds.has(id));

    if (!landed && (await askUser(`Not confirmed yet (tx ${err.txHash ?? "unknown"}). Send again?`))) {
        await wallet.transfer(args);
    }
}
```

Guidance:

- Do not retry automatically. Show the operation as pending, with `txHash` when the relayer reported one.
- Sync after a while and check the reserved notes, as above, or look up `txHash` on chain.
- If the notes are still unspent after `reservedUntil`, the spend did not land; they return to selection on their own.
- `balance().withheld.reserved` and `state().notes.pendingSpend` include these notes in the meantime.

## Operation ids and cancellation

Every operation accepts `opId`, `signal`, and `onPhase`:

| Option | Behaviour |
|---|---|
| `opId` | a correlation id (1–64 of `[A-Za-z0-9_:.-]`), minted when omitted. It appears on phases, the result, `err.context.opId`, logs, and `state().ops`. It is never sent to a service. |
| `signal` | checked between every step. The operation rejects with `signal.reason` as-is and releases its note leases. An abort after the spend reached the relayer does not recall it: the SDK waits for the answer or reports `SPEND_OUTCOME_UNKNOWN`. |
| `onPhase(phase, { opId, txHash })` | progress; a throwing callback is logged and swallowed |

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: `0x${string}`;
// ---cut-end---
import { isWalletError } from "@lelantos-org/sdk";

const controller = new AbortController();
const opId = `withdraw:${crypto.randomUUID()}`;

try {
    await wallet.withdraw({ asset: "USDC", gross: "10", recipient, opId, signal: controller.signal });
} catch (err) {
    if (err === controller.signal.reason) console.log("cancelled by the user");
    else if (isWalletError(err)) console.error(err.context.opId === opId, err.code);
    else throw err;
}
```

## Timeouts and retries

The relayer, FMD, and quoter clients share one transport, configured with `http` on `connect()`:

| Setting | Default |
|---|---|
| `retries` | 3, after the first attempt |
| backoff | 250 ms, doubling, with jitter |
| `timeoutMs` (reads and estimates) | 15,000 ms per attempt |
| `submitTimeoutMs` (spend submissions) | 30,000 ms per attempt, or the preset's value (90,000 ms on `mainnet`) |
| quoter timeout | 5,000 ms per attempt |
| Retried: reads and estimates | no response, timeouts, 408, 429, 5xx |
| Retried: submissions | no response, timeouts, 429, 503 — under one `Idempotency-Key` |
| Never retried | a submission answered with 500 or 502, which may follow a broadcast |

```ts twoslash
// ---cut-start---
declare const privateKey: `0x${string}`;
declare const rpcUrl: string;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

// A poll on a latency budget: fail fast rather than retry for a minute.
const wallet = await connect({
    network: "base",
    rpcUrl,
    privateKey,
    http: { timeoutMs: 3_000, retries: 1, onRetry: (i) => console.warn("retry", i.service, i.attempt) },
});
```

::: warning `timeoutMs` applies per attempt
With retries, a request can take several times `timeoutMs`. At the defaults, a failing read takes over a minute to throw. For latency-sensitive calls such as polling, set both `timeoutMs` and `retries`.
:::

Clients constructed directly (`RelayerClient`, `FmdClient`, `HttpRelayerSubmitter`) take `HttpClientOptions`, which also accepts `backoffMs`.

## Next

- [Troubleshooting](/guide/troubleshooting) — symptoms and fixes
- [Logging](/guide/logging)
