// Port of xyz.columnal.gui.lexeditor.completion.LexCompletionGroup (lex-editor-completion module).
import type { CanonicalLocation } from "../../../../../engine/anns/Annotations.js";
import type { StyledString } from "../../../../../engine/utility-error/styled/StyledString.js";
import { Utility } from "../../../../../engine/utility/utility/Utility.js";
import type { LexCompletion } from "./LexCompletion.js";

export class LexCompletionGroup
{
    /** @internal Java: package-visible */
    public readonly completions: readonly LexCompletion[];
    /** @internal Java: package-visible */
    public readonly header: StyledString | null;
    // How many items to show as a minimum if the group is collapsed
    /** @internal Java: package-visible */
    public readonly minCollapsed: number;

    public constructor(completions: readonly LexCompletion[], header: StyledString | null, minCollapsed: number)
    {
        this.completions = completions;
        this.header = header;
        this.minCollapsed = minCollapsed;
    }

    public filterForPos(caretPos: CanonicalLocation): LexCompletionGroup | null
    {
        const filtered = this.completions.filter(c => c.showFor(caretPos));
        if (filtered.length === 0)
            return null;
        return new LexCompletionGroup(filtered, this.header, this.minCollapsed);
    }

    public offsetBy(offsetBy: CanonicalLocation): LexCompletionGroup
    {
        const offset = Utility.mapListI(this.completions, c => c.offsetBy(offsetBy));
        return new LexCompletionGroup(offset, this.header, this.minCollapsed);
    }
}
