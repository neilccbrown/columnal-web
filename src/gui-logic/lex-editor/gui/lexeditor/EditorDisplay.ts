// Port of the logic of xyz.columnal.gui.lexeditor.EditorDisplay (lex-editor module): how its key
// handlers change the editor's content, caret and completions, and choosing a completion.
//
// PORT-DEFERRED: the display itself (Phase 10, with the editor; see TopLevelEditor): rendering
// (including the error underlines), the mouse, focus, the clipboard, the further details of a
// completion, and the keys which only act on those (UP and DOWN without completions showing,
// ENTER without completions, TAB without completions, shortcut-A/X/C/V, shift-F keys for fixes).
import type { CanonicalLocation } from "../../../../engine/anns/Annotations.js";
import type { StyledShowable } from "../../../../engine/utility-error/styled/StyledShowable.js";
import { LexAutoComplete } from "../../../lex-editor-completion/gui/lexeditor/completion/LexAutoComplete.js";
import type { LexCompletion } from "../../../lex-editor-completion/gui/lexeditor/completion/LexCompletion.js";
import type { LexCompletionGroup } from "../../../lex-editor-completion/gui/lexeditor/completion/LexCompletionGroup.js";
import type { CodeCompletionContext } from "./CodeCompletionContext.js";
import type { EditorContent } from "./EditorContent.js";

type AnyEditorContent = EditorContent<StyledShowable, CodeCompletionContext>;

export class EditorDisplay
{
    private readonly content: AnyEditorContent;
    private readonly autoComplete: LexAutoComplete;
    // Java: Node.isFocused, set by the GUI
    private focused = true;

    public constructor(theContent: AnyEditorContent)
    {
        this.autoComplete = new LexAutoComplete({
            insert: (start: CanonicalLocation | null, text: string): void =>
            {
                theContent.insert(start, text);
            },

            complete: (c: LexCompletion): void =>
            {
                this.triggerSelection(c);
            },
        });
        this.content = theContent;
    }

    /**
     * Java: the KEY_TYPED handler.  Typing a closing bracket or quote which is already after the caret
     * overtypes it (if the brackets are balanced); typing an opening bracket or quote also adds its
     * closing one after the caret (unless in a string, or with a selection).
     */
    public keyTyped(character: string): void
    {
        const content = this.content;
        if (")}]\"".includes(character) && content.getCaretPosition() < content.getText().length && content.getText().charAt(content.getCaretPosition()) === character.charAt(0) && content.areBracketsBalanced())
        {
            // Overtype instead
            content.positionCaret(content.getCaretPosition() + 1, true);
        }
        else if ("({[\"".includes(character) && !content.suppressBracketMatch(content.getCaretPosition()) && content.getCaretPosition() === content.getAnchorPosition())
        {
            content.replaceSelection(character);
            if (character === "(")
                content.replaceSelection(")", true);
            else if (character === "[")
                content.replaceSelection("]", true);
            else if (character === "{")
                content.replaceSelection("}", true);
            else // Add a duplicate:
                content.replaceSelection(character, true);
        }
        else
        {
            content.replaceSelection(character);
        }
    }

