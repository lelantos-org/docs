---
layout: home
hero:
  name: Lelantos SDK
  text: Shielded transfers on EVM
  tagline: Deposit, transfer, swap and withdraw in a Multi-Asset Shielded Pool. Client-side proving, no trusted intermediary.
  image:
    src: /icon.svg
    alt: Lelantos
  actions:
    - theme: brand
      text: Quickstart
      link: /guide/quickstart
    - theme: alt
      text: Concepts
      link: /guide/concepts
features:
  - title: One call per operation
    details: deposit, transfer, withdraw, swap, sync, balance. Note selection, nullifiers, witnesses and proofs stay behind the wallet.
  - title: Pluggable all the way down
    details: Replace the chain adapter, indexer, submitter, prover, coin selector, scanner or store — each independently, each with a working default.
  - title: Primitives when you need them
    details: Keys, FMD, note encryption, witness builders and the prover, each on its own subpath, so a bundler drops what you do not import.
  - title: Runs where your users are
    details: Node 24+, browsers, Deno. Web Crypto and fetch only — no node builtins, enforced in CI.
---
