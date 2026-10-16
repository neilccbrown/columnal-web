// Port of xyz.columnal.transformations.expression.explanation.Explanation (expressions module).
import { javaEquals, javaHashCode, javaObjectsHash } from "../../../../java/JavaObject.js";
import { javaEnumName } from "../../../../java/JavaEnum.js";
import { InternalException } from "../../../../utility-error/error/InternalException.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import type { StyledString } from "../../../../utility-error/styled/StyledString.js";
import { Log } from "../../../../utility/log/Log.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import type { Value } from "../../../../utility/utility/Value.js";
import type { EvaluateState } from "../EvaluateState.js";
import type { Expression } from "../Expressions.js";
import type { ExplanationLocation } from "./ExplanationLocation.js";

/**
 * An explanation of how a value came to be calculated.
 * Used for display (with hyperlinks), and also potentially
 * for analysing which data locations were used to produce
 * a given value.
 */
export abstract class Explanation
{
    private readonly expression: Explanation.ExplanationSource;
    protected readonly executionType: Explanation.ExecutionType;
    private readonly evaluateState: EvaluateState;
    private readonly result: Value | null;
    private readonly directlyUsedLocations: readonly ExplanationLocation[];
    private readonly resultIsLocation: ExplanationLocation | null;

    // Java: protected (public here, so that anonymous subclasses can be constructed)
    public constructor(expression: Explanation.ExplanationSource, executionType: Explanation.ExecutionType, evaluateState: EvaluateState, result: Value | null, directlyUsedLocations: readonly ExplanationLocation[], resultIsLocation: ExplanationLocation | null)
    {
        this.expression = expression;
        this.executionType = executionType;
        this.evaluateState = evaluateState;
        this.result = result;
        this.directlyUsedLocations = directlyUsedLocations;
        this.resultIsLocation = resultIsLocation;
    }

    /**
     *
     * @param alreadyDescribed The set of already described explanations.  Do not
     *                         describe if this is the same explanation as one in the set.
     * @param hyperlinkLocation A function to hyperlink used locations so that they
     *                          jump to the right point in the data display.
     * @param skipIfTrivial If true, return null here if this is a trivial expression
     *                      (i.e. one that doesn't calculate, it just substitutes
     *                      a variable or column reference for a value)
     * @return
     * @throws InternalException
     * @throws UserException
     */
    public abstract describe(alreadyDescribed: ReadonlySetLike<Explanation>, hyperlinkLocation: (location: ExplanationLocation) => StyledString, expressionStyler: Expression.ExpressionStyler, extraLocations: readonly ExplanationLocation[], skipIfTrivial: boolean): StyledString | null;

    public getDirectlyUsedLocations(): readonly ExplanationLocation[]
    {
        return this.directlyUsedLocations;
    }

    public getResultIsLocation(): ExplanationLocation | null
    {
        return this.resultIsLocation;
    }

    public abstract getDirectSubExplanations(): readonly Explanation[];

    /**
     * Should we miss out explaining children if they are trivial?  If so return true.
     * This is true for things like tuples, lists and tag applications, where we don't
     * want to say x is 1, y is 2, (x, y) is (1, 2).  It's enough to say (x, y) is (1, 2)
     * and the user will work it out.
     * @return
     */
    public excludeChildrenIfTrivial(): boolean
    {
        return false;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof Explanation)) return false;

        const that = o;

        if (!this.expression.equals(that.expression)) return false;
        if (this.executionType !== that.executionType) return false;
        const usedVars = new Set(this.expression.allVariableReferences());
        if (!this.evaluateState.varFilteredTo(usedVars).equals(that.evaluateState.varFilteredTo(usedVars))) return false;
        if (!javaEquals(this.directlyUsedLocations, that.directlyUsedLocations)) return false;
        if (!javaEquals(this.resultIsLocation, that.resultIsLocation)) return false;
        try
        {
            if (!javaEquals(this.getDirectSubExplanations(), that.getDirectSubExplanations())) return false;
            // null compares equal to any value, for testing:
            if (this.result === null || that.result === null)
                return true;
            return Utility.compareValues(this.result, that.result) === 0;
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            Log.log(e);
            return false;
        }
    }

    public hashCode(): number
    {
        let result1 = this.expression.hashCode();
        result1 = (Math.imul(31, result1) + this.executionType) | 0;
        result1 = (Math.imul(31, result1) + this.evaluateState.hashCode()) | 0;
        result1 = (Math.imul(31, result1) + javaHashCode(this.directlyUsedLocations)) | 0;
        result1 = (Math.imul(31, result1) + javaObjectsHash(this.resultIsLocation)) | 0;
        try
        {
            result1 = (Math.imul(31, result1) + javaHashCode(this.getDirectSubExplanations())) | 0;
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
        }
        // We don't hash result.  This means we get more hash collisions,
        // but it's not invalid...
        return result1;
    }

    // Only used for testing:
    public toString(): string
    {
        try
        {
            return "Explanation{" +
                    "expression=" + this.expression.toString() +
                    ", executionType=" + javaEnumName(Explanation.ExecutionType, this.executionType) +
                    ", evaluateState.rowIndex=" + String(this.evaluateState._test_getOptionalRowIndex()) +
                    ", evaluateState.vars=" + "{" + [...this.evaluateState._test_getVariables()].map(([k, v]) => k + "=" + String(v)).join(", ") + "}" +
                    ", result=" + String(this.result) +
                    ", directlyUsedLocations=" + "[" + this.directlyUsedLocations.map(l => l.toString()).join(", ") + "]" +
                    ", resultIsLocation=" + String(this.resultIsLocation) +
                    ", directSubExplanations:{\n" + this.getDirectSubExplanations().map(o => o.toString().split("\n").map(s => "    " + s + "\n").join("") + "\n").join("") +
                    "}";
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            return "InternalException: " + e.getLocalizedMessage();
        }
    }

    public isValue(): boolean
    {
        return this.executionType === Explanation.ExecutionType.VALUE;
    }

    public isDescribing(e: Expression): boolean
    {
        return this.expression === e;
    }
}

/** The part of Java's Set<Explanation> that describe() uses */
export interface ReadonlySetLike<T>
{
    has(item: T): boolean;
}

export namespace Explanation
{
    // Is this a normal fetch of an expression's value,
    // or is it being asked to match against a given value?
    // or is it constructing an implicit lambda function?
    export enum ExecutionType { VALUE, MATCH, CALL_IMPLICIT }

    // Marker interface for items which can be the (code) source of an explanation
    export interface ExplanationSource
    {
        allVariableReferences(): string[];

        equals(o: unknown): boolean;

        hashCode(): number;

        toString(): string;
    }
}
