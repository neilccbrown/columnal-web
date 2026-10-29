# Function documentation view

Java: a `WebView` in `LexAutoCompleteWindow` (beside the expression editor's completions, for the selected
completion's "further details") and in `DocWindow` (a small always-on-top window, opened from some error
fixes, e.g. "guide-optional.html"). The pages are made at build time from `resources/funcdoc/*.xml` by
`funcdoc-indiv-html.xsl` (a page per item: `function-{namespace}-{name}.html`, `type-…`, `literal-…`,
`syntax-…`, `variable-…`, `operator-{code points joined by -}.html`, `guide-…`) and
`funcdoc-joined-html.xsl` (a page per namespace, `{namespace}.html`, which the namespace links go to).
No Java GUI test covers them beyond the completion tests checking which page is shown.
Web: `src/gui/components/FuncdocView.vue`, `src/gui/funcdoc.ts`, pages from `scripts/funcdoc/funcdocHtml.mjs`
(checked against Saxon's output).

## What is shown

- The page's body, styled by `funcdoc.scss`, with the `autocomplete` class on (Java's `enableInsertLinks` set
  it on every page shown): the "Click an example to insert it" hint shows under "Examples".
- A function page: a purple header with the name and argument names, the type (type names link to their
  pages; type and unit variables are grey, with a "Can be any type/unit" tooltip on hover), the
  description, the examples (example → result), and "See Also" links.

## Interaction

- Clicking an example, or an expression in the text (`span.insertable-expression`, titled "Click to insert
  into editor"), inserts its `data-insert` text into the editor: in Java at the start of the completion
  being shown (`LexAutoCompleteWindow`), or wherever the editor's caret is (`DocWindow`).
- Clicking a link goes to that page in the same view (WebView's default); `#anchor` links scroll.
- A page that doesn't exist: Java logs "Missing file: …" and hides the view; here it logs and shows nothing.
  The Java XML has links that go nowhere (32 to missing pages: undocumented operators such as `*` and `^`,
  `maybe.html`, `type-unitvar.html`, links missing their namespace, a typo; and 66 anchors on the namespace
  pages, which each have one namespace, for items in other namespaces). They are left as they are: the
  build warns about them, and `FuncdocPages.test.ts` keeps the list (a snapshot), so a new one is noticed.

## Web differences

- External links (one, to Wikipedia) open in a new tab; WebView would have shown the site in the view.

- The view emits `insert` with the text; the expression editor (Phase 10) decides where it goes.
- When the page it is given changes, it shows that page, even if a link was followed.
- funcdoc.scss's unitless paddings (`padding: 8`) are invalid CSS, which WebView ignored; they are left out.
- Saxon copied the source's namespace declarations (`xmlns:xi="…"`) onto copied elements; they are left out.
