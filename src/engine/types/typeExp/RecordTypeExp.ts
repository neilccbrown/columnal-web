// Port of xyz.columnal.typeExp.RecordTypeExp (types module).
// Import TypeExp and its subclasses from TypeExps.ts (which see).
//
// PORT-NOTE: _unify and _concrete use Java HashMaps, whose iteration order is observable (in
// the order of unification, which error is reported, and the field order of the resulting
// types), so they iterate in Java's order (HashMap.javaOrder).
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import { HashMap } from "../../java/HashMap.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import { Utility } from "../../utility/utility/Utility.js";
import { DataType } from "../data/datatype/DataType.js";
import type { TypeManager } from "../data/datatype/TypeManager.js";
import type { ExpressionBase } from "./ExpressionBase.js";
import { TypeClassRequirements } from "./TypeClassRequirements.js";
import type { TypeConcretisationError } from "./TypeConcretisationError.js";
import { TypeExp, type MutVar } from "./TypeExps.js";

export class RecordTypeExp extends TypeExp
{
    // Java: ImmutableMap (iteration in the given order)
    public readonly knownMembers: ReadonlyMap<ExpressionIdentifier, TypeExp>;
    // If not complete, can have many more members than knownMembers
    // e.g. "first" uses this, has single knownMembers and complete==false
    public readonly complete: boolean;

    // The type classes required by this record, if it is not complete:
    private requiredTypeClasses: TypeClassRequirements = TypeClassRequirements.empty();

    public constructor(src: ExpressionBase | null, knownMembers: ReadonlyMap<ExpressionIdentifier, TypeExp>, complete: boolean)
    {
        super(src);
        this.knownMembers = knownMembers;
        this.complete = complete;
    }

    public override _unify(b: TypeExp): Either<TypeExp.TypeError, TypeExp>
    {
        if (!(b instanceof RecordTypeExp))
            return this.typeMismatch(b);
        const bt = b;

        // Here's the approach to unification.
        // Any elements which are only in one of the records are fine iff:
        //  - they meet any pending type class requirements from the other side.
        //  - the other side is not marked complete.
        // Any elements which are in both are fine iff:
        //  - they have a unifiable type on both sides
        // Afterwards, the pending type classes are union-ed.

        // LHS of pair is us, RHS is b
        const occurs = HashMap.javaOrder<ExpressionIdentifier, Pair<TypeExp | null, TypeExp | null>>();
        this.knownMembers.forEach((v, k) => occurs.set(k, new Pair<TypeExp | null, TypeExp | null>(v, null)));
        bt.knownMembers.forEach((v, k) => occurs.merge(k, new Pair<TypeExp | null, TypeExp | null>(null, v), (oldVal, newVal) => new Pair<TypeExp | null, TypeExp | null>(oldVal.getFirst(), newVal.getSecond())));

        const unified = HashMap.javaOrder<ExpressionIdentifier, TypeExp>();
        for (const [key, p] of occurs)
        {
            const first = p.getFirst();
            const second = p.getSecond();
            if (first === null || second === null)
            {
                // Only occurs in one side, check completeness:
                if ((second !== null && this.complete) || (first !== null && bt.complete))
                    return Either.left(new TypeExp.TypeError(StyledString.s("Field \"" + key + "\" occurs in one record but not in the other complete record"), Utility.filterOutNulls([first, second])));

                // Check type classes:
                let typeClassErr: TypeExp.TypeError | null = null;
                if (first !== null)
                {
                    typeClassErr = first.requireTypeClasses(bt.requiredTypeClasses);
                    unified.set(key, first);
                }
                else if (second !== null)
                {
                    typeClassErr = second.requireTypeClasses(this.requiredTypeClasses);
                    unified.set(key, second);
                }
                if (typeClassErr !== null)
                    return Either.left(typeClassErr);
            }
            else
            {
                //Occurs in both sides, unify:
                const result = first.unifyWith(second);
                if (result.isLeft())
                    return result;
                result.ifRight(t => unified.set(key, t));
            }
        }

        return Either.right(new RecordTypeExp(this.src !== null ? this.src : b.src, new Map(unified), this.complete || bt.complete));
    }

    public override containsMutVar(mutVar: MutVar): boolean
    {
        return [...this.knownMembers.values()].some(t => t.containsMutVar(mutVar));
    }

    public override _concrete(typeManager: TypeManager, substituteDefaultIfPossible: boolean): Either<TypeConcretisationError, DataType>
    {
        const fields = HashMap.javaOrder<ExpressionIdentifier, DataType>();
        for (const [key, value] of this.knownMembers)
        {
            const r = value.toConcreteType(typeManager, substituteDefaultIfPossible);
            if (r.isLeft())
                return r;
            r.ifRight(t => fields.set(key, t));
        }
        return Either.right(DataType.record(fields));
    }

    protected override requireTypeClassesVisited(typeClasses: TypeClassRequirements, visitedMutVar: ReadonlySet<MutVar>): TypeExp.TypeError | null
    {
        for (const member of this.knownMembers.values())
        {
            const err = member.requireTypeClasses(typeClasses, visitedMutVar);
            if (err !== null)
                return err;
        }
        if (!this.complete)
        {
            this.requiredTypeClasses = TypeClassRequirements.union(this.requiredTypeClasses, typeClasses);
        }
        return null;
    }

    protected override toStyledStringDepth(maxDepth: number): StyledString
    {
        return StyledString.concat(StyledString.s("("),
            StyledString.intercalate(StyledString.s(", "), [...this.knownMembers].map(([k, v]) => StyledString.concat(StyledString.s(k + ": "), v.toStyledString(maxDepth)))),
            StyledString.s(this.complete ? ")" : ", ...)"));
    }
}
