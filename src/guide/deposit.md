# Deposit

A deposit moves tokens from a public ERC-20 balance into the shielded pool. It is the only operation broadcast by your own account, so it needs a chain layer that signs (`capabilities.deposit`) and you pay its gas.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const friend: string;
// ---cut-end---
const result = await wallet.deposit({
    asset: "USDC", // id, token address or symbol
    amount: "100", // the new note's value; fees are charged on top
    feeAsset: "USDC", // optional — asset the relayer's fee note is paid in. Default `asset`
    recipient: friend, // optional — shielded owner of the note. Default this wallet
    deadline: BigInt(Math.floor(Date.now() / 1000) + 600), // optional — permit and escrow deadline
    onPhase: (phase, { opId, txHash }) => console.log(opId, phase, txHash),
});

result.escrow;
//     ^?
```

| Option | Default | Description |
|---|---|---|
| `asset` | — | registry id, token address, or symbol |
| `amount` | — | the principal that becomes the note (`publicIn`); the protocol fee and relayer fee are pulled on top |
| `feeAsset` | `asset` | asset for the relayer fee note — see [A deposit's relayer fee](/guide/fees#a-deposit-s-relayer-fee) |
| `recipient` | this wallet | shielded owner of the new note |
| `native` | `false` | send the native coin through `NativeAdapter`; `asset` must be the wrapped coin |
| `deadline` | now + 1 h | Permit2 signature and escrow deadline, unix seconds |
| `signal`, `onPhase`, `opId` | — | cancellation, progress, and a correlation id — see [Errors](/guide/errors#operation-ids-and-cancellation) |

Phases, in order: `preparing`, `signing` (only when a Permit2 signature is needed), `submitting`, `broadcast` (the transaction hash is known), `confirmed` (mined).

## Quoting first

`quoteDeposit` runs the same resolution and validation as `deposit`, reads balances and allowances, and returns what the deposit would pull and which path it would take — without signing anything.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
import { formatAmount } from "@lelantos-org/sdk";

const quote = await wallet.quoteDeposit({ asset: "USDC", amount: "100" });

for (const pull of quote.pulls) {
    // One entry per ERC-20 the pool pulls: principal + protocol fee, and the relayer's note.
    console.log(pull.token, pull.amount, "balance", pull.balance, "covered", pull.allowance?.covers);
}
quote.fees.protocol; // Money in USDC, or null
quote.fees.relayer; // Money in the fee asset, or null
quote.strategy; // "native" | "allowance" | "witness"
quote.sufficientBalance; // false → the deposit would revert for lack of funds
quote.allowanceSetupAvailable; // true → setupDepositAllowance would remove the per-deposit signature
```

| Field | Meaning |
|---|---|
| `amount` | the new note's value |
| `principal` | `amount` plus the protocol fee, in base units of `asset` |
| `pulls[]` | per token: `amount` (exact pull), `ceiling` (what is signed; adds yield headroom on a yield asset), `balance`, `allowance` |
| `separateFee` | the relayer's note is pulled on its own, in another token |
| `strategy` | the path `deposit` would take now |
| `quotedAt` | unix seconds; yield figures drift, so re-quote rather than cache |

A quote rejects exactly as the deposit would before signing: `FEE_ASSET_NOT_QUOTED`, `INVALID_ARGUMENT` for a refused fee asset or bad amount, `UNSUPPORTED_OPERATION` for `native` without an adapter, `NO_EVM_ACCOUNT` without a signing chain layer.

## Deposit strategies

The token transfer and the deposit execute in one transaction; no separate `approve` per deposit is needed. The wallet picks a path from the adapter's capabilities and the account's Permit2 state:

| Strategy | When | Prompts |
|---|---|---|
| `native` | `native: true` | one transaction |
| `allowance` | every pull is covered by a Permit2 allowance with time to spare | one transaction |
| `witness` | otherwise | one Permit2 signature, then one transaction |

### One-time allowance setup

`setupDepositAllowance` authorizes the pool through Permit2 once, so later deposits take the `allowance` path with no signature. It approves Permit2 on each token that needs it, then signs one batch permit and sends one `permit` transaction for all of them.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
const quote = await wallet.quoteDeposit({ asset: "USDC", amount: "100", feeAsset: "WETH" });

