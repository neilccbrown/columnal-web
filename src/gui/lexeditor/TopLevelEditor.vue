<script setup lang="ts" generic="EXPRESSION extends StyledShowable">
// An editor of the expression, type and unit languages (Java: TopLevelEditor, with its EditorDisplay
// and InformationPopup), on CodeMirror (docs/gui-spec/lex-editor.md).
//
// The lexer's display text differs from the content (spaces around operators and after commas,
// line breaks and indents in @if, and positions the caret can't take, such as inside a keyword), so,
// as in Java, the ported EditorContent is the model and CodeMirror shows its display: keys go to
// EditorDisplay's handlers, typed text to its keyTyped, and the mouse to the content's caret; the
// content's display text, caret and decorations then replace CodeMirror's.  Anything else that
// changes CodeMirror's text (an input method's composition, when it ends) or selection is mapped back
// to the content.  The popups are Vue's: the information popup above the editor (errors at the caret
// and their fixes, information and prompts) and the completions below the caret.
import { Annotation, Compartment, EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from "reka-ui";
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from "vue";
import type { CanonicalLocation } from "../../engine/anns/Annotations.js";
import type { StyledShowable } from "../../engine/utility-error/styled/StyledShowable.js";
import { StyledString } from "../../engine/utility-error/styled/StyledString.js";
import type { LexCompletion } from "../../gui-logic/lex-editor-completion/gui/lexeditor/completion/LexCompletion.js";
import type { LexCompletionGroup } from "../../gui-logic/lex-editor-completion/gui/lexeditor/completion/LexCompletionGroup.js";
import type { LexCompletionList } from "../../gui-logic/lex-editor-completion/gui/lexeditor/completion/LexCompletionList.js";
import type { CodeCompletionContext } from "../../gui-logic/lex-editor/gui/lexeditor/CodeCompletionContext.js";
import { EditorContent } from "../../gui-logic/lex-editor/gui/lexeditor/EditorContent.js";
import { EditorDisplay } from "../../gui-logic/lex-editor/gui/lexeditor/EditorDisplay.js";
import { EditorLocationAndErrorRecorder } from "../../gui-logic/lex-editor/gui/lexeditor/EditorLocationAndErrorRecorder.js";
import type { Lexer } from "../../gui-logic/lex-editor/gui/lexeditor/Lexer.js";
import type { TextQuickFix } from "../../gui-logic/lex-editor/gui/lexeditor/TextQuickFix.js";
import { TopLevelEditor } from "../../gui-logic/lex-editor/gui/lexeditor/TopLevelEditor.js";
import FixList from "../components/FixList.vue";
import StyledText from "../components/StyledText.vue";
import { isMac } from "../shortcuts.js";
import LexAutoCompleteWindow from "./LexAutoCompleteWindow.vue";
import type { TopLevelEditorApi } from "./TopLevelEditorApi.js";

type AnyContent = EditorContent<StyledShowable, CodeCompletionContext>;

const props = defineProps<{
    lexer: Lexer<EXPRESSION, CodeCompletionContext>,
    // Java: null for a new item, whose errors show once the editor has been focused
    originalContent: string | null,
    // The style class: "type-editor", "unit-editor" or "expression-editor"
    editorClass: string,
    disabled?: boolean,
}>();
const emit = defineEmits<{
    // Java: onChange, with the content saved (forced when the editor is made)
    change: [expression: EXPRESSION],
}>();

const content = new EditorContent<EXPRESSION, CodeCompletionContext>(props.originalContent ?? "", props.lexer);
const anyContent = content as unknown as AnyContent;
const display = new EditorDisplay(anyContent);
// Java: EditorDisplay's hasBeenFocused (markAsPreviouslyFocused if there was original content)
let hasBeenFocused = props.originalContent !== null;
const focused = shallowRef(false);
display.focusChanged(false);

interface InfoShown
{
    readonly type: TopLevelEditor.DisplayType;
    readonly text: StyledString;
    readonly fixes: readonly TextQuickFix[];
}
interface CompletionsShown
{
    readonly groups: readonly LexCompletionGroup[];
    readonly selected: LexCompletion | null;
    readonly listView: LexCompletionList;
    // A virtual element at the caret, below which they show
    readonly anchor: { getBoundingClientRect(): DOMRect };
}
const info = shallowRef<InfoShown | null>(null);
const completions = shallowRef<CompletionsShown | null>(null);
let shownGroups: readonly LexCompletionGroup[] = [];

const host = useTemplateRef<HTMLElement>("host");
let view: EditorView | null = null;
// The display text and selection last given to CodeMirror
let syncedText = "";
let syncedSelection = { anchor: 0, head: 0 };

const fromContent = Annotation.define<boolean>();
const setDecorations = StateEffect.define<DecorationSet>();
const decorations = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update: (deco, tr) =>
    {
        for (const e of tr.effects)
        {
            if (e.is(setDecorations))
                return e.value;
        }
        return deco.map(tr.changes);
    },
    provide: f => EditorView.decorations.from(f),
});
const editable = new Compartment();

