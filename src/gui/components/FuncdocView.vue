<script setup lang="ts">
// Shows a function documentation page, as the Java original's WebView did in the expression
// editor's completion popup (LexAutoCompleteWindow) and in DocWindow (docs/gui-spec/funcdoc-view.md).
// Links go to other pages in the same view; clicking an example emits it, to insert in the editor
// (Java: LexAutoCompleteWindow.enableInsertLinks).
import { nextTick, shallowRef, useTemplateRef, watch } from "vue";
import { Log } from "../../engine/utility/log/Log.js";
import { type FuncdocPage, loadFuncdocPages } from "../funcdoc.js";

const props = defineProps<{
    // A page's file name, optionally with #anchor, e.g. "function-text-replace.html"
    page: string,
}>();
const emit = defineEmits<{
    insert: [expression: string],
}>();

const pages = shallowRef<ReadonlyMap<string, FuncdocPage> | null>(null);
// The page shown, which changes when a link is clicked:
const current = shallowRef(props.page);
const shown = shallowRef<FuncdocPage | null>(null);
const view = useTemplateRef<HTMLElement>("view");

void loadFuncdocPages().then(p => { pages.value = p; });
watch(() => props.page, page => { current.value = page; });

watch([pages, current], async ([pages, current]) =>
{
    if (pages === null)
        return;
    const [file, anchor] = current.split("#", 2) as [string, string | undefined];
    const page = pages.get(file);
    if (page === undefined)
        Log.error("Missing file: " + file);
    shown.value = page === undefined ? null : {
        ...page,
        body: page.body.replaceAll("class=\"insertable-expression\"", "class=\"insertable-expression\" title=\"Click to insert into editor\""),
    };
    await nextTick();
    // (The HTML is the build's, from resources/funcdoc)
    if (view.value !== null)
        view.value.innerHTML = shown.value?.body ?? "";
    if (anchor !== undefined)
        scrollTo(anchor);
    else if (view.value !== null)
        view.value.scrollTop = 0;
}, { immediate: true });

function scrollTo(id: string): void
{
    view.value?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView();
}

function clicked(event: MouseEvent): void
{
    if (!(event.target instanceof Element))
        return;
    const insertable = event.target.closest(".insertable-expression");
    if (insertable !== null)
    {
        event.stopPropagation();
        emit("insert", insertable.getAttribute("data-insert") ?? "");
        return;
    }
    const link = event.target.closest("a[href]");
    if (link !== null)
    {
        event.preventDefault();
        const href = link.getAttribute("href")!;
        if (href.startsWith("#"))
            scrollTo(href.substring(1));
        else if (/^[a-z]+:/i.test(href))
            window.open(href, "_blank", "noopener");
        else
            current.value = href;
    }
}
</script>

<template>
  <div
    ref="view"
    class="funcdoc"
    :class="shown?.bodyClass"
    data-testid="funcdoc"
    @click="clicked"
  />
</template>

<style>
/*
 * From funcdoc.scss, with body as .funcdoc, and html.autocomplete always on (Java set it on every
 * page it showed).  Its unitless paddings ("padding: 8") were invalid, so WebView ignored them,
 * and they are left out.
 */
