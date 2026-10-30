<script setup lang="ts">
// Rebuild of xyz.columnal.gui.dtf.DocumentTextField (stf): a text field showing a Document, which it
// edits (docs/gui-spec/cell-editor.md).  Java drew its own text, caret and selection; this is a native
// textarea (so typing, input methods, the clipboard, dragging to select and scrolling to the caret are
// the browser's), with Java's keys on top: Left and Right move the caret one character and collapse
// the selection there (with Shift, extend it), Home and End go to the ends, a double click selects
// everything, Escape and Ctrl/Cmd+Z undo back to the text at focus (Document.getUndo), and Escape,
// Enter and Tab end the edit (Document.defocus).  The field takes all keys (Java consumed them all).
// Expanded (Java: setExpanded, while a grid cell is edited), the text wraps and scrolls vertically;
// otherwise it is one line, scrolled sideways to keep the caret in view.
//
// PORT-NOTE: Java moved the caret, and Backspace and Delete deleted, one UTF-16 unit at a time, so could
// split a surrogate pair; a textarea can't put its caret inside one, so this goes one code point.
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from "vue";
import type { Document, KeyCode } from "../../gui-logic/stf/gui/dtf/Document.js";
import { isMac } from "../shortcuts.js";

const props = withDefaults(defineProps<{
    document: Document,
    expanded?: boolean,
}>(), {
    expanded: false,
});
const emit = defineEmits<{
    // The field lost the focus, after telling the document:
    focusLost: [],
}>();

const textarea = useTemplateRef<HTMLTextAreaElement>("textarea");
// Java: the has-error pseudo-class (Document.hasError), updated when the document changes:
const hasError = shallowRef(props.document.hasError());

function documentChanged(): void
{
    hasError.value = props.document.hasError();
    const ta = textarea.value;
    if (ta !== null && ta.value !== props.document.getText())
        ta.value = props.document.getText();
}
watch(() => props.document, (document, old) =>
{
    old?.removeListener(documentChanged);
    document.addListener(documentChanged);
    documentChanged();
}, { immediate: true });
onMounted(documentChanged);
onBeforeUnmount(() => props.document.removeListener(documentChanged));

// --- Caret and anchor (the textarea's selection, with its direction) -----------------------------

function getCaretPosition(): number
{
    const ta = textarea.value!;
    return ta.selectionDirection === "backward" ? ta.selectionStart : ta.selectionEnd;
}

function getAnchorPosition(): number
{
    const ta = textarea.value!;
    return ta.selectionDirection === "backward" ? ta.selectionEnd : ta.selectionStart;
}

function setSelection(anchor: number, caret: number): void
{
    textarea.value!.setSelectionRange(Math.min(anchor, caret), Math.max(anchor, caret), caret < anchor ? "backward" : "forward");
    if (window.document.activeElement === textarea.value)
        scrollToCaret();
}

function selectAll(): void
{
    setSelection(0, props.document.getLength());
}

// The positions a code point before and after pos:
function before(text: string, pos: number): number
{
    return pos >= 2 && /[\uDC00-\uDFFF]/.test(text[pos - 1]!) && /[\uD800-\uDBFF]/.test(text[pos - 2]!) ? pos - 2 : Math.max(0, pos - 1);
}

function after(text: string, pos: number): number
{
    return pos + 2 <= text.length && /[\uD800-\uDBFF]/.test(text[pos]!) && /[\uDC00-\uDFFF]/.test(text[pos + 1]!) ? pos + 2 : Math.min(text.length, pos + 1);
}

/** Replaces the text from start to end, leaving the caret (and anchor) at the end of the new text. */
function replace(start: number, end: number, text: string): void
{
    props.document.replaceText(start, end, text);
    documentChanged();
    const caret = Math.min(props.document.getLength(), start + text.length);
    setSelection(caret, caret);
}

/** Java: replaceAll, e.g. with the character typed to start editing (save: and store it). */
function replaceAll(content: string, save: boolean): void
{
    if (save)
    {
        props.document.setAndSave(content);
        documentChanged();
        const end = props.document.getLength();
        setSelection(end, end);
    }
    else
        replace(0, props.document.getLength(), content);
}

// --- Events --------------------------------------------------------------------------------------

// Typing, pasting, cutting and dropping (Java: replaceSelection), passed on to the document as the
// change between the document's text and the textarea's:
function onInput(): void
{
    const ta = textarea.value!;
    const old = props.document.getText();
    const now = ta.value;
    let start = 0;
    while (start < old.length && start < now.length && old[start] === now[start])
        start++;
    let end = 0;
    while (end < old.length - start && end < now.length - start && old[old.length - 1 - end] === now[now.length - 1 - end])
        end++;
    const caret = getCaretPosition(), anchor = getAnchorPosition();
    props.document.replaceText(start, old.length - end, now.substring(start, now.length - end));
    documentChanged();
    setSelection(Math.min(anchor, props.document.getLength()), Math.min(caret, props.document.getLength()));
}

