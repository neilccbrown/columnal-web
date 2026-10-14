// Port of xyz.columnal.typeExp.TypeExp (types module).
// Import TypeExp and its subclasses from TypeExps.ts (which see).
import type { ExpressionIdentifier, Localized } from "../../anns/Annotations.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { StyledShowable } from "../../utility-error/styled/StyledShowable.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { DataType, TagType } from "../data/datatype/DataType.js";
import type { DateTimeInfo } from "../data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../data/datatype/NumberInfo.js";
import { TaggedTypeDefinition } from "../data/datatype/TaggedTypeDefinition.js";
import type { TypeId } from "../data/datatype/TypeId.js";
import type { TypeManager } from "../data/datatype/TypeManager.js";
import type { Unit } from "../data/unit/Unit.js";
import type { JellyType } from "../jellytype/JellyType.js";
import type { ExpressionBase } from "./ExpressionBase.js";
import type { TypeClassRequirements } from "./TypeClassRequirements.js";
import type { TypeConcretisationError } from "./TypeConcretisationError.js";
import { MutVar, NumTypeExp, RecordTypeExp, TypeCons } from "./TypeExps.js";
import { MutUnitVar } from "./units/MutUnitVar.js";
import { UnitExp } from "./units/UnitExp.js";

/**
 * We have the following concrete/terminal types:
 *  - Boolean
 *  - Number
 *  - String
 *  - Date/time types
 * The following composite types:
 *  - an ADT, which at the type level can take a list of 0+ type parameters
 *  - a list, which can be thought of as an in-built ADT taking one type parameter
 *  - a tuple, which can be thought as an in-built ADT taking 2+ parameters
 * Because some functions take a tuple with any number of parameters, we have a special case for this
 *
 *
 * The following is a pseudo-GADT for types which we will one day expose to the user for dynamic typing
 * so that you can process a column dynamically as (Type a, [a]) :
 *
 * data Constructor a where
 *   -- construct, deconstruct, Type
 *   Cons :: (b -> a) -> (a -> Maybe b) -> Type b -> Constructor a
 *
 * data ConcreteComposite a where
 *   Concrete :: [(String, Maybe (Constructor a))] -> CompositeDef a
 *
 * data CompositeDef a where
 *   -- End version, with no type args:
 *   Conc :: ConcreteComposite a -> CompositeDef a
 *   -- Type variable:
 *   Poly :: (Type b -> CompositeDef a) -> CompositeDef (Type b -> a)
 *
 * data TupleElem a where
 *   -- deconstruct, setter
 *   Elem :: (a -> b) -> (b -> a -> a) -> Type b -> TupleElem a
 *
 * data TypeArg where
 *   TypeArg :: Type a -> TypeArg
 *
 * data Type a where
 *   Num :: Type Number
 *   Bool :: Type Boolean
 *   Text :: Type String
 *   Date :: Type Date (etc -- several of these)
 *   -- Tagged data types:
 *   CompositeConcrete :: ConcreteComposite a -> Type a
 *   CompositeApp :: CompositeDef (Type b -> a) -> Type b -> Type a
 *   List :: Type a -> Type [a]
 *   Tuple :: [TupleElem a] -> Type a
 *
 *
 *
 * Meanwhile, we need a prospective type while doing type inference.  That is similar to the above
 * but has some different fields ready for unification:
 *
 * -- Note in Sheard that TypeExp a is only carrying around ST parameter, TypeExp doesn't actually
 * -- need a type argument.
 *
 * data TypeExp where
 *   -- Note, in the Sheard paper that Ptr is a custom type, not an in-built one!  Unfolded here:
 *   MutVar :: IORef (Maybe TypeExp) -> TypeExp
 *   -- Don't really understand GenVar, yet:
 *   GenVar :: Int -> TypeExp
 *   -- We need a special case for numbers due to units:
 *   NumType :: Unit -> TypeExp
 *   -- Includes non-numeric primitives, lists, algebraic:
 *   TypeCons :: String -> [TypeExp] -> TypeExp
 *   -- Tuples are difficult primarily due to type of functions like "first":
 *   TupleType :: Tuple -> TypeExp
 *   -- Overloaded operators and functions:
 *   Or :: [TypeExp] -> TypeExp
 *
 * -- This is like a list type, but distinguishes don't-care (used by "first" for the
 * rest of the tuple) from empty.
 * data Tuple where
 *   Any :: Tuple
 *   End :: Tuple
 *   TCons :: TypeExp -> Tuple -> Tuple
 */
