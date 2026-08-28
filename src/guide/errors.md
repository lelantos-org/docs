# Errors

Every error the SDK raises inherits `WalletError` and carries a stable, machine-readable `code`. Recovery is therefore a matter of switching on that code — never of matching message text, which is not part of the API.

`isWalletError(err, code?)` is the guard to reach for. It narrows to the concrete class, so the variant's context fields are typed without an `instanceof` chain — and it is duck-typed, so it keeps working when two copies of the SDK end up in one bundle.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
const to = wallet.address;
const amount = 100n;
// ---cut-end---
import { isWalletError } from "@lelantos-org/sdk";

try {
    await wallet.transfer({ to, amount });
} catch (e) {
    if (isWalletError(e, "INSUFFICIENT_COVER")) {
        await wallet.transfer({ to, amount, autoConsolidate: true });
    } else if (isWalletError(e)) {
        switch (e.code) {
            case "RELAYER_TIMEOUT":
                console.error(e.url, e.status, e.body);
                break;
            case "WALLET_CONFIG":
                console.error(e.missing);
                break;
            default:
                throw e;
        }
    } else throw e;
}
```

`WALLET_ERROR_CODES` is the runtime list of every code; `AnyWalletError` is the union of every class, discriminated on `code`.

## Shielded-fee rejections

A relayer that refuses a submission over its [shielded fee](/guide/primitives) answers `402`, which arrives as a `NetworkError`. `isShieldedFeeRejection` is the guard.

The status alone is decisive — the relayer returns `402` for nothing else — but a named predicate says *which* `402` a call site means, and keeps the check honest if that ever stops being true.

```ts twoslash
// ---cut-start---
import { RelayerClient } from "@lelantos-org/sdk/relayer";
import type { SubmitTransactPayload } from "@lelantos-org/sdk/protocol";
declare const relayer: RelayerClient;
declare const payload: SubmitTransactPayload;
// ---cut-end---
import { isShieldedFeeRejection } from "@lelantos-org/sdk/relayer";

try {
    await relayer.submitTransact(payload);
} catch (e) {
    if (!isShieldedFeeRejection(e)) throw e;
    // `e.body` carries the relayer's reason in prose: which asset, what was
    // paid, what was required, and the grace band. The quote went stale —
    // re-estimate and rebuild. Resubmitting the same payload is refused again.
}
```

## Every error class

| Class | Code | Notes |
|---|---|---|
| `InsufficientCoverError` | `INSUFFICIENT_COVER` | No 1/2-note cover. Pass `autoConsolidate` or read `consolidate: StoredNote[]`. |
| `WalletConfigError` | `WALLET_CONFIG` | `missing: string[]` lists all problems. |
| `NetworkError` | `RELAYER_*` / `FMD_*` / `QUOTER_*` | Wraps fetch failures and timeouts. Fields: `url`, `status?`, `body?`, `cause?`. |
| `ProverError` | `PROVER_FAILED` | Proof generation failed. |
| `ProverArtifactsMissingError` | `PROVER_ARTIFACTS_MISSING` | Field `tried: string[]`. Pass `proverArtifacts`, install the companion package, or set `LELANTOS_PROVER_ARTIFACTS_DIR`. |
| `PermitRejectedError` | `PERMIT_REJECTED` | User rejected the EIP-2612 signature. |
| `DepositAdapterError` | `DEPOSIT_ADAPTER` | Strategy mismatch (`native` / `allowance` / `witness`). |
| `SelectionError` | `SELECTION` | Coin-selector failure. Field `asset?`. Also raised when a cross-asset fee has no input slot left. |
| `InvalidArgumentError` | `INVALID_ARGUMENT` | Field `argument?` names the offending parameter. **The rejected value is never in the message** — it would reach logs verbatim. |
| `WireFormatError` | `WIRE_FORMAT` | A response did not match the documented wire contract. Field `path` is the JSON path, e.g. `$.min_out`. |
| `TxMiningError` | `TX_MINING` | Chain transaction submitted but not mined, or reverted. |
| `NetworkNotDeployedError` | `NETWORK_NOT_DEPLOYED` | Field `network: string`. Pick a deployed preset or pass a `NetworkPreset` literal. |

## Timeouts and retries

Every HTTP pluggable takes `HttpClientOptions` — `{ timeoutMs, retries, backoffMs }` — at construction. To change them, build the client yourself and inject it.

```ts twoslash
// ---cut-start---
declare const fmdUrl: string;
declare const relayerUrl: string;
declare const chainId: bigint;
// ---cut-end---
import { connect, FmdNoteSource, HttpRelayerSubmitter } from "@lelantos-org/sdk";
import { FmdClient } from "@lelantos-org/sdk/fmd-server";

// A poll on a latency budget: fail fast rather than retry for a minute.
const fmd = new FmdClient(fmdUrl, chainId, { timeoutMs: 3_000, retries: 1, backoffMs: 100 });

const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
    noteSource: new FmdNoteSource(fmd),
    submitter: new HttpRelayerSubmitter(relayerUrl, { timeoutMs: 60_000, retries: 2 }),
});
```

`fetchSwapQuote` accepts the same options per call and defaults `timeoutMs` to 5000 — a stale quote is worth less than a fast failure.

Defaults: **3** retries after the first attempt, 250 ms backoff doubling with ±25% jitter, and a per-attempt timeout of **15 000 ms** for idempotent requests (GET/HEAD/OPTIONS) or **30 000 ms** for submits.

::: warning The timeout is per attempt, not per call
A fully retried request can outlive `timeoutMs` several times over — at the defaults, a failing GET takes upwards of a minute before it throws. Set `timeoutMs` **and** `retries` when a call sits on a latency budget, as a poll does.
:::

HTTP clients retry 5xx, 408, 429, and network errors. `402` is never retried.

To route all SDK egress through a proxy or a recording shim, pass `fetchImpl` instead — it is used by every default HTTP pluggable, and ignored for ones you build yourself.

## Next

- [Fees](/guide/fees) — shielded-fee rejections in context
- [Logging](/guide/logging) — seeing what the SDK is doing before it throws
