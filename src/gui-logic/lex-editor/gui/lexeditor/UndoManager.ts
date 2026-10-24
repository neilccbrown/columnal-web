// Port of xyz.columnal.gui.lexeditor.UndoManager (lex-editor module).
import type { CanonicalLocation } from "../../../../engine/anns/Annotations.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";

//package-visible
export class UndoManager
{
    private readonly undoList: Pair<string, CanonicalLocation>[] = [];
    private curIndex = 0;

    public constructor(originalContent: string)
    {
        this.undoList.push(new Pair<string, CanonicalLocation>(originalContent, 0));
    }

    public undo(): Pair<string, CanonicalLocation> | null
    {
        if (this.curIndex > 0)
        {
            this.curIndex -= 1;
            return this.undoList[this.curIndex]!;
        }
        return null;
    }

    public redo(): Pair<string, CanonicalLocation> | null
    {
        if (this.curIndex + 1 < this.undoList.length)
        {
            this.curIndex += 1;
            return this.undoList[this.curIndex]!;
        }
        return null;
    }

    /**
     * PORT-NOTE: if there have been undos (so curIndex is not the last entry), Java adds the new
     * content at the end, without moving curIndex or removing the undone entries, so a following
     * undo goes back further than the state that was edited, and redo brings back undone states.
     * That is kept.
     */
    public contentChanged(newContent: string, caretPosition: CanonicalLocation): void
    {
        if (this.curIndex === this.undoList.length - 1)
        {
            this.curIndex += 1;
        }
        this.undoList.push(new Pair<string, CanonicalLocation>(newContent, caretPosition));
    }
}
