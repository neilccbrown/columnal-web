// Port of xyz.columnal.typeExp.TypeClassRequirements (types module).
import { StyledString } from "../../utility-error/styled/StyledString.js";
import { Utility } from "../../utility/utility/Utility.js";
import { TypeExp } from "./TypeExps.js";

// Java: private static nested class
class Context
{
    public readonly functionNames: readonly string[];

    public constructor(functionNames: readonly string[])
    {
        this.functionNames = functionNames;
    }

    public static merge(a: Context, b: Context): Context
    {
        return new Context(Utility.concatI(a.functionNames, b.functionNames));
    }
}

// An immutable set of type-classes which are required, but we carry more information
// about where the requirement comes from
export class TypeClassRequirements
{
    private static readonly EMPTY = new TypeClassRequirements(new Map());

    public static require(typeClass: string, functionName: string): TypeClassRequirements
    {
        return new TypeClassRequirements(new Map([[typeClass, new Context([functionName])]]));
    }

    // Returns null if given set satisfies this requirement, or error if not.
    public checkIfSatisfiedBy(typeName: StyledString, typeClasses: ReadonlySet<string>, involvedType: TypeExp): TypeExp.TypeError | null
    {
        if ([...this.typeClasses.keys()].every(t => typeClasses.has(t)))
            return null;
        else
            return new TypeExp.TypeError(StyledString.concat(typeName, StyledString.s(" is not " + [...this.typeClasses.keys()].filter(t => !typeClasses.has(t)).join(" or "))), [involvedType]);
    }

    // Java: ImmutableMap (insertion order)
    private readonly typeClasses: ReadonlyMap<string, Context>;

    // Java: public, but takes the private Context class
    private constructor(typeClasses: ReadonlyMap<string, Context>)
    {
        this.typeClasses = typeClasses;
    }

    public static union(a: TypeClassRequirements, b: TypeClassRequirements): TypeClassRequirements
    {
        const m = new Map<string, Context>();
        for (const [k, v] of [...a.typeClasses, ...b.typeClasses])
        {
            const existing = m.get(k);
            m.set(k, existing === undefined ? v : Context.merge(existing, v));
        }
        return new TypeClassRequirements(m);
    }

    public static empty(): TypeClassRequirements
    {
        return TypeClassRequirements.EMPTY;
    }
}
