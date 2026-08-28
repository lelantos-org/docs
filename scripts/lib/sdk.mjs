// What counts as public API in @lelantos-org/sdk.
//
// package.json#exports is the definition — the SDK enforces "a symbol is public
// iff a barrel forwards it" (scripts/check-layers.mjs in the SDK repo). Both the
// reference generator and the coverage gate need to walk that map the same way,
// and they disagreed once already, so the rule lives here rather than in each.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/** Installed package root and its manifest. */
export function sdkPackage() {
    const manifestPath = require.resolve("@lelantos-org/sdk/package.json");
    return { dir: dirname(manifestPath), manifest: require("@lelantos-org/sdk/package.json") };
}

/**
 * Every exports subpath that carries type declarations, as
 * `{ subpath, types }` with `types` an absolute path to the .d.ts.
 *
 * Skips `./package.json` (a bare string, no types) and the `./wasm/*`
 * passthroughs (raw artifacts, no TypeScript to document).
 *
 * @param {{ verify?: boolean }} [opts] throw if a declared `types` file is absent
 */
export function typedEntries({ verify = false } = {}) {
    const { dir, manifest } = sdkPackage();
    const out = [];
    for (const [subpath, entry] of Object.entries(manifest.exports)) {
        if (typeof entry !== "object" || !entry.types) continue;
        if (subpath.startsWith("./wasm")) continue;
        const types = join(dir, entry.types);
        if (verify && !existsSync(types)) {
            throw new Error(`exports "${subpath}" -> ${entry.types}, missing from the package`);
        }
        out.push({ subpath, types });
    }
    return out;
}

/** Compiler options for reading the shipped .d.ts files. */
export function declarationProgramOptions(ts) {
    return {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        skipLibCheck: true,
        noEmit: true,
    };
}
