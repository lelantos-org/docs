# Denominations

A withdrawal's `publicOut` is public, so the naive round trip publishes the same integer at both ends — deposit 3,417 units, withdraw 3,417 units — and links them. Withdrawing from a fixed **ladder** of denominations publishes a value many other users also publish.

A ladder is a list of fixed circuit-unit amounts, ascending. It is a table of integers rather than a conversion from human amounts: a pool-managed yield index moves what a denomination is *worth*, while the denomination itself never changes.

## The leak this closes

Every round trip publishes two values: a deposit's `publicIn`, attributed to the payer, and a withdrawal's `publicOut`, attributed to the recipient. Nothing between them is public — an internal transfer carries no amount.

A distinctive amount links those two ends, and a yield-bearing pool makes almost every amount distinctive. Circuit units are normalized, so a round *underlying* amount divides by a continuously moving index: at 5% APY a 1000-USDC deposit drifts about 1.6 units per second, and two users collide only by depositing the identical amount in the same block. A later withdrawal of that integer matches its deposit exactly, revealing the link, the holding period and the realised yield.

A denomination is a fixed integer, so it does not move with the index. Its anonymity set is every withdrawal of that size in the pool's history, with no partitioning by time.

::: danger Never derive a denomination at runtime
`n = human * RAY / (scale * index)` moves as the index moves, reproducing the fingerprint the ladder exists to remove. The ladder is a table of integers; the human labels are display only. Once yield accrues, `1_000_000_000` reads as ~1050 USDC rather than 1000, and that is correct.
:::

Only `publicOut` is constrained. Deposits and internal transfers may carry any value: a deposit's amount is public and attributed to its payer regardless of what the wallet does, and a transfer publishes no amount at all.

## What every asset gets

A `{1, 2, 5} × 10^e` series in circuit units, derived from the asset's own `scale` and ERC-20 `decimals`. Steps of 2× and 2.5× put any amount within ~20% using two or three pieces, in a shape users already recognise.

There is no table and nothing to configure per token, because a circuit unit is already roughly value-normalised across assets: an operator picks `scale` to make one unit a sensible granularity, which leaves USDC at ~$0.000001 per unit and WETH at ~$0.00003 — about 30× apart, against ~3000× for one whole token. So one window in circuit units serves both, and it is the same window the two hand-tuned ladders it replaced already described.

The floor bounds leftover dust: at 1e5 circuit units it is 0.001 WETH, exactly where the curated WETH ladder put it, and $0.10 for USDC.

The cap is the looser end, and the one thing the derivation cannot get right for every asset. Nothing available correlates with value — WETH and a stablecoin can be identical in `scale` and `decimals` and 3000× apart in price — so a single cap in circuit units is generous for the asset worth most per unit. The top decades exist but are close to unpopulated, and an anonymity set is actual, not potential: treat a rung near the top of the range as rarer than one in the middle. Making the cap track value means publishing it per asset from the pool operator, who is the only party that knows.

`decimals` is consulted only to keep the window where the asset can express it. An asset scaled far from the usual granularity — an 18-decimal token registered at `scale = 1` — gets the window moved to where it actually lives rather than one describing amounts nobody could withdraw.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
import { denominations, formatAmount, isDenominated } from "@lelantos-org/sdk";

const usdc = await wallet.asset("USDC");

isDenominated(usdc); // does this asset have a ladder at all?
for (const d of denominations(usdc)) {
    console.log(formatAmount(d, usdc, { symbol: true })); // "10 USDC", "20 USDC", …
}
```

The ladder is resolved once, when the `AssetInfo` is built, and travels with it as `asset.ladder`, so no code downstream needs to know the policy.

## Offering a picker

`wallet.withdrawDenominations()` labels each denomination with its current worth and what the recipient would receive after the protocol fee. Both labels move with the yield index, so recompute rather than cache them.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
for (const choice of await wallet.withdrawDenominations("USDC")) {
    console.log(choice.label, "→", choice.netLabel);
    //          ^?
}
```

For an amount the user typed, `previewWithdraw` reports whether it is on the ladder and names the closest one when it is not. `onLadder: false` is not an error and nothing rejects it, but an off-ladder `publicOut` is a near-unique public integer — surface it.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
const p = await wallet.previewWithdraw({ asset: "USDC", amount: "1234" });

