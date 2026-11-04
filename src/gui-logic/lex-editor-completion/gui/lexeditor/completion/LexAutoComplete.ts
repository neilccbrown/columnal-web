// Port of the logic of xyz.columnal.gui.lexeditor.completion.LexAutoComplete (lex-editor-completion
// module): showing and hiding the completions, moving the selection, and the selected completion.
//
// PORT-NOTE: Java shows the window after the next layout, positioned below the caret on screen,
// and only if there are completions (and the caret is on screen), keeping the position updated
// on a timer; here show() shows it if there are completions.  The positioning, its
// EditorDisplayInterface, are in src/gui/lexeditor/TopLevelEditor.vue.
import type { LexCompletion } from "./LexCompletion.js";
import { LexAutoCompleteWindow } from "./LexAutoCompleteWindow.js";
import type { LexCompletionGroup } from "./LexCompletionGroup.js";
import type { LexCompletionListener } from "./LexCompletionListener.js";

export class LexAutoComplete
{
    private readonly window: LexAutoCompleteWindow;
    // When the user clicks on the code completion, they can sometimes click more than is needed, especially using
    // double-click to select an item, when actually single-click on an already-selected item is enough.  This can cause
    // issues with the click falling through to the item beneath, which they didn't intend.  So we add "click immunity";
    // for a short period of time after the click that dismisses code completion, further clicks won't register on the
    // item beneath.  This value is for comparing to Date.now()
    private clickImmuneUntil = -1;

    public constructor(triggerCompletion: LexCompletionListener)
    {
        this.window = new LexAutoCompleteWindow(triggerCompletion);
    }

    public show(groups: readonly LexCompletionGroup[]): void
    {
        this.window.setCompletions(groups);
        // Java: updateWindowPosition, after the next layout:
        if (this.window.listView.getItems().length !== 0)
            this.window.show();
        else
            this.hide(false);
    }

    public hide(becauseOfMouseClick: boolean): void
    {
        this.window.hide();
        this.window.setCompletions([]);
        if (becauseOfMouseClick)
        {
            this.clickImmuneUntil = Date.now() + 400;
        }
    }

    public isMouseClickImmune(): boolean
    {
        return Date.now() < this.clickImmuneUntil;
    }

    public isShowing(): boolean
    {
        return this.window.isShowing();
    }

    public down(): void
    {
        this.window.listView.down();
    }

    public up(): void
    {
        this.window.listView.up();
    }

    public pageDown(): void
    {
        this.window.listView.pageDown();
    }

    public pageUp(): void
    {
        this.window.listView.pageUp();
    }

    // Java: returns Optional<LexCompletion>
    public getSelectedCompletion(): LexCompletion | null
    {
        return this.window.listView.getSelectedItem();
    }

    /** For the tests: Java's tests find the LexAutoCompleteWindow among the open windows. */
    public _test_getWindow(): LexAutoCompleteWindow | null
    {
        return this.window.isShowing() ? this.window : null;
    }
}

export namespace LexAutoComplete
{
    export enum LexSelectionBehaviour
    {
        SELECT_IF_ONLY,
        SELECT_IF_TOP,
        NO_AUTO_SELECT,
    }
}
