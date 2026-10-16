// Port of xyz.columnal.transformations.expression.EvaluateState (expressions module).
import type { TableDataRowIndex } from "../../../anns/Annotations.js";
import { Decimal } from "../../../java/JavaBigDecimal.js";
import { javaObjectsHash } from "../../../java/JavaObject.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { Log } from "../../../utility/log/Log.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { TypeState } from "./TypeState.js";

/**
 * Created by neil on 29/11/2016.
 */
export class EvaluateState
{
    private readonly typeManager: TypeManager;
    // PORT-NOTE: Java copies the variables through a HashMap, so they are in hash order; the order is
    // only visible in Explanation.toString (used for debugging tests), so insertion order is kept here.
    private readonly variables: ReadonlyMap<string, Value>;
    // Java: OptionalInt
    private readonly rowIndex: number | null;
    private readonly _recordExplanation: boolean;

    // Java: EvaluateState(TypeManager, OptionalInt) and EvaluateState(TypeManager, OptionalInt, boolean)
    public constructor(typeManager: TypeManager, rowIndex: number | null, recordExplanation?: boolean);
    // Java: private EvaluateState(ImmutableMap, TypeManager, OptionalInt, boolean)
    public constructor(variables: ReadonlyMap<string, Value>, typeManager: TypeManager, rowIndex: number | null, recordExplanation: boolean);
    public constructor(...args: unknown[])
    {
        if (args[0] instanceof Map)
        {
            this.variables = args[0] as ReadonlyMap<string, Value>;
            this.typeManager = args[1] as TypeManager;
            this.rowIndex = args[2] as number | null;
            this._recordExplanation = args[3] as boolean;
        }
        else
        {
            const rowIndex = args[1] as number | null;
            this.variables = EvaluateState.makeVariables(rowIndex);
            this.typeManager = args[0] as TypeManager;
            this.rowIndex = rowIndex;
            this._recordExplanation = (args[2] as boolean | undefined) ?? false;
        }
    }

    private static makeVariables(rowIndex: number | null): ReadonlyMap<string, Value>
    {
        return rowIndex !== null ? new Map<string, Value>([[TypeState.ROW_NUMBER, DataTypeUtility.value(new Decimal(rowIndex + 1))]]) : new Map<string, Value>();
    }

    public add(varName: string, value: Value): EvaluateState
    {
        const copy = new Map<string, Value>();
        if (!varName.startsWith("?") && this.variables.has(varName))
        {
            throw new InternalException("Duplicate variable name: " + varName);
        }
        for (const [k, v] of this.variables)
            copy.set(k, v);
        copy.set(varName, value);
        return new EvaluateState(copy, this.typeManager, this.rowIndex, this._recordExplanation);
    }

    /**
     * Gets value of variable.  Throws InternalException if variable not found
     * (since if we passed the type check, variable must be present during execution).
     */
    public get(varName: string): Value
    {
        const value = this.variables.get(varName);
        if (value === undefined)
            throw new InternalException("Trying to access undeclared variable: \"" + varName + "\"");
        return value;
    }

    public getTypeManager(): TypeManager
    {
        return this.typeManager;
    }

    public getRowIndex(): TableDataRowIndex
    {
        if (this.rowIndex === null)
            throw new UserException("No row index available.");
        return this.rowIndex;
    }

    // Java: returns OptionalInt
    public _test_getOptionalRowIndex(): number | null
    {
        return this.rowIndex;
    }

    public _test_getVariables(): ReadonlyMap<string, Value>
    {
        return this.variables;
    }

    public recordExplanation(): boolean
    {
        return this._recordExplanation;
    }

    public varFilteredTo(variableNames: ReadonlySet<string>): EvaluateState
    {
        return new EvaluateState(new Map([...this.variables].filter(([k]) => variableNames.has(k))), this.typeManager, this.rowIndex, this._recordExplanation);
    }

    // Equals and hashCode on EvaluateState are only used by
    // explanations, for checking if two executations of the same
    // expression had equivalent context.
    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof EvaluateState) || o.constructor !== this.constructor) return false;
        const that = o;
        if (this.variables.size !== that.variables.size || ![...this.variables.keys()].every(k => that.variables.has(k)))
            return false;
        for (const [key, value] of this.variables)
        {
            const otherVarValue = that.variables.get(key);
            // Shouldn't be null given the above keySet check, but satisfy checker:
            if (otherVarValue === undefined)
                continue;
            try
            {
                if (Utility.compareValues(value, otherVarValue) !== 0)
                    return false;
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                Log.log(e);
                return false;
            }
        }
        return this.rowIndex === that.rowIndex;
    }

    public hashCode(): number
    {
        // We don't hash variables because it's too complex, so
        // we just live with having hash collisions:
        // PORT-NOTE: Java hashes the OptionalInt; any consistent hash will do.
        return javaObjectsHash(this.rowIndex);
    }
}
