import ts from "typescript";
import { ROOT } from "./build-info.ts";

/**
 * Twoslash does not read tsconfig.json — it applies its own defaults. Those
 * defaults already resolve node_modules and already enable `strict`, so the
 * options below are not what makes snippets typecheck. What they add is the
 * rest of sdk/tsconfig.json's strictness — `noUncheckedIndexedAccess` and
 * `exactOptionalPropertyTypes` in particular — so a snippet is held to the same
 * bar as the SDK source it documents, and NodeNext resolution so subpath
 * imports resolve through the package's real exports map.
 */
export const twoslashCompilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    lib: ["lib.es2023.d.ts", "lib.dom.d.ts"],
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    esModuleInterop: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    // Snippets elide bindings they do not need to show.
    noUnusedLocals: false,
    noUnusedParameters: false,
    types: ["node"],
    baseUrl: ROOT,
};
