// Port of xyz.columnal.gui.lexeditor.TextQuickFix (lex-editor module).
import type { CanonicalLocation, LocalizableKey } from "../../../../engine/anns/Annotations.js";
import type { CanonicalSpan } from "../../../../engine/expressions/transformations/expression/CanonicalSpan.js";
import { ExpressionUtil } from "../../../../engine/expressions/transformations/expression/ExpressionUtil.js";
import type { QuickFix } from "../../../../engine/expressions/transformations/expression/QuickFix.js";
import { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../engine/utility-error/error/InternalException.js";
import type { StyledShowable } from "../../../../engine/utility-error/styled/StyledShowable.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";
import { Log } from "../../../../engine/utility/log/Log.js";
import { TranslationUtility } from "../../../../engine/utility/utility/TranslationUtility.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";

/**
 * A quick fix for an error.  Has a title to display, and a thunk to run
 * to get a replacement chunk for the error source.
 *
 * This quick fix relates to a span of text in the source that will be replaced,
 * as opposed to a tree-based quick fix.
 */
export class TextQuickFix
{
    private readonly title: StyledString;
    // Identified by position:
    private readonly replacementTarget: CanonicalSpan;
    private readonly actionOrMakeReplacement: Either<QuickFix.QuickFixAction, QuickFix.QuickFixReplace<Pair<string, StyledString>>>;
    private readonly cssClasses: () => readonly string[];
    private cachedTitle: StyledString | null = null;

    /**
     * Java has four constructors: (titleKey, replacementTarget, makeReplacement),
     * (title, cssClasses, replacementTarget, makeReplacement), the private
     * (title, cssClasses, replacementTarget, actionOrMakeReplacement), and
     * (location, toText, treeFix), which turns a tree-based quick fix into a text one.
     */
    public constructor(titleKey: LocalizableKey, replacementTarget: CanonicalSpan, makeReplacement: QuickFix.QuickFixReplace<Pair<string, StyledString>>);
    public constructor(title: StyledString, cssClasses: readonly string[], replacementTarget: CanonicalSpan, makeReplacement: QuickFix.QuickFixReplace<Pair<string, StyledString>> | Either<QuickFix.QuickFixAction, QuickFix.QuickFixReplace<Pair<string, StyledString>>>);
    public constructor(location: CanonicalSpan, toText: (e: never) => string, treeFix: QuickFix<StyledShowable>);
    public constructor(...args: unknown[])
    {
        let title: StyledString;
        let cssClasses: readonly string[];
        let replacementTarget: CanonicalSpan;
        let actionOrMakeReplacement: Either<QuickFix.QuickFixAction, QuickFix.QuickFixReplace<Pair<string, StyledString>>>;
        if (args.length === 3 && typeof args[0] === "string")
        {
            title = StyledString.s(TranslationUtility.getString(args[0]));
            cssClasses = [];
            replacementTarget = args[1] as CanonicalSpan;
            actionOrMakeReplacement = Either.right(args[2] as QuickFix.QuickFixReplace<Pair<string, StyledString>>);
        }
        else if (args.length === 3)
        {
            const location = args[0] as CanonicalSpan;
            const toText = args[1] as (e: StyledShowable) => string;
            const treeFix = args[2] as QuickFix<StyledShowable>;
            title = treeFix.getTitle();
            cssClasses = treeFix.getCssClasses();
            replacementTarget = location;
            actionOrMakeReplacement = treeFix.getActionOrReplacement().map((m: QuickFix.QuickFixReplace<StyledShowable>) => () =>
            {
                const s = m();
                return new Pair(toText(s), s.toStyledString());
            });
        }
        else
        {
            title = args[0] as StyledString;
            cssClasses = args[1] as readonly string[];
            replacementTarget = args[2] as CanonicalSpan;
            const last = args[3] as QuickFix.QuickFixReplace<Pair<string, StyledString>> | Either<QuickFix.QuickFixAction, QuickFix.QuickFixReplace<Pair<string, StyledString>>>;
            actionOrMakeReplacement = last instanceof Either ? last : Either.right(last);
        }
        this.title = title;
        const actionOrMakeReplacementFinal = actionOrMakeReplacement;
        this.cssClasses = () =>
        {
            try
            {
                return Utility.concatI(cssClasses, actionOrMakeReplacementFinal.eitherInt<readonly string[]>(_a => [], m => [ExpressionUtil.makeCssClass(m().getFirst())]));
            }
            catch (e)
            {
                if (!(e instanceof InternalException))
                    throw e;
                Log.log(e);
                return cssClasses;
            }
        };
        this.replacementTarget = replacementTarget;
        this.actionOrMakeReplacement = actionOrMakeReplacement;
    }

    public getTitle(): StyledString
    {
        if (this.cachedTitle !== null)
            return this.cachedTitle;

        let replacement: StyledString;
        try
        {
            replacement = this.actionOrMakeReplacement.eitherInt(_a => StyledString.s(""), m => m().getSecond());
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
            replacement = StyledString.s("");
        }
        this.cachedTitle = StyledString.concat(this.title, StyledString.s(" ⇾ "), replacement);
        return this.cachedTitle;
    }

    public getReplacementTarget(): CanonicalSpan
    {
        return this.replacementTarget;
    }

    // Gets the replacement target (first item) and replacement (second item)
    public getReplacement(): Either<QuickFix.QuickFixAction, Pair<CanonicalSpan, string>>
    {
        return this.actionOrMakeReplacement.mapInt(m => new Pair(this.replacementTarget, m().getFirst()));
    }

    public getCssClasses(): readonly string[]
    {
        return this.cssClasses();
    }

    public offsetBy(caretPosOffset: CanonicalLocation): TextQuickFix
    {
        return new TextQuickFix(this.title, this.cssClasses(), this.replacementTarget.offsetBy(caretPosOffset), this.actionOrMakeReplacement);
    }
}
