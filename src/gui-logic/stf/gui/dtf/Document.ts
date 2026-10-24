// Port of xyz.columnal.gui.dtf.Document (stf module): the content of a cell's text field.
//
// PORT-NOTE: Java's KeyCode (the key that moved focus away) is a string here, the name of the
// JavaFX KeyCode (such as "ESCAPE", "ENTER" or "TAB"); the GUI maps its keys to these.  Menu items
// are the GUI's own, which the document only passes on (MenuItem is unknown here).
import type { CanonicalLocation } from "../../../../engine/anns/Annotations.js";
import type { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";

/** Java: javafx.scene.input.KeyCode, by name (see the PORT-NOTE above). */
export type KeyCode = string;

/** Java: javafx.scene.control.MenuItem, made by the GUI. */
export type MenuItem = unknown;

export abstract class Document
{
    private readonly listeners: Document.DocumentListener[] = [];

    // Package-protected
    /** @internal */
    public abstract getStyledSpans(focused: boolean): Pair<ReadonlySet<string>, string>[];
    // Package-protected
    /** @internal */
    public abstract replaceText(startPosIncl: number, endPosExcl: number, text: string): void;
    // Package-protected
    /** @internal */
    public abstract trackPosition(pos: number, bias: Document.TrackedPosition.Bias, onChange: (() => void) | null): Document.TrackedPosition;
    public abstract getLength(): number;
    /** @internal */
    public abstract isEditable(): boolean;
    public abstract getText(): string;

    /** @internal */
    public abstract hasError(): boolean;
    /** @internal */
    public abstract focusChanged(focused: boolean): void;

    // Bit weird in Document, but it's easiest that way
    /** @internal */
    public defocus(_defocusCause: KeyCode): void
    {
    }

    /** @internal */
    public mapCaretPos(pos: number): number
    {
        return pos;
    }

    /** @internal */
    public addListener(listener: Document.DocumentListener): void
    {
        this.listeners.push(listener);
    }

    /** @internal */
    public removeListener(listener: Document.DocumentListener): void
    {
        for (let i = this.listeners.indexOf(listener); i !== -1; i = this.listeners.indexOf(listener))
            this.listeners.splice(i, 1);
    }

    protected notifyListeners(): void
    {
        for (const listener of [...this.listeners])
        {
            listener(this);
        }
    }

    public abstract setAndSave(content: string): void;

    // Value to undo to, if applicable.  null if n/a
    public getUndo(): string | null
    {
        return null;
    }

    public getAdditionalMenuItems(_focused: boolean): readonly MenuItem[]
    {
        return [];
    }
}

export namespace Document
{
    export class TrackedPosition
    {
        private readonly bias: TrackedPosition.Bias;
        private readonly onChange: (() => void) | null;
        private position: number;

        /** @internal Java: package-visible */
        public constructor(position: number, bias: TrackedPosition.Bias, onChange: (() => void) | null)
        {
            this.bias = bias;
            this.position = position;
            this.onChange = onChange;
        }

        public getBias(): TrackedPosition.Bias
        {
            return this.bias;
        }

        public getPosition(): CanonicalLocation
        {
            return this.position;
        }

        public moveBy(amount: number): void
        {
            this.position += amount;
            if (this.onChange !== null)
                this.onChange();
        }

        public moveTo(newPos: number): void
        {
            this.position = newPos;
            if (this.onChange !== null)
                this.onChange();
        }
    }

    export namespace TrackedPosition
    {
        export enum Bias { BACKWARD, FORWARD }
    }

    // Java: an interface with one method, documentChanged(Document)
    export type DocumentListener = (document: Document) => void;
}
