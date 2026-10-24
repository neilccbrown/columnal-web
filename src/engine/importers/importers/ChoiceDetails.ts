// Port of xyz.columnal.importers.ChoiceDetails (importers module).
import type { HelpKey, Localized, LocalizableKey } from "../../anns/Annotations.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";

/**
 * Contains information about a given choice, e.g. is free entry allowed,
 * get help on the item, etc).
 */
export class ChoiceDetails<C>
{
    private readonly labelKey: LocalizableKey;
    private readonly helpKey: HelpKey;
    public readonly quickPicks: readonly C[];
    // If null, quick picks are the only options.  If non-null, offer an "Other" pick
    // in the combo box which shows a text field:
    public readonly stringEntry: ((s: string) => Either<Localized, C>) | null;

    public constructor(labelKey: LocalizableKey, helpKey: HelpKey, quickPicks: readonly C[], stringEntry: ((s: string) => Either<Localized, C>) | null)
    {
        this.labelKey = labelKey;
        this.helpKey = helpKey;
        this.quickPicks = quickPicks;
        this.stringEntry = stringEntry;
    }

    public getLabelKey(): LocalizableKey
    {
        return this.labelKey;
    }

    public getHelpId(): HelpKey
    {
        return this.helpKey;
    }

    // Does this item have no possible choices?
    public isEmpty(): boolean
    {
        return this.quickPicks.length === 0 && this.stringEntry === null;
    }
}
