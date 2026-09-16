/**
 * What the site is called and where it lives.
 *
 * Read by the VitePress config for the page head and by `scripts/gen-llms.mjs`
 * for the llms.txt files, which link back to absolute URLs — so the two cannot
 * name the site differently or point at different hosts. `public/CNAME` is the
 * one copy of the host outside this file; GitHub Pages reads it as-is.
 */
export const SITE_URL = "https://docs.lelantos.xyz";

export const SITE_TITLE = "Lelantos SDK";

export const SITE_DESCRIPTION =
    "Client SDK for the Lelantos Multi-Asset Shielded Pool — shielded transfers, swaps, and client-side proving on EVM.";
