# How it fits together

The SDK sits between your application and three independent parties: a set of **contracts** on an EVM chain, and three **backend services** that index and relay on the chain's behalf. None of them holds your keys, and none of them can move your funds.

This page maps who talks to whom, and — just as importantly — what the SDK deliberately never asks.

## The whole system

<svg viewBox="0 0 780 520" width="100%" role="img" aria-label="Component map: your application calls the SDK, which talks to three backend services and, through its chain adapter, to the pool contracts." style="max-width:100%;height:auto">
  <defs>
    <marker id="ar" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 z" fill="var(--vp-c-text-3)"/>
    </marker>
  </defs>

  <rect x="240" y="14" width="300" height="42" rx="6" fill="var(--vp-c-brand-soft)" stroke="var(--vp-c-brand-1)"/>
  <text x="390" y="40" text-anchor="middle" font-size="14" fill="var(--vp-c-text-1)">Your application</text>

  <rect x="30" y="92" width="720" height="118" rx="8" fill="var(--vp-c-bg-soft)" stroke="var(--vp-c-brand-2)" stroke-dasharray="5 4"/>
  <text x="46" y="112" font-size="12" fill="var(--vp-c-brand-1)">@lelantos-org/sdk</text>

  <rect x="46" y="126" width="158" height="66" rx="5" fill="var(--vp-c-bg-elv)" stroke="var(--vp-c-border)"/>
  <text x="125" y="152" text-anchor="middle" font-size="13" fill="var(--vp-c-text-1)">NoteSource</text>
  <text x="125" y="170" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">FmdClient</text>

  <rect x="220" y="126" width="158" height="66" rx="5" fill="var(--vp-c-bg-elv)" stroke="var(--vp-c-border)"/>
  <text x="299" y="152" text-anchor="middle" font-size="13" fill="var(--vp-c-text-1)">Submitter</text>
  <text x="299" y="170" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">RelayerClient</text>

  <rect x="394" y="126" width="158" height="66" rx="5" fill="var(--vp-c-bg-elv)" stroke="var(--vp-c-border)"/>
  <text x="473" y="152" text-anchor="middle" font-size="13" fill="var(--vp-c-text-1)">Quoter</text>
  <text x="473" y="170" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">fetchSwapQuote</text>

  <rect x="568" y="126" width="166" height="66" rx="5" fill="var(--vp-c-bg-elv)" stroke="var(--vp-c-border)"/>
  <text x="651" y="152" text-anchor="middle" font-size="13" fill="var(--vp-c-text-1)">ChainAdapter</text>
  <text x="651" y="170" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">+ Prover (local)</text>

  <line x1="390" y1="56" x2="390" y2="88" stroke="var(--vp-c-text-3)" marker-end="url(#ar)"/>

  <text x="30" y="252" font-size="12" fill="var(--vp-c-text-3)">Backend services</text>
  <rect x="46" y="264" width="158" height="56" rx="5" fill="var(--vp-c-bg-alt)" stroke="var(--vp-c-border)"/>
  <text x="125" y="290" text-anchor="middle" font-size="13" fill="var(--vp-c-text-1)">fmd-webserver</text>
  <text x="125" y="307" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">read-only index</text>

  <rect x="220" y="264" width="158" height="56" rx="5" fill="var(--vp-c-bg-alt)" stroke="var(--vp-c-border)"/>
  <text x="299" y="290" text-anchor="middle" font-size="13" fill="var(--vp-c-text-1)">relayer</text>
  <text x="299" y="307" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">the only service that writes</text>

  <rect x="394" y="264" width="158" height="56" rx="5" fill="var(--vp-c-bg-alt)" stroke="var(--vp-c-border)"/>
  <text x="473" y="290" text-anchor="middle" font-size="13" fill="var(--vp-c-text-1)">metaquoter</text>
  <text x="473" y="307" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">swap routes</text>

  <line x1="125" y1="192" x2="125" y2="260" stroke="var(--vp-c-text-3)" marker-end="url(#ar)"/>
  <line x1="299" y1="192" x2="299" y2="260" stroke="var(--vp-c-text-3)" marker-end="url(#ar)"/>
  <line x1="473" y1="192" x2="473" y2="260" stroke="var(--vp-c-text-3)" marker-end="url(#ar)"/>

  <line x1="299" y1="320" x2="299" y2="386" stroke="var(--vp-c-text-3)" marker-end="url(#ar)"/>
  <text x="311" y="356" font-size="11" fill="var(--vp-c-text-3)">flushBatch · transfer · withdraw</text>

  <line x1="651" y1="192" x2="651" y2="386" stroke="var(--vp-c-text-3)" marker-end="url(#ar)"/>
  <text x="663" y="290" font-size="11" fill="var(--vp-c-text-3)">deposit</text>
  <text x="663" y="306" font-size="11" fill="var(--vp-c-text-3)">cancel</text>
  <text x="663" y="322" font-size="11" fill="var(--vp-c-text-3)">reads</text>

  <rect x="30" y="390" width="720" height="112" rx="8" fill="var(--vp-c-bg-soft)" stroke="var(--vp-c-border)" stroke-dasharray="5 4"/>
  <text x="46" y="410" font-size="12" fill="var(--vp-c-text-3)">EVM chain</text>

  <rect x="46" y="424" width="158" height="60" rx="5" fill="var(--vp-c-bg-elv)" stroke="var(--vp-c-border)"/>
  <text x="125" y="450" text-anchor="middle" font-size="13" fill="var(--vp-c-text-1)">MASP</text>
  <text x="125" y="468" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">the pool</text>

  <rect x="220" y="424" width="158" height="60" rx="5" fill="var(--vp-c-bg-elv)" stroke="var(--vp-c-border)"/>
  <text x="299" y="450" text-anchor="middle" font-size="13" fill="var(--vp-c-text-1)">NativeAdapter</text>
  <text x="299" y="468" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">ETH wrap / unwrap</text>

  <rect x="394" y="424" width="158" height="60" rx="5" fill="var(--vp-c-bg-elv)" stroke="var(--vp-c-border)"/>
  <text x="473" y="450" text-anchor="middle" font-size="13" fill="var(--vp-c-text-1)">SwapWrapper</text>
  <text x="473" y="468" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">atomic swap legs</text>

  <rect x="568" y="424" width="166" height="60" rx="5" fill="var(--vp-c-bg-elv)" stroke="var(--vp-c-border)"/>
  <text x="651" y="450" text-anchor="middle" font-size="13" fill="var(--vp-c-text-1)">Permit2</text>
  <text x="651" y="468" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">canonical, external</text>