p.hasLadder; // false → the asset has none, and `onLadder` means nothing
p.onLadder; // false → this amount is not one of them
p.suggestion; // the nearest denomination, ties going to the smaller
```

## Change lands on the ladder too

A denomination you cannot assemble is unusable, so change is decomposed onto the ladder greedily, largest first, with the remainder in one final note. Splitting evenly instead would produce notes that cannot be withdrawn as they stand, on every spend, and they compound.

```
decompose(4900n, ladder, 4) → pieces [2000, 2000, 500], dust 400
```

The dust is transient: an internal transfer publishes no amount, so a later self-spend re-splits it at no privacy cost. `redenominate` drives that self-spend in a loop.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
const rounds = await wallet.redenominate("USDC", { maxRounds: 4 });
```

Each round places `nOut - 1` ladder pieces and carries one residual, so the residual shrinks until it falls below the lowest denomination and no decomposition can place it. It is idempotent and safe to schedule. A round that cannot find cover ends the loop rather than throwing, since a partly tidied note set is strictly better than the original. The return value is the number of rounds run; zero means the asset has no ladder, or nothing was off it.

## Selecting for zero change

`DenominationCoinSelector` wraps SFRT and prefers a cover that pays the target exactly. An exact cover produces no change note — nothing to place on the ladder, nothing to re-split later.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
// ---cut-end---
import { DenominationCoinSelector } from "@lelantos-org/sdk";

await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
    selector: new DenominationCoinSelector(),
});
```

SFRT's dust thresholds, spend cooldown, reservations and consolidate-first fallback are unchanged; the wrapper intercepts only the exact-cover case. The default selector remains plain SFRT.

## What the ladder does not hide

The ladder removes one linkage — the amount. The rest of a withdrawal is as visible as it was before.

| Still public | Consequence |
|---|---|
| the recipient address | withdrawals to one address are linked to each other, and to any identity already attached to it |
| the number and timing of exits | a large balance leaves as several pieces; spread them across blocks and recipients |
| deposit amounts | public and attributed to the payer, so a rare deposit size still narrows the candidate set |
| submission metadata | timing and network origin reach the relayer unless routed around — `fetchImpl` is the seam |

**The net delivered adds nothing back.** The recipient receives the denomination minus `withdrawBps`, computed on chain from the asset's rate, `scale` and index, so every user withdrawing that denomination at that moment gets the same figure. Rounding the net to a tidy number puts the uniqueness back into `publicOut`.

**Off-ladder amounts mark the wallet, not just the transaction.** A `publicOut` nobody else publishes is linkable to the deposit that funded it, and identifies the wallet as non-conforming. `previewWithdraw` reports `onLadder` so a UI can surface that rather than swallow it.

**An anonymity set is actual, not potential.** It is however many users withdrew that denomination, not how many could have. The extremes of a ladder, and any thinly used pool, offer less cover than the middle of a busy one.

Which notes a spend consumes is a separate fingerprint — the reason the default selector is SFRT rather than largest-first, and why the spend cooldown exists (see [Note management](/guide/notes)). A detection delegate additionally learns the FMD match set (see [Syncing](/guide/sync)).

### Surfacing it in a UI

Show what will be published, and offer the conforming amount rather than rewriting the user's.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
const to = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
declare const entered: string;
// ---cut-end---
import { formatAmount } from "@lelantos-org/sdk";

const usdc = await wallet.asset("USDC");
const p = await wallet.previewWithdraw({ asset: usdc.id, amount: entered });

if (p.hasLadder && !p.onLadder && p.suggestion !== undefined) {
    // Offer the nearest denomination — ties go to the smaller, so the
    // suggestion never costs more than was asked for.
    console.warn(`off-ladder; nearest denomination is ${formatAmount(p.suggestion, usdc)}`);
}

await wallet.withdraw({ to, asset: usdc.id, amount: p.publicOut });
```

Silently substituting the suggestion is worse than a linkable withdrawal: only the user knows whether a smaller amount still covers what they owe.

## Choosing a different policy

`denominations` on `connect()` and `WalletConfig` decides whether the wallet uses ladders at all.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
// ---cut-end---
await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
    denominations: false,
});
```

`true` is the default and gives every asset its derived ladder. `false` opts out entirely: change splits evenly again, `previewWithdraw` reports no ladder, and `redenominate` is a no-op — and it is now the only reason an asset has no ladder.

::: warning The window is a pool-wide constant
Every wallet on the same SDK version derives the same rungs for the same asset, which is what makes the set shared. Two versions with different windows split it at every rung outside their intersection, so the window changes only under a coordinated migration.
:::

## Next

- [Withdraw](/guide/withdraw) — where the gross becomes public
- [Note management](/guide/notes) — selection, cover, and consolidation
- [Fees](/guide/fees) — what the recipient actually receives
