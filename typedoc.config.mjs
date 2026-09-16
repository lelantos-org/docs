// Reference pages, derived from the SDK's own exports map.
//
// Entry points are computed rather than listed: package.json#exports is the
// definition of what is public, so a hand-written list here would be a second
// copy to keep in sync. The walk itself lives in scripts/lib/sdk.mjs, shared
// with the coverage gate — the two disagreed about what counts as public once
// already.
//
// TypeDoc reads the shipped .d.ts rather than source: the published package is
// `files: ["dist", "wasm/*/pkg"]` and carries no src/. That costs ~16% of the
// JSDoc blocks (1274 of 1519), almost all of it on non-exported internals that
// `excludeInternal` would drop anyway. In exchange the docs build needs no Rust
// toolchain — the package ships prebuilt WASM, which a source checkout does not.

import { sdkPackage, typedEntries } from "./scripts/lib/sdk.mjs";

const { manifest } = sdkPackage();
const entryPoints = typedEntries({ verify: true }).map((e) => e.types);

console.log(
    `typedoc: ${entryPoints.length} entry points from @lelantos-org/sdk@${manifest.version}`,
);

/** @type {Partial<import("typedoc").TypeDocOptions>} */
export default {
    entryPoints,
    entryPointStrategy: "resolve",
    tsconfig: "tsconfig.typedoc.json",
    out: "src/reference",
    plugin: [
        "typedoc-plugin-markdown",
        "typedoc-vitepress-theme",
        "./scripts/lib/typedoc-viem.mjs",
        "./scripts/lib/typedoc-subpaths.mjs",
    ],
    // The SDK marks internals with @internal; they are not supported surface.
    excludeInternal: true,
    excludePrivate: true,
    // Type-level plumbing, not surface. Each is a module-local helper alias
    // that a public type is *built from* — `ConnectOptions` is a union assembled
    // out of the `connect/options.ts` mapped types, `FlattenInput` out of
    // `Loose` — so TypeDoc sees them referenced while nothing exports them.
    // Publishing them would name intermediates no caller writes.
    //
    // TypeDoc warns when an entry here goes unused, so a rename upstream shows
    // up rather than rotting.
    intentionallyNotExported: [
        "ChainKeys",
        "Hex",
        "KeyKeys",
        "Loose",
        "NoKey",
        "Only",
        "SelfKeyingChainOptions",
    ],
    // Barrels only re-export; with excludeExternals the referenced declarations
    // all count as external and every page comes out empty.
    excludeExternals: false,
    // Named viem types we reference are not ours to document, so the wildcard
    // sends the lot to viem's docs in one line rather than leaving each a
    // warning and a dead link.
    //
    // Only symbols TypeScript resolves are reachable this way, and only on a
    // global resolution start — the bare `{@link}`s inside viem's own comments
    // are neither, which is what `scripts/lib/typedoc-viem.mjs` handles.
    externalSymbolLinkMappings: {
        viem: { "*": "https://viem.sh" },
    },
    readme: "none",
    githubPages: false,
    hideGenerator: true,
    sort: ["alphabetical"],
    docsRoot: "src",
    useCodeBlocks: true,
    parametersFormat: "table",
    skipErrorChecking: true,
};
