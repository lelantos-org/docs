# Privacy checklist

The pool hides which notes a transaction spends, who receives a transfer, and transfer amounts. Other data remains observable, and some SDK options reduce privacy. This page lists what an application should configure and communicate to users.

## What is public

| Data | Visible to | Details |
|---|---|---|
| Deposit payer and amount | everyone (on chain) | [Denominations](/guide/denominations#what-the-ladder-prevents) |
| Withdrawal recipient and gross amount | everyone (on chain) | [Withdraw](/guide/withdraw) |
| That a shielded transfer occurred, and when | everyone (on chain) | [How it fits together](/guide/system#visibility-by-party) |
| Submitter IP address and timing | relayer | [How it fits together](/guide/system#spend-flow) |
| Requested token pair and size | metaquoter | [Swap](/guide/swap) |
| A handle, the address published under it, and when it was registered | everyone (on chain) | [Names](/guide/names) |
| Which handle is looked up, and when | the RPC serving the lookup | [Names](/guide/names#looking-a-handle-up) |
| RPC reads, including your deposit account | your RPC provider | [Networks](/guide/networks#rpc-endpoint) |
| Incoming notes (with `matches` strategy) | FMD server | [Syncing](/guide/sync#sync-strategies) |

## Checklist

### Amounts

- **Withdraw denominations.** Use `previewWithdraw` and show `onLadder: false` to the user; offer `suggestion` instead of changing the amount. A `net` withdrawal is almost never on the ladder. See [Denominations](/guide/denominations#building-a-picker).
- **Keep ladders enabled** (`denominations: true`, the default).
- **Do not round the net amount.** Choosing `publicOut` so the recipient receives a round figure makes `publicOut` distinctive.
- **Avoid distinctive deposit amounts** where the user can choose, since deposits are public.
- **Consider `DenominationCoinSelector`** (via `createWallet`) to reduce change, and run `redenominate` to keep notes on the ladder.

### Timing and linkage

- **Spread large withdrawals** across blocks and recipients; several withdrawals to one address are linked.
- **Keep the spend cooldown** (`selection.cooldownBlocks`, default 1) and use a chain adapter that implements `blockNumber`, which the cooldown requires. See [Spend cooldown](/guide/notes#spend-cooldown).
- **Keep the default SFRT selector.** Largest-first selection creates a pattern that links spends. See [Pluggable interfaces](/guide/interfaces#custom-coin-selector).
- **Use `recipientCommitment`**, not an output index, to identify the payee note; outputs are shuffled. See [Transfer](/guide/transfer#reading-the-result).
- **Give each payer its own address** with `addressAt(index)`. Payers comparing addresses then cannot tell they pay the same account. See [Addresses](/guide/addresses#one-account-many-addresses).
- **Publish only the reserved address under a handle**, which `registerName` does, and hand it out nowhere else. A registration re-shields its change in the same public transaction as that address, so the change is kept to one unit.
- **Look a handle up once, when a contact is saved**, not before each payment. A lookup followed by a spend lets whoever served the lookup pair them. See [Names](/guide/names#looking-a-handle-up).
- **Accept only names under the parents your deployment lists.** `lelantos.eth` is not one of them. See [Names](/guide/names#which-names-are-genuine).

### Detection and keys

- **Keep the `full` sync strategy** unless bandwidth requires `matches`. Delegating detection cannot be revoked. See [Sync strategies](/guide/sync#sync-strategies).
- **In a watch-only wallet, leave `allowDetectionKeyRelease` unset.** The decision belongs to the account owner. See [Watch-only wallets](/guide/watch-only#differences-from-a-spending-wallet).
- **Treat viewing keys as permanent disclosure.** They cannot be revoked. See [Watch-only wallets](/guide/watch-only).
- **Treat a payment proof as disclosure of one payment.** With the payee's address, its holder reads that output's asset, value and memo; it reveals nothing else. Send it only to whoever should learn it. See [Proving a payment](/guide/transfer#proving-a-payment).
- **Treat a handle's controller key as the handle.** Its holder can publish another address under it. Clearing a record stops it resolving but does not erase it from chain history. See [Names](/guide/names#the-controller-key).
- **Treat a claim-link key as the funds.** Whoever holds it can spend what the link holds. See [Claim-link keys](/guide/transfer#claim-link-keys).
- **Derive subscription tokens from `ivk`**, and store the epoch after rotating. See [Rotating the token](/guide/sync#rotating-the-token).

### Network

- **Route traffic if IP privacy matters.** Pass `http: { fetch }` to send all SDK service requests through a proxy, and point `rpcUrl` at an endpoint you trust. See [HTTP options](/guide/wallet#http-options).
- **Do not query servers per note.** Custom `NoteSource` implementations must not request Merkle paths or nullifier status for specific notes. See [Custom note source](/guide/interfaces#custom-note-source).

### Local data

- **Encrypt the notes file at rest.** It links its holder to every commitment the wallet owns. See [Custom storage](/guide/storage#contents).
- **Do not log user input verbatim.** SDK error messages omit rejected addresses and values; keep application logs consistent with that.

## Next

- [Denominations](/guide/denominations)
- [How it fits together](/guide/system)