</svg>

Three things are worth reading off that picture.

**Proving happens on your machine.** The prover is inside the SDK box, not out at a service. No secret — note values, `nsk`, the notes being spent — ever leaves the process.

**Only two parties write to the chain.** Your own signer broadcasts deposits and cancellations. The relayer broadcasts everything else. There is no third writer.

**The read path and the write path are different services.** `fmd-webserver` is read-only and never sees a transaction; the relayer never serves note data.

## Who the SDK talks to

| Party | SDK entry point | What it is asked for |
|---|---|---|
| **fmd-webserver** | `FmdClient`, `NoteSource` | encrypted notes, commitment chunks, nullifier chunks, sync watermarks |
| **relayer** | `RelayerClient`, `Submitter`, `DepositStream` | chain registry, fee estimates, spend submission, deposit-flush events |
| **metaquoter** | `fetchSwapQuote` | best swap route and `minOut` |
| **EVM chain** | `ChainAdapter` | asset registry, fee rate, deposit broadcast, escrow reads |

The deployment also runs an explorer indexer, a risk-screening API, and a price feed. **The SDK contacts none of them** — they are not on any wallet path.

## What the SDK never asks

Several requests are absent by design, because making them would identify you to whoever answered.

| Never asked | Why | What happens instead |
|---|---|---|
| "Is nullifier `N` spent?" | naming a nullifier names a note you own | the whole spent set is mirrored and filtered locally |
| "Give me the Merkle path for leaf `i`" | the leaf index identifies the note you are spending | the tree is rebuilt locally from an append-only chunk feed |
| "Which notes are mine?" | that is the entire privacy property | every encrypted note is downloaded and trial-decrypted locally |

