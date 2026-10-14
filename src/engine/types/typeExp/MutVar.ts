// Port of xyz.columnal.typeExp.MutVar (types module).
// Import TypeExp and its subclasses from TypeExps.ts (which see).
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { CommonStyles } from "../../utility-error/styled/CommonStyles.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { DataType } from "../data/datatype/DataType.js";
import type { TypeManager } from "../data/datatype/TypeManager.js";
import type { ExpressionBase } from "./ExpressionBase.js";
import { TypeClassRequirements } from "./TypeClassRequirements.js";
import { TypeConcretisationError } from "./TypeConcretisationError.js";
import { TypeExp } from "./TypeExps.js";

/**
 * Named MutVar after the Sheard paper.  Essentially, any time there
 * is an item of uncertain type in the expression tree, e.g.
 * return of an overloaded function/operator, it gets a MutVar
 * assigned as a placeholder, which is free to unify with any one thing.
 * It usually is the glue between some harder constraints, e.g.
 * in the expression a * (b + c), The type of b will be a MutVar,
 * but it will need to unify with number to satisfy the outer multiply,
 * and number or string to satisfy the inner plus.
 */
export class MutVar extends TypeExp
{
    // For Comparable and printing purposes
    private static nextId = 0n;
    private readonly id: bigint = MutVar.nextId++;

    // Java: package-visible, mutable reference:
    // If we point to something, all type-class information is in the pointer destination.
    // If we don't point to something, we have the type-class info:
    public typeClassesOrPointer: Either<TypeClassRequirements, TypeExp>;

    // Java has (src, typeClasses) and (src) constructors
    public constructor(src: ExpressionBase | null, typeClasses: TypeClassRequirements = TypeClassRequirements.empty())
    {
        super(src);
        this.typeClassesOrPointer = Either.left(typeClasses);
    }

    /**
     * You can assume that this is pruned, b is pruned, and b is not a MutVar unless
     * this is also a MutVar.
     */
    public override _unify(b: TypeExp): Either<TypeExp.TypeError, TypeExp>
    {
        // If the other item is a MutVar, we just unify ourselves to them:
        if (this === b)
        {
            return Either.right(this);
        }
        else if (b instanceof MutVar)
        {
            const maybeError = b.requireTypeClasses(this.typeClassesOrPointer.getLeft("Internal variable should be TCR when pruned"));
            if (maybeError !== null)
                return Either.left(maybeError);
            this.typeClassesOrPointer = Either.right(b);
            return Either.right(this);
        }
        else
        {
            // Do an occurs check to prevent cyclic types:
            // Note: no need to prune b, as it is already pruned.
            const cycle = b.containsMutVar(this);
            if (cycle)
            {
                return Either.left(new TypeExp.TypeError(StyledString.concat(StyledString.s("Cyclic type while attempting to match "), this.toStyledString(), StyledString.s(" with "), b.toStyledString()), [this, b]));
            }
            else
            {
                // Check that the item we are pointing to is a member of the needed type-classes:
                const maybeError = b.requireTypeClasses(this.typeClassesOrPointer.getLeft("Internal variable should be TCR when pruned"));
                if (maybeError !== null)
                    return Either.left(maybeError);
                this.typeClassesOrPointer = Either.right(b);
                return Either.right(this);
            }
        }
    }

    public override containsMutVar(mutVar: MutVar): boolean
    {
        // It feels like we should recurse into the pointer.
        // But if there is a cycle with
        // another MutVar, we would risk infinite recursion,
        // and Sheard's paper doesn't seem to recurse.
        return this === mutVar;
    }

    public override _concrete(typeManager: TypeManager, substituteDefaultIfPossible: boolean): Either<TypeConcretisationError, DataType>
    {
        if (substituteDefaultIfPossible)
            return Either.right(typeManager.getVoidType().instantiate([], typeManager));
        // Will have been pruned, so error here
        return Either.left(new TypeConcretisationError(StyledString.s("Ambiguous type"), null));
    }

    protected override requireTypeClassesVisited(typeClasses: TypeClassRequirements, visited: ReadonlySet<MutVar>): TypeExp.TypeError | null
    {
        if (visited.has(this))
            return new TypeExp.TypeError(StyledString.s("Cyclic type found"), [this]);
        return this.typeClassesOrPointer.either<TypeExp.TypeError | null>(t => {
            this.typeClassesOrPointer = Either.left(TypeClassRequirements.union(t, typeClasses));
            return null;
        }, p => {
            const visitedPlusUs = new Set<MutVar>(visited);
            visitedPlusUs.add(this);
            return p.requireTypeClasses(typeClasses, visitedPlusUs);
        });
    }

    public override prune(): TypeExp
    {
        this.typeClassesOrPointer = this.typeClassesOrPointer.map(p => p.prune());
        return this.typeClassesOrPointer.either<TypeExp>(_t => this, p => p);
    }

    protected override toStyledStringDepth(maxDepth: number): StyledString
    {
        const name = "_t" + this.id;
        return this.typeClassesOrPointer.either(_t => StyledString.styled(name, CommonStyles.ITALIC),
           pointer => maxDepth <= 0 ? StyledString.s("...") : StyledString.concat(StyledString.s(name + "[="), pointer.toStyledString(maxDepth - 1), StyledString.s("]"))
                    .withStyle(CommonStyles.ITALIC));
    }
}
