// Port of xyz.columnal.gui.lexeditor.completion.InsertListener (lex-editor-completion module).
import type { CanonicalLocation } from "../../../../../engine/anns/Annotations.js";

export interface InsertListener
{
    /**
     * Replaces text between start and current caret position with text.  If start is null, use caret position.
     */
    insert(start: CanonicalLocation | null, text: string): void;
}
