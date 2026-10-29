// The function documentation pages, which the build makes from the funcdoc XML
// (scripts/funcdoc/funcdocHtml.mjs, a port of the Java build's XSLT).  They are loaded when first
// needed, as they are the biggest resource.

export interface FuncdocPage
{
    readonly title: string;
    // "indiv" for a page about one item, null for a page about a whole namespace:
    readonly bodyClass: string | null;
    // The body's content, as HTML:
    readonly body: string;
}

let loading: Promise<ReadonlyMap<string, FuncdocPage>> | null = null;

/** The pages, by file name, e.g. "function-text-replace.html" (as the Java code names them). */
export function loadFuncdocPages(): Promise<ReadonlyMap<string, FuncdocPage>>
{
    loading ??= import("./generated/funcdoc-pages.json?raw")
        .then(m => new Map(Object.entries(JSON.parse(m.default) as Record<string, FuncdocPage>)));
    return loading;
}
