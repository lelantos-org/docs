# Swap

A swap exchanges one shielded asset for another in a single atomic operation:

1. **Leg 1** unshields the input asset to the `SwapWrapper` contract, which executes the trade.
2. **Leg 2** re-shields the output as a new note for the recipient.

Both legs are submitted together, so the value is never held unshielded between transactions. A `withdraw` followed by a `deposit` does not provide this guarantee. If the trade fails or passes its deadline, the wrapper re-shields the input as a refund note instead.

A swap is two calls: `quoteSwap` prices it, and `swap` executes that quote.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
import { formatAmount } from "@lelantos-org/sdk";

const quote = await wallet.quoteSwap({
    assetIn: "WETH",
    assetOut: "USDC",
    gross: "0.5", // what leaves the pool; or `net` for what reaches the venue
    slippageBps: 50,
});

// What the output note will hold if the swap fills. Show this, not `expectedOut`.
console.log("you receive", formatAmount(quote.credit.amount, quote.assetOut, { symbol: true }));

const result = await wallet.swap({ quote });
//    ^?
```

Swaps need `capabilities.swap`: a prover, a relayer that relays swaps, and a network with a quoter URL. The `SwapWrapper` address comes from the network preset or the relayer's `/chains`; without one, `quoteSwap` rejects `UNSUPPORTED_OPERATION`.

## Quoting

| `quoteSwap` option | Description |
|---|---|
| `assetIn`, `assetOut` | input and output assets |
| `gross` **or** `net` | exactly one: `gross` leaves the pool, `net` is what reaches the venue (`gross − protocol fee`) — see [Gross and net](/guide/amounts#gross-and-net) |
| `slippageBps` | maximum slippage, `0`–`10000` |
| `feeAsset` | asset `fees.relayer` is quoted in; default `assetIn` |
| `signal` | cancels the quote request |

| `SwapQuote` field | Meaning |
|---|---|
| `gross`, `net` | leg 1 in `assetIn`; `net.baseUnits` is the venue's `amountIn` |
| `onLadder` | whether `gross` is a denomination of `assetIn` (it is published) |
| `expectedOut`, `minOut` | the venue's expected output and the slippage floor, base units of `assetOut` |
| `credit` | exactly what the output note will hold if the swap fills |
| `refundCredit` | what the refund note would hold, in `assetIn` |
| `fees.protocol` | leg 1's withdraw fee, in `assetIn`, taken out of `gross` |
| `fees.relayer` | the relayer's spend fee, in the fee asset; paid from notes, not inside `gross` |
| `fees.flush`, `fees.outProtocol` | leg 2's relayer flush fee and deposit fee, in `assetOut`; already subtracted from `credit` |
| `venue`, `quotedAt` | venue label and the unix second it was queried |

`credit` is not `minOut / scale`: leg 2's fees come out of the output, and any fill above `minOut` goes to the treasury. The quote computes it with the same code the swap binds into the proof.

A quote is plain frozen data and survives `structuredClone`, so it can live in a UI cache. Do not construct or edit one.

## Executing

| `swap` option | Description |
|---|---|
| `quote` | from `quoteSwap`; its assets, amount, route, and `minOut` are what the proof binds |
| `recipient` | shielded owner of the output note; default this wallet |
| `refundAddress` | EVM account bound into the intent for refunds; default this wallet's EOA, else the relayer's |
| `deadline` | unix seconds after which the wrapper refunds instead of swapping |
| `feeAsset`, `selection`, `autoConsolidate`, `signal`, `onPhase`, `opId` | as for [Transfer](/guide/transfer) |

`swap` does not trust the quote object. It re-resolves both assets and recomputes `gross`, `net`, `credit`, and `refundCredit` at current rates:

| Outcome | Code | What to do |
|---|---|---|
| figures reproduce | — | the swap runs |
| a yield index or the relayer's flush fee moved since quoting | `QUOTE_STALE`, `retryable: true`, `fields` names the moved figures | re-quote, show the new figures, and run the new quote |
| the quote was altered or is malformed | `INVALID_ARGUMENT`, `argument: "quote"` | a bug in the caller |

```ts twoslash
// ---cut-start---
import type { QuoteSwapOptions, SwapResult, WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare function confirmWithUser(q: Awaited<ReturnType<WalletApi["quoteSwap"]>>): Promise<boolean>;
// ---cut-end---
import { isWalletError } from "@lelantos-org/sdk";

async function swapWithFreshQuote(args: QuoteSwapOptions): Promise<SwapResult | undefined> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const quote = await wallet.quoteSwap(args);
        if (!(await confirmWithUser(quote))) return undefined;
        try {
            return await wallet.swap({ quote });
        } catch (err) {
            if (!isWalletError(err, "QUOTE_STALE")) throw err;
            console.info("quote moved:", err.fields); // e.g. ["credit"]
        }
    }
    throw new Error("rates keep moving; try again later");
}
```

Beyond that check, staleness is your policy: `quotedAt` says how old the venue price is, and the chain enforces `minOut`.

## Reading the result

| Field | Meaning |
|---|---|
| `asset`, `assetOut` | input and output assets |
| `gross`, `net`, `onLadder` | leg 1, as quoted |
| `expectedCredit` | the output note's value if the swap fills: the quote's `credit` |
| `refundCredit` | the refund note's value if it does not |
| `creditCommitment`, `refundCommitment` | exactly one of the two lands; await it with `awaitCommitments` |
| `deadline` | unix seconds after which the wrapper refunds |
| `fees` | the quote's four fees, with `relayer` as actually paid |
| `spent`, `change`, `txHash`, `opId` | as for a transfer |

Exactly one of the two notes lands, so wait for whichever appears first:

```ts twoslash
// ---cut-start---
import type { SwapResult, WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const result: SwapResult;
// ---cut-end---
async function swapOutcome(r: SwapResult): Promise<"filled" | "refunded"> {
    const credit = r.creditCommitment.toLowerCase();
    const refund = r.refundCommitment.toLowerCase();
    for (;;) {
        await wallet.sync({ scope: "notes" });
        for (const note of await wallet.notes()) {
            const cm = note.cm.toLowerCase();
            if (cm === credit) return "filled";
            if (cm === refund) return "refunded";
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
}

console.log(await swapOutcome(result));
```

With a `recipient` other than this wallet, the credit note lands in the recipient's wallet instead.

Without a wallet, `fetchSwapQuote` (`@lelantos-org/sdk/services`) and `sizeBNote` (`@lelantos-org/sdk/protocol`) are the underlying venue client and output sizing.

## Next

- [Syncing](/guide/sync)
- [Fees](/guide/fees)