// Java: EditorDisplay.getErrorCharacters, which also marks the errors the caret has left
function errorSpans(): EditorLocationAndErrorRecorder.DisplaySpan[]
{
    const r: EditorLocationAndErrorRecorder.DisplaySpan[] = [];
    for (const error of content.getErrors())
    {
        if (!hasBeenFocused)
            error.caretHasLeftSinceEdit = false;
        else if (error.caretHasLeftSinceEdit || !focused.value || !error.location.touches(content.getCaretPosition()))
        {
            error.caretHasLeftSinceEdit = true;
            error.displayLocation ??= new EditorLocationAndErrorRecorder.DisplaySpan(content.mapContentToDisplay(error.location.start), content.mapContentToDisplay(error.location.end));
            r.push(error.displayLocation);
        }
    }
    return r;
}

// The display's styles, and the errors (Java: TextEditorBase's error underlines, which show the
// span's outline unless it contains the caret)
function makeDecorations(): DecorationSet
{
    const marks = [];
    let pos = 0;
    content.getDisplay().forEach((styles, text) =>
    {
        if (styles.length > 0 && text.length > 0)
        {
            const target = { classes: new Set<string>(), inlineStyles: new Map<string, string>() };
            for (const style of styles)
                style.applyTo(target);
            const style = [...target.inlineStyles].map(([k, v]) => k + ": " + v).join("; ");
            marks.push(Decoration.mark({ class: [...target.classes].join(" "), attributes: style === "" ? {} : { style } }).range(pos, pos + text.length));
        }
        pos += text.length;
    });
    const caret = content.getDisplayCaretPosition();
    for (const span of errorSpans())
    {
        if (span.start < span.end)
            marks.push(Decoration.mark({ class: span.start <= caret && caret <= span.end ? "error-underline contains-caret" : "error-underline" }).range(span.start, span.end));
    }
    return Decoration.set(marks, true);
}

// Gives CodeMirror the content's display text, selection and decorations
function sync(): void
{
    if (view === null)
        return;
    const text = content.getDisplay().toPlain();
    const doc = view.state.doc.toString();
    // Only the part which changed, so that CodeMirror keeps the rest of its DOM:
    let start = 0;
    while (start < text.length && start < doc.length && text[start] === doc[start])
        start += 1;
    let endText = text.length;
    let endDoc = doc.length;
    while (endText > start && endDoc > start && text[endText - 1] === doc[endDoc - 1])
    {
        endText -= 1;
        endDoc -= 1;
    }
    syncedText = text;
    syncedSelection = { anchor: content.getDisplayAnchorPosition(), head: content.getDisplayCaretPosition() };
    view.dispatch({
        changes: start === endText && start === endDoc ? [] : [{ from: start, to: endDoc, insert: text.slice(start, endText) }],
        selection: syncedSelection,
        effects: setDecorations.of(makeDecorations()),
        annotations: fromContent.of(true),
        scrollIntoView: focused.value,
    });
    updateCompletions();
}

