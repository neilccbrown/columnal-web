// Port of xyz.columnal.gui.lexeditor.CodeCompletionContext (lex-editor module).
import type { CanonicalLocation } from "../../../../engine/anns/Annotations.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { LexCompletionGroup } from "../../../lex-editor-completion/gui/lexeditor/completion/LexCompletionGroup.js";

export class CodeCompletionContext
{
    protected readonly completions: readonly LexCompletionGroup[];

    // Java has two constructors: (completions) and (nestedCompletions, offsetBy)
    public constructor(completions: readonly LexCompletionGroup[]);
    public constructor(nestedCompletions: CodeCompletionContext, offsetBy: CanonicalLocation);
    public constructor(a: readonly LexCompletionGroup[] | CodeCompletionContext, offsetBy?: CanonicalLocation)
    {
        if (a instanceof CodeCompletionContext)
            this.completions = Utility.mapListI(a.completions, cc => cc.offsetBy(offsetBy!));
        else
            this.completions = a;
    }

    public getCompletionsFor(caretPos: CanonicalLocation): LexCompletionGroup[]
    {
        return this.completions.flatMap(g =>
        {
            const filtered = g.filterForPos(caretPos);
            return filtered === null ? [] : [filtered];
        });
    }
}
