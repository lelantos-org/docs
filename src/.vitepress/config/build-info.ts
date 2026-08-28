import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * The SDK version the docs describe, read off the installed package rather than
 * hard-coded — the nav label and the API it documents are then the same thing
 * by construction. They drifted once, when the label was a literal.
 */
export const SDK_VERSION: string = createRequire(import.meta.url)(
    "@lelantos-org/sdk/package.json",
).version;

/**
 * Which build of this site is on screen — the first thing worth knowing about a
 * bug report, and unanswerable from a hashed asset filename. Mirrors
 * explorer-ui's `__COMMIT__`.
 *
 * `GITHUB_SHA` comes first so a CI build reports the commit it was triggered
 * for even though actions/checkout leaves a detached HEAD. Falls back to "dev"
 * when there is no git history at all — the case in a fresh clone before the
 * first commit, which must not fail the build.
 */
export function commitSha(): string {
    const ci = process.env.GITHUB_SHA;
    if (ci) return ci.slice(0, 7);
    try {
        return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
            cwd: ROOT,
            stdio: ["ignore", "pipe", "ignore"],
            encoding: "utf8",
        }).trim();
    } catch {
        return "dev";
    }
}
