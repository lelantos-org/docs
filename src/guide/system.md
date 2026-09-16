# How it fits together

The SDK communicates with **contracts** on an EVM chain and three **backend services** that index and relay transactions. None of them holds keys or can move funds.

This page shows which component talks to which, what each request contains, and which requests the SDK never makes.

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
  <text x="473" y="170" text-anchor="middle" font-size="11" fill="var(--vp-c-text-3)">quoteSwap</text>

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

- **Proving is local.** The prover runs inside the SDK. Secrets — `nsk`, note values, the notes being spent — never leave the process.
- **Two parties write to the chain.** Your signer broadcasts deposits and cancellations. The relayer broadcasts all other transactions.
- **Reads and writes use different services.** `fmd-webserver` is read-only and never receives transactions. The relayer does not serve note data.

## Who the SDK talks to

| Party | SDK entry point | Requests |
|---|---|---|
| **fmd-webserver** | `FmdClient`, `NoteSource` | encrypted notes, commitment chunks, nullifier chunks, sync positions |
| **relayer** | `RelayerClient`, `Submitter`, `DepositStream` | chain registry, fee estimates, swap wrapper address, spend submission, deposit flush events |
| **metaquoter** | `quoteSwap`, `fetchSwapQuote` | swap route and `minOut` |
| **EVM chain** | `ChainAdapter` | asset registry, fee rates, deposit broadcast, escrow state |

The deployment also runs an explorer indexer, a risk-screening API, and a price feed. The SDK does not contact them.

## Requests the SDK never makes

These requests would identify the wallet's notes to the server, so the SDK performs the work locally:

| Request not made | Reason | Local alternative |
|---|---|---|
| "Is nullifier `N` spent?" | a nullifier identifies a note the wallet owns | download the full spent set and check locally |
| "Merkle path for leaf `i`" | the leaf index identifies the note being spent | rebuild the tree from the append-only chunk feed |
| "Which notes are mine?" | reveals the wallet's notes | download all encrypted notes and trial-decrypt locally |

The third can be delegated: the [`matches` sync strategy](/guide/sync#sync-strategies) sends a detection key to the server to reduce bandwidth. The delegation is opt-in and cannot be revoked.

## Deposit flow

A deposit is broadcast by your signer. After it is mined, the funds are in escrow until the relayer adds the note to the tree.

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

A new note is spendable only after steps 4 and 5. [`awaitDeposit`](/guide/deposit#waiting-for-the-relayer) waits for both; `DepositStream` observes step 4 directly.

The relayer's fee for step 4 is part of the deposit. Every deposit creates two leaves, both bound by the signature in step 1:

- the depositor's note;
- a fee note addressed to the relayer.

The fee note can use a different registered asset (`feeAsset`). The request records it as `feeAssetId`, and the pool transfers both tokens from the payer in the same transaction. The protocol fee is always in the deposited asset. If the relayer charges nothing, the fee leaf is a zero-value note to the depositor and `feeAssetId` is `0`.

## Spend flow

Transfers, withdrawals, and swaps are broadcast by the relayer, never by your signer. The spend proof binds the relayer's address, so the pool rejects the transaction from any other sender.

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

The relayer receives the proof, its public inputs, and its fee note. The spent notes, payee, and amount are private circuit inputs and are not revealed. The relayer does see the submitter's IP address and the submission time.

The relayer and the FMD server are defaults, not requirements. `Submitter` and `NoteSource` are interfaces: you can use several relayers, run your own, submit directly from your own account, or use a different indexer. See [Pluggable interfaces](/guide/interfaces#custom-submitter).

## Visibility by party

| Party | Can see | Cannot see |
|---|---|---|
| **fmd-webserver** | that a client fetched a page of the public feed | which notes belong to the wallet (with the default `full` strategy) |
| **relayer** | IP address, submission time, its fee | spent notes, payee, amount |
| **metaquoter** | the token pair and size of a requested route | the requester's identity, and whether the swap is executed |
| **the chain** | deposit payer and amount; withdrawal recipient and amount | the contents of shielded transfers, other than that they occurred |

Only deposits and withdrawals are publicly visible. Shielded transfers are not.

## Next

- [Concepts](/guide/concepts)
- [Syncing](/guide/sync) — the read path
- [Deposit](/guide/deposit) — the deposit path
- [Architecture](/guide/architecture) — the SDK's module structure