export abstract class TypeExp implements StyledShowable
{
    // Java: ImmutableSet (iteration in the given order)
    public static readonly ALL_TYPE_CLASSES: ReadonlySet<string> = new Set([
        "Equatable", "Comparable", "Readable", "Showable",
    ]);
    public static readonly CONS_TEXT: ExpressionIdentifier = "Text";
    public static readonly CONS_BOOLEAN: ExpressionIdentifier = "Boolean";
    public static readonly CONS_LIST: ExpressionIdentifier = "List";
    public static readonly CONS_FUNCTION: ExpressionIdentifier = "Function";
    public static readonly CONS_TYPE: ExpressionIdentifier = "Type";
    public static readonly CONS_UNIT: ExpressionIdentifier = "Unit";

    // For recording errors:
    public readonly src: ExpressionBase | null;

    protected constructor(src: ExpressionBase | null)
    {
        this.src = src;
    }

    // Java has unifyTypes(TypeExp...) and unifyTypes(List<TypeExp>)
    public static unifyTypes(...typesOrList: TypeExp[] | [readonly TypeExp[]]): Either<TypeExp.TypeError, TypeExp>
    {
        const types: readonly TypeExp[] = typesOrList.length === 1 && Array.isArray(typesOrList[0]) ? typesOrList[0] : typesOrList as TypeExp[];
        if (types.length === 0)
            return Either.left(new TypeExp.TypeError(StyledString.s("Error: no types available"), []));
        else if (types.length === 1)
            return Either.right(types[0]!);
        else
        {
            let r = types[0]!.unifyWith(types[1]!);
            for (let i = 2; i < types.length; i++)
            {
                if (r.isLeft())
                    return r;
                const next = types[i]!;
                r = r.getRight("Impossible").unifyWith(next);
            }
            return r;
        }
    }

    // This is like a function: type -> Type type, except that the parameter is not a value of that type, it's the type itself.
    public static dataTypeToTypeGADT(src: ExpressionBase | null, dataType: DataType): TypeExp
    {
        return TypeExp.typeExpToTypeGADT(src, TypeExp.fromDataType(src, dataType));
    }

    // This is like a function: type -> Type type, except that the parameter is not a value of that type, it's the type itself.
    public static typeExpToTypeGADT(src: ExpressionBase | null, exp: TypeExp): TypeExp
    {
        return new TypeCons(src, TypeExp.CONS_TYPE, [Either.right<UnitExp, TypeExp>(exp)], new Set());
    }

    // This is like a function: unit -> Unit unit, except that the parameter is not a value of that unit, it's the unit itself.
    public static unitExpToUnitGADT(src: ExpressionBase | null, exp: UnitExp): TypeExp
    {
        return new TypeCons(src, TypeExp.CONS_UNIT, [Either.left<UnitExp, TypeExp>(exp)], new Set());
    }

    public static record(src: ExpressionBase | null, fieldTypes: Iterable<readonly [ExpressionIdentifier, TypeExp]>, complete: boolean): TypeExp
    {
        return new RecordTypeExp(src, new Map(fieldTypes), complete);
    }

    // Java: package-protected
    public unifyWith(b: TypeExp): Either<TypeExp.TypeError, TypeExp>
    {
        const aPruned = this.prune();
        const bPruned = b.prune();
        // Make sure param isn't a MutVar unless it has to be (because they are both MutVar):
        if (bPruned instanceof MutVar && !(aPruned instanceof MutVar))
        {
            return bPruned._unify(aPruned);
        }
        else
        {
            return aPruned._unify(bPruned);
        }
    }

    /**
     * You can assume that b is pruned, and is not a MutVar unless
     * this is also a MutVar.
     */
    public abstract _unify(b: TypeExp): Either<TypeExp.TypeError, TypeExp>;

    // Prunes any MutVars at the outermost level.
    public prune(): TypeExp
    {
        return this;
    }

    /**
     * Is this TypeExp equal to, or does it contain, the given MutVar?
     * Used to check for cycles.
     */
    public abstract containsMutVar(mutVar: MutVar): boolean;

    protected typeMismatch(other: TypeExp): Either<TypeExp.TypeError, TypeExp>
    {
        return Either.left(new TypeExp.TypeError(StyledString.concat(StyledString.s("Type mismatch: "), this.toStyledString(), StyledString.s(" versus "), other.toStyledString()), [this, other]));
    }

