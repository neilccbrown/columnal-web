// What TopLevelEditor.vue exposes (a generic component's instance type can't be named from outside).
import type { EditorView } from "@codemirror/view";
import type { StyledShowable } from "../../engine/utility-error/styled/StyledShowable.js";
import type { CodeCompletionContext } from "../../gui-logic/lex-editor/gui/lexeditor/CodeCompletionContext.js";
import type { EditorContent } from "../../gui-logic/lex-editor/gui/lexeditor/EditorContent.js";
import type { EditorDisplay } from "../../gui-logic/lex-editor/gui/lexeditor/EditorDisplay.js";
import type { TopLevelEditor } from "../../gui-logic/lex-editor/gui/lexeditor/TopLevelEditor.js";

export interface TopLevelEditorApi<EXPRESSION extends StyledShowable>
{
    save(forceSaveAsIfUnfocused: boolean): EXPRESSION;
    focus(side: TopLevelEditor.Focus): void;
    isFocused(): boolean;
    selectAll(): void;
    setContent(text: string): void;
    // Replaces the selection with the text (Java: the column picker's insertion of a column reference)
    replaceSelection(text: string): void;
    hasErrors(): boolean;
    showAllErrors(): void;
    // Java: isMouseClickImmune, just after a click chose a completion
    isMouseClickImmune(): boolean;
    _test_getRawText(): string;
    _test_getContent(): EditorContent<EXPRESSION, CodeCompletionContext>;
    _test_getDisplay(): EditorDisplay;
    _test_getView(): EditorView | null;
}

/** For tests: the editor shown by each editor element (Java's tests found the EditorDisplay node). */
export const _test_editors = new WeakMap<Element, TopLevelEditorApi<StyledShowable>>();