function onKeyDown(e: KeyboardEvent): void
{
    // (Java consumed every key; the grid mustn't see them)
    e.stopPropagation();
    if (e.isComposing)
        return;
    const shortcut = isMac() ? e.metaKey : e.ctrlKey;
    const text = props.document.getText();
    const caret = getCaretPosition();
    const anchor = getAnchorPosition();
    // Moves the caret, and the anchor with it unless Shift is down:
    const moveCaret = (to: number): void => setSelection(e.shiftKey ? anchor : to, to);
    let defocus: KeyCode | null = null;
    switch (e.key)
    {
        case "ArrowLeft":
            if (shortcut || e.altKey)
                return;
            moveCaret(before(text, caret));
            break;
        case "ArrowRight":
            if (shortcut || e.altKey)
                return;
            moveCaret(after(text, caret));
            break;
        case "ArrowUp":
            // (Expanded, the textarea moves between lines; on one line, Java went to the start)
            if (props.expanded)
                return;
            moveCaret(0);
            break;
        case "ArrowDown":
            if (props.expanded)
                return;
            moveCaret(caret);
            break;
        case "Home":
            moveCaret(0);
            break;
        case "End":
            moveCaret(text.length);
            break;
        case "Backspace":
        case "Delete":
            // (Java's read-only documents ignored the change)
            if (!props.document.isEditable())
                break;
            if (caret !== anchor)
                replace(Math.min(caret, anchor), Math.max(caret, anchor), "");
            else if (e.key === "Backspace" && caret > 0)
                replace(before(text, caret), caret, "");
            else if (e.key === "Delete" && caret < text.length)
                replace(caret, after(text, caret), "");
            break;
        case "Escape":
            undo();
            defocus = "ESCAPE";
            break;
        case "Enter":
            defocus = "ENTER";
            break;
        case "Tab":
            defocus = "TAB";
            break;
        default:
            if (shortcut && !e.altKey && e.key.toLowerCase() === "z")
            {
                undo();
                break;
            }
            // Typing, Ctrl/Cmd+A, cut, copy and paste are the textarea's:
            return;
    }
    e.preventDefault();
    if (defocus !== null)
        props.document.defocus(defocus);
}

// Java: Escape and Ctrl/Cmd+Z go back to the text at focus
function undo(): void
{
    const undoText = props.document.getUndo();
    if (undoText !== null)
        replace(0, props.document.getLength(), undoText);
}

function onMouseDown(e: MouseEvent): void
{
    if (e.button !== 0)
        return;
    // Java: a double click selects everything
    if (e.detail === 2)
    {
        e.preventDefault();
        selectAll();
        return;
    }
    if (e.detail !== 1)
        return;
    // Java had no dragging of text, so a press in the selection places the caret, as anywhere else
    // (the textarea would otherwise wait to drag the selection):
    if (!e.shiftKey)
        setSelection(getCaretPosition(), getCaretPosition());
    // Java: the press moves the anchor to it (unless Shift is down), and dragging moves the caret.  The
    // textarea selects the same way, but may not say which end the caret is (Chrome on macOS gives the
    // direction as "none"), so the anchor is noted, once the press has placed it:
    const ta = textarea.value!;
    let anchor: number | null = e.shiftKey ? getAnchorPosition() : null;
    setTimeout(() => { anchor ??= ta.selectionStart; }, 0);
    const up = (): void =>
    {
        window.removeEventListener("mouseup", up, true);
        if (anchor === null)
            return;
        const start = ta.selectionStart, end = ta.selectionEnd;
        setSelection(anchor, anchor === start ? end : start);
    };
    window.addEventListener("mouseup", up, true);
}

function onFocus(): void
{
    props.document.focusChanged(true);
    documentChanged();
}

function onBlur(): void
{
    props.document.focusChanged(false);
    documentChanged();
    const ta = textarea.value;
    if (ta !== null)
    {
        setSelection(0, 0);
        ta.scrollLeft = 0;
        ta.scrollTop = 0;
    }
    emit("focusLost");
}

/**
 * Where caret position pos is in the textarea's content (from its border box's top left, ignoring
 * scrolling): its x, and the top and bottom of its line.  Measured in a copy of the text with the
 * textarea's styles.
 */