    // The first part of the pair is the overall tagged type.  The second part is a list, for all the constructors,
    // of the types of that constructor
    public static fromTagged(src: ExpressionBase | null, taggedTypeDefinition: TaggedTypeDefinition): Pair<TypeExp, readonly TypeExp[]>
    {
        const typeVarsInOrder: Either<UnitExp, TypeExp>[] = [];
        // Java: a HashMap, only used for lookups
        const typeVarsByName = new Map<string, Either<MutUnitVar, MutVar>>();
        for (const typeVar of taggedTypeDefinition.getTypeArguments())
        {
            const mutVar: Either<MutUnitVar, MutVar> = typeVar.getFirst() === TaggedTypeDefinition.TypeVariableKind.TYPE ? Either.right(new MutVar(src)) : Either.left(new MutUnitVar());
            typeVarsInOrder.push(mutVar.mapBoth<UnitExp, TypeExp>(u => new UnitExp(u), v => v));
            typeVarsByName.set(typeVar.getSecond(), mutVar);
        }
        const overallType = new TypeCons(src, taggedTypeDefinition.getTaggedTypeName().getRaw(), typeVarsInOrder, TypeExp.ALL_TYPE_CLASSES);
        const tagTypes: TypeExp[] = [];
        for (const tagType of taggedTypeDefinition.getTags())
        {
            const inner: JellyType | null = tagType.getInner();
            if (inner === null)
            {
                tagTypes.push(overallType);
            }
            else
            {
                const innerTypeExp = inner.makeTypeExp(typeVarsByName);
                tagTypes.push(TypeCons.function(src, [innerTypeExp], overallType));
            }
        }
        return new Pair<TypeExp, readonly TypeExp[]>(
            overallType
        , tagTypes);
    }

    public static bool(src: ExpressionBase | null): TypeExp
    {
        return new TypeCons(src, TypeExp.CONS_BOOLEAN, TypeExp.ALL_TYPE_CLASSES);
    }

    public static text(src: ExpressionBase | null): TypeExp
    {
        return new TypeCons(src, TypeExp.CONS_TEXT, TypeExp.ALL_TYPE_CLASSES);
    }

    public static plainNumber(src: ExpressionBase | null): TypeExp
    {
        return new NumTypeExp(src, UnitExp.SCALAR);
    }

    public static list(src: ExpressionBase | null, inner: TypeExp): TypeExp
    {
        return new TypeCons(src, TypeExp.CONS_LIST, [Either.right<UnitExp, TypeExp>(inner)], TypeExp.ALL_TYPE_CLASSES);
    }

    public static function(src: ExpressionBase | null, paramTypes: readonly TypeExp[], returnType: TypeExp): TypeExp
    {
        return new TypeCons(src, TypeExp.CONS_FUNCTION, Utility.concatI(Utility.mapListI(paramTypes, p => Either.right<UnitExp, TypeExp>(p)), [Either.right<UnitExp, TypeExp>(returnType)]), new Set());
    }

