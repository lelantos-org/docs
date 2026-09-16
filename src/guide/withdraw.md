# Withdraw

A withdrawal spends shielded notes and pays a public EVM address. The recipient and the gross amount are visible on chain.

## To an ERC-20 balance

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
const tx = await wallet.withdraw({
    asset: "USDC",
    gross: "1000", // what leaves the pool; or `net: "…"` for what arrives
    recipient: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    autoConsolidate: true,
    onPhase: (phase) => console.log(phase), // "preparing" | "consolidating" | "proving" | "submitting" | "confirmed"
});

tx.onLadder;
// ^?
```

| Option | Description |
|---|---|
| `asset` | registry id, token address, or symbol |
| `gross` **or** `net` | exactly one — see [Gross or net](#gross-or-net) |
| `recipient` | EVM address receiving the tokens |
| `native` | unwrap to the native coin — see [To native ETH](#to-native-eth) |
| `feeAsset`, `selection`, `autoConsolidate`, `deadline`, `signal`, `onPhase`, `opId` | as for [Transfer](/guide/transfer) |

Change is returned as new notes. When the asset has a withdrawal ladder, change is split into ladder denominations — see [Denominations](/guide/denominations#change-lands-on-the-ladder-too).

## Gross or net

The protocol fee is deducted from what leaves the pool. Name the side you mean:

| Field | You name | The SDK computes |
|---|---|---|
| `gross` | `publicOut`, the amount published on chain | what the recipient receives: `gross − fee` |
| `net` | what the recipient receives | the smallest `gross` that delivers at least that |

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: `0x${string}`;
// ---cut-end---
import { formatAmount } from "@lelantos-org/sdk";

// A payment of exactly 250 USDC to an exchange deposit address.
const r = await wallet.withdraw({ asset: "USDC", net: { baseUnits: 250_000_000n }, recipient });

formatAmount(r.gross.amount, r.asset); // e.g. "250.625" — published on chain
r.net.baseUnits; // ≥ 250_000_000n, exact
r.fees.protocol; // Money in USDC, or null at 0 bps
r.fees.relayer; // Money in the fee asset, or null — never inside gross or net
```

A `net` withdrawal rarely lands on a denomination, so it publishes a distinctive amount; `r.onLadder` is then `false`. Surface that to the user. See [Denominations](/guide/denominations).

::: danger Relayer fee is separate
Neither `gross` nor `net` includes the relayer's fee. It is paid from notes, in `feeAsset`, and reported as `fees.relayer`.
:::

## Previewing

`previewWithdraw` computes what a withdrawal would publish, cost, and deliver. It does no proving or submitting, so it can run on every keystroke.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
const p = await wallet.previewWithdraw({ asset: "USDC", gross: "1000" });

p.publicOut; // gross in circuit units — what the chain sees
p.netFormatted; // "997.5" — what the recipient gets
p.onLadder; // whether this gross blends with other users' withdrawals
p.suggestion; // nearest denomination, when it does not
//    ^?
```

Without a wallet, `withdrawNetFor(publicOut, asset)` and `grossForNet` from `@lelantos-org/sdk/protocol` apply the same arithmetic. Do not reimplement it: yield-bearing and plain assets round at different steps, and the results differ by up to one unit.

## Reading the result

| Field | Meaning |
|---|---|
| `gross` | `publicOut` (`Money`, `amount` exact) |
| `net` | delivered to `recipient` (`Money`, `baseUnits` exact) |
| `fees.protocol`, `fees.relayer` | `Money` or `null` |
| `onLadder` | whether `gross` is a denomination; `false` makes the withdrawal linkable |
| `native` | unwrapped to the native coin |
| `recipient`, `spent`, `change`, `txHash`, `opId` | as for a transfer |

## To native ETH

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: `0x${string}`;
// ---cut-end---
if (wallet.capabilities.nativeWithdraw) {
    await wallet.withdraw({
        asset: "WETH", // must be the chain's registered wrapped coin
        gross: "0.5",
        recipient,
        native: true,
        feeAsset: "USDC", // any accepted fee asset works on the native path too
    });
}
```

`native: true` unshields WETH and unwraps it in the same transaction through the `NativeAdapter` contract. It needs no EOA of your own — the relayer broadcasts it — but it needs a known `NativeAdapter` address. Without one it rejects `UNSUPPORTED_OPERATION` before any fee is quoted.

## Withdrawing the maximum

`balance().total` is not the maximum withdrawable amount: notes can be reserved, dust, or recently received, and one spend can use only `nIn` notes. `spendableMax` applies the spend's own rules, and with `kind` it also reserves the relayer fee:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: `0x${string}`;
// ---cut-end---
import { circuitAmount } from "@lelantos-org/sdk";
import { largestAtMost } from "@lelantos-org/sdk/protocol";

const usdc = await wallet.asset("USDC");
const { max } = await wallet.spendableMax(usdc.id, { kind: "withdraw" });

// `max` is the largest `gross` one spend can cover, after the fee. Either withdraw it all…
if (max > 0n) await wallet.withdraw({ asset: usdc.id, gross: max, recipient });

// …or the largest denomination at or below it, which blends in where `max` rarely does.
const denomination = largestAtMost(max, usdc.ladder);
if (denomination !== undefined) {
    await wallet.withdraw({ asset: usdc.id, gross: circuitAmount(denomination), recipient });
}
```

Pass the same `feeAsset`, `native`, and `selection` to `spendableMax` that the withdrawal will use. For a denomination picker, use `wallet.withdrawDenominations()`.

## Next

- [Denominations](/guide/denominations)
- [Swap](/guide/swap)
- [Fees](/guide/fees)
