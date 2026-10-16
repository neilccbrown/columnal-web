// Port of xyz.columnal.transformations.expression.QuickFix (expressions module).
import type { LocalizableKey } from "../../../anns/Annotations.js";
import type { ColumnId } from "../../../identifiers/id/ColumnId.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import type { StyledShowable } from "../../../utility-error/styled/StyledShowable.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import type { SimulationConsumer } from "../../../utility-functional/utility/function/simulation/SimulationConsumer.js";
import { Log } from "../../../utility/log/Log.js";
import { TranslationUtility } from "../../../utility/utility/TranslationUtility.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Expression } from "./Expressions.js";
import { ExpressionUtil } from "./ExpressionUtil.js";

/**
 * A quick fix for an error.  Has a title to display, and a thunk to run
 * to get a replacement expression for the error source.
 *
 * This works on a tree basis, not text-based.
 */
export class QuickFix<EXPRESSION extends StyledShowable>
{
    private readonly title: StyledString;
    // Identified by reference, not by contents/hashCode.
    private readonly replacementTarget: EXPRESSION;
    private readonly actionOrMakeReplacement: Either<QuickFix.QuickFixAction, QuickFix.QuickFixReplace<EXPRESSION>>;
    private readonly cssClasses: () => readonly string[];

    // Java: QuickFix(@LocalizableKey String titleKey, EXPRESSION replacementTarget, QuickFixReplace makeReplacement),
    // QuickFix(StyledString title, ImmutableList<String> cssClasses, EXPRESSION replacementTarget, QuickFixReplace makeReplacement)
    // and QuickFix(StyledString title, ImmutableList<String> cssClasses, EXPRESSION replacementTarget, QuickFixAction action)
    public constructor(titleKey: LocalizableKey, replacementTarget: EXPRESSION, makeReplacement: QuickFix.QuickFixReplace<EXPRESSION>);
    public constructor(title: StyledString, cssClasses: readonly string[], replacementTarget: EXPRESSION, makeReplacementOrAction: QuickFix.QuickFixReplace<EXPRESSION> | QuickFix.QuickFixAction);
    public constructor(...args: unknown[])
    {
        let title: StyledString;
        let cssClasses: readonly string[];
        let replacementTarget: EXPRESSION;
        let actionOrMakeReplacement: Either<QuickFix.QuickFixAction, QuickFix.QuickFixReplace<EXPRESSION>>;
        if (args.length === 3)
        {
            title = StyledString.s(TranslationUtility.getString(args[0] as LocalizableKey));
            cssClasses = [];
            replacementTarget = args[1] as EXPRESSION;
            actionOrMakeReplacement = Either.right(args[2] as QuickFix.QuickFixReplace<EXPRESSION>);
        }
        else
        {
            title = args[0] as StyledString;
            replacementTarget = args[2] as EXPRESSION;
            const last = args[3] as QuickFix.QuickFixReplace<EXPRESSION> | QuickFix.QuickFixAction;
            if (typeof last === "function")
            {
                cssClasses = args[1] as readonly string[];
                actionOrMakeReplacement = Either.right(last);
            }
            else
            {
                cssClasses = Utility.prependToList("quick-fix-action", args[1] as readonly string[]);
                actionOrMakeReplacement = Either.left(last);
            }
        }
        this.title = title;
        this.cssClasses = () =>
        {
            try
            {
                return Utility.concatI(cssClasses, actionOrMakeReplacement.eitherInt<readonly string[]>(_a => [], r => [ExpressionUtil.makeCssClass(r())]));
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
        return this.title;
    }

    // Gets the replacement, or action to perform
    public getActionOrReplacement(): Either<QuickFix.QuickFixAction, QuickFix.QuickFixReplace<EXPRESSION>>
    {
        return this.actionOrMakeReplacement;
    }

    public getReplacementTarget(): EXPRESSION
    {
        return this.replacementTarget;
    }

    public getCssClasses(): readonly string[]
    {
        return this.cssClasses();
    }
}

export namespace QuickFix
{
    // PORT-NOTE: Java's QuickFixAction is an interface with one method; it is an object here (so that
    // it can be told apart from a QuickFixReplace, which is a function).  The editor's scene is the
    // GUI's business, so its type is left open.
    export interface QuickFixAction
    {
        // Will only be called once.  If non-null return, force-close expression editor
        // and then run the item on the simulation thread.
        doAction(typeManager: TypeManager, editorSceneProperty: unknown): SimulationConsumer<Pair<ColumnId | null, Expression>> | null;
    }

    // Note -- may be called multiple times
    export type QuickFixReplace<EXPRESSION> = () => EXPRESSION;
}
