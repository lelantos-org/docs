# Glossary

Terms used throughout this guide and the [API reference](/reference/).

## Keys

| Term | Definition |
|---|---|
| `nsk` | Spending key. A field element from which every other key is derived. Holding `nsk` is required to spend. See [Connecting a wallet](/guide/wallet). |
| `ivk` | Incoming viewing key. Derived from `nsk`; decrypts notes sent to the account. |
| `nk` | Nullifier key. Derived from `nsk`; computes nullifiers. Included in a full viewing key. |
| `pk` | Public key. Binds a note commitment to its owner. |
| `pk_d` | Diversified public key. The ECDH target that notes are encrypted to. |
| `ck` | Clue key. Lets a sender attach an FMD clue to a note. |
| `dk` | Detection key secret. Tests FMD clues; can be delegated to a server. |
| Incoming viewing key (IVK) | Encoded `ivk` (`lelantosivk1…`). Reads incoming notes; cannot tell which are spent. See [Watch-only wallets](/guide/watch-only). |
| Full viewing key (FVK) | An incoming viewing key plus `nk` (`lelantosfvk1…`). Reads incoming notes and their spent status. |
| Shielded address | Bech32m string with prefix `lelantos` encoding `pk_d`, `pk`, and `ck`. See [Addresses](/guide/addresses). |

## Pool and transactions

| Term | Definition |
|---|---|
| MASP | Multi-Asset Shielded Pool. The contract holding shielded funds for every registered asset. |
| Note | A shielded value: one asset, one amount, one owner. Balances are sums of unspent notes. |
| Commitment (`cm`) | The public hash of a note, appended to the Merkle tree. |
| Nullifier (`nf`) | A value derived from a note and `nk`, published when the note is spent. The pool rejects a repeated nullifier. |
| Merkle tree | Append-only tree of note commitments. A spend proves its inputs are in the tree. |
| Tree depth (`treeDepth`) | Height of the Merkle tree. Must match the deployed contract and circuit. |
| Deposit (shield) | Moving tokens from a public balance into the pool. |
| Transfer | Moving value between shielded addresses. Publishes no amount. |
| Withdraw (unshield) | Moving value from the pool to a public address. |
| Swap | Atomic unshield, trade, and re-shield. See [Swap](/guide/swap). |
| Credit note | The note created by a swap's re-shield leg when the trade fills; `quote.credit` is its value. |
| Refund note | The note a swap re-shields in the input asset when the trade fails or passes its deadline. |
| Escrow | Holding state of a mined deposit before the relayer adds it to the tree; `DepositResult.escrow` identifies it. |
| Flush | The relayer's `flushBatch` transaction, which adds escrowed deposits to the tree. |
| `publicIn` | A deposit's public amount, in circuit units. |
| `publicOut` | A withdrawal's public gross amount, in circuit units. |
| Change | Output notes returning unspent input value to the sender. |
| Consolidation | A self-transfer that merges several small notes into fewer notes. |
| Cover | A set of notes whose total is at least the target amount. |
| Dust | Notes below the selector's dust threshold. |

## Amounts

| Term | Definition |
|---|---|
| Circuit units | The integer amounts used inside the pool (`CircuitAmount`): note values, `publicIn`, `publicOut`. |
| Base units | ERC-20 base units (`10 ** decimals` per token; `TokenAmount`). |
| Gross / net | A withdrawal's or swap's amount before (`gross`, published) or after (`net`, delivered) the protocol fee. |
| `Money` | An amount in both integer spaces, `{ asset, amount, baseUnits }`, as results report it. |
| `scale` | Per-asset multiplier from circuit units to token units, set in the registry. |
| `index` | Per-asset yield index, scaled by `RAY`. Equals `RAY` when the asset earns no yield. |
| `RAY` | `10n ** 27n`, the fixed-point base for `index`. |
| `rate` | The pool's `{ gross, supply }` pair for a yield-bearing asset. Used to size payments. |
| bps | Basis points; 1 bps = 0.01%. |
| `depositBps`, `withdrawBps` | Per-asset protocol fee rates for each direction. See [Fees](/guide/fees). |
| Denomination | A fixed withdrawal amount from an asset's ladder. |
| Ladder | An asset's ascending list of denominations. See [Denominations](/guide/denominations). |

## Circuit and proving

| Term | Definition |
|---|---|
| Circuit shape | Number of input and output notes a proof supports. The shipped shape is `TRANSACT_4X6`. |
| `nIn`, `nOut` | Input and output counts of the circuit shape (4 and 6). |
| Groth16 | The zero-knowledge proof system used for spends. |
| Witness | The private inputs to a proof, computed before proving. |
| zkey | The proving key file (~48 MB for 4x6). |
| Prover artifacts | The circuit `.wasm` and the `.zkey` needed to prove. |
| Output shuffling | Randomizing the order of output notes so the payee and fee outputs cannot be identified by position. |

## Detection and sync

| Term | Definition |
|---|---|
| Trial decryption | Attempting to decrypt every note with `ivk` to find the wallet's notes. |
| FMD | Fuzzy message detection. Clues let a detection key find probable matches with a tunable false-positive rate. |
| γ (gamma) | FMD precision parameter; controls the false-positive rate. |
| Sync strategy | `full` (download all notes, decrypt locally) or `matches` (server-side detection). See [Syncing](/guide/sync#sync-strategies). |
| Subscription token | Bearer credential identifying a `matches` subscription. |
| Cursor | Position in the note feed from which the next sync resumes. |
| Spent set | The local copy of every published nullifier. |

## Services and selection

| Term | Definition |
|---|---|
| Relayer | Service that submits spends on chain, pays gas, and flushes deposits. Paid by a shielded fee note. |
| `fmd-webserver` | Read-only indexer serving encrypted notes, tree chunks, and nullifier chunks. |
| Metaquoter | Service returning swap routes and `minOut`. |
| `NativeAdapter` | Contract that wraps and unwraps ETH for native deposits and withdrawals. |
| `SwapWrapper` | Contract that executes a swap's trade between its two legs. |
| Permit2 | Uniswap's token-approval contract, used to authorize deposit transfers. |
| SFRT | Smallest-First, Random Tiebreak. The default coin-selection algorithm. |
| Spend cooldown | Minimum age in blocks before a received note can be spent. |
| Lease | A note selected by a spend in flight, withheld from other spends until it settles. |
| `opId` | Correlation id of one operation, on its phases, result, errors, and `state().ops`. |