.funcdoc {
    overflow: auto;
    font-family: var(--font-main);
    font-size: 13pt;
    background: white;
    color: black;
}
.funcdoc.indiv {
    font-size: 11pt;
}
.funcdoc .index-entry {
    display: block;
}
.funcdoc .function-group-item {
    display: none;
}
.funcdoc :is(.function-item, .operator-item, .type-item, .syntax-item, .variable-item, .literal-item) {
    padding: 25pt;
}
.funcdoc.indiv :is(.function-item, .operator-item, .type-item, .column-item, .syntax-item, .variable-item, .literal-item) {
    padding: 5pt;
}
.funcdoc :is(.function-item, .operator-item, .type-item, .column-item, .syntax-item, .variable-item, .literal-item) {
    border-width: 0 0 1px 0;
    border-color: lightgray;
    border-style: solid;
}
.funcdoc .function-header :is(.function-name-header, .bracket, .comma) {
    font-weight: bold;
}
.funcdoc :is(.syntax-keyword, .type-name-header, .operator-name-header, .variable-name-header, .column-header, .literal-name-header) {
    font-weight: bold;
}
.funcdoc :is(.function-header, .function-type, .syntax-type, .operator-type, .operator-name-header, .syntax-name-header, .column-header, .variable-name-header, .literal-name-header, .type-name-header) {
    display: block;
}
.funcdoc :is(.type-name-header, .function-header, .operator-type, .syntax-name-header, .operator-name-header, .variable-name-header, .literal-name-header, .column-header) {
    font-size: 18pt;
    background-color: var(--doc-header-background);
}
.funcdoc.indiv :is(.type-name-header, .function-header, .operator-type, .syntax-name-header, .variable-name-header, .column-header) {
    font-size: 14pt;
}
.funcdoc.indiv .function-type {
    font-size: 11pt;
}
.funcdoc :is(.function-name-type, .function-type, .operator-type) :is(.type-var, .unit-var) {
    display: inline;
    position: relative;
}
/* From https://www.webdesignerdepot.com/2012/11/how-to-create-a-simple-css3-tooltip/ */
.funcdoc :is(.function-name-type, .function-type, .operator-type) :is(.type-var, .unit-var):hover::after {
    font-size: 10pt;
    background: rgb(0 0 0 / 0.8);
    border-radius: 5px;
    top: 120%;
    color: #fff;
    content: "Can be any type/unit";
    left: 20%;
    padding: 5px;
    position: absolute;
    z-index: 98;
    width: 120px;
}
.funcdoc :is(.function-name-type, .function-type, .operator-type) .type-var:hover::after {
    content: "Can be any type";
}
.funcdoc :is(.function-name-type, .function-type, .operator-type) .unit-var:hover::after {
    content: "Can be any unit";
}
.funcdoc :is(.type-var, .unit-var) {
    color: rgb(60% 60% 60%);
}
.funcdoc .function-arrow {
    padding-left: 7pt;
    padding-right: 7pt;
}
.funcdoc .function-arrow::before {
    content: "\2192";
    font-family: "Noto Sans Symbols";
}
.funcdoc .example-arrow {
    font-family: "Noto Sans Symbols";
}
.funcdoc .type {
    font-family: "Noto Mono";
    color: #555;
}
.funcdoc .type :is(a, a:visited, a:hover) {
    color: #555;
    text-decoration: none;
}
.funcdoc .type a:hover {
    background-color: #eee;
    text-decoration: underline;
}
.funcdoc .expression-bracket {
    font-family: "Noto Mono";
}
.funcdoc.indiv .examples .examples-header {
    font-size: 13pt;
}
.funcdoc span.insertable-expression {
    cursor: pointer;
}
.funcdoc span.insertable-expression:hover {
    background: rgb(80% 80% 80%);
}
.funcdoc .examples .examples-header {
    font-size: 14pt;
    font-weight: bold;
}
.funcdoc .examples .examples-header-hint {
    display: block;
    font-size: 80%;
    color: rgb(70% 70% 70%);
}
.funcdoc .examples .example {
    margin-top: 10pt;
    margin-bottom: 10pt;
}
.funcdoc .examples .example .example-call {
    padding-left: 20pt;
}
.funcdoc .examples .example .example-description {
    display: block;
    font-size: 80%;
    color: rgb(60% 60% 60%);
    padding-left: 40pt;
}
.funcdoc .examples .example-arrow {
    vertical-align: middle;
    position: relative;
    top: -0.1em;
    font-size: 300%;
    line-height: 0;
    color: rgb(60% 60% 60%);
    padding-left: 8pt;
    padding-right: 8pt;
}
.funcdoc .seeAlso .seeAlsoHeader {
    display: block;
    font-weight: bold;
    font-size: 14pt;
}
.funcdoc.indiv .seeAlso .seeAlsoHeader {
    font-size: 11pt;
}
.funcdoc :is(.seeAlso, .index) a {
    margin-left: 20pt;
    display: block;
}
.funcdoc :is(.seeAlso, .index) :is(a, a:visited, a:hover) {
    color: black;
}
.funcdoc code {
    background-color: rgb(95% 95% 95%);
    font-family: "Noto Sans";
}
.funcdoc div.section :is(p, .examples) {
    padding-left: 20pt;
}
.funcdoc span.title {
    font-size: 150%;
    font-weight: bold;
    padding-top: 15pt;
    padding-bottom: 10pt;
}
</style>