// The content's listeners can be called several times in one change, and while CodeMirror is
// updating, so the sync waits for the current task's microtasks
let syncQueued = false;
function queueSync(): void
{
    if (!syncQueued)
    {
        syncQueued = true;
        queueMicrotask(() =>
        {
            syncQueued = false;
            sync();
        });
    }
}

content.addChangeListener(() =>
{
    queueSync();
    emit("change", save(false));
});
content.addCaretPositionListener((caretPos, reason) =>
{
    // Java: TopLevelEditor's listener showing the completions, and InformationPopup.caretMoved
    if (reason !== EditorContent.CaretMoveReason.FORCED_SAVE)
    {
        shownGroups = content.getLexerResult().getCompletionsFor(caretPos);
        display.showCompletions(shownGroups);
    }
    caretMoved(caretPos);
    queueSync();
});

// Java: InformationPopup's displays (by type: errors, then warnings, information and prompts)
const infoDisplays = new Map<TopLevelEditor.DisplayType, InfoShown>();

// Java: InformationPopup.caretMoved
function caretMoved(caretPos: CanonicalLocation): void
{
    const errors: StyledString[] = [];
    const fixes: TextQuickFix[] = [];
    for (const error of content.getErrors())
    {
        if (error.location.touches(caretPos))
        {
            if (error.caretHasLeftSinceEdit)
            {
                errors.push(error.error);
                fixes.push(...error.quickFixes);
            }
        }
        else
            error.caretHasLeftSinceEdit = true;
    }
    infoDisplays.clear();
    if (errors.length > 0)
        infoDisplays.set(TopLevelEditor.DisplayType.ERROR, { type: TopLevelEditor.DisplayType.ERROR, text: StyledString.intercalate(StyledString.s("\n"), errors), fixes });
    for (const [type, value] of content.getDisplayFor(caretPos, null))
        infoDisplays.set(type, { type, text: value.getFirst(), fixes: value.getSecond() });
    updateShowHide();
}

// Java: InformationPopup.updateShowHide
function updateShowHide(): void
{
    const first = [...infoDisplays.values()].sort((a, b) => a.type - b.type)[0] ?? null;
    info.value = focused.value ? first : null;
}

// Java: InformationPopup.triggerFix and TopLevelEditor.makeFixInfo.
// PORT-DEFERRED: a fix which is an action (Java: QuickFixAction.doAction, such as moving a
// Calculate column, which closes the dialog) is the expression editor's (Phase 10).
function triggerFix(fixIndex: number): void
{
    const fix = info.value?.fixes[fixIndex];
    if (fix === undefined)
        return;
    fix.getReplacement().either_(_action => {}, replacement =>
    {
        content.replaceText(replacement.getFirst().start, replacement.getFirst().end, replacement.getSecond());
    });
    infoDisplays.clear();
    updateShowHide();
}

function updateCompletions(): void
{
    const window = display._test_getAutoComplete()._test_getWindow();
    if (window === null || view === null)
    {
        completions.value = null;
        return;
    }
    // Java: LexAutoComplete.updateWindowPosition, below the earliest completion's start
    const items = window.listView.getItems();
    const startPos = items.length === 0 ? content.getCaretPosition() : Math.min(...items.map(c => c.startPos));
    const v = view;
    const displayPos = content.mapContentToDisplay(startPos);
    completions.value = {
        groups: shownGroups,
        selected: window.listView.getSelectedItem(),
        listView: window.listView,
        anchor: {
            getBoundingClientRect: (): DOMRect =>
            {
                const r = v.coordsAtPos(Math.min(displayPos, v.state.doc.length));
                return r === null ? new DOMRect() : new DOMRect(r.left, r.top, 0, r.bottom - r.top);
            },
        },
    };
}

