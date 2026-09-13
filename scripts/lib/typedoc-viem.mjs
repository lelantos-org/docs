// Keeps viem's inlined client type out of the reference.
//
// `ViemChainAdapter.publicClient`, `ViemChainReader.publicClient` and
// `ViemReadCtx.publicClient` are typed as viem's client, which the shipped
// `.d.ts` inlines structurally rather than naming. TypeDoc therefore converts
// every method on it — `getCode`, `simulateBlocks` and ~60 more — as our own
// documentation, and each carries viem's JSDoc.
//
// Two things follow, both unwanted. The pages grow by a type that is not ours
// to document, and viem's comments reference aliases like
// `GetBytecodeReturnType` which viem only re-exports from its root: the name is
// not in scope where the comment sits, a bare `{@link Foo}` resolves locally,
// and `externalSymbolLinkMappings` is consulted only for a global resolution
// start. Nine warnings, nine dead links, none of them fixable from here.
//
// `excludeExternals` is not the lever: the SDK is itself installed, so
// TypeDoc's default `externalPattern` counts it external too, and turning
// exclusion on empties every page — a negated pattern for `@lelantos-org` does
// not win it back. So drop the members directly, and leave `validation.invalidLink`
// on to keep catching our own broken links.
//
// The property keeps its type; only the expanded members go. If the SDK ever
// names viem's type instead of inlining it, TypeDoc will link it externally on
// its own and this becomes a no-op — hence the warning below rather than
// silence, so it does not rot unnoticed.

import { Comment, Converter, ReflectionKind } from "typedoc";

/** Properties whose inlined type is viem's, not ours. */
const FOREIGN = new Set(["publicClient"]);

/** @param {import("typedoc").Application} app */
export function load(app) {
    app.converter.on(Converter.EVENT_RESOLVE_BEGIN, (context) => {
        const project = context.project;
        let pruned = 0;

        for (const refl of project.getReflectionsByKind(ReflectionKind.Property)) {
            if (!FOREIGN.has(refl.name)) continue;

            // An inlined object type converts to a ReflectionType carrying a
            // declaration; a named one has no `declaration` and is left alone.
            const declaration = refl.type?.declaration;
            const children = declaration?.children;
            if (!children?.length) continue;

            for (const child of [...children]) project.removeReflection(child);
            pruned++;

            // Pruned, the type renders as a bare `object`, which tells a reader
            // nothing — and the SDK carries no JSDoc of its own here. Say what
            // it is and send them to viem for the members.
            refl.comment ??= new Comment([
                {
                    kind: "text",
                    text:
                        "viem's [`PublicClient`](https://viem.sh/docs/clients/public). " +
                        "Its members are viem's own and are documented there, not here.",
                },
            ]);
        }

        if (pruned === 0) {
            app.logger.warn(
                "typedoc-viem: no inlined viem client members found to prune — " +
                    "the SDK may now name the type, making this plugin unnecessary.",
            );
        }
    });
}
