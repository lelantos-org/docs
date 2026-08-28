// Every public export must appear in the generated reference.
//
// This is the gate that makes a new export impossible to ship undocumented: add
// a name to a barrel, and the docs build fails until the reference covers it.
//
// The surface is computed here rather than read from the SDK's checked-in
// api-surface.json, because that file is not published — `files` is
// ["dist", "wasm/*/pkg"]. Deriving it from the installed .d.ts with the
// compiler API (the same approach as the SDK's scripts/check-public-api.mjs)
// has the better property anyway: it describes the exact version installed, so
// it cannot drift from what the docs are actually built against.
//
// Run: npm run check:api-coverage

import { existsSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import { fail, ROOT, read } from "./lib/docs.mjs";
import { declarationProgramOptions, sdkPackage, typedEntries } from "./lib/sdk.mjs";

const { manifest } = sdkPackage();
const entries = typedEntries();

const program = ts.createProgram(
    entries.map((e) => e.types),
    declarationProgramOptions(ts),
);
const checker = program.getTypeChecker();

/** True if the symbol, or what it aliases, carries a JSDoc @internal tag. */
function isInternal(sym) {
    const tagged = (s) => s.getJsDocTags(checker).some((t) => t.name === "internal");
    if (tagged(sym)) return true;
    if (sym.flags & ts.SymbolFlags.Alias) {
        try {
            return tagged(checker.getAliasedSymbol(sym));
        } catch {
            return false;
        }
    }
    return false;
}

/** @type {Record<string, string[]>} */
const surface = {};
for (const { subpath, types } of entries) {
    const sf = program.getSourceFile(types);
    if (!sf) throw new Error(`could not load ${types}`);
    const sym = checker.getSymbolAtLocation(sf);
    // A .d.ts with no exported symbol (worker entries) contributes nothing.
    // @internal symbols are barrel-exported but not supported surface — the SDK
    // tags 178 of them, and TypeDoc's excludeInternal drops them. Counting them
    // here would demand documentation for things deliberately kept private.
    surface[subpath] = sym
        ? checker
              .getExportsOfModule(sym)
              .filter((s) => !isInternal(s))
              .map((s) => s.name)
              .sort()
        : [];
}

// What the generated reference actually documents. TypeDoc emits one page per
// module with a heading per symbol; a name is covered if any page names it.
const REF = join(ROOT, "src", "reference");
if (!existsSync(REF)) {
    console.error("src/reference is missing — run `npm run gen:reference` first.");
    process.exit(1);
}

const documented = new Set();
for await (const file of glob("src/reference/**/*.md", { cwd: ROOT })) {
    // TypeDoc escapes underscores in link text and headings (X402\_VERSION),
    // so unescape before matching or every SCREAMING_CASE export looks missing.
    const md = read(file).replace(/\\_/g, "_");
    for (const m of md.matchAll(/^#{1,6}\s+(?:\\?[A-Za-z]+\s+)?`?([A-Za-z_$][\w$]*)`?/gm)) {
        documented.add(m[1]);
    }
    // TypeDoc also links symbols it documents elsewhere; count those too. A
    // link to a page that does not exist would count here — VitePress's
    // dead-link check is what catches that case, so the two gates overlap
    // rather than leaving a hole.
    for (const m of md.matchAll(/\[`?([A-Za-z_$][\w$]*)`?\]\([^)]*\.md/g)) {
        documented.add(m[1]);
    }
}

const missing = [];
let total = 0;
for (const [subpath, names] of Object.entries(surface)) {
    for (const name of names) {
        total++;
        if (!documented.has(name)) missing.push(`${subpath.padEnd(18)} ${name}`);
    }
}

if (missing.length) {
    const shown = missing.slice(0, 40);
    if (missing.length > 40) shown.push(`… and ${missing.length - 40} more`);
    fail(
        `${missing.length} of ${total} public export(s) in @lelantos-org/sdk@${manifest.version} ` +
            "are missing from the generated reference:",
        shown,
        "Either regenerate with `npm run gen:reference`, or — if the symbol is\n" +
            "not meant to be supported surface — tag it @internal in the SDK so both\n" +
            "this gate and TypeDoc agree it is private.",
    );
}

console.log(
    `check:api-coverage — ${total} public exports documented (@lelantos-org/sdk@${manifest.version}).`,
);