if (quote.allowanceSetupAvailable && wallet.capabilities.depositAllowance) {
    await wallet.setupDepositAllowance({
        assets: quote.pulls.map((p) => p.asset.id),
        onProgress: (p) => {
            if (p.step === "approving") console.log(`approve ${p.index}/${p.total}`, p.token, p.status);
            else console.log(p.step, p.status, p.txHash);
        },
    });
}
```

| Option | Default |
|---|---|
| `cap` | `2^160 − 1` base units, which Permit2 treats as unlimited |
| `expiration` | now + 90 days |
| `deadline` | signature deadline, now + 30 minutes |

## The deposit lifecycle

| State | Meaning | Observed with |
|---|---|---|
| **confirmed** | the transaction is mined; funds are in escrow | `deposit()` resolves |
| **flushed** | the relayer has added the note to the Merkle tree | `awaitDeposit(result.escrow)` |
| **synced** | the wallet has the note and the tree containing it | `sync()` |

The note is spendable only after it is synced. Between confirmed and flushed it has no tree position, so no proof can be built for it.

## Waiting for the relayer

`awaitDeposit(escrow)` syncs until the note's commitment appears. It resolves a status rather than throwing on timeout: a slow indexer after a mined deposit is not a failure.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
const { escrow } = await wallet.deposit({ asset: "USDC", amount: "100" });

const seen = await wallet.awaitDeposit(escrow, { timeoutMs: 300_000, pollMs: 3_000 });
if (seen.status !== "seen") console.warn("not flushed yet:", seen.status);
```

The default timeout is 120 seconds, polling every 2 seconds. Pass `throwOnTimeout: true` to reject with `FMD_TIMEOUT` instead. A deposit to another `recipient` never appears in this wallet; watch for it from the recipient's side.

### Push notification with `DepositStream`

The relayer also publishes flushes on a server-sent events stream. `DepositStream` from `@lelantos-org/sdk/services` matches them by `depositId`:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const signal: AbortSignal;
// ---cut-end---
import { DepositStream } from "@lelantos-org/sdk/services";

// Open the stream before depositing: the relayer does not replay past events.
const stream = new DepositStream("https://relayer.lelantos.xyz", 8453n);
const { escrow } = await wallet.deposit({ asset: "USDC", amount: "100" });

const wait = await stream.awaitFlush(escrow.depositId, { signal });
if (wait.kind === "flushed") console.log("flushed in", wait.txHash, wait.blockNumber);
stream.close();
```

`awaitFlush` never rejects. It resolves `"flushed"`, `"aborted"` (the signal fired), or `"closed"` (the stream closed); the last two mean the flush was not observed, not that the deposit failed. `wait.txHash` is the relayer's `flushBatch` transaction, not the deposit's.

`EventSource` is not available in Node. Pass `eventSourceFactory` in the options; without it the constructor throws `ENVIRONMENT`. On Node, `awaitDeposit` is usually simpler.

## Reading the result

| Field | Meaning |
|---|---|
| `amount` | the new note's value (`Money`) |
| `fees.protocol`, `fees.relayer` | `Money` in the deposited asset and the fee asset, or `null` when not charged |
| `pulled` | what the pool pulled per asset, exact base units: the deposited asset first, then the fee asset when pulled separately |
| `strategy`, `native` | the path taken |
| `recipient` | owner of the new note |
| `escrow` | `{ depositId, native, asset, commitment, cancelInputs, cancellableAtBlock }` |
| `txHash`, `opId` | the deposit transaction and this call's correlation id |
| `ownCommitments` | the new note's commitment, when `recipient` is this wallet |

`escrow` is plain data. Persist it with a bigint-aware serializer to await or cancel after a reload.

## Cancelling a deposit

If the relayer does not flush a deposit, the payer can reclaim it once `cancellableAtBlock` is reached. The refund always goes to the original payer.

```ts twoslash
// ---cut-start---
import type { DepositEscrow, WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const escrow: DepositEscrow;
// ---cut-end---
const tip = await wallet.chain.blockNumber?.();

if (tip !== undefined && tip >= escrow.cancellableAtBlock) {
    const r = await wallet.cancelDeposit(escrow);
    r.refunded; // Money in the deposited asset: principal, protocol fee, and a same-asset relayer fee
    r.feeRefunded; // Money in the fee asset when it was pulled separately, else null
}
```

`cancelDeposit` accepts the `escrow` a deposit returned, whose `cancelInputs` are used as-is, or `{ depositId, fromBlock? }`, in which case the inputs are rebuilt from the pool's `DepositEscrowed` log. The log is searched from a recent window by default; pass `fromBlock` for an older escrow. Native escrows are routed through `NativeAdapter` automatically.

| Failure | Code |
|---|---|
| already flushed or cancelled | `INVALID_ARGUMENT`, `argument: "depositId"`, before any transaction |
| no signing account | `NO_EVM_ACCOUNT` |
| cancelled before `cancellableAtBlock` | `RPC_FAILED` with `retryable: false` (the pool reverted the call), or `TX_REVERTED` if it was mined |

::: warning Block numbers on rollups
`cancellableAtBlock` is in the EVM's `block.number` space. On Arbitrum that is the L1 block number, while logs and the default search window use L2 blocks. When cancelling by `depositId` on a rollup, pass `fromBlock`.
:::

## Next

- [Transfer](/guide/transfer)
- [Fees](/guide/fees)
- [Syncing](/guide/sync)