function caretBox(pos: number): { x: number, top: number, bottom: number }
{
    const ta = textarea.value!;
    const style = getComputedStyle(ta);
    const mirror = window.document.createElement("div");
    for (const p of ["font", "letterSpacing", "padding", "border", "boxSizing", "whiteSpace", "overflowWrap", "wordBreak", "tabSize", "lineHeight"] as const)
        mirror.style[p] = style[p];
    // (The width inside any scroll bar, which the text wraps within)
    Object.assign(mirror.style, { position: "fixed", left: "0", top: "0", width: ta.clientWidth + ta.clientLeft * 2 + "px", visibility: "hidden" });
    // (A zero-width space, so that there is text to measure at the end, and when empty)
    const textNode = window.document.createTextNode(ta.value + "\u200B");
    mirror.appendChild(textNode);
    window.document.body.appendChild(mirror);
    try
    {
        const range = window.document.createRange();
        range.setStart(textNode, pos);
        range.setEnd(textNode, pos + 1);
        const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
        const origin = mirror.getBoundingClientRect();
        return { x: rect.left - origin.left, top: rect.top - origin.top, bottom: rect.bottom - origin.top };
    }
    finally
    {
        mirror.remove();
    }
}

/**
 * Java: layoutChildren's scrolling, which keeps the caret 5 px inside the field (going 10 px past it
 * when it scrolls).  The textarea scrolls by itself for typing; this is for the keys handled here.
 */
function scrollToCaret(): void
{
    const ta = textarea.value!;
    const caret = caretBox(getCaretPosition());
    if (caret.x - ta.scrollLeft - 5 < 0)
        ta.scrollLeft = Math.max(0, caret.x - 10);
    else if (caret.x - ta.scrollLeft > ta.clientWidth - 5)
        ta.scrollLeft = Math.min(Math.max(0, ta.scrollWidth - ta.clientWidth), caret.x + 10 - ta.clientWidth);
    if (caret.top - ta.scrollTop - 5 < 0)
        ta.scrollTop = Math.max(0, caret.top - 10);
    else if (caret.bottom - ta.scrollTop > ta.clientHeight - 5)
        ta.scrollTop = Math.min(Math.max(0, ta.scrollHeight - ta.clientHeight), caret.bottom + 10 - ta.clientHeight);
}

/** For tests (Java: _test_getClickPosFor): the client position of caret position pos, half way down its line. */
function _test_getClickPosFor(pos: number): { x: number, y: number }
{
    const ta = textarea.value!;
    const r = ta.getBoundingClientRect();
    const caret = caretBox(pos);
    return { x: r.left + caret.x - ta.scrollLeft, y: r.top + (caret.top + caret.bottom) / 2 - ta.scrollTop };
}

defineExpose({
    focus: () => textarea.value?.focus({ preventScroll: true }),
    isFocused: () => textarea.value !== null && window.document.activeElement === textarea.value,
    getCaretPosition,
    getAnchorPosition,
    setSelection,
    selectAll,
    replaceAll,
    element: () => textarea.value,
    _test_getGraphicalText: () => textarea.value?.value ?? "",
    _test_getClickPosFor,
});
</script>

<template>
  <textarea
    ref="textarea"
    class="document-text-field"
    :class="{ expanded, 'has-error': hasError }"
    :readonly="!document.isEditable()"
    :wrap="expanded ? 'soft' : 'off'"
    rows="1"
    spellcheck="false"
    autocomplete="off"
    @input="onInput"
    @keydown="onKeyDown"
    @mousedown="onMouseDown"
    @dragstart.prevent
    @focus="onFocus"
    @blur="onBlur"
  />
</template>

<style scoped>
/* general.scss .text-editor, and virtual-grid.scss's .table-data-cell (.document-text-flow's padding) */
.document-text-field {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: 0 2px;
    border: none;
    outline: none;
    resize: none;
    overflow: hidden;
    white-space: pre;
    font: inherit;
    line-height: var(--grid-row-height);
    color: black;
    background: var(--table-cell);
    caret-color: var(--focus-color);
}
.document-text-field::selection {
    background: var(--focus-color);
    color: white;
}
/* virtual-grid.scss .table-data-cell:expanded */
.document-text-field.expanded {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    overflow-y: auto;
    border: 1px solid hsl(213 20% 70%);
    border-radius: 0 5px 5px 5px;
    background: white;
    box-shadow: 1px 1px 12px rgb(0 0 0 / 0.3);
}
.document-text-field.has-error {
    box-shadow: inset 1px 1px 0 1px var(--cell-error);
}
.document-text-field.expanded.has-error {
    box-shadow: inset 1px 1px 0 1px var(--cell-error), 1px 1px 12px rgb(0 0 0 / 0.3);
}
</style>
