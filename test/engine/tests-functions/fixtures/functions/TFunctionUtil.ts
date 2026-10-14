// Port of test.functions.TFunctionUtil (tests-functions testFixtures).
//
// PORT-DEFERRED: everything apart from managerWithTestTypes and ILD needs the expressions and
// functions modules (Phase 4): typeCheckFunction, excOnError, runExpression, parseExpression,
// getUnit, dummyColumnLookup, createTypeState, tagged, makeStringLiteral, containsTypeVar,
// makeUnfinished and typeState.
import type { ExpressionIdentifier, UnitIdentifier } from "../../../../../src/engine/anns/Annotations.js";
import { Table } from "../../../../../src/engine/data/data/Table.js";
import { Rational } from "../../../../../src/engine/java/Rational.js";
import { DataType, TagType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { NumberInfo } from "../../../../../src/engine/types/data/datatype/NumberInfo.js";
import { TaggedTypeDefinition } from "../../../../../src/engine/types/data/datatype/TaggedTypeDefinition.js";
import { TypeId } from "../../../../../src/engine/types/data/datatype/TypeId.js";
import { SingleUnit } from "../../../../../src/engine/types/data/unit/SingleUnit.js";
import { Unit } from "../../../../../src/engine/types/data/unit/Unit.js";
import { UnitDeclaration } from "../../../../../src/engine/types/data/unit/UnitDeclaration.js";
import { JellyType } from "../../../../../src/engine/types/jellytype/JellyTypes.js";
import { JellyUnit } from "../../../../../src/engine/types/jellytype/JellyUnit.js";
import { Either } from "../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { DummyManager } from "../DummyManager.js";

const id = (s: string): ExpressionIdentifier => s as ExpressionIdentifier;
const record = (...fields: [string, DataType][]): DataType => DataType.record(fields.map(([k, v]) => [id(k), v] as const));

export class TFunctionUtil
{
    public static readonly ILD = new Table.InitialLoadDetails(null, null, null, null);

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
}
