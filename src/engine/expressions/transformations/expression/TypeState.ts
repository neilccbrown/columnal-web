// Port of xyz.columnal.transformations.expression.TypeState (expressions module).
import type { ExpressionIdentifier } from "../../../anns/Annotations.js";
import { HashMap } from "../../../java/HashMap.js";
import { javaEquals, javaHashCode } from "../../../java/JavaObject.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { FunctionLookup } from "./function/FunctionLookup.js";
import type { ImplicitLambdaArg } from "./Expressions.js";

/**
 * The state used while type-checking expressions.
 *
 * It changes based on pattern matches, which introduce new variables.
 */
export class TypeState
{
    // In-built variables:
    public static readonly GROUP_COUNT: ExpressionIdentifier = "group count";
    public static readonly ROW_NUMBER: ExpressionIdentifier = "row";

    // Doesn't change in modified TypeStates, but is passed through unchanged from initial TypeState.
    private readonly functionLookup: FunctionLookup;

    private readonly variablePreTypes: ReadonlyMap<string, TypeExp>;
    // If variable is in there but > size 1, means it is known but it is defined by multiple guards
    // This is okay if they don't use it, but if they do use it, must attempt unification across all the types.
    // These are not @ExpressionIdentifier because there may be internal
    // names like ?1
    // PORT-NOTE: where Java builds this through a HashMap, it is in Java's hash order, as the order
    // of getAvailableVariables() can be seen.
    private readonly variables: ReadonlyMap<string, readonly TypeExp[]>;
    private readonly typeManager: TypeManager;
    private readonly unitManager: UnitManager;
    private nextLambdaId = 1;

    // Java: public TypeState(TypeManager, FunctionLookup) and a private constructor with all the fields
    public constructor(typeManager: TypeManager, functionLookup: FunctionLookup);
    public constructor(variablePreTypes: ReadonlyMap<string, TypeExp>, variables: ReadonlyMap<string, readonly TypeExp[]>, typeManager: TypeManager, unitManager: UnitManager, functionLookup: FunctionLookup);
    public constructor(...args: unknown[])
    {
        if (args.length === 2)
        {
            const typeManager = args[0] as TypeManager;
            this.variablePreTypes = new Map();
            this.variables = new Map();
            this.typeManager = typeManager;
            this.unitManager = typeManager.getUnitManager();
            this.functionLookup = args[1] as FunctionLookup;
        }
        else
        {
            this.variablePreTypes = args[0] as ReadonlyMap<string, TypeExp>;
            this.variables = args[1] as ReadonlyMap<string, readonly TypeExp[]>;
            this.typeManager = args[2] as TypeManager;
            this.unitManager = args[3] as UnitManager;
            this.functionLookup = args[4] as FunctionLookup;
        }
    }

    public static withRowNumber(typeManager: TypeManager, functionLookup: FunctionLookup): TypeState
    {
        const typeState = new TypeState(typeManager, functionLookup).add(TypeState.ROW_NUMBER, TypeExp.plainNumber(null), _ss => {
        });
        if (typeState !== null)
            return typeState;
        else
            throw new InternalException("Could not add row number variable");
    }

    public add(varName: ExpressionIdentifier, type: TypeExp, error: (s: StyledString) => void): TypeState | null
    {
        if (this.variables.has(varName))
        {
            error(StyledString.s("Duplicate variable name: " + varName));
            return null;
        }
        const copy = new Map<string, readonly TypeExp[]>(this.variables);
        const preType = this.variablePreTypes.get(varName);
        if (preType !== undefined)
        {
            const unified = TypeExp.unifyTypes(type, preType);
            unified.ifLeft(typeError => error(typeError.getMessage()));
            if (unified.isLeft())
                return null;
        }
        copy.set(varName, [type]);
        return new TypeState(new Map([...this.variablePreTypes].filter(([k]) => k !== varName)), copy, this.typeManager, this.unitManager, this.functionLookup);
    }

    public addImplicitLambdas(lambdaArgs: readonly ImplicitLambdaArg[], argTypes: readonly TypeExp[]): TypeState
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- reassigned in the loop
        let typeState: TypeState = this;
        for (let i = 0; i < lambdaArgs.length; i++)
        {
            lambdaArgs[i]!.assignId(this);
            typeState = typeState.addAllowShadow(lambdaArgs[i]!.getVarName(), argTypes[i]!);
        }
        return typeState;
    }

    public addAllowShadow(varName: string, type: TypeExp): TypeState
    {
        // We allow name shadowing without complaint:
        const copy = HashMap.javaOrder<string, readonly TypeExp[]>();
        copy.setAll(this.variables);
        copy.set(varName, [type]);
        return new TypeState(this.variablePreTypes, new Map(copy), this.typeManager, this.unitManager, this.functionLookup);
    }

    /**
     *  Merges a set of type states from different pattern guards.
     *
     *  The semantics here are that duplicate variables are allowed, if they refer to a variable
     *  with the same type. (e.g. @case (4, x) @orcase (6, x))  If they have a different type,
     *  it's an error.
     *
     *  This is different semantics to the union function, which does not permit variables with
     *  the same name (this may be a bit confusing: intersect does allow duplicates, but union
     *  does not!)
     */

    public static intersect(typeStates: readonly TypeState[]): TypeState
    {
        const mergedVars = HashMap.javaOrder<string, readonly TypeExp[]>({}, typeStates[0]!.variables);
        for (let i = 1; i < typeStates.length; i++)
        {
            const variables = typeStates[i]!.variables;
            for (const [key, value] of variables)
            {
                // If it's present in both sets, only keep if same type, otherwise mask:
                mergedVars.merge(key, value, (a, b) => Utility.concatI(a, b));
            }
        }
        return new TypeState(new Map(), new Map(mergedVars), typeStates[0]!.typeManager, typeStates[0]!.unitManager, typeStates[0]!.functionLookup);
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TypeState) || o.constructor !== this.constructor) return false;

        const typeState = o;

        return javaEquals(this.variables, typeState.variables);
    }

    public hashCode(): number
    {
        return javaHashCode(this.variables);
    }

    // If it's null, it's totally unknown
    // If it's > size 1, it should count as masked because it has different types in different guards
    public findVarType(varName: string): readonly TypeExp[] | null
    {
        return this.variables.get(varName) ?? null;
    }

    public getUnitManager(): UnitManager
    {
        return this.unitManager;
    }

    public getTypeManager(): TypeManager
    {
        return this.typeManager;
    }

    public toString(): string
    {
        return "TypeState{" +
                "variables=" + "{" + [...this.variables].map(([k, v]) => k + "=[" + v.map(t => t.toString()).join(", ") + "]").join(", ") + "}" +
                "}";
    }

    public getNextLambdaId(): number
    {
        return this.nextLambdaId++;
    }

    public getAvailableVariables(): ReadonlySet<string>
    {
        return new Set(this.variables.keys());
    }

    public getFunctionLookup(): FunctionLookup
    {
        return this.functionLookup;
    }

    public addPreType(varName: string, typeExp: TypeExp, onError: (s: StyledString) => void): TypeState | null
    {
        if (this.variablePreTypes.has(varName))
        {
            onError(StyledString.s("Duplicate types given for variable " + varName));
            return null;
        }

        const newPreTypes = new Map<string, TypeExp>(this.variablePreTypes);
        newPreTypes.set(varName, typeExp);
        return new TypeState(newPreTypes, this.variables, this.typeManager, this.unitManager, this.functionLookup);
    }
}