The third is negotiable and the other two are not. [FMD](/guide/sync#sync-strategies) lets you delegate detection to the server in exchange for far less bandwidth — a deliberate, permanent, and non-default trade.

## Shielding: the path you broadcast

A deposit is the one operation your own signer sends. It is also the one with a settlement step after mining: escrowed funds are not in the tree until the relayer folds them in.

<svg viewBox="0 0 780 360" width="100%" role="img" aria-label="Deposit sequence: the wallet signs and calls MASP.deposit, the relayer flushes the batch, and the wallet syncs the note from fmd-webserver." style="max-width:100%;height:auto">
  <defs>
    <marker id="ar2" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 z" fill="var(--vp-c-text-3)"/>
    </marker>
  </defs>

  <rect x="14" y="12" width="150" height="34" rx="5" fill="var(--vp-c-brand-soft)" stroke="var(--vp-c-brand-1)"/>
  <text x="89" y="34" text-anchor="middle" font-size="12" fill="var(--vp-c-text-1)">Wallet (SDK)</text>
  <rect x="240" y="12" width="120" height="34" rx="5" fill="var(--vp-c-bg-alt)" stroke="var(--vp-c-border)"/>
  <text x="300" y="34" text-anchor="middle" font-size="12" fill="var(--vp-c-text-1)">MASP</text>
  <rect x="440" y="12" width="120" height="34" rx="5" fill="var(--vp-c-bg-alt)" stroke="var(--vp-c-border)"/>
  <text x="500" y="34" text-anchor="middle" font-size="12" fill="var(--vp-c-text-1)">relayer</text>
  <rect x="610" y="12" width="150" height="34" rx="5" fill="var(--vp-c-bg-alt)" stroke="var(--vp-c-border)"/>
  <text x="685" y="34" text-anchor="middle" font-size="12" fill="var(--vp-c-text-1)">fmd-webserver</text>

  <line x1="89" y1="46" x2="89" y2="344" stroke="var(--vp-c-divider)" stroke-dasharray="3 4"/>
  <line x1="300" y1="46" x2="300" y2="344" stroke="var(--vp-c-divider)" stroke-dasharray="3 4"/>
  <line x1="500" y1="46" x2="500" y2="344" stroke="var(--vp-c-divider)" stroke-dasharray="3 4"/>
  <line x1="685" y1="46" x2="685" y2="344" stroke="var(--vp-c-divider)" stroke-dasharray="3 4"/>

  <rect x="42" y="66" width="94" height="26" rx="4" fill="var(--vp-c-bg-elv)" stroke="var(--vp-c-brand-2)"/>
  <text x="89" y="84" text-anchor="middle" font-size="11" fill="var(--vp-c-text-1)">sign permit</text>
  <text x="150" y="84" font-size="11" fill="var(--vp-c-text-3)">1 — EIP-2612 / Permit2 witness, bound to this deposit</text>

  <line x1="89" y1="120" x2="294" y2="120" stroke="var(--vp-c-text-3)" marker-end="url(#ar2)"/>
  <text x="192" y="114" text-anchor="middle" font-size="11" fill="var(--vp-c-text-1)">2 deposit() — funds escrowed</text>

  <line x1="300" y1="152" x2="95" y2="152" stroke="var(--vp-c-text-3)" stroke-dasharray="4 3" marker-end="url(#ar2)"/>
  <text x="197" y="146" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">DepositEscrowed(id) — mined, not yet spendable</text>

  <line x1="500" y1="196" x2="306" y2="196" stroke="var(--vp-c-text-3)" marker-end="url(#ar2)"/>
  <text x="403" y="190" text-anchor="middle" font-size="11" fill="var(--vp-c-text-1)">3 flushBatch()</text>

  <line x1="500" y1="234" x2="95" y2="234" stroke="var(--vp-c-text-3)" stroke-dasharray="4 3" marker-end="url(#ar2)"/>
  <text x="297" y="228" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">4 SSE: flushed — the note is now in the tree</text>

  <line x1="300" y1="276" x2="679" y2="276" stroke="var(--vp-c-text-3)" stroke-dasharray="4 3" marker-end="url(#ar2)"/>
  <text x="490" y="270" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">logs indexed</text>

  <line x1="685" y1="316" x2="95" y2="316" stroke="var(--vp-c-text-3)" marker-end="url(#ar2)"/>
  <text x="390" y="310" text-anchor="middle" font-size="11" fill="var(--vp-c-text-1)">5 sync() — encrypted notes + commitment chunks</text>
</svg>

Steps 4 and 5 are why a freshly deposited note is not immediately spendable, and why [`DepositStream`](/guide/deposit#waiting-for-the-relayer-to-settle) exists.

## Spending: the path the relayer broadcasts

A transfer, withdraw, or swap is never sent by your signer. The spend proof binds the relayer's address, so the pool rejects a transaction that any other account submits.

<svg viewBox="0 0 780 340" width="100%" role="img" aria-label="Spend sequence: the wallet syncs, quotes the fee, proves locally, and submits to the relayer, which attaches a tree-update proof and calls the pool." style="max-width:100%;height:auto">
  <defs>
    <marker id="ar3" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 z" fill="var(--vp-c-text-3)"/>
    </marker>
  </defs>

  <rect x="14" y="12" width="150" height="34" rx="5" fill="var(--vp-c-brand-soft)" stroke="var(--vp-c-brand-1)"/>
  <text x="89" y="34" text-anchor="middle" font-size="12" fill="var(--vp-c-text-1)">Wallet (SDK)</text>
  <rect x="240" y="12" width="120" height="34" rx="5" fill="var(--vp-c-bg-alt)" stroke="var(--vp-c-border)"/>
  <text x="300" y="34" text-anchor="middle" font-size="12" fill="var(--vp-c-text-1)">MASP</text>
  <rect x="440" y="12" width="120" height="34" rx="5" fill="var(--vp-c-bg-alt)" stroke="var(--vp-c-border)"/>
  <text x="500" y="34" text-anchor="middle" font-size="12" fill="var(--vp-c-text-1)">relayer</text>
  <rect x="610" y="12" width="150" height="34" rx="5" fill="var(--vp-c-bg-alt)" stroke="var(--vp-c-border)"/>
  <text x="685" y="34" text-anchor="middle" font-size="12" fill="var(--vp-c-text-1)">fmd-webserver</text>

  <line x1="89" y1="46" x2="89" y2="324" stroke="var(--vp-c-divider)" stroke-dasharray="3 4"/>
  <line x1="300" y1="46" x2="300" y2="324" stroke="var(--vp-c-divider)" stroke-dasharray="3 4"/>
  <line x1="500" y1="46" x2="500" y2="324" stroke="var(--vp-c-divider)" stroke-dasharray="3 4"/>
  <line x1="685" y1="46" x2="685" y2="324" stroke="var(--vp-c-divider)" stroke-dasharray="3 4"/>

  <line x1="685" y1="82" x2="95" y2="82" stroke="var(--vp-c-text-3)" marker-end="url(#ar3)"/>
  <text x="390" y="76" text-anchor="middle" font-size="11" fill="var(--vp-c-text-1)">1 sync() — notes, commitment chunks, nullifier chunks</text>

  <line x1="500" y1="118" x2="95" y2="118" stroke="var(--vp-c-text-3)" marker-end="url(#ar3)"/>
  <text x="297" y="112" text-anchor="middle" font-size="11" fill="var(--vp-c-text-1)">2 quoteFee() — what relaying costs</text>

  <rect x="30" y="146" width="118" height="44" rx="4" fill="var(--vp-c-bg-elv)" stroke="var(--vp-c-brand-2)"/>
  <text x="89" y="164" text-anchor="middle" font-size="11" fill="var(--vp-c-text-1)">select notes</text>
  <text x="89" y="180" text-anchor="middle" font-size="11" fill="var(--vp-c-text-1)">Groth16 prove</text>
  <text x="162" y="172" font-size="11" fill="var(--vp-c-text-3)">3 — entirely local; no secret leaves the process</text>

  <line x1="89" y1="218" x2="494" y2="218" stroke="var(--vp-c-text-3)" marker-end="url(#ar3)"/>
  <text x="292" y="212" text-anchor="middle" font-size="11" fill="var(--vp-c-text-1)">4 submit() — proof + public inputs + shielded fee note</text>

  <line x1="500" y1="256" x2="306" y2="256" stroke="var(--vp-c-text-3)" marker-end="url(#ar3)"/>
  <text x="403" y="250" text-anchor="middle" font-size="11" fill="var(--vp-c-text-1)">5 transfer() / withdraw()</text>
  <text x="403" y="272" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">+ tree-update SNARK</text>

  <line x1="300" y1="304" x2="679" y2="304" stroke="var(--vp-c-text-3)" stroke-dasharray="4 3" marker-end="url(#ar3)"/>
  <text x="490" y="298" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">nullifiers + commitments indexed</text>
</svg>

The relayer sees a valid proof, its public inputs, and the fee note addressed to it. It does not learn which notes were spent, who the payee is, or the amount — those are the circuit's private inputs. What it does learn is your IP address and the timing of your submission.

::: tip The relayer is a pluggable, not a dependency
`Submitter` is an interface. Race several relayers, route through your own, or broadcast directly from an account you control — see [Pluggable interfaces](/guide/interfaces#custom-submitter). The same is true of `NoteSource`: the FMD server is the default index, not the only possible one.
:::

## What each party can and cannot see

| Party | Learns | Cannot learn |
|---|---|---|
| **fmd-webserver** | that some client fetched a page of the public feed | which notes are yours — under the default `full` strategy |
| **relayer** | your IP, submission timing, the fee it is paid | spent notes, payee, amount |
| **metaquoter** | that someone wants a route for a token pair and size | who is asking, or whether the swap happens |
| **the chain** | a deposit's payer and amount; a withdraw's recipient and amount | anything about a shielded transfer beyond its existence |

Shielding and unshielding are the visible edges. What happens between them is not.

## Next

- [Concepts](/guide/concepts) — notes, nullifiers, the tree, FMD
- [Syncing](/guide/sync) — the read path in detail
- [Deposit](/guide/deposit) — the write path in detail
- [Architecture](/guide/architecture) — how the SDK's own code is layered