// Inserting a documentation example (Java: LexAutoCompleteWindow.enableInsertLinks)
function insertExample(text: string): void
{
    content.insert(completions.value?.selected?.startPos ?? null, text);
}

// Java's key codes, for EditorDisplay.keyPressed
const KEY_NAMES: Readonly<Record<string, string>> = {
    ArrowLeft: "LEFT", ArrowRight: "RIGHT", ArrowUp: "UP", ArrowDown: "DOWN", Home: "HOME", End: "END",
    PageUp: "PAGE_UP", PageDown: "PAGE_DOWN", Backspace: "BACK_SPACE", Delete: "DELETE", Escape: "ESCAPE",
    Enter: "ENTER", Tab: "TAB",
};

// Java: EditorDisplay's KEY_PRESSED handler.  Returns whether the key's default is prevented.
function keyPressed(e: KeyboardEvent): boolean
{
    if (e.isComposing)
        return false;
    // Java consumes every key pressed, except Enter without completions (for the dialog's default
    // button); the typed characters still come as input.  Tab without completions moves the focus, as
    // it does elsewhere (Java's did nothing in these editors: parentFocusRightOfThis did nothing).
    const completionsShowing = display._test_getAutoComplete().isShowing();
    if ((e.key === "Enter" || e.key === "Tab") && !completionsShowing)
        return e.key === "Enter";
    e.stopPropagation();
    const mac = isMac();
    const shortcut = mac ? e.metaKey : e.ctrlKey;
    const fKey = /^F(\d+)$/.exec(e.key);
    if (e.shiftKey && fKey !== null)
    {
        // Shift+F1 is the first fix
        triggerFix(Number(fKey[1]) - 1);
        return true;
    }
    if (shortcut && e.key.toLowerCase() === "a")
    {
        display.selectAll();
        return true;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown")
    {
        if (!display._test_getAutoComplete().isShowing())
        {
            moveVertically(e.key === "ArrowDown", e.shiftKey);
            return true;
        }
    }
    const name = KEY_NAMES[e.key] ?? (shortcut && /^[zy]$/i.test(e.key) ? e.key.toUpperCase() : null);
    if (name === null)
        return false;
    display.keyPressed(name, { shift: e.shiftKey, shortcut, wordSkip: mac ? e.altKey : e.ctrlKey });
    updateCompletions();
    // Enter never adds a line
    return true;
}

// Up and Down: Java positions the caret as a click 8 pixels below the caret's bottom (or above its
// top) would
function moveVertically(down: boolean, shift: boolean): void
{
    if (view === null)
        return;
    const caret = view.coordsAtPos(view.state.selection.main.head);
    if (caret !== null)
        positionCaretAt(caret.left, down ? caret.bottom + 8 : caret.top - 8, !shift);
}

/**
 * Java: EditorDisplay.positionCaret(x, y, moveAnchor), for clicks, drags and Up and Down.  (Java bug,
 * fixed: Java took the display position at the point and mapped it to the caret position nearest in
 * the text, which could be on another line: on an @if over several lines, Down from after "@if" stayed
 * on the first line, and a click in a line's indent went to the end of the line above.)  Here it's the
 * caret position nearest on screen: on the line nearest the point, the nearest across.
 */
function positionCaretAt(x: number, y: number, moveAnchor: boolean): void
{
    if (view === null)
        return;
    let best: CanonicalLocation | null = null;
    let bestDistance: readonly [number, number] = [Infinity, Infinity];
    for (const pos of content.getValidCaretPositions())
    {
        const r = view.coordsAtPos(content.mapContentToDisplay(pos));
        if (r === null)
            continue;
        const distance = [y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0, Math.abs(r.left - x)] as const;
        if (distance[0] < bestDistance[0] || (distance[0] === bestDistance[0] && distance[1] < bestDistance[1]))
        {
            best = pos;
            bestDistance = distance;
        }
    }
    if (best !== null)
        content.positionCaret(best, moveAnchor);
}

// Java: EditorDisplay.selectWordAt
function selectWordAt(x: number, y: number): void
{
    positionCaretAt(x, y, true);
    let start = content.prevWordPosition(true);
    content.positionCaret(start, true);
    const end = content.nextWordPosition();
    if (start === end)
    {
        start = content.prevWordPosition(false);
        content.positionCaret(start, true);
    }
    content.positionCaret(end, false);
}

// Java: the MOUSE_PRESSED, MOUSE_DRAGGED and MOUSE_CLICKED handlers
function mousePressed(e: MouseEvent): boolean
{
    if (view === null || props.disabled === true || e.button !== 0)
        return false;
    e.preventDefault();
    view.focus();
    if (e.detail === 2)
        selectWordAt(e.clientX, e.clientY);
    else if (e.detail >= 3)
        display.selectAll();
    else
    {
        positionCaretAt(e.clientX, e.clientY, true);
        const drag = (m: MouseEvent): void => positionCaretAt(m.clientX, m.clientY, false);
        const release = (): void =>
        {
            window.removeEventListener("mousemove", drag);
            window.removeEventListener("mouseup", release);
        };
        window.addEventListener("mousemove", drag);
        window.addEventListener("mouseup", release);
    }
    return true;
}

// Maps a change CodeMirror made itself (an input method's composition, or a selection) to the content
function reconcile(): void
{
    if (view === null || view.composing)
        return;
    const doc = view.state.doc.toString();
    const sel = view.state.selection.main;
    if (doc !== syncedText)
    {
        let start = 0;
        while (start < doc.length && start < syncedText.length && doc[start] === syncedText[start])
            start += 1;
        let endDoc = doc.length;
        let endSynced = syncedText.length;
        while (endDoc > start && endSynced > start && doc[endDoc - 1] === syncedText[endSynced - 1])
        {
            endDoc -= 1;
            endSynced -= 1;
        }
        const inserted = doc.slice(start, endDoc);
        const selFrom = Math.min(syncedSelection.anchor, syncedSelection.head);
        const selTo = Math.max(syncedSelection.anchor, syncedSelection.head);
        // Where the change fits around the selection (a prefix and suffix match can't tell typing
        // next to the same letter from typing after it), it replaces the selection
        if (start <= selFrom && endSynced >= selTo && syncedText.slice(start, selFrom) === inserted.slice(0, selFrom - start)
            && syncedText.slice(selTo, endSynced) === inserted.slice(inserted.length - (endSynced - selTo)))
            content.replaceSelection(inserted.slice(selFrom - start, inserted.length - (endSynced - selTo)));
        else
            content.replaceText(content.mapDisplayToContent(start, true), content.mapDisplayToContent(endSynced, false), inserted);
    }
    else if (sel.anchor !== syncedSelection.anchor || sel.head !== syncedSelection.head)
    {
        content.positionCaret(content.mapDisplayToContent(sel.anchor, false), true);
        if (sel.head !== sel.anchor)
            content.positionCaret(content.mapDisplayToContent(sel.head, false), false);
    }
    sync();
}

// Java: TextEditorBase's copy, cut and paste: of the content, not the display
function selectedText(): string
{
    const from = Math.min(content.getCaretPosition(), content.getAnchorPosition());
    const to = Math.max(content.getCaretPosition(), content.getAnchorPosition());
    return content.getText().slice(from, to);
}

function focusChanged(nowFocused: boolean): void
{
    focused.value = nowFocused;
    // Java: EditorDisplay.focusChanged (and TopLevelEditor's focus listener showing the completions)
    display.focusChanged(nowFocused);
    if (nowFocused)
    {
        hasBeenFocused = true;
        content.notifyCaretPositionListeners(EditorContent.CaretMoveReason.FOCUSED);
        display.showCompletions(content.getLexerResult().getCompletionsFor(content.getCaretPosition()));
        updateCompletions();
    }
    else
        showAllErrors();
}

// Java: TopLevelEditor.save
function save(forceSaveAsIfUnfocused: boolean): EXPRESSION
{
    if (forceSaveAsIfUnfocused)
    {
        content.forceSaveAsIfUnfocused();
        showAllErrors();
    }
    return content.getLexerResult().result;
}

// Java: EditorDisplay.showAllErrors
function showAllErrors(): void
{
    for (const error of content.getErrors())
        error.caretHasLeftSinceEdit = true;
    content.notifyCaretPositionListeners(EditorContent.CaretMoveReason.FORCED_SAVE);
}

onMounted(() =>
{
    view = new EditorView({
        parent: host.value!,
        state: EditorState.create({
            doc: "",
            extensions: [
                decorations,
                editable.of(EditorView.editable.of(props.disabled !== true)),
                EditorView.lineWrapping,
                EditorView.contentAttributes.of({ spellcheck: "false", autocorrect: "off", autocapitalize: "off", translate: "no" }),
                EditorView.domEventHandlers({
                    keydown: (e) =>
                    {
                        const handled = keyPressed(e);
                        if (handled)
                            e.preventDefault();
                        return handled;
                    },
                    mousedown: (e) => mousePressed(e),
                    focus: () => focusChanged(true),
                    blur: () => focusChanged(false),
                    copy: (e) =>
                    {
                        e.clipboardData?.setData("text/plain", selectedText());
                        e.preventDefault();
                        return true;
                    },
                    cut: (e) =>
                    {
                        e.clipboardData?.setData("text/plain", selectedText());
                        content.replaceSelection("");
                        e.preventDefault();
                        return true;
                    },
                    paste: (e) =>
                    {
                        content.replaceSelection(e.clipboardData?.getData("text/plain") ?? "");
                        e.preventDefault();
                        return true;
                    },
                    // Java had no dragging of text
                    dragstart: (e) =>
                    {
                        e.preventDefault();
                        return true;
                    },
                    drop: (e) =>
                    {
                        e.preventDefault();
                        return true;
                    },
                    compositionend: () =>
                    {
                        setTimeout(reconcile);
                    },
                }),
                // Java: EditorDisplay's KEY_TYPED handler
                EditorView.inputHandler.of((v, _from, _to, text) =>
                {
                    if (v.composing)
                        return false;
                    for (const c of text)
                        display.keyTyped(c);
                    return true;
                }),
                EditorView.updateListener.of(update =>
                {
                    if (update.transactions.some(tr => tr.annotation(fromContent) !== true && (tr.docChanged || tr.selection !== undefined)))
                        queueMicrotask(reconcile);
                }),
            ],
        }),
    });
    sync();
    // Java: TopLevelEditor's constructor gives onChange the forced save
    emit("change", save(true));
});

watch(() => props.disabled, disabled =>
{
    view?.dispatch({ effects: editable.reconfigure(EditorView.editable.of(disabled !== true)) });
});

onBeforeUnmount(() =>
{
    view?.destroy();
    view = null;
});

defineExpose<TopLevelEditorApi<EXPRESSION>>({
    save,
    // Java: TopLevelEditor.focus(Focus)
    focus: (side: TopLevelEditor.Focus): void =>
    {
        content.positionCaret(side);
        view?.focus();
    },
    isFocused: (): boolean => focused.value,
    selectAll: (): void => display.selectAll(),
    setContent: (text: string): void => content.replaceWholeText(text),
    hasErrors: (): boolean => content.getErrors().length > 0,
    showAllErrors,
    _test_getRawText: (): string => content.getText(),
    _test_getContent: (): EditorContent<EXPRESSION, CodeCompletionContext> => content,
    _test_getDisplay: (): EditorDisplay => display,
    _test_getView: (): EditorView | null => view,
});
</script>

<template>
  <PopoverRoot :open="info !== null">
    <PopoverAnchor as-child>
      <div
        ref="host"
        class="top-level-editor text-editor"
        :class="[editorClass, { focused, disabled }]"
      />
    </PopoverAnchor>
    <PopoverPortal>
      <PopoverContent
        v-if="info !== null"
        side="top"
        :side-offset="4"
        :avoid-collisions="false"
        class="expression-info-popup"
        :class="TopLevelEditor.DisplayType[info.type].toLowerCase()"
        @open-auto-focus.prevent
        @close-auto-focus.prevent
        @interact-outside.prevent
        @escape-key-down.prevent
        @mousedown.prevent
      >
        <div class="expression-info-content">
          <StyledText
            v-if="info.text.toPlain() !== ''"
            class="expression-info-error"
            :text="info.text"
          />
          <FixList
            :fixes="info.fixes.map(f => ({ label: f.getTitle(), cssClasses: f.getCssClasses() }))"
            @fix="triggerFix"
          />
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
  <PopoverRoot :open="completions !== null">
    <PopoverAnchor
      v-if="completions !== null"
      :reference="completions.anchor"
    />
    <PopoverPortal>
      <PopoverContent
        v-if="completions !== null"
        side="bottom"
        align="start"
        :align-offset="-4"
        :avoid-collisions="false"
        class="lex-autocomplete-popover"
        @open-auto-focus.prevent
        @close-auto-focus.prevent
        @interact-outside.prevent
        @escape-key-down.prevent
      >
        <LexAutoCompleteWindow
          :groups="completions.groups"
          :selected="completions.selected"
          :list-view="completions.listView"
          @insert="insertExample"
          @clicked="updateCompletions"
        />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
/* Java: expression-editor.scss's .top-level-editor, and general.scss's .text-editor */
.top-level-editor {
    width: 250px;
    min-height: 25px;
    box-sizing: border-box;
    font-family: var(--font-main);
    font-size: 12pt;
    background: white;
    border: 1px solid rgb(128 128 128);
    cursor: text;
}
.top-level-editor.focused {
    outline: 1px solid var(--focus-color);
}
.top-level-editor.disabled {
    opacity: 0.4;
}
.top-level-editor :deep(.cm-editor) {
    max-height: 100%;
}
.top-level-editor :deep(.cm-editor.cm-focused) {
    outline: none;
}
.top-level-editor :deep(.cm-scroller) {
    font-family: inherit;
    line-height: 1.3;
}
.top-level-editor :deep(.cm-content) {
    padding: 2px 0;
    caret-color: var(--focus-color);
}
.top-level-editor :deep(.cm-line) {
    padding: 0 2px;
}
.top-level-editor :deep(.cm-content ::selection) {
    background: var(--focus-color);
    color: white;
}
.top-level-editor :deep(.error-underline) {
    background: var(--editor-error-background);
    box-shadow: inset 0 0 0 1px var(--editor-error-stroke);
    box-decoration-break: clone;
}
.top-level-editor :deep(.error-underline.contains-caret) {
    box-shadow: none;
}
</style>

<style>
/* The popups are outside the component (in a portal) */
.expression-info-popup {
    z-index: 1000;
    max-width: 500px;
    border: 1.5px solid;
    border-radius: 6px;
    font-family: var(--font-main);
    font-size: 10pt;
    cursor: default;
}
.expression-info-popup.error {
    background: var(--editor-popup-error);
    border-color: var(--editor-popup-error-border);
}
.expression-info-popup.warning {
    background: var(--editor-popup-error);
    border-color: var(--editor-popup-error-border);
}
.expression-info-popup.information {
    background: var(--editor-popup-information);
    border-color: var(--editor-popup-information-border);
}
.expression-info-popup.prompt {
    background: var(--editor-popup-prompt);
    border-color: var(--editor-popup-prompt-border);
}
.expression-info-content {
    padding: 0.5em 1em;
}
.expression-info-error {
    color: black;
    white-space: pre-wrap;
}
.lex-autocomplete-popover {
    z-index: 1001;
}
</style>
