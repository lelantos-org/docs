// Names each reference module after the import path it documents.
//
// TypeDoc names a module after its entry file relative to the entries' common
// directory. The SDK's entries live in `dist/entry/*.d.ts`, beside the two
// worker entries, so the defaults read `entry`, `entry/advanced`,
// `prover/worker-entry` and `sync/worker/entry`: build layout, not anything a
// reader imports. The exports map is the
// definition of a subpath (see ./sdk.mjs), so the names come from it: the root
// is `index`, every other module is its subpath without the leading `./`
// (`advanced`, `workers/prover`).
//
// A module whose computed name matches no entry is left alone and warned about,
// so a layout change upstream shows up rather than silently mislabelling.

import { dirname, relative } from "node:path";
import { Converter, ReflectionKind } from "typedoc";
import { typedEntries } from "./sdk.mjs";

/** TypeDoc's default module name for each entry, mapped to its subpath label. */
function labels() {
    const entries = typedEntries();
    let common = dirname(entries[0]?.types ?? "").split("/");
    for (const { types } of entries) {
        const parts = dirname(types).split("/");
        let i = 0;
        while (i < common.length && common[i] === parts[i]) i++;
        common = common.slice(0, i);
    }
    const base = common.join("/");
    const out = new Map();
    for (const { subpath, types } of entries) {
        const name = relative(base, types)
            .replace(/\.d\.ts$/, "")
            .replace(/(^|\/)index$/, "");
        out.set(name, subpath === "." ? "index" : subpath.slice(2));
    }
    return out;
}

/** @param {import("typedoc").Application} app */
export function load(app) {
    app.converter.on(Converter.EVENT_RESOLVE_BEGIN, (context) => {
        const map = labels();
        for (const mod of context.project.getChildrenByKind(ReflectionKind.Module)) {
            const label = map.get(mod.name);
            if (label === undefined) {
                app.logger.warn(`typedoc-subpaths: no subpath for module "${mod.name}"`);
                continue;
            }
            mod.name = label;
        }
    });
}
