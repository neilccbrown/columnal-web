// Port of xyz.columnal.transformations.expression.function.ValueFunction (expressions module).
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import { InternalException } from "../../../../utility-error/error/InternalException.js";
import { javaClassName, Utility, ValueFunctionBase } from "../../../../utility/utility/Utility.js";
import type { Value } from "../../../../utility/utility/Value.js";
import type { Explanation } from "../explanation/Explanation.js";
import type { ExplanationLocation } from "../explanation/ExplanationLocation.js";

// I want to label this class @Value but I don't seem able to.  Perhaps because it is abstract?
export abstract class ValueFunction extends ValueFunctionBase
{
    // All fields are used temporarily while _call() is executing.
    // This means that an individual ValueFunction is not re-entrant.

    // null if we are not recording explanationss
    private usedLocations: ExplanationLocation[] | null = null;
    // null if we are not recording
    private argExplanations: readonly ValueFunction.ArgumentExplanation[] | null = null;
    // null if we are not recording
    private extraExplanations: Explanation[] | null = null;

    private resultIsLocation: ExplanationLocation | null = null;

    // Non-null once we are executing:
    private curArgs: readonly Value[] | null = null;


    // PORT-NOTE: protected in Java; public so that Utility.cast can take the (abstract) class.
    public constructor()
    {
        super();
    }

    // Not for external calling
    protected abstract _call(): Value;

    // Call without recording an explanation
    public call(args: readonly Value[]): Value
    {
        this.curArgs = args;
        this.argExplanations = null;
        this.usedLocations = null;
        this.extraExplanations = null;
        return this._call();
    }

    // Call and record an explanation
    public callRecord(args: readonly Value[], argumentExplanations: readonly ValueFunction.ArgumentExplanation[] | null): ValueFunction.RecordedFunctionResult
    {
        this.curArgs = args;
        this.argExplanations = argumentExplanations;
        this.usedLocations = [];
        const extra: Explanation[] = this.extraExplanations = [];
        const result = this._call();
        return new ValueFunction.RecordedFunctionResult(result, Utility.concatI<Explanation>(argumentExplanations === null ? [] : Utility.mapListInt(argumentExplanations, e => e.getValueExplanation()), extra), this.usedLocations !== null ? [...this.usedLocations] : [], this.resultIsLocation);
    }

    // Java: arg(int index, Class<T> tClass) and arg(int index)
    protected arg(index: number): Value;
    protected arg<T extends Value>(index: number, tClass: ValueClass<T>): T;
    protected arg<T extends Value>(index: number, tClass?: ValueClass<T>): Value
    {
        if (this.curArgs === null)
            throw new InternalException("Function accessing missing arguments");
        if (index < 0 || index >= this.curArgs.length)
            throw new InternalException("Function " + javaClassName(this) + " accessing argument " + index + " but only " + this.curArgs.length);
        const v = this.curArgs[index]!;
        if (tClass === undefined)
            return v;
        // Java: Utility.cast(arg(index), tClass)
        if (!tClass.is(v))
            throw new InternalException("Cannot cast " + javaClassName(v) + " into " + tClass.javaName);
        return v;
    }

    protected intArg(index: number): number
    {
        return DataTypeUtility.requireInteger(this.arg(index, ValueClass.NUMBER));
    }

    protected callArg(index: number, args: readonly Value[]): Value
    {
        const f = this.arg(index, ValueFunction.CLASS);
        if (this.extraExplanations === null)
        {
            // Not recording:
            return f.call(args);
        }
        else
        {
            // We are recording, so pass argument explanations to the chained call:
            const r = f.callRecord(args, null);
            if (this.extraExplanations !== null)
            {
                this.extraExplanations.length = 0;
                this.extraExplanations.push(...r.childExplanations);
            }
            if (this.usedLocations !== null)
            {
                this.usedLocations.length = 0;
                this.usedLocations.push(...r.usedLocations);
            }
            return r.result;
        }
    }

    protected addUsedLocations(extractLocations: (argExplanations: readonly ValueFunction.ArgumentExplanation[]) => readonly ExplanationLocation[]): void
    {
        if (this.argExplanations !== null && this.usedLocations !== null)
            this.usedLocations.push(...extractLocations(this.argExplanations));
    }

    protected setResultIsLocation(explanationLocation: ExplanationLocation): void
    {
        if (this.usedLocations !== null)
            this.resultIsLocation = explanationLocation;
    }

    protected addExtraExplanation(makeExplanation: () => Explanation): void
    {
        if (this.extraExplanations !== null)
        {
            this.extraExplanations.push(makeExplanation());
        }
    }

    public static value(f: ValueFunction): ValueFunction
    {
        return f;
    }

    /** Java's ValueFunction.class, for the runtime checks on values (see ValueClass) */
    public static readonly CLASS: ValueClass<ValueFunction> = { javaName: "class xyz.columnal.transformations.expression.function.ValueFunction", is: (v): v is ValueFunction => v instanceof ValueFunction };
}

export namespace ValueFunction
{
    // Used by some function implementations to access explanations
    // of arguments, or of a list element of an argument.
    export interface ArgumentExplanation
    {
        getValueExplanation(): Explanation;

        // If this argument is a column, give back the location
        // for the given zero-based index.
        getListElementLocation(index: number): ExplanationLocation | null;
    }

    export class RecordedFunctionResult
    {
        public readonly result: Value;
        public readonly childExplanations: readonly Explanation[];
        public readonly usedLocations: readonly ExplanationLocation[];
        public readonly resultIsLocation: ExplanationLocation | null;

        public constructor(result: Value, childExplanations: readonly Explanation[], usedLocations: readonly ExplanationLocation[], resultIsLocation: ExplanationLocation | null)
        {
            this.result = result;
            this.childExplanations = childExplanations;
            this.usedLocations = usedLocations;
            this.resultIsLocation = resultIsLocation;
        }
    }
}
