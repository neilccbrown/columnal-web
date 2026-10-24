// Port of xyz.columnal.gui.lexeditor.EditorLocationAndErrorRecorder (lex-editor module).
//
// PORT-NOTE: entry prompts are functions of the node that documentation should appear to the right
// of (a JavaFX Node in Java), which is the GUI's (unknown here).  Java's IdentityHashMaps are
// Maps (which compare keys by identity); getDisplayFor goes through the recorded positions in the
// order they were recorded, where Java's order was arbitrary (they are then sorted by position).
import type { CanonicalLocation, DisplayLocation } from "../../../../engine/anns/Annotations.js";
import { BracketedStatus } from "../../../../engine/expressions/transformations/expression/BracketedStatus.js";
import type { CanonicalSpan } from "../../../../engine/expressions/transformations/expression/CanonicalSpan.js";
import { ErrorAndTypeRecorder } from "../../../../engine/expressions/transformations/expression/ErrorAndTypeRecorder.js";
import { Expression } from "../../../../engine/expressions/transformations/expression/Expressions.js";
import { QuickFix } from "../../../../engine/expressions/transformations/expression/QuickFix.js";
import { TypeExpression } from "../../../../engine/expressions/transformations/expression/type/TypeExpressions.js";
import { UnitExpression } from "../../../../engine/expressions/transformations/expression/UnitExpressions.js";
import { TableAndColumnRenames } from "../../../../engine/identifiers/id/TableAndColumnRenames.js";
import { javaObjectsHash } from "../../../../engine/java/JavaObject.js";
import type { TypeManager } from "../../../../engine/types/data/datatype/TypeManager.js";
import type { TypeConcretisationError } from "../../../../engine/types/typeExp/TypeConcretisationError.js";
import { NumTypeExp, TypeCons, type TypeExp } from "../../../../engine/types/typeExp/TypeExps.js";
import { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../engine/utility-error/error/InternalException.js";
import type { StyledShowable } from "../../../../engine/utility-error/styled/StyledShowable.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";
import { Log } from "../../../../engine/utility/log/Log.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { InsertListener } from "../../../lex-editor-completion/gui/lexeditor/completion/InsertListener.js";
import { DocWindow } from "./DocWindow.js";
import { TextQuickFix } from "./TextQuickFix.js";
import { TopLevelEditor } from "./TopLevelEditor.js";

// Java: interface UnresolvedErrorDetails { ErrorDetails resolve() throws InternalException; }
type UnresolvedErrorDetails = () => EditorLocationAndErrorRecorder.ErrorDetails;

/**
 * This class keeps track of mapping expressions back to their source location in a graphical editor.
 *
 * It is uncoupled from actually recording the error, which is handled in the {@link ErrorAndTypeRecorder} class.
 *
 * For displaying semantic errors (which occur on a particular expression)
 */
export class EditorLocationAndErrorRecorder
{
    // We use IdentityHashMap because we want to distinguish between multiple duplicate sub-expressions,
    // e.g. in the expression 2 + abs(2), we want to assign any error to the right 2.  Because of this
    // we use identity hash map, and we cannot use Either (which would break this property).  So two maps it is:
    private readonly positions = new Map<unknown, CanonicalSpan>();
    private readonly types = new Map<Expression, Either<TypeConcretisationError, TypeExp>>();
    // Function takes node that documentation should appear to the right of
    private readonly entryPrompts: Pair<CanonicalSpan, (toRightOf: unknown) => StyledString>[] = [];
    private readonly information = new Map<Expression, Pair<StyledString, readonly TextQuickFix[]>>();
    // Used by DocWindow
    private readonly insertListener: InsertListener;
    private readonly typeManager: TypeManager;

    private readonly errorsToShow: UnresolvedErrorDetails[] = [];

    public constructor(typeManager: TypeManager, insertListener: InsertListener)
    {
        this.typeManager = typeManager;
        this.insertListener = insertListener;
    }

    public record<EXPRESSION>(location: CanonicalSpan, e: EXPRESSION): EXPRESSION
    {
        if (this.positions.has(e))
            Log.logStackTrace("Double position record for: " + String(e));
        this.positions.set(e, location);
        return e;
    }

    // Java: three overloads, for an Expression, a TypeExpression and a UnitExpression, which save
    // the quick fixes' replacements differently.
    private showUnresolvedError(e: Expression | TypeExpression | UnitExpression, error: StyledString | null, quickFixes: readonly QuickFix<StyledShowable>[]): void
    {
        const save = (exp: StyledShowable): string =>
        {
            if (e instanceof Expression)
                return (exp as Expression).save(Expression.SaveDestination.TO_EDITOR_FULL_NAME, BracketedStatus.DONT_NEED_BRACKETS, new TableAndColumnRenames(new Map()));
            else if (e instanceof TypeExpression)
                return (exp as TypeExpression).save(Expression.SaveDestination.TO_EDITOR_FULL_NAME, new TableAndColumnRenames(new Map()));
            else
                return (exp as UnitExpression).save(Expression.SaveDestination.TO_EDITOR_FULL_NAME, false);
        };
        const kind = e instanceof Expression ? "expression" : "type expression";
        this.errorsToShow.push(() =>
        {
            const resolvedLocation = this.positions.get(e);
            if (resolvedLocation !== undefined)
            {
                return new EditorLocationAndErrorRecorder.ErrorDetails(resolvedLocation, error === null ? StyledString.s("") : error, Utility.mapListInt(quickFixes, q =>
                {
                    const replPos = this.positions.get(q.getReplacementTarget());
                    if (replPos === undefined)
                        throw new InternalException("Could not resolve location for expression: " + String(q.getReplacementTarget()));
                    return new TextQuickFix(replPos, save as (e: never) => string, q);
                }));
            }
            else
            {
                throw new InternalException("Could not resolve location for " + kind + ": " + String(e));
            }
        });
    }

    public addErrorAndFixes(showFor: CanonicalSpan, error: StyledString, quickFixes: readonly TextQuickFix[]): void
    {
        this.errorsToShow.push(() => new EditorLocationAndErrorRecorder.ErrorDetails(showFor, error, quickFixes));
    }

    public recordType(src: Expression, errorOrType: Either<TypeConcretisationError, TypeExp>): void
    {
        this.types.set(src, errorOrType);
    }

    public getRecorder(): ErrorAndTypeRecorder
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const outer = this;
        return new class extends ErrorAndTypeRecorder
        {
            protected override recordErrorMessage<EXPRESSION>(src: EXPRESSION, error: StyledString): void
            {
                if (src instanceof Expression)
                {
                    outer.showUnresolvedError(src, error, []);
                }
                else if (src instanceof TypeExpression)
                {
                    outer.showUnresolvedError(src, error, []);
                }
                else if (src instanceof UnitExpression)
                {
                    outer.showUnresolvedError(src, error, []);
                }
            }

            public override recordInformation<EXPRESSION extends StyledShowable>(src: EXPRESSION, info: Pair<StyledString, QuickFix<EXPRESSION> | null>): void
            {
                if (src instanceof Expression)
                    outer.information.set(src, info.mapSecond(qf => qf === null ? [] : [new TextQuickFix(outer.recorderFor(src), ((e: StyledShowable) => e.toStyledString().toPlain()) as (e: never) => string, qf as unknown as QuickFix<StyledShowable>)]));
            }

            public override recordQuickFixes<EXPRESSION extends StyledShowable>(src: EXPRESSION, quickFixes: readonly QuickFix<EXPRESSION>[]): void
            {
                if (src instanceof Expression && quickFixes.length !== 0)
                {
                    outer.showUnresolvedError(src, null, quickFixes as unknown as readonly QuickFix<StyledShowable>[]);
                }
                else if (src instanceof TypeExpression && quickFixes.length !== 0)
                {
                    outer.showUnresolvedError(src, null, quickFixes as unknown as readonly QuickFix<StyledShowable>[]);
                }
                else if (src instanceof UnitExpression && quickFixes.length !== 0)
                {
                    outer.showUnresolvedError(src, null, quickFixes as unknown as readonly QuickFix<StyledShowable>[]);
                }
            }

            public override recordTypeNN(expression: Expression, typeExp: TypeExp): TypeExp
            {
                outer.recordType(expression, Either.right(typeExp));
                return typeExp;
            }

            // Java overrides the default method recordError(Expression, Either<TypeError, TypeExp>):
            public override recordError(src: Expression, errorOrType: Either<TypeExp.TypeError | null, TypeExp>): TypeExp | null;
            public override recordError<EXPRESSION>(src: EXPRESSION, error: StyledString): void;
            public override recordError(src: unknown, errorOrType: StyledString | Either<TypeExp.TypeError | null, TypeExp>): TypeExp | null | void
            {
                if (!(errorOrType instanceof Either))
                    return super.recordError(src, errorOrType);
                const srcExp = src as Expression;
                return errorOrType.either<TypeExp | null>(err =>
                {
                    if (err !== null)
                    {

                        if (err.getCouldNotUnify().some(t => this.isOptional(t)) && !err.getCouldNotUnify().every(t => this.isOptional(t)))
                            outer.showUnresolvedError(srcExp, err.getMessage(), [new QuickFix<Expression>(StyledString.s("Show guide for Optional type"), [], srcExp, {
                                doAction: (_typeManager: TypeManager, sceneProp: unknown) =>
                                {
                                    DocWindow.show("Optional", "guide-optional.html", null, outer.insertListener, sceneProp);
                                    return null;
                                },
                            }) as unknown as QuickFix<StyledShowable>]);
                        // If they're all numbers and there was an error, must be units problem:
                        else if (err.getCouldNotUnify().every(t => this.isNumber(t)))
                            outer.showUnresolvedError(srcExp, err.getMessage(), [new QuickFix<Expression>(StyledString.s("Show units guide"), [], srcExp, {
                                doAction: (_typeManager: TypeManager, sceneProp: unknown) =>
                                {
                                    DocWindow.show("Units", "guide-units.html", null, outer.insertListener, sceneProp);
                                    return null;
                                },
                            }) as unknown as QuickFix<StyledShowable>]);
                        else
                            this.recordError(srcExp, err.getMessage());
                    }
                    return null;
                }, val => val);
            }

            private isNumber(typeExp: TypeExp): boolean
            {
                return typeExp instanceof NumTypeExp;
            }

            private isOptional(typeExp: TypeExp): boolean
            {
                return typeExp instanceof TypeCons && typeExp.name === "Optional";
            }
        }();
    }

    public recorderFor(expression: unknown): CanonicalSpan
    {
        return this.positions.get(expression)!;
    }

    public addNestedError(nestedError: EditorLocationAndErrorRecorder.ErrorDetails, caretPosOffset: CanonicalLocation, displayCaretPosOffset: DisplayLocation): void
    {
        this.errorsToShow.push(() => nestedError.offsetBy(caretPosOffset, displayCaretPosOffset));
    }

    public addNestedLocations(nested: EditorLocationAndErrorRecorder, caretPosOffset: CanonicalLocation): void
    {
        nested.positions.forEach((s, e) => this.positions.set(e, s.offsetBy(caretPosOffset)));
    }

    public getErrors(): EditorLocationAndErrorRecorder.ErrorDetails[]
    {
        const r: EditorLocationAndErrorRecorder.ErrorDetails[] = [];

        for (const unresolvedErrorDetails of this.errorsToShow)
        {
            try
            {
                r.push(unresolvedErrorDetails());
            }
            catch (e)
            {
                if (!(e instanceof InternalException))
                    throw e;
                Log.log(e);
            }
        }

        return r;
    }

    public getDisplayFor(canonIndex: CanonicalLocation, toRightOf: unknown): ReadonlyMap<TopLevelEditor.DisplayType, Pair<StyledString, readonly TextQuickFix[]>>
    {
        const relevantPrompts: Pair<StyledString, CanonicalSpan>[] = [];
        const relevantInformation: Pair<Pair<StyledString, readonly TextQuickFix[]>, CanonicalSpan>[] = [];
        for (const [key, location] of this.positions)
        {
            if (location.touches(canonIndex))
            {
                const info = this.information.get(key as Expression);
                if (info !== undefined)
                    relevantInformation.push(new Pair(info, location));
            }
        }
        for (const entryPrompt of this.entryPrompts)
        {
            if (entryPrompt.getFirst().touches(canonIndex))
                relevantPrompts.push(new Pair(entryPrompt.getSecond()(toRightOf), entryPrompt.getFirst()));
        }

        // (Java's sort is stable, as is this)
        relevantPrompts.sort((a, b) => a.getSecond().start - b.getSecond().start);
        relevantInformation.sort((a, b) => a.getSecond().start - b.getSecond().start);

        // Java: an EnumMap, which iterates in the enum's order
        const combined = new Map<TopLevelEditor.DisplayType, Pair<StyledString, readonly TextQuickFix[]>>();
        const merge = (key: TopLevelEditor.DisplayType, value: Pair<StyledString, readonly TextQuickFix[]>): void =>
        {
            const a = combined.get(key);
            combined.set(key, a === undefined ? value : new Pair(StyledString.intercalate(StyledString.s("\n"), [a.getFirst(), value.getFirst()]), Utility.concatI(a.getSecond(), value.getSecond())));
        };
        for (const prompt of relevantPrompts)
        {
            merge(TopLevelEditor.DisplayType.PROMPT, new Pair<StyledString, readonly TextQuickFix[]>(prompt.getFirst(), []));
        }
        for (const info of relevantInformation)
        {
            merge(TopLevelEditor.DisplayType.INFORMATION, info.getFirst());
        }

        return new Map([...combined.entries()].sort((a, b) => a[0] - b[0]));
    }

    public recordEntryPromptG<EXPRESSION>(expression: EXPRESSION, prompt: (toRightOf: unknown) => StyledString): void
    {
        if (expression instanceof Expression)
            this.recordEntryPrompt(expression, prompt);
    }

    // Java: recordEntryPrompt(Expression, prompt) and recordEntryPrompt(CanonicalSpan, prompt)
    public recordEntryPrompt(expressionOrSpan: Expression | CanonicalSpan, prompt: (toRightOf: unknown) => StyledString): void
    {
        if (expressionOrSpan instanceof Expression)
        {
            const canonicalSpan = this.positions.get(expressionOrSpan);
            if (canonicalSpan !== undefined)
                this.entryPrompts.push(new Pair(canonicalSpan, prompt));
        }
        else
            this.entryPrompts.push(new Pair(expressionOrSpan, prompt));
    }

    public getInsertListener(): InsertListener
    {
        return this.insertListener;
    }

    /** @internal Java: the private typeManager field (unused there too) */
    public _getTypeManager(): TypeManager
    {
        return this.typeManager;
    }
}

