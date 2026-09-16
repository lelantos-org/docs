# Addresses

A shielded address is a **bech32m** string with the human-readable prefix `lelantos` and a 96-byte payload, `pk_d || pk || ck`.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
wallet.address;
// ^?
```

| Component | Purpose |
|---|---|
| `pk_d` | diversified public key; the key notes are paid to |
| `pk` | public key; lets any sender build a valid note commitment for the recipient |
| `ck` | clue key; lets a sender attach the FMD clue that makes the note detectable |

All three are required to send a detectable note. `ck` is the public half of the detection secret: holding an address lets you pay someone, not watch them.

## Deriving an address

The address is derived deterministically from `nsk`. Every [key source](/guide/wallet#key-source-and-chain-layer) yields the same address for the same input.

To derive an address without a wallet, use `addressFromSpendingKey` or `addressFromViewingKey` from `@lelantos-org/sdk/primitives`.

## Validating input

| Function | Checks | Cost |
|---|---|---|
| `shieldedAddress(value)` | prefix and bech32m character set | cheap; suitable for validation on each keystroke |
| `parseAddress(value)` | checksum, and that both points are on the curve | async; loads the crypto context once; confirms the address is payable |

```ts twoslash
// ---cut-start---
declare const entered: string;
// ---cut-end---
import { isWalletError, parseAddress, shieldedAddress } from "@lelantos-org/sdk";

function looksValid(value: string): boolean {
    try {
        shieldedAddress(value); // HRP + charset only
        return true;
    } catch {
        return false;
    }
}

try {
    const { pk_d, pk, ck } = await parseAddress(entered); // full validation
    console.log(pk_d, pk, ck);
} catch (err) {
    if (!isWalletError(err, "INVALID_ARGUMENT")) throw err;
    console.error("not a payable Lelantos address");
}
```

`transfer()` and `deposit()` validate `recipient` fully themselves. Validating in advance only improves the error shown to the user.

`decodeAddress(J, value)` in `@lelantos-org/sdk/primitives` is the synchronous form of `parseAddress`, for code that already holds a Jubjub context.

An invalid address raises `INVALID_ARGUMENT`. `parseAddress` and the wallet's operations omit the address from the message, so payee information does not reach application logs. Display the rejected value from your own state if needed.

## Next

- [Transfer](/guide/transfer)
- [Watch-only wallets](/guide/watch-only)
