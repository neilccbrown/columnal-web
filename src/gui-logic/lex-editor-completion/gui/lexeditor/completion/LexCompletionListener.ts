// Port of xyz.columnal.gui.lexeditor.completion.LexCompletionListener (lex-editor-completion module).
import type { InsertListener } from "./InsertListener.js";
import type { LexCompletion } from "./LexCompletion.js";

export interface LexCompletionListener extends InsertListener
{
    complete(lexCompletion: LexCompletion): void;
}