    public static fromDataType(src: ExpressionBase | null, dataType: DataType): TypeExp
    {
        return dataType.apply<TypeExp>({
            number(numberInfo: NumberInfo): TypeExp
            {
                return new NumTypeExp(src, UnitExp.fromConcrete(numberInfo.getUnit()));
            },

            text(): TypeExp
            {
                return TypeExp.text(src);
            },

            date(_dateTimeInfo: DateTimeInfo): TypeExp
            {
                const typeName: ExpressionIdentifier = dataType.toString();
                return new TypeCons(src, typeName, TypeExp.ALL_TYPE_CLASSES);
            },

            bool(): TypeExp
            {
                return TypeExp.bool(src);
            },

            tagged(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], _tags: readonly TagType<DataType>[]): TypeExp
            {
                return new TypeCons(src, typeName.getRaw(), Utility.mapListInt(typeVars, e => e.mapBothInt<UnitExp, TypeExp>(u => UnitExp.fromConcrete(u), v => TypeExp.fromDataType(src, v))), TypeExp.ALL_TYPE_CLASSES);
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): TypeExp
            {
                return new RecordTypeExp(src, new Map(Utility.mapValuesInt(fields, t => TypeExp.fromDataType(src, t))), true);
            },

            array(inner: DataType | null): TypeExp
            {
                return new TypeCons(src, TypeExp.CONS_LIST, [Either.right<UnitExp, TypeExp>(inner === null ? new MutVar(src) : TypeExp.fromDataType(src, inner))], TypeExp.ALL_TYPE_CLASSES);
            },

            function(argTypes: readonly DataType[], resultType: DataType): TypeExp
            {
                return new TypeCons(src, TypeExp.CONS_FUNCTION, Utility.concatI(Utility.mapListInt(argTypes, (a: DataType) => Either.right<UnitExp, TypeExp>(TypeExp.fromDataType(null, a))), [Either.right<UnitExp, TypeExp>(TypeExp.fromDataType(null, resultType))]), new Set());
            },
        });
    }

    // Java has toConcreteType(TypeManager, boolean) and toConcreteType(TypeManager)
    public toConcreteType(typeManager: TypeManager, substituteDefaultIfPossible: boolean = false): Either<TypeConcretisationError, DataType>
    {
        return this.prune()._concrete(typeManager, substituteDefaultIfPossible);
    }

    // Java: protected abstract (but called on other TypeExps)
    public abstract _concrete(typeManager: TypeManager, substituteDefaultIfPossible: boolean): Either<TypeConcretisationError, DataType>;

    public toString(): Localized
    {
        return this.toStyledString().toPlain();
    }

    public static isList(typeExp: TypeExp): boolean
    {
        return typeExp instanceof TypeCons && typeExp.name === TypeCons.CONS_LIST;
    }

    public static isFunction(typeExp: TypeExp): boolean
    {
        return typeExp instanceof TypeCons && typeExp.name === TypeCons.CONS_FUNCTION;
    }

    public static getFunctionArg(functionTypeExp: TypeExp): readonly TypeExp[] | null
    {
        if (TypeExp.isFunction(functionTypeExp))
        {
            const operands = (functionTypeExp as TypeCons).operands;
            return Either.mapM<UnitExp, TypeExp, Either<UnitExp, TypeExp>>(operands.slice(0, operands.length - 1), x => x).either<readonly TypeExp[] | null>(_u => null, t => t);
        }
        return null;
    }

    public static getFunctionResult(functionTypeExp: TypeExp): TypeExp | null
    {
        if (TypeExp.isFunction(functionTypeExp))
        {
            const operands = (functionTypeExp as TypeCons).operands;
            return operands[operands.length - 1]!.either<TypeExp | null>(_u => null, t => t);
        }
        return null;
    }

    /**
     * Adds all the given type-classes as constraints to this TypeExp if possible.  If not, an error is returned.
     * The visitedMutVar keeps track of visited MutVar to prevent infinite
     * recursion in case of there being a cycle in the type.
     *
     * Java has a final requireTypeClasses(typeClasses), which passes a new empty set, and an
     * abstract requireTypeClasses(typeClasses, visitedMutVar), which subclasses implement here
     * as requireTypeClassesVisited.  (Java's IdentityHashSet is a Set, which compares by identity.)
     */
    public requireTypeClasses(typeClasses: TypeClassRequirements, visitedMutVar: ReadonlySet<MutVar> = new Set()): TypeExp.TypeError | null
    {
        return this.requireTypeClassesVisited(typeClasses, visitedMutVar);
    }

    protected abstract requireTypeClassesVisited(typeClasses: TypeClassRequirements, visitedMutVar: ReadonlySet<MutVar>): TypeExp.TypeError | null;

    /**
     * Java has a final toStyledString(), which uses a maximum depth of 4, and an abstract
     * protected toStyledString(int maxDepth), which subclasses implement here as toStyledStringDepth.
     */
    public toStyledString(maxDepth: number = 4): StyledString
    {
        return this.toStyledStringDepth(maxDepth);
    }

    protected abstract toStyledStringDepth(maxDepth: number): StyledString;
}

export namespace TypeExp
{
    export class TypeError
    {
        private readonly message: StyledString;
        private readonly couldNotUnify: readonly TypeExp[];

        public constructor(message: StyledString, couldNotUnify: readonly TypeExp[])
        {
            this.message = message;
            this.couldNotUnify = couldNotUnify;
        }

        public getMessage(): StyledString
        {
            return this.message;
        }

        public getCouldNotUnify(): readonly TypeExp[]
        {
            return this.couldNotUnify;
        }

        // For testing
        public toString(): string
        {
            return this.getMessage().toPlain();
        }
    }
}
