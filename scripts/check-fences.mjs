// Every `ts` fence in the guide must be typechecked, or say why not.
//
// Twoslash is opt-in per fence: a plain ```ts block renders happily and is
// never compiled. That is the same silent-drift failure the SDK's own
// scripts/check-docs.mjs exists to prevent — the README quickstart once
// accumulated three type errors nobody noticed. Twoslash alone would trade one
// gap for another, so this restores checked-by-default: a `ts` fence must
// carry `twoslash`, or an explicit opt-out on the line before it.
//
//     <!-- typecheck: skip -->
//
// Run: npm run check:fences

import { fail, guidePages, read, tsFences } from "./lib/docs.mjs";

const problems = [];
let checked = 0;
let skipped = 0;

for (const file of await guidePages()) {
    for (const fence of tsFences(read(file))) {
        if (fence.twoslash) checked++;
        else if (fence.skipped) skipped++;
        else problems.push(`${file}:${fence.line}  \`\`\`${fence.lang}${fence.attrs}`);
    }
}

if (problems.length) {
    fail(
        `${problems.length} TypeScript block(s) are neither typechecked nor explicitly skipped:`,
        problems,
        "Add `twoslash` to the fence so it is compiled at build time, or put\n" +
            "`<!-- typecheck: skip -->` on the line before it to opt out on purpose.",
    );
}

console.log(`check:fences — ${checked} block(s) typechecked, ${skipped} explicitly skipped.`);