    /**
     * Java: the KEY_PRESSED handler, for the keys which act on the content, caret and completions.
     * Key is the name of Java's KeyCode.  Returns false for the keys left to the GUI.
     */
    public keyPressed(key: string, modifiers: EditorDisplay.KeyModifiers): boolean
    {
        const content = this.content;
        const caretPositions = content.getValidCaretPositions();
        const caretPosIndex = content.getCaretPosAsValidIndex();
        const caretPosition = content.getCaretPosition();
        switch (key)
        {
            case "LEFT":
                if (caretPosition !== content.getAnchorPosition() && !modifiers.shift)
                {
                    const start: CanonicalLocation = Math.min(caretPosition, content.getAnchorPosition());
                    content.positionCaret(start, true);
                }
                else if (modifiers.wordSkip)
                    content.positionCaret(content.prevWordPosition(false), !modifiers.shift);
                else if (caretPosIndex > 0)
                    content.positionCaret(caretPositions[caretPosIndex - 1]!, !modifiers.shift);
                return true;
            case "RIGHT":
                if (caretPosition !== content.getAnchorPosition() && !modifiers.shift)
                {
                    const end: CanonicalLocation = Math.max(caretPosition, content.getAnchorPosition());
                    content.positionCaret(end, true);
                }
                else if (modifiers.wordSkip)
                    content.positionCaret(content.nextWordPosition(), !modifiers.shift);
                else if (caretPosIndex + 1 < caretPositions.length)
                    content.positionCaret(caretPositions[caretPosIndex + 1]!, !modifiers.shift);
                return true;
            case "HOME":
                if (caretPositions.length > 0)
                    content.positionCaret(caretPositions[0]!, !modifiers.shift);
                return true;
            case "END":
                if (caretPositions.length > 0)
                    content.positionCaret(caretPositions[caretPositions.length - 1]!, !modifiers.shift);
                return true;
            case "DOWN":
                if (this.autoComplete.isShowing())
                {
                    this.autoComplete.down();
                    return true;
                }
                // Moving the caret down a line is left to the GUI
                return false;
            case "UP":
                if (this.autoComplete.isShowing())
                {
                    this.autoComplete.up();
                    return true;
                }
                // Moving the caret up a line is left to the GUI
                return false;
            case "PAGE_DOWN":
                if (this.autoComplete.isShowing())
                    this.autoComplete.pageDown();
                return true;
            case "PAGE_UP":
                if (this.autoComplete.isShowing())
                    this.autoComplete.pageUp();
                return true;
            case "BACK_SPACE":
                if (caretPosition !== content.getAnchorPosition())
                    content.replaceSelection("");
                else if (caretPosition > 0)
                    content.replaceText(caretPosition - 1, caretPosition, "");
                return true;
            case "DELETE":
                if (caretPosition !== content.getAnchorPosition())
                    content.replaceSelection("");
                else if (caretPosition < content.getText().length)
                    content.replaceText(caretPosition, caretPosition + 1, "");
                return true;
            case "Z":
                if (modifiers.shortcut)
                {
                    if (modifiers.shift)
                        content.redo();
                    else
                        content.undo();
                }
                return true;
            case "Y":
                if (modifiers.shortcut)
                    content.redo();
                return true;
            case "ESCAPE":
                this.showCompletions(null);
                return true;
            case "ENTER":
            {
                if (!this.autoComplete.isShowing())
                    return false;
                const selected = this.autoComplete.getSelectedCompletion();
                if (selected !== null)
                    this.triggerSelection(selected);
                return true;
            }
            case "TAB":
            {
                // Without completions, Java moves the focus, which is left to the GUI
                if (!this.autoComplete.isShowing())
                    return false;
                const selected = this.autoComplete.getSelectedCompletion();
                if (selected !== null)
                    this.triggerSelection(selected);
                return true;
            }
            default:
                return false;
        }
    }

    /** Java: part of focusChanged; the GUI calls this when the focus changes. */
    public focusChanged(focused: boolean): void
    {
        this.focused = focused;
        if (!focused)
            this.showCompletions(null);
    }

    public selectAll(): void
    {
        this.content.positionCaret(0, true);
        this.content.positionCaret(this.content.getText().length, false);
    }

    /**
     * PORT-NOTE: for a completion without content, Java opens its further details (a help page)
     * in the system's browser; that is left to the GUI, through openFurtherDetails.
     */
    private triggerSelection(p: LexCompletion): void
    {
        if (p.content !== null)
        {
            this.content.replaceText(p.startPos, this.content.getCaretPosition(), p.content, p.startPos + p.relativeCaretPos);
        }
        else if (p.furtherDetails !== null)
        {
            p.furtherDetails.ifRight(furtherDetailsURL => EditorDisplay.openFurtherDetails(furtherDetailsURL.getFirst()));
        }
    }

    // Java: package-visible
    public showCompletions(completions: readonly LexCompletionGroup[] | null): void
    {
        if (completions !== null && this.focused)
            this.autoComplete.show(completions);
        else
            this.autoComplete.hide(false);
    }

    public _test_getAutoComplete(): LexAutoComplete
    {
        return this.autoComplete;
    }
}

export namespace EditorDisplay
{
    /**
     * The modifiers of a key press.  wordSkip is Java's FXUtility.wordSkip: alt on macOS, control
     * elsewhere.
     */
    export interface KeyModifiers
    {
        readonly shift: boolean;
        readonly shortcut: boolean;
        readonly wordSkip: boolean;
    }

    /** Opens a help page (a resource's name); the GUI sets this, until then it does nothing. */
    export let openFurtherDetails: (resourceName: string) => void = _resourceName => {};

    export function setOpenFurtherDetails(open: (resourceName: string) => void): void
    {
        openFurtherDetails = open;
    }
}
