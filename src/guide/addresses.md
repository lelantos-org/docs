# Addresses

A Lelantos shielded address is **bech32m** with the HRP `lelantos` and a 96-byte payload: `pk_d || pk || ck`.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
wallet.address;
// ^?
```

All three components are needed:

| Component | Purpose |
|---|---|
| `pk_d` | diversified public key — where the note is paid |
| `pk` | public key |
| `ck` | clue key — lets a sender construct the FMD clue that makes the note detectable |

Without `ck`, a sender cannot produce a detectable note, which is why the address is 96 bytes rather than 32.

::: danger Legacy `sswap1…` / `sswap2…` addresses are rejected
They are not a different encoding of the same thing — they carry a **different payload** and cannot be upgraded in place. An address that does not parse raises `InvalidArgumentError`, and the rejected value never appears in the error message: it would reach logs verbatim. See [Errors](/guide/errors).
:::

## Deriving an address

The address derives deterministically from `nsk`, so every key source in [Creating a wallet](/guide/wallet) produces the same address for the same seed.

`addressFromSpendingKey` is exported from `@lelantos-org/sdk/keys` if you need it without a wallet.

## Validating what a user typed

Two levels of check, and which you want depends on how much work you are prepared to do.

`shieldedAddress(value)` checks the HRP and the bech32m charset — cheap enough for keystroke-level validation. `decodeAddress(J, value)` additionally verifies the checksum and that both point slots are on the curve, which is what actually proves an address is payable.

```ts twoslash
// ---cut-start---
declare const entered: string;
// ---cut-end---
import { isWalletError, shieldedAddress } from "@lelantos-org/sdk";
import { cryptoContext } from "@lelantos-org/sdk/crypto";
import { decodeAddress } from "@lelantos-org/sdk/keys";

function looksValid(value: string): boolean {
    try {
        shieldedAddress(value); // HRP + charset only
        return true;
    } catch {
        return false;
    }
}

const { J } = await cryptoContext();

try {
    const { pk_d, pk, ck } = decodeAddress(J, entered); // full validation
    console.log(pk_d, pk, ck);
} catch (e) {
    if (!isWalletError(e, "INVALID_ARGUMENT")) throw e;
    console.error("not a payable Lelantos address");
}
```

`transfer()` decodes the address itself, so validating first is about giving the user a better message — not about safety.

::: tip The rejected address is never in the error message
Error messages reach application logs verbatim, and an address names a payee. `InvalidArgumentError` reports `argument` and nothing more, so you have to echo the offending value yourself if you want it shown.
:::

## Next

- [Creating a wallet](/guide/wallet)
- [Transfer](/guide/transfer)