export namespace EditorLocationAndErrorRecorder
{
    export class DisplaySpan
    {
        public readonly start: DisplayLocation;
        public readonly end: DisplayLocation;

        public constructor(start: DisplayLocation, end: DisplayLocation)
        {
            this.start = start;
            this.end = end;
        }

        // Even though end is typically exclusive, this checks
        // if <= end because for errors etc we still want to display
        // if we touch the extremity.
        public touches(position: DisplayLocation): boolean
        {
            return this.start <= position && position <= this.end;
        }

        // Used in testing:
        public equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof DisplaySpan)) return false;
            const that = o;
            return this.start === that.start &&
                    this.end === that.end;
        }

        public hashCode(): number
        {
            return javaObjectsHash(this.start, this.end);
        }

        public toString(): string
        {
            return this.start + "->" + this.end;
        }
    }

    export class ErrorDetails
    {
        public readonly location: CanonicalSpan;
        // Mutable for ease of processing:
        public displayLocation: DisplaySpan | null = null;
        public readonly error: StyledString;
        public readonly quickFixes: readonly TextQuickFix[];
        // Note -- mutable field.
        public caretHasLeftSinceEdit = false;

        public constructor(location: CanonicalSpan, error: StyledString, quickFixes: readonly TextQuickFix[])
        {
            this.location = location;
            this.error = error;
            this.quickFixes = quickFixes;
        }

        public offsetBy(caretPosOffset: CanonicalLocation, displayCaretPosOffset: DisplayLocation): ErrorDetails
        {
            const r = new ErrorDetails(this.location.offsetBy(caretPosOffset), this.error, Utility.mapListI(this.quickFixes, f => f.offsetBy(caretPosOffset)));
            r.caretHasLeftSinceEdit = this.caretHasLeftSinceEdit;
            if (this.displayLocation !== null)
                r.displayLocation = new DisplaySpan(this.displayLocation.start + displayCaretPosOffset, this.displayLocation.end + displayCaretPosOffset);
            return r;
        }

        // Useful for debugging:
        public toString(): string
        {
            return "ErrorDetails{" +
                    "location=" + this.location.toString() +
                    "//" + String(this.displayLocation) +
                    ", error=" + this.error.toString() +
                    "}";
        }
    }
}
