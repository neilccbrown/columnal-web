// Port of xyz.columnal.typeExp.TypeCons (types module).
// Import TypeExp and its subclasses from TypeExps.ts (which see).
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import { javaEnumValues } from "../../java/JavaEnum.js";
import { javaEquals, javaObjectsHash } from "../../java/JavaObject.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import { DataType } from "../data/datatype/DataType.js";
import { DateTimeInfo } from "../data/datatype/DateTimeInfo.js";
import { TypeId } from "../data/datatype/TypeId.js";
import type { TypeManager } from "../data/datatype/TypeManager.js";
import type { Unit } from "../data/unit/Unit.js";
import type { ExpressionBase } from "./ExpressionBase.js";
import type { TypeClassRequirements } from "./TypeClassRequirements.js";
import { TypeConcretisationError } from "./TypeConcretisationError.js";
import { TypeExp, type MutVar } from "./TypeExps.js";
import type { UnitExp } from "./units/UnitExp.js";

export class TypeCons extends TypeExp
{
    public readonly name: ExpressionIdentifier;
    // Can be size 0+:
    public readonly operands: readonly Either<UnitExp, TypeExp>[];
    // If operands is empty, this is the actual set of type-classes.  If operands is non-empty,
    // this is the list of type-classes which can be derived as long as all of the inner types
    // satisfy them (bit of a hack, but it will do for now)
    // (Java: ImmutableSet, which iterates in insertion order)
    private readonly typeClasses: ReadonlySet<string>;

    /**
     * Java has two constructors: (src, name, typeClasses) for primitive types, and
     * (src, name, operands, derivableTypeClasses) for tagged types.
     */
    public constructor(src: ExpressionBase | null, name: ExpressionIdentifier, typeClasses: ReadonlySet<string>);
    public constructor(src: ExpressionBase | null, name: ExpressionIdentifier, operands: readonly Either<UnitExp, TypeExp>[], derivableTypeClasses: ReadonlySet<string>);
    public constructor(src: ExpressionBase | null, name: ExpressionIdentifier, operandsOrTypeClasses: readonly Either<UnitExp, TypeExp>[] | ReadonlySet<string>, derivableTypeClasses?: ReadonlySet<string>)
    {
        super(src);
        this.name = name;
        if (derivableTypeClasses === undefined)
        {
            this.operands = [];
            this.typeClasses = operandsOrTypeClasses as ReadonlySet<string>;
        }
        else
        {
            this.operands = operandsOrTypeClasses as readonly Either<UnitExp, TypeExp>[];
            this.typeClasses = derivableTypeClasses;
        }
    }

    public override _unify(b: TypeExp): Either<TypeExp.TypeError, TypeExp>
    {
        if (!(b instanceof TypeCons))
            return this.typeMismatch(b);
        const bt = b;
        if (this.name !== bt.name)
            return this.typeMismatch(b);

        // This probably shouldn't happen in our editor, as it suggests
        // an incoherent expression:
        if (this.operands.length !== bt.operands.length)
            return this.typeMismatch(b);

        const unifiedOperands: Either<UnitExp, TypeExp>[] = [];
        for (let i = 0; i < this.operands.length; i++)
        {
            const us = this.operands[i]!;
            const them = bt.operands[i]!;
            if (us.isLeft() && them.isLeft())
            {
                const unified = us.getLeft("Impossible").unifyWith(them.getLeft("Impossible"));
                if (unified === null)
                    return Either.left(new TypeExp.TypeError(StyledString.s("Cannot match units " + us.getLeft("Impossible").toString() + " with " + them.getLeft("Impossible").toString()), [this, b]));
                unifiedOperands.push(Either.left(unified));
            }
            else if (us.isRight() && them.isRight())
            {
                const sub = us.getRight("Impossible").unifyWith(them.getRight("Impossible"));
                if (sub.isLeft())
                    return sub;
                unifiedOperands.push(Either.right(sub.getRight("Impossible")));
            }
            else
            {
                return Either.left(new TypeExp.TypeError(StyledString.s("Cannot match units with a type"), [this, b]));
            }
        }
        // Java: ImmutableSet.copyOf(Sets.intersection(typeClasses, b.typeClasses)), in our order
        return Either.right(new TypeCons(this.src !== null ? this.src : b.src, this.name, unifiedOperands, new Set([...this.typeClasses].filter(t => b.typeClasses.has(t)))));
    }

    public override containsMutVar(mutVar: MutVar): boolean
    {
        return this.operands.some(operand => operand.either(_u => false, t => t.containsMutVar(mutVar)));
    }

