// Port of xyz.columnal.typeExp.NumTypeExp (types module).
// Import TypeExp and its subclasses from TypeExps.ts (which see).
import { javaEquals, javaObjectsHash } from "../../java/JavaObject.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import { DataType } from "../data/datatype/DataType.js";
import { NumberInfo } from "../data/datatype/NumberInfo.js";
import type { TypeManager } from "../data/datatype/TypeManager.js";
import { Unit } from "../data/unit/Unit.js";
import type { ExpressionBase } from "./ExpressionBase.js";
import type { TypeClassRequirements } from "./TypeClassRequirements.js";
import { TypeConcretisationError } from "./TypeConcretisationError.js";
import { TypeExp, type MutVar } from "./TypeExps.js";
import type { UnitExp } from "./units/UnitExp.js";

// Note: this is separate to TypeCons because (a) unit is optional, so special treatment needed, and
// (b) the unit is treated specially in multiplication and division.
export class NumTypeExp extends TypeExp
{
    private static readonly NATURAL_TYPE_CLASSES: ReadonlySet<string> = new Set([
        "Equatable", "Comparable", "Readable", "Showable",
    ]);

    public readonly unit: UnitExp;

    public constructor(src: ExpressionBase | null, unit: UnitExp)
    {
        super(src);
        this.unit = unit;
    }

    public override containsMutVar(_mutVar: MutVar): boolean
    {
        return false;
    }

    public override _unify(b: TypeExp): Either<TypeExp.TypeError, TypeExp>
    {
        if (!(b instanceof NumTypeExp))
            return this.typeMismatch(b);
        const bn = b;
        const unifiedUnit = this.unit.unifyWith(bn.unit);
        if (unifiedUnit === null)
            return this.typeMismatch(b);
        return Either.right(new NumTypeExp(this.src !== null ? this.src : b.src, unifiedUnit));
    }

    public override _concrete(_typeManager: TypeManager, substituteDefaultIfPossible: boolean): Either<TypeConcretisationError, DataType>
    {
        const concreteUnit = this.unit.toConcreteUnit();
        if (concreteUnit === null)
        {
            if (this.unit.isOnlyVars() || substituteDefaultIfPossible)
                return Either.right(DataType.number(new NumberInfo(Unit.SCALAR)));
            else
                return Either.left(new TypeConcretisationError(StyledString.concat(StyledString.s("Ambiguous unit: "), this.unit.toStyledString()), DataType.NUMBER));
        }
        else
            return Either.right(DataType.number(new NumberInfo(concreteUnit)));
    }

    protected override requireTypeClassesVisited(typeClasses: TypeClassRequirements, _visited: ReadonlySet<MutVar>): TypeExp.TypeError | null
    {
        return typeClasses.checkIfSatisfiedBy(StyledString.s("Number"), NumTypeExp.NATURAL_TYPE_CLASSES, this);
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof NumTypeExp) || o.constructor !== this.constructor) return false;
        return javaEquals(this.unit, o.unit);
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.unit);
    }

    protected override toStyledStringDepth(_maxDepth: number): StyledString
    {
        return StyledString.concat(StyledString.s("Number{"), this.unit.toStyledString(), StyledString.s("}"));
    }
}
