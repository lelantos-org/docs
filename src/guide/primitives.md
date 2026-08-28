# Low-level primitives

Most applications never come here — the [Wallet API](/guide/wallet) covers the normal paths, including everything on this page. Read it when you are assembling a transaction shape the wallet does not expose, and need to reproduce what it does internally.

## Paying a relayer's shielded fee

A relayer may charge for relaying, and charges **privately**: the fee is an output note addressed to the relayer, built into the spend it pays for. There is no on-chain transfer, and so nothing linking the payer to the transaction.

`GET /chains` says whether a relayer charges. **The presence of `shieldedFee` is the contract** — where it appears, every spend and swap on that chain must carry a fee output, and one that does not is refused `402`.

<!-- typecheck: skip -->
```ts
import { RelayerClient } from "@lelantos-org/sdk/relayer";
import { feeOutputFromEstimate } from "@lelantos-org/sdk/bundle";

const relayer = new RelayerClient(relayerUrl);
const estimate = await relayer.estimateSpend(chainId, "transfer");

// null when this relayer charges nothing; throws when it charges but cannot
// take `asset` — that spend cannot be relayed at all.
const fee = feeOutputFromEstimate({ J, estimate, asset });
```

## Why the fee slot is shuffled

`fee` is one slot's `{ note, recipient, randomness }`, spliced into the three parallel arrays `buildSpend` takes. They are positional, so its entry has to land at the **same index in all three** — but deliberately not at a *fixed* index.

A fee note always sitting in the last slot would be a free label on every relayed transaction.

<!-- typecheck: skip -->
```ts
const feeValue = fee ? fee.note.value : 0n;
const changeValue = selection.sum - sendValue - feeValue;
const change = splitChange(ownPk, asset, changeValue, shape.nOut - (fee ? 2 : 1));

// One object per slot, shuffled once, then unzipped — so the three arrays
// cannot disagree about where the fee went.
const slots = shuffled([
    { note: sendNote, recipient: to, randomness: perOutput[0] },
    ...change.map((note, i) => ({ note, recipient: own, randomness: perOutput[i + 1] })),
    ...(fee ? [fee] : []),
]);
```

`shuffled` is exported from `@lelantos-org/sdk/core`. The wallet paths use `finalizeSlots`, which wraps this and derives `ownIndices` from the same permutation — so the wallet always knows which outputs are its own without re-scanning.

::: tip Let the wallet do it
`wallet.transfer()` and `wallet.swap()` already handle fee estimation, slot shuffling, and index tracking. Reach for these primitives only when you are building a transaction shape the Wallet API does not expose.
:::

## Knowing the fee before you build

`wallet.quoteFee()` prices a prospective operation without building it, and reports which assets this wallet could pay in — so a UI can show a total before the user commits. See [Fees](/guide/fees) for the worked example.

## Next

- [Fees](/guide/fees) — quoting, and cross-asset fees
- [Errors](/guide/errors) — `isShieldedFeeRejection`
- [API Reference](/reference/)