    public override _concrete(typeManager: TypeManager, substituteDefaultIfPossible: boolean): Either<TypeConcretisationError, DataType>
    {
        switch (this.name)
        {
            case TypeExp.CONS_TEXT:
                return Either.right(DataType.TEXT);
            case TypeExp.CONS_BOOLEAN:
                return Either.right(DataType.BOOLEAN);
            case TypeExp.CONS_LIST:
                if (this.operands[0]!.isLeft())
                    throw new UserException("List must be of a type, not a unit");
                else
                    return this.operands[0]!.getRight("Impossible").toConcreteType(typeManager, substituteDefaultIfPossible).map(t => DataType.array(t));
            case TypeExp.CONS_FUNCTION:
            {
                if (this.operands.some(o => o.isLeft()))
                    throw new UserException("Function cannot take or return a unit");
                const arg = Either.mapMEx<TypeConcretisationError, DataType, Either<UnitExp, TypeExp>>(this.operands.slice(0, this.operands.length - 1), op => op.getRight("Impossible").toConcreteType(typeManager, substituteDefaultIfPossible));
                if (arg.isLeft())
                    return Either.left(arg.getLeft("Impossible"));
                const ret = this.operands[this.operands.length - 1]!.getRight("Impossible").toConcreteType(typeManager, substituteDefaultIfPossible);
                if (ret.isLeft())
                    return ret;
                return Either.right(DataType.function(arg.getRight("Impossible"), ret.getRight("Impossible")));
            }
            default:
            {
                for (const dtt of javaEnumValues<DateTimeInfo.DateTimeType>(DateTimeInfo.DateTimeType))
                {
                    const dataType = DataType.date(new DateTimeInfo(dtt));
                    if (dataType.toString() === this.name)
                        return Either.right(dataType);
                }
                // Not a date type, continue...
                const errOrOperandsAsTypes = Either.mapMEx<TypeConcretisationError, Either<Unit, DataType>, Either<UnitExp, TypeExp>>(this.operands, o => {
                    // So, the outer either here is for units versus types, but the return type is either error or either-unit-or-type.
                    return o.eitherEx<Either<TypeConcretisationError, Either<Unit, DataType>>>(u => {
                        const concreteUnit = u.toConcreteUnit();
                        if (concreteUnit === null)
                            return Either.left<TypeConcretisationError, Either<Unit, DataType>>(new TypeConcretisationError(StyledString.s("Unit unspecified; could be any unit: " + u.toString())));
                        const unitOrType: Either<Unit, DataType> = Either.left(concreteUnit);
                        return Either.right(unitOrType);
                    }, t => t.toConcreteType(typeManager, substituteDefaultIfPossible).map(x => Either.right<Unit, DataType>(x)));
                });
                return errOrOperandsAsTypes.eitherEx<Either<TypeConcretisationError, DataType>>(err => Either.left<TypeConcretisationError, DataType>(new TypeConcretisationError(err.getErrorText(), null)), (operandsAsTypes: readonly Either<Unit, DataType>[]) => {
                    const tagged = typeManager.lookupType(new TypeId(this.name), [...operandsAsTypes]);
                    if (tagged !== null)
                    {
                        return Either.right(tagged);
                    }
                    return Either.left(new TypeConcretisationError(StyledString.s("Unknown type constructor: " + this.name)));
                });
            }
        }
    }

    protected override requireTypeClassesVisited(typeClasses: TypeClassRequirements, visited: ReadonlySet<MutVar>): TypeExp.TypeError | null
    {
        if (this.operands.length === 0)
        {
            return typeClasses.checkIfSatisfiedBy(this.toStyledString(), this.typeClasses, this);
            /*
                StyledString.Builder b = StyledString.builder();
                b.append("Type: ");
                b.append(name).append(operands.stream().map(s -> StyledString.concat(StyledString.s("-"), s.toStyledString())).collect(StyledString.joining("")));
                b.append(" is not " + Sets.difference(typeClasses, this.typeClasses).stream().collect(Collectors.joining(" or ")));
                return b.build();
                */
        }
        else
        {
            // Apply all type constraints to children.
            // First check that everything they want can be derived:
            const derivationError = typeClasses.checkIfSatisfiedBy(this.toStyledString(), this.typeClasses, this);
            if (derivationError === null)
            {
                // Apply constraints to children so that they know them
                // for future unification:
                for (const operand of this.operands)
                {
                    const err = operand.either<TypeExp.TypeError | null>(_u => null, t => t.requireTypeClasses(typeClasses, visited));
                    if (err !== null)
                        return err;
                }
                return null;
            }
            else
            {
                return derivationError;
            }
        }
    }

    protected override toStyledStringDepth(maxDepth: number): StyledString
    {
        return StyledString.concat(StyledString.s(this.name), this.operands.length === 0 ? StyledString.s("") : StyledString.concat(...this.operands.map(t => StyledString.concat(StyledString.s("("), t.either(u => u.toStyledString(), ty => ty.toStyledString(maxDepth)), StyledString.s(")")))));
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TypeCons) || o.constructor !== this.constructor) return false;
        return this.name === o.name &&
            javaEquals(this.operands, o.operands);
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.name, this.operands);
    }
}
