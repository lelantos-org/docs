# Deposit (shield)

A deposit moves value from a public ERC-20 balance into the shielded pool. It is the one wallet operation your own signer broadcasts, so it is also the one that costs you gas directly.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
const peerBech32 = wallet.address;
// ---cut-end---
const tx = await wallet.deposit({
    amount: 1000n, // circuit units; on-chain inAmt = amount * scale
    asset: 1n, // optional — id, token address or symbol. Default asset 1
    to: peerBech32, // optional, default own address
    deadline: 1700000000n, // optional permit expiry (default: now + 3600s)
    asEth: false, // optional; true routes native ETH via NativeAdapter
    onPhase: (p) => console.log(p), // "signing" | "submitting" | "broadcast" | "mined"
});

tx.depositId;
// ^?
```

Each method returns its own receipt type — `deposit()` gives you a `DepositResult`, not the four-way `TransactionResult` union — so `tx.depositId` needs no narrowing.

The chain adapter signs an EIP-2612 permit so the deposit and the ERC-20 pull happen in one atomic transaction, with no separate `approve`. Deposit strategies (`native`, `allowance`, `witness`) are picked per-asset by the adapter; a mismatch raises `DepositAdapterError`.

## The deposit lifecycle

A deposit passes through three states, and only the third makes the note spendable.

| State | What has happened | How you observe it |
|---|---|---|
| **mined** | your transaction is on chain; funds are in escrow | `deposit()` resolves |
| **flushed** | the relayer folded the note into the Merkle tree | `DepositStream.awaitFlush` |
| **synced** | your wallet holds the note and the tree containing it | `wallet.sync()` |

A note between "mined" and "flushed" is real but unspendable — there is no tree position to prove membership against yet.

## Waiting for the relayer to settle

The relayer folds escrowed deposits in with `flushBatch` and publishes that on an SSE feed. `depositId` from the receipt is the correlation key.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
const relayerUrl = "https://relayer.lelantos.xyz";
const chainId = 1n;
const signal = new AbortController().signal;
// ---cut-end---
import { DepositStream } from "@lelantos-org/sdk/relayer";

const stream = new DepositStream(relayerUrl, chainId);
const tx = await wallet.deposit({ amount: 1000n });
if (tx.depositId !== undefined) {
    const wait = await stream.awaitFlush(tx.depositId, { signal });
    if (wait.kind === "flushed") console.log("settled in", wait.txHash, wait.blockNumber);
}
stream.close();
```

::: warning Open the stream before depositing
The relayer does not replay. A fast flush can land before you subscribe — the stream buffers recent events and `awaitFlush` matches against them, which closes that race. The buffer holds the last 64 events; raise `replayBuffer` on a busy chain, where 64 flushes can pass between broadcasting and awaiting.
:::

### Outside the browser

`EventSource` is a browser global with no Node equivalent, so pass one. The constructor throws `EnvironmentError` when there is no global to fall back to.

```ts twoslash
// ---cut-start---
declare const relayerUrl: string;
declare const chainId: bigint;
declare class MyEventSourcePolyfill {
    constructor(src: string);
    onmessage: ((ev: MessageEvent) => void) | null;
    onerror: ((ev: Event) => void) | null;
    close(): void;
    addEventListener(t: string, l: (ev: MessageEvent) => void): void;
    removeEventListener(t: string, l: (ev: MessageEvent) => void): void;
}
// ---cut-end---
import { DepositStream } from "@lelantos-org/sdk/relayer";

const stream = new DepositStream(relayerUrl, chainId, {
    eventSourceFactory: (src) => new MyEventSourcePolyfill(src) as unknown as EventSource,
});
```

### `awaitFlush` never rejects

It resolves a `FlushWait`, discriminated on `kind`:

| `kind` | Meaning |
|---|---|
| `"flushed"` | the settlement event itself — read `wait.txHash` directly |
| `"aborted"` | your signal fired |
| `"closed"` | the feed died |

The last two mean settlement went **unobserved**, not that the deposit failed. The transaction is already mined either way.

::: danger `wait.txHash` is not your deposit
It is the relayer's `flushBatch` transaction — a different transaction in a different block. So `wait.blockNumber` is when the note entered the tree, not when your deposit was mined. Keep `tx.txHash` from the `DepositResult` if you need to link back to the deposit itself.
:::

## Reclaiming a deposit the relayer never flushed

Escrowed funds are not stuck. Once `cancelDelay()` blocks have passed, `cancelDeposit` refunds them, and it is permissionless — anyone can submit it, though the refund always goes to the digest-bound payer.

The escrow row stores only `keccak(request)`, so every field the contract once read from storage has to be handed back in and checked against that digest.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
import type { CancelDepositInputs, Hex32 } from "@lelantos-org/sdk";
import type { ViemChainAdapter } from "@lelantos-org/sdk/chain";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
declare const depositId: bigint;
// The fee leaf is on the same `DepositEscrowed` log, but is not carried by
// `DepositEscrowedRecord` — read it off the log, or cache it at deposit time.
declare const feeLeaf: Pick<CancelDepositInputs, "feeIn" | "feeCm" | "feeCvDep">;
// ---cut-end---
const chain = wallet.chain as ViemChainAdapter;

// null once the deposit has been flushed or cancelled.
const escrow = await chain.getEscrowed(depositId);
if (escrow) {
    const delay = await chain.cancelDelay();
    const record = await chain.fetchDepositEscrowed(depositId);
    const tip = await chain.blockNumber();

    if (record && tip - record.submittedAt >= delay) {
        await wallet.cancelDeposit(depositId, {
            publicIn: record.publicIn,
            cm: record.cm,
            cvDep: record.cvDep,
            publicAssetId: record.publicAssetId,
            feeBpsAtSubmit: record.feeBpsAtSubmit,
            payer: record.payer,
            submittedAt: record.submittedAt,
            ...feeLeaf,
        });
    }
}
```

::: tip Cache the `DepositEscrowed` log at deposit time
`escrowed(id)` returns the digest and nothing else, so every preimage field has to be recovered from the log. `fetchDepositEscrowed` does that by scanning for it, which is a wide `getLogs` range on a chain that has been running a while. Storing the log alongside your own deposit record turns recovery into a local lookup.
:::

::: warning `submittedAt` is not always the log's block number
It is the EVM's `block.number` as the digest saw it. On Arbitrum the EVM reports the L1 height while the log carries the L2 height, so `fetchDepositEscrowed` resolves it explicitly rather than reusing `log.blockNumber`. Do not substitute one for the other.
:::

A native-ETH deposit is escrowed under the `NativeAdapter`'s own name, since the pool is ERC-20 only and would otherwise refund the adapter. Those are cancelled through `cancelDepositNative`, which supplies its own payer.

## Next

- [Transfer](/guide/transfer)
- [Fees](/guide/fees) — what a deposit is charged
- [Syncing](/guide/sync) — before the note is spendable
