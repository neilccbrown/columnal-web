// The document of an editable cell while it is edited (Java: the cell's RecogniserDocument).
//
// PORT-NOTE: Java's RecogniserDocument ran the column's recogniser only when it was made and when it
// lost the focus (to show the error, and to store the value), never while typing; here the engine does
// that when the edit is stored (the "edit" request), so the main thread needs no copy of the column's
// type.  The cell then shows what the engine sends back.
import { DisplayDocument } from "../../gui-logic/stf/gui/dtf/DisplayDocument.js";
import type { KeyCode } from "../../gui-logic/stf/gui/dtf/Document.js";
import { ReadOnlyDocument } from "../../gui-logic/stf/gui/dtf/ReadOnlyDocument.js";

export class CellEditDocument extends DisplayDocument
{
    private valueOnFocusGain: string;
    private readonly error: boolean;
    private readonly relinquishFocus: (keyCode: KeyCode) => void;
    private readonly save: (text: string) => void;

    /**
     * error: whether the cell showed an error when the edit began (Java: hasError stays as it was
     * recognised until the focus is lost).  save stores the text, if it changed while focused.
     */
    public constructor(initialContent: string, error: boolean, relinquishFocus: (keyCode: KeyCode) => void, save: (text: string) => void)
    {
        super(initialContent);
        this.valueOnFocusGain = initialContent;
        this.error = error;
        this.relinquishFocus = relinquishFocus;
        this.save = save;
    }

    public override focusChanged(focused: boolean): void
    {
        if (focused)
            this.valueOnFocusGain = this.getText();
        else if (this.getText() !== this.valueOnFocusGain)
            this.save(this.getText());
    }

    public override hasError(): boolean
    {
        return this.error;
    }

    public override defocus(defocusCause: KeyCode): void
    {
        this.relinquishFocus(defocusCause);
    }

    public override setAndSave(content: string): void
    {
        this.replaceText(0, this.getLength(), content);
        this.save(content);
    }

    public override getUndo(): string | null
    {
        return this.valueOnFocusGain;
    }
}

/**
 * The document of a read-only cell (an error, or a column that can't be edited) while it is focused
 * (Java: ReadOnlyDocument).  Java's didn't end the edit on Escape, Enter or Tab (ReadOnlyDocument kept
 * Document's defocus, which does nothing), so only clicking elsewhere did; this ends it as for an
 * editable cell.
 */
export class ReadOnlyCellDocument extends ReadOnlyDocument
{
    private readonly relinquishFocus: (keyCode: KeyCode) => void;

    public constructor(content: string, error: boolean, relinquishFocus: (keyCode: KeyCode) => void)
    {
        super(content, error);
        this.relinquishFocus = relinquishFocus;
    }

    public override defocus(defocusCause: KeyCode): void
    {
        this.relinquishFocus(defocusCause);
    }
}
