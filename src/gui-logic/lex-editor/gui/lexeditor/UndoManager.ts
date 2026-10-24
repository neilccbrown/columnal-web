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
     * PORT-NOTE: bug fix.  Java added the new content at the end without discarding any undone
     * entries, and without moving curIndex if there had been undos; and as the editor reports the
     * content set by undo and redo as a change too, they added entries themselves.  So after an undo
     * and an edit, redo brought back the undone text, and undo went back to the wrong states.  Here
     * a change to the current entry's content (as undo and redo make) is not a new state, and a new
     * state discards the undone ones.
     */
    public contentChanged(newContent: string, caretPosition: CanonicalLocation): void
    {
        if (this.undoList[this.curIndex]!.getFirst() === newContent)
            return;
        this.undoList.splice(this.curIndex + 1);
        this.undoList.push(new Pair<string, CanonicalLocation>(newContent, caretPosition));
        this.curIndex = this.undoList.length - 1;
    }
}
