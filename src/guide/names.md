# Names

A handle is a short name, such as `alice`, that publishes one of an account's shielded addresses. A payer who knows the handle looks the address up instead of copying 195 characters.

Handles live in the `LelantosNameRegistrar` contract. Each ENS parent name the deployment holds serves them as subnames, so `alice` is also `alice.lelantos.xyz` in any ENS client. The SDK reads the registrar directly and never resolves through ENS.

Registration is a spend: it is paid from shielded funds and broadcast by the relayer, so it needs no EVM account and names none.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
const result = await wallet.registerName({ label: "alice" });
//    ^?

if (result.registered) {
    console.log(result.label, "now resolves to", result.address);
}
```

Registering needs `capabilities.registerName`: a prover, a relayer that relays `GenericCallWrapper` executions, a `nameRegistrarAddress` in the network preset, and a chain layer that can read the registrar.

::: warning A handle is public and permanent
The handle, the address published under it, and the time of registration are on chain for everyone, and stay in chain history after the record is cleared. A handle cannot be transferred or released. Ask the user to confirm before calling `registerName`.
:::

## Which names are genuine

A handle is genuine only under the parent names the deployment lists (`nameParents` in the registry's `/v1/chains`), and its address is the text record `xyz.lelantos.address`.

`lelantos.eth` is **not** one of those parents: that ENS name belongs to a third party, who decides what `anything.lelantos.eth` resolves to. Do not accept it, and do not accept a name under any parent you were not configured with. `parseHandle` enforces this:

```ts twoslash
import { parseHandle } from "@lelantos-org/sdk/protocol";

const parents = ["lelantos.xyz"]; // from the registry, never from user input

parseHandle("alice", parents); // { label: "alice", parent: undefined }
parseHandle("@Alice", parents); // { label: "alice", parent: undefined }
parseHandle("alice.lelantos.xyz", parents); // { label: "alice", parent: "lelantos.xyz" }

try {
    parseHandle("alice.lelantos.eth", parents);
} catch (err) {
    // INVALID_ARGUMENT, details.reason "parent"
}
```

A label is 3 to 32 characters of `a-z`, `0-9` and single hyphens, and does not start or end with a hyphen. `isNameLabel` checks one; case is folded by `parseHandle` and by `registerName`.

## The published address

`registerName` publishes `wallet.publishedAddress()`: the account's address at `PUBLISHED_DIVERSIFIER_INDEX`, the last index. It is not `wallet.address`.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
import { PUBLISHED_DIVERSIFIER_INDEX } from "@lelantos-org/sdk/primitives";

const published = await wallet.publishedAddress();
published === (await wallet.addressAt(PUBLISHED_DIVERSIFIER_INDEX)); // true
published === wallet.address; // false
```

The index is reserved so that no address the account hands out elsewhere can be matched to the one it publishes. Keep giving payers other indices, as [Addresses](/guide/addresses#one-account-many-addresses) describes. Notes sent to the published address arrive in the same wallet and need nothing extra to be found.

## Registering

| `registerName` option | Description |
|---|---|
| `label` | the handle; a name under a parent is refused, pass the bare label |
| `asset` | the plain (not yield-bearing) pool asset of the registrar's fee token, unshielded to pay the fee. Looked up from the token by default, which needs an asset list the wallet may not have: pass it when the wallet rejects `INVALID_ARGUMENT` on `asset`, and where registration is free |
| `deadline` | unix seconds after which the wrapper refunds instead of registering |
| `feeAsset`, `maxFee`, `selection`, `autoConsolidate`, `signal`, `onPhase`, `opId` | as for [Transfer](/guide/transfer) |

The label is checked against the registrar before anything is proven:

| Outcome | Code | What to do |
|---|---|---|
| the label is malformed | `INVALID_ARGUMENT`, `argument: "name"` | show the label rule |
| the label is already registered | `INVALID_ARGUMENT`, `argument: "label"`, `details.reason: "taken"` | ask for another |
| the label is free | — | the registration runs |

The operation unshields the registrar's fee plus the smallest change the pool will re-shield. From the wrapper's single-use clone it approves the fee and calls `register`, then re-shields the change. Three fees are paid:

| Fee | Paid to | Where it shows |
|---|---|---|
| registration | the registrar's treasury | `registrationFee` |
| relayer | the relayer, for the transaction | `fees.relayer`; quote it beforehand with `quoteFee("registerName")` |
| protocol | the pool, on the unshield | `fees.protocol` |

## Reading the result

A registration that landed did not necessarily register. If another registration of the same label lands first, or the registrar's fee rose after the wallet built the intent, the calls fail and the wrapper re-shields the input as a refund note. Only the relayer's and the pool's fees are spent.

| Field | Meaning |
|---|---|
| `registered` | `true`: the handle is claimed. `false`: the calls failed and the input was refunded. `undefined`: the transaction's receipt could not be read |
| `label`, `address` | the handle, case-folded, and the address published under it |
| `controller` | the address of the key that controls the handle |
| `registrationFee` | what the registrar charged; `null` where registration is free |
| `changeCommitment`, `refundCommitment` | exactly one of the two lands; await it with `awaitCommitments` |
| `deadline`, `fees`, `spent`, `change`, `txHash`, `opId` | as for a swap |

```ts twoslash
// ---cut-start---
import type { RegisterNameResult, WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const result: RegisterNameResult;
// ---cut-end---
if (result.registered === false) {
    // The funds are on their way back as the refund note.
    await wallet.awaitCommitments([result.refundCommitment]);
}
```

When `registered` is `undefined`, look the handle up: it is registered by this call if its `controller` is `result.controller`.

## Looking a handle up

`readNameRecord` reads a handle with any viem client. It needs no wallet.

```ts twoslash
import { parseAddress } from "@lelantos-org/sdk";
import { readNameRecord } from "@lelantos-org/sdk/advanced";
import { parseHandle } from "@lelantos-org/sdk/protocol";
import { createPublicClient, http } from "viem";

declare const registrar: string; // nameRegistrarAddress, from the registry
declare const parents: string[]; // nameParents, from the registry

const client = createPublicClient({ transport: http("https://rpc.example.com") });
const { label } = parseHandle("alice.lelantos.xyz", parents);
const record = await readNameRecord(client, registrar, label);

if (record.registered && record.value !== "") {
    await parseAddress(record.value); // rejects unless it is a payable shielded address
}
```

| `NameRecord` field | Meaning |
|---|---|
| `registered` | whether the label is taken |
| `value` | the published address; empty when the holder cleared it |
| `controller` | the address whose signature changes the value |
| `nonce` | how many times the value has changed |

The registrar stores the value without parsing it. Validate it with [`parseAddress`](/guide/addresses#validating-input) before paying it, and treat a value that fails as no address.

A lookup is a request that names the payee. Whoever serves the RPC learns which handle was read, and can match a lookup to a payment that follows it. Look a handle up when a contact is saved, not each time it is paid.

## The controller key

A handle belongs to a key, not to an account on chain. `wallet.nameControllerKey()` returns it: a secp256k1 key derived from the account's seed, the same on every device.

| The key | Detail |
|---|---|
| Authorises | replacing the published value, or clearing it, with a signed `setValue` on the registrar |
| Receives | the refund of a registration escrow that is cancelled instead of flushed, and any unused dust, at its address |
| Is linked to | nothing: its address is the handle's public `controller`, and no other account of the user appears in a registration |

Treat the private key as the handle. Whoever holds it can redirect payments made to the handle by publishing another address.

## Next

- [Addresses](/guide/addresses)
- [Privacy checklist](/guide/privacy)
- [Fees](/guide/fees)
