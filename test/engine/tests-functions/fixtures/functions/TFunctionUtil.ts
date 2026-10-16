// Port of test.functions.TFunctionUtil (tests-functions testFixtures).
import type { ExpressionIdentifier, UnitIdentifier } from "../../../../../src/engine/anns/Annotations.js";
import { Table } from "../../../../../src/engine/data/data/Table.js";
import { ErrorAndTypeRecorder } from "../../../../../src/engine/expressions/transformations/expression/ErrorAndTypeRecorder.js";
import { EvaluateState } from "../../../../../src/engine/expressions/transformations/expression/EvaluateState.js";
import { CallExpression, IdentExpression, StringLiteral, TypeLiteralExpression, type Expression } from "../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ExpressionUtil } from "../../../../../src/engine/expressions/transformations/expression/ExpressionUtil.js";
import type { FunctionLookup } from "../../../../../src/engine/expressions/transformations/expression/function/FunctionLookup.js";
import type { ValueFunction } from "../../../../../src/engine/expressions/transformations/expression/function/ValueFunction.js";
import type { QuickFix } from "../../../../../src/engine/expressions/transformations/expression/QuickFix.js";
import { TypeExpression } from "../../../../../src/engine/expressions/transformations/expression/type/TypeExpressions.js";
import { TypeState } from "../../../../../src/engine/expressions/transformations/expression/TypeState.js";
import type { FunctionDefinition } from "../../../../../src/engine/functions/transformations/function/FunctionDefinition.js";
import { FunctionList } from "../../../../../src/engine/functions/transformations/function/FunctionList.js";
import type { ColumnId } from "../../../../../src/engine/identifiers/id/ColumnId.js";
import type { TableId } from "../../../../../src/engine/identifiers/id/TableId.js";
import { codePoints } from "../../../../../src/engine/java/JavaCharacter.js";
import { Rational } from "../../../../../src/engine/java/Rational.js";
import { GrammarUtility } from "../../../../../src/engine/parsers/grammar/GrammarUtility.js";
import { ExpressionVersion } from "../../../../../src/engine/parsers/grammar/Versions.js";
import { DataType, SpecificDataTypeVisitor, TagType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { NumberInfo } from "../../../../../src/engine/types/data/datatype/NumberInfo.js";
import { TaggedTypeDefinition } from "../../../../../src/engine/types/data/datatype/TaggedTypeDefinition.js";
import { TypeId } from "../../../../../src/engine/types/data/datatype/TypeId.js";
import { TypeManager } from "../../../../../src/engine/types/data/datatype/TypeManager.js";
import { SingleUnit } from "../../../../../src/engine/types/data/unit/SingleUnit.js";
import { Unit } from "../../../../../src/engine/types/data/unit/Unit.js";
import { UnitDeclaration } from "../../../../../src/engine/types/data/unit/UnitDeclaration.js";
import { UnitManager } from "../../../../../src/engine/types/data/unit/UnitManager.js";
import { JellyType, type JellyTypeRecord } from "../../../../../src/engine/types/jellytype/JellyTypes.js";
import { JellyUnit } from "../../../../../src/engine/types/jellytype/JellyUnit.js";
import { MutVar, TypeCons, TypeExp } from "../../../../../src/engine/types/typeExp/TypeExps.js";
import type { MutUnitVar } from "../../../../../src/engine/types/typeExp/units/MutUnitVar.js";
import { ComparableEither } from "../../../../../src/engine/utility-adt/utility/adt/ComparableEither.js";
import { Either } from "../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../../src/engine/utility-error/error/InternalException.js";
import type { StyledShowable } from "../../../../../src/engine/utility-error/styled/StyledShowable.js";
import type { StyledString } from "../../../../../src/engine/utility-error/styled/StyledString.js";
import { Utility } from "../../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../../src/engine/utility/utility/Value.js";
import { assertNotNull } from "../../../../support/junit.js";
import type { SourceOfRandomness } from "../../../../support/quickcheck.js";
import { DummyManager } from "../DummyManager.js";

const id = (s: string): ExpressionIdentifier => s as ExpressionIdentifier;
const record = (...fields: [string, DataType][]): DataType => DataType.record(fields.map(([k, v]) => [id(k), v] as const));

export class TFunctionUtil
{
    public static readonly ILD = new Table.InitialLoadDetails(null, null, null, null);

    // Java has typeCheckFunction(function, paramTypes), (function, paramTypes, overrideTypeManager)
    // and (function, expectedReturnType, paramTypes, overrideTypeManager).
    // Returns the function and the return type of the function
    public static typeCheckFunction(func: FunctionDefinition, paramTypes: readonly DataType[], overrideTypeManager?: TypeManager | null): Pair<ValueFunction, DataType> | null;
    public static typeCheckFunction(func: FunctionDefinition, expectedReturnType: DataType, paramTypes: readonly DataType[], overrideTypeManager: TypeManager | null): Pair<ValueFunction, DataType> | null;
    public static typeCheckFunction(func: FunctionDefinition, a: readonly DataType[] | DataType, b?: readonly DataType[] | TypeManager | null, c?: TypeManager | null): Pair<ValueFunction, DataType> | null
    {
        if (Array.isArray(a))
            return TFunctionUtil.typeCheckFunctionParams(func, a as readonly DataType[], (b ?? null) as TypeManager | null);
        else
            return TFunctionUtil.typeCheckFunctionWithReturn(func, a as DataType, b as readonly DataType[], c ?? null);
    }

    private static typeCheckFunctionParams(func: FunctionDefinition, paramTypes: readonly DataType[], overrideTypeManager: TypeManager | null): Pair<ValueFunction, DataType> | null
    {
        const onError = TFunctionUtil.excOnError();
        const typeManager = overrideTypeManager !== null ? overrideTypeManager : TFunctionUtil.managerWithTestTypes().getFirst().getTypeManager();
        const functionType = func.getType(typeManager);
        const returnTypeVar = new MutVar(null);
        const paramTypeExp = onError.recordError(null as unknown as Expression, TypeExp.unifyTypes(TypeCons.function(null, Utility.mapListInt(paramTypes, p => TypeExp.fromDataType(null, p)), returnTypeVar), functionType.getFirst()));
        if (paramTypeExp === null)
            return null;

        const returnType = onError.recordLeftError(typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager()), null as unknown as Expression, returnTypeVar.toConcreteType(typeManager));
        if (returnType !== null)
            return new Pair<ValueFunction, DataType>(func.getInstance(typeManager, s => TFunctionUtil.getConcrete(s, functionType.getSecond(), typeManager)), returnType);
        return null;
    }

    private static typeCheckFunctionWithReturn(func: FunctionDefinition, expectedReturnType: DataType, paramTypes: readonly DataType[], overrideTypeManager: TypeManager | null): Pair<ValueFunction, DataType> | null
    {
        const onError = TFunctionUtil.excOnError();
        const typeManager = overrideTypeManager !== null ? overrideTypeManager : DummyManager.make().getTypeManager();
        const functionType = func.getType(typeManager);
        const returnTypeVar = new MutVar(null);
        const unifiedReturn = onError.recordError(null as unknown as Expression, TypeExp.unifyTypes(returnTypeVar, TypeExp.fromDataType(null, expectedReturnType)));
        if (null === unifiedReturn)
            return null;
        const funcTypeExp = onError.recordError(null as unknown as Expression, TypeExp.unifyTypes(TypeCons.function(null, Utility.mapListInt(paramTypes, p => TypeExp.fromDataType(null, p)), returnTypeVar), functionType.getFirst()));
        if (funcTypeExp === null)
            return null;

        const returnType = onError.recordLeftError(typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager()), null as unknown as Expression, returnTypeVar.toConcreteType(typeManager));
        if (returnType !== null)
            return new Pair<ValueFunction, DataType>(func.getInstance(typeManager, s => TFunctionUtil.getConcrete(s, functionType.getSecond(), typeManager)), returnType);
        return null;
    }

    private static getConcrete(s: string, vars: ReadonlyMap<string, Either<MutUnitVar, MutVar>>, typeManager: TypeManager): Either<Unit, DataType>
    {
        const v = vars.get(s);
        if (v === undefined)
            throw new InternalException("Var " + s + " not found");
        return v.mapBothEx(
            u => {
                const concrete = u.toConcreteUnit();
                if (concrete === null)
                    throw new InternalException("Could not concrete unit: " + u.toString());
                return concrete;
            },
            t => t.toConcreteType(typeManager).getRight(""));
    }

    public static excOnError(): ErrorAndTypeRecorder
    {
        return new class extends ErrorAndTypeRecorder
        {
            protected override recordErrorMessage<E>(_src: E, error: StyledString): void
            {
                throw new Error(error.toPlain());
            }

            public override recordInformation<EXPRESSION extends StyledShowable>(_src: EXPRESSION, _informaton: Pair<StyledString, QuickFix<EXPRESSION> | null>): void
            {
            }

            public override recordQuickFixes<EXPRESSION extends StyledShowable>(_src: EXPRESSION, _quickFixes: readonly QuickFix<EXPRESSION>[]): void
            {
            }

            public override recordTypeNN(_expression: Expression, typeExp: TypeExp): TypeExp
            {
                return typeExp;
            }
        }();
    }

    public static managerWithTestTypes(): Pair<DummyManager, DataType[]>
    {
        const dummyManager = new DummyManager();

        dummyManager.getUnitManager().addUserUnit(new Pair("myUnit" as UnitIdentifier, Either.right<UnitIdentifier, UnitDeclaration>(new UnitDeclaration(new SingleUnit("myUnit" as UnitIdentifier, "Custom unit for testing", "", ""), null, "New Category"))));
        dummyManager.getUnitManager().addUserUnit(new Pair("myAlias" as UnitIdentifier, Either.left<UnitIdentifier, UnitDeclaration>("myUnit" as UnitIdentifier)));
        dummyManager.getUnitManager().addUserUnit(new Pair("hogshead" as UnitIdentifier, Either.right<UnitIdentifier, UnitDeclaration>(new UnitDeclaration(new SingleUnit("hogshead" as UnitIdentifier, "An English wine cask hogshead", "", ""), new Pair(Rational.ofLongs(2387, 10), dummyManager.getUnitManager().loadUse("l")), "Volume"))));

        // TODO add more higher-order types
        const typeManager = dummyManager.getTypeManager();
        const a = typeManager.registerTaggedType(id("A"), [], [new TagType<JellyType>(id("Single"), null)])!.instantiate([], typeManager);
        const c = typeManager.registerTaggedType(id("C"), [], [new TagType<JellyType>(id("Blank"), null), new TagType<JellyType>(id("Num"), JellyType.fromConcrete(DataType.NUMBER))])!.instantiate([], typeManager);
        const b = typeManager.registerTaggedType(id("B"), [], [new TagType<JellyType>(id("Single"), null)])!.instantiate([], typeManager);
        const nested = typeManager.registerTaggedType(id("Nested"), [], [new TagType<JellyType>(id("A"), JellyType.tagged(new TypeId(id("A")), [])), new TagType<JellyType>(id("C"), JellyType.tagged(new TypeId(id("C")), []))])!.instantiate([], typeManager);
        const maybeMaybe = typeManager.getMaybeType().instantiate([Either.right(
            typeManager.getMaybeType().instantiate([Either.right(DataType.TEXT)], typeManager)
        )], typeManager);

        const eitherUnits = typeManager.registerTaggedType(id("EitherNumUnit"),
                [new Pair(TaggedTypeDefinition.TypeVariableKind.UNIT, id("a")), new Pair(TaggedTypeDefinition.TypeVariableKind.UNIT, id("b"))],
                [new TagType(id("Left"), JellyType.number(JellyUnit.unitVariable("a"))),
                        new TagType(id("Right"), JellyType.number(JellyUnit.unitVariable("b")))]
        )!.instantiate([Either.left(Unit.SCALAR), Either.left(typeManager.getUnitManager().loadUse("m"))], typeManager);

        const eitherUnits2 = typeManager.registerTaggedType(id("EitherMyOrHogshead"),
            [],
            [new TagType(id("Left"), JellyType.number(JellyUnit.fromConcrete(typeManager.getUnitManager().loadUse("myUnit")))),
                new TagType(id("Right"), JellyType.number(JellyUnit.fromConcrete(typeManager.getUnitManager().loadUse("hogshead"))))]
        )!.instantiate([], typeManager);

        return new Pair<DummyManager, DataType[]>(dummyManager, [
            DataType.BOOLEAN,
            DataType.TEXT,
            DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY)),
            DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTH)),
            DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIME)),
            DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIMEZONED)),
            DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.TIMEOFDAY)),
            //DataType.date(new DateTimeInfo(DateTimeType.TIMEOFDAYZONED)),
            DataType.NUMBER,
            DataType.number(new NumberInfo(typeManager.getUnitManager().loadUse("GBP"))),
            DataType.number(new NumberInfo(typeManager.getUnitManager().loadUse("m"))),
            DataType.number(new NumberInfo(typeManager.getUnitManager().loadUse("m^2"))),
            DataType.number(new NumberInfo(typeManager.getUnitManager().loadUse("m^3/s^3"))),
            DataType.number(new NumberInfo(typeManager.getUnitManager().loadUse("cm"))),
            DataType.number(new NumberInfo(typeManager.getUnitManager().loadUse("(USD*m)/s^2"))),
            a,
            b,
            c,
            nested,
            maybeMaybe,
            eitherUnits,
            eitherUnits2,
            record(["a", DataType.NUMBER], ["b", DataType.NUMBER]),
            record(["bool", DataType.BOOLEAN], ["Text", DataType.TEXT], ["dtz", DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIMEZONED))], ["c", c]),
            record(["z", DataType.NUMBER], ["inner", record(["t 1", DataType.TEXT], ["t 2", DataType.NUMBER])]),
            DataType.array(DataType.TEXT),
            DataType.array(DataType.NUMBER),
            DataType.array(record(["a", DataType.NUMBER], ["nested", record(["the text 0 item", DataType.TEXT], ["num num", DataType.NUMBER])])),
            DataType.array(DataType.array(record(["key", DataType.NUMBER], ["value", record(["a", DataType.TEXT], ["c", DataType.NUMBER])]))),
        ]);
    }

    public static runExpression(expressionSrc: string): Value
    {
        const mgr = TFunctionUtil.managerWithTestTypes().getFirst();
        const expression = TFunctionUtil.parseExpression(expressionSrc, mgr.getTypeManager(), FunctionList.getFunctionLookup(mgr.getUnitManager()));
        assertNotNull(expression.checkExpression(TFunctionUtil.dummyColumnLookup(), TFunctionUtil.createTypeState(mgr.getTypeManager()), TFunctionUtil.excOnError()));
        return expression.calculateValue(new EvaluateState(mgr.getTypeManager(), null)).value;
    }

    public static parseExpression(expressionSrc: string, typeManager: TypeManager, functionLookup: FunctionLookup): Expression
    {
        return ExpressionUtil.parse(null, expressionSrc, ExpressionVersion.latest(), typeManager, functionLookup);
    }

    public static getUnit(numberType: DataType): Unit
    {
        return numberType.apply(new class extends SpecificDataTypeVisitor<Unit>
        {
            public override number(displayInfo: NumberInfo): Unit
            {
                return displayInfo.getUnit();
            }
        }());
    }

    public static dummyColumnLookup(): Expression.ColumnLookup
    {
        return {
            getColumn(_expression: Expression, _tableId: TableId | null, _columnId: ColumnId): Expression.ColumnLookup.FoundColumn | null
            {
                return null;
            },

            getTable(_tableName: TableId | null): Expression.ColumnLookup.FoundTable | null
            {
                return null;
            },

            getAvailableColumnReferences(): Pair<TableId | null, ColumnId>[]
            {
                return [];
            },

            getAvailableTableReferences(): TableId[]
            {
                return [];
            },

            getPossibleColumnReferences(_tableId: TableId, _columnId: ColumnId): Expression.ColumnLookup.ClickedReference[]
            {
                return [];
            },
        };
    }

    public static createTypeState(typeManager: TypeManager): TypeState
    {
        return TypeState.withRowNumber(typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager()));
    }

    // Used for testing
    // Creates a call to a tag constructor
    public static tagged(unitManager: UnitManager, constructor: TypeManager.TagInfo, arg: Expression | null, destType: DataType, canAddAsType: boolean): Expression
    {
        const constructorExpression = IdentExpression.tag(constructor.getTypeName().getRaw(), constructor.getTagInfo().getName());
        let r: Expression;
        if (arg === null)
        {
            r = constructorExpression;
        }
        else
        {
            r = new CallExpression(constructorExpression, [arg]);
        }

        if (!canAddAsType)
            return r;

        // Need to avoid having an ambiguous type:
        const wholeType = constructor.wholeType;
        for (const v of wholeType.getTypeArguments())
        {
            // If any type variables aren't mentioned, wrap in asType:
            if (!TFunctionUtil.containsTypeVarJelly(wholeType.getTags()[constructor.tagIndex]!.getInner(), v))
            {
                const asType = FunctionList.lookup(unitManager, "as type");
                if (asType === null)
                    throw new Error("Could not find as type");
                return new CallExpression(IdentExpression.function(asType.getFullName()), [new TypeLiteralExpression(TypeExpression.fromDataType(destType)), r]);
            }
        }
        return r;
    }

    public static makeStringLiteral(target: string, r: SourceOfRandomness): StringLiteral
    {
        let b = "";

        for (const n of codePoints(target))
        {
            if (r.nextInt(8) === 1)
                b += "^{" + n.toString(16) + "}";
            else
                b += GrammarUtility.escapeChars(Utility.codePointToString(n));
        }
        return new StringLiteral(b);
    }

    // Java: containsTypeVar(JellyUnit, ...) and the private containsTypeVar(JellyType, ...)
    public static containsTypeVar(unit: JellyUnit, v: Pair<TaggedTypeDefinition.TypeVariableKind, string>): boolean
    {
        if (v.getFirst() === TaggedTypeDefinition.TypeVariableKind.UNIT)
            return unit.getDetails().has(ComparableEither.left(v.getSecond()));
        return false;
    }

    private static containsTypeVarJelly(jellyType: JellyType | null, v: Pair<TaggedTypeDefinition.TypeVariableKind, string>): boolean
    {
        if (jellyType === null)
            return false;

        return jellyType.apply<boolean>({
            number(unit: JellyUnit): boolean
            {
                return TFunctionUtil.containsTypeVar(unit, v);
            },

            text(): boolean
            {
                return false;
            },

            date(_dateTimeInfo: DateTimeInfo): boolean
            {
                return false;
            },

            bool(): boolean
            {
                return false;
            },

            applyTagged(_typeName: TypeId, typeParams: readonly Either<JellyUnit, JellyType>[]): boolean
            {
                return typeParams.some(p => p.either<boolean>(u => TFunctionUtil.containsTypeVar(u, v), t => TFunctionUtil.containsTypeVarJelly(t, v)));
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, JellyTypeRecord.Field>, _complete: boolean): boolean
            {
                return [...fields.values()].some(t => TFunctionUtil.containsTypeVarJelly(t.getJellyType(), v));
            },

            array(inner: JellyType): boolean
            {
                return TFunctionUtil.containsTypeVarJelly(inner, v);
            },

            function(argTypes: readonly JellyType[], resultType: JellyType): boolean
            {
                return argTypes.some(a => TFunctionUtil.containsTypeVarJelly(a, v)) || TFunctionUtil.containsTypeVarJelly(resultType, v);
            },

            ident(name: string): boolean
            {
                return v.equals(new Pair(TaggedTypeDefinition.TypeVariableKind.TYPE, name));
            },
        });
    }

    // Makes something which could be an unfinished expression.  Can't have operators, can't start with a number.
    public static makeUnfinished(r: SourceOfRandomness): string
    {
        let s = "";
        s += r.nextChar("a", "z");
        const len = r.nextInt(0, 10);
        for (let i = 0; i < len; i++)
        {
            s += r.nextBoolean() ? r.nextChar("a", "z") : r.nextChar("0", "9");
        }
        return s;
    }

    public static typeState(): TypeState
    {
        const unitManager = new UnitManager();
        const typeManager = new TypeManager(unitManager);
        return TFunctionUtil.createTypeState(typeManager);
    }
}
