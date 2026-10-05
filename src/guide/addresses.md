# Addresses

A shielded address is a **bech32m** string with the human-readable prefix `lelantos` and a 112-byte payload, `d || pk_d || pk || ck_d`.

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
| `d` | diversifier, 16 bytes; selects the base point `g_d` the other keys are built on |
| `pk_d` | diversified public key, `ivk · g_d`; the key notes are encrypted to |
| `pk` | public key, `Poseidon(TAG_PK, ivk, d)`; lets any sender build a valid note commitment for the recipient |
| `ck_d` | clue key, `dk · g_d`; lets a sender attach the FMD clue that makes the note detectable |

All four are required to send a detectable note. `ck_d` is the public half of the detection secret: holding an address lets you pay someone, not watch them.

## One account, many addresses

An account has one address per integer index in `[0, 2^32)`. `wallet.address` is the address at index 0, and `addressAt(index)` returns any other; an index outside the range rejects `INVALID_ARGUMENT`.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
const invoice = await wallet.addressAt(7);
//    ^?

(await wallet.addressAt(0)) === wallet.address; // true
```

| Property | Detail |
|---|---|
| Deterministic | an address is a function of the viewing key and the index: the same on every device, and on a [watch-only wallet](/guide/watch-only) of the account |
| Nothing to register | every address receives into the same wallet; `sync()` finds a note sent to any of them, and one detection key covers them all |
| Unlinkable | without the account's viewing key or detection key, two of its addresses cannot be told to share an owner |

Give each payer its own index, and payers cannot recognise a shared payee by comparing addresses.

## Deriving an address

Every address is derived deterministically from `nsk`, through `ivk`. Every [key source](/guide/wallet#key-source-and-chain-layer) yields the same addresses for the same input.

To derive an address without a wallet, use `addressFromViewingKey(P, J, viewingKey, index)` from `@lelantos-org/sdk/primitives`; `index` defaults to 0. `ownsAddress(P, J, ivk, decoded)` answers the reverse question: whether a decoded address belongs to a viewing key.

## Validating input

| Function | Checks | Cost |
|---|---|---|
| `shieldedAddress(value)` | prefix and bech32m character set | cheap; suitable for validation on each keystroke |
| `parseAddress(value)` | checksum, payload length, and that both points are in the prime-order subgroup and not the identity | async; loads the crypto context once; confirms the address is payable |

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
    const { d, pk_d, pk, ck_d } = await parseAddress(entered); // full validation
    console.log(d, pk_d, pk, ck_d);
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
