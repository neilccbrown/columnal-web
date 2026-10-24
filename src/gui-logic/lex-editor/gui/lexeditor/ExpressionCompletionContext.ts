// Port of xyz.columnal.gui.lexeditor.ExpressionCompletionContext (lex-editor module).
import type { CanonicalLocation } from "../../../../engine/anns/Annotations.js";
import type { LexCompletionGroup } from "../../../lex-editor-completion/gui/lexeditor/completion/LexCompletionGroup.js";
import { CodeCompletionContext } from "./CodeCompletionContext.js";

export class ExpressionCompletionContext extends CodeCompletionContext
{
    // Java has two constructors: (completions) and (nestedCompletions, offsetBy)
    public constructor(completions: readonly LexCompletionGroup[]);
    public constructor(nestedCompletions: CodeCompletionContext, offsetBy: CanonicalLocation);
    public constructor(a: readonly LexCompletionGroup[] | CodeCompletionContext, offsetBy?: CanonicalLocation)
    {
        if (a instanceof CodeCompletionContext)
            super(a, offsetBy!);
        else
            super(a);
    }
}
