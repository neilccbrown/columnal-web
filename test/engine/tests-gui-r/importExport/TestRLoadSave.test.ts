// Port of test.importExport.TestRLoadSave (tests-gui-r).  The test doesn't use the GUI, so it is a
// Vitest engine test (see ENGINE_TESTS_IN_GUI_MODULES in scripts/port-status.ts).
//
// PORT-DEFERRED: testRoundTrip's third kind runs the R executable (Java requires R to be
// installed).  Until R runs in webR (Phase 12), that kind only runs where R is on the PATH.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "vitest";
import type { ExpressionIdentifier } from "../../../../src/engine/anns/Annotations.js";
import type { Column } from "../../../../src/engine/data/data/Column.js";
import type { RecordSet } from "../../../../src/engine/data/data/RecordSet.js";
import { ColumnId } from "../../../../src/engine/identifiers/id/ColumnId.js";
import { type Decimal, decimalFromDouble, doubleValue, parseBigDecimal } from "../../../../src/engine/java/JavaBigDecimal.js";
import { JavaFile } from "../../../../src/engine/java/JavaFile.js";
import { javaUtf8Bytes, javaReplace } from "../../../../src/engine/java/JavaString.js";
import { Instant, LocalDate, LocalDateTime, LocalTime, ZonedDateTime, ZoneId, ZoneOffset } from "../../../../src/engine/java/time/JavaTime.js";
import type { TemporalAccessor } from "../../../../src/engine/java/time/TemporalAccessor.js";
import { ConvertFromR } from "../../../../src/engine/r-interop/rinterop/ConvertFromR.js";
import { ConvertToR } from "../../../../src/engine/r-interop/rinterop/ConvertToR.js";
import { RPrettyPrint } from "../../../../src/engine/r-interop/rinterop/RPrettyPrint.js";
import { RRead } from "../../../../src/engine/r-interop/rinterop/RRead.js";
import type { RValue } from "../../../../src/engine/r-interop/rinterop/RValue.js";
import { RWrite } from "../../../../src/engine/r-interop/rinterop/RWrite.js";
import { DataType, FlatDataTypeVisitor, type TagType } from "../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { GetValue, type DataTypeVisitorGet } from "../../../../src/engine/types/data/datatype/DataTypeValue.js";
import { DateTimeInfo } from "../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../../../src/engine/types/data/datatype/NumberInfo.js";
import type { ProgressListener } from "../../../../src/engine/types/data/datatype/ProgressListener.js";
import { TypeId } from "../../../../src/engine/types/data/datatype/TypeId.js";
import { TypeManager } from "../../../../src/engine/types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../src/engine/types/data/unit/Unit.js";
import { UnitManager } from "../../../../src/engine/types/data/unit/UnitManager.js";
import { Either } from "../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../src/engine/utility-error/error/InternalException.js";
import { UserException } from "../../../../src/engine/utility-error/error/UserException.js";
import { TaggedValue } from "../../../../src/engine/utility/utility/TaggedValue.js";
import { ListEx, Record, RecordMap, Utility } from "../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../src/engine/utility/utility/Value.js";
import { assertEquals, fail } from "../../../support/junit.js";
import { propertyTest } from "../../../support/quickcheck.js";
import { TBasicUtil } from "../../tests-basic/fixtures/data/TBasicUtil.js";
import { GenRCompatibleRecordSet } from "./GenRCompatibleRecordSet.js";

import DateTimeType = DateTimeInfo.DateTimeType;

const resourceDir = join(import.meta.dirname, "resources");

// Java: getClass().getClassLoader().getResource(name), as a File
function resource(name: string): JavaFile
{
    const path = join(resourceDir, name);
    return new JavaFile(path, readFileSync(path));
}

describe("TestRLoadSave", () =>
{
    test("testImportRData1", () =>
    {
        const loaded = RRead.readRData(resource("iris.rds"));
        console.log(RPrettyPrint.prettyPrint(loaded));
        const typeManager = new TypeManager(new UnitManager());
        const rs = ConvertFromR.convertRToTable(typeManager, loaded, false)[0]!.getSecond();

        assertEquals([new ColumnId("Sepal Length"), new ColumnId("Sepal Width"), new ColumnId("Petal Length"), new ColumnId("Petal Width"), new ColumnId("Species")], rs.getColumnIds());

        TBasicUtil.assertValueListEqual("Row 0", [d("5.1"), d("3.5"), d("1.4"), d("0.2"), typeManager.lookupTag("setosa 3", "setosa").getRight("Tag not found").makeTag(null)], getRowVals(rs, 0));

        TBasicUtil.assertValueListEqual("Row 149", [d("5.9"), d("3.0"), d("5.1"), d("1.8"), typeManager.lookupTag("setosa 3", "virginica").getRight("Tag not found").makeTag(null)], getRowVals(rs, 149));
    });

    test("testImportRData2", () =>
    {
        const loaded = RRead.readRData(resource("mtcars.rds"));
        console.log(RPrettyPrint.prettyPrint(loaded));
        const typeManager = new TypeManager(new UnitManager());
        const rs = ConvertFromR.convertRToTable(typeManager, loaded, false)[0]!.getSecond();

        assertEquals(["mpg", "cyl", "disp", "hp", "drat", "wt", "qsec", "vs", "am", "gear", "carb"].map(c => new ColumnId(c)), rs.getColumnIds());

        TBasicUtil.assertValueListEqual("Row 0", [d("21.0"), d("6"), d("160.0"), d("110"), d("3.90"), d("2.620"), d("16.46"), d("0"), d("1"), d("4"), d("4")], getRowVals(rs, 0));
    });

    // Java: @Ignore // Empty tag name issue
    test.skip("testImportRData3", () =>
    {
        const loaded = RRead.readRData(resource("aggr_results.Rdata"));
        console.log(RPrettyPrint.prettyPrint(loaded));
        const typeManager = new TypeManager(new UnitManager());
        ConvertFromR.convertRToTable(typeManager, loaded, false);
    });

    test("testImportRData4", () =>
    {
        const loaded = RRead.readRData(resource("date.rds"));
        console.log(RPrettyPrint.prettyPrint(loaded));
        const r = ConvertFromR.convertRToTypedValueList(new TypeManager(new UnitManager()), loaded);
        assertEquals(DataType.date(new DateTimeInfo(DateTimeType.YEARMONTHDAY)), r.getFirst());
        TBasicUtil.assertValueEqual("Date", LocalDate.of(1950, 2, 1), r.getSecond()[0]!);
    });

    test("testImportRData5", () =>
    {
        const loaded = RRead.readRData(resource("datetimezoned.rds"));
        console.log(RPrettyPrint.prettyPrint(loaded));
        const r = ConvertFromR.convertRToTypedValueList(new TypeManager(new UnitManager()), loaded);
        assertEquals(DataType.date(new DateTimeInfo(DateTimeType.DATETIMEZONED)), r.getFirst());
        const zdt: TemporalAccessor = ZonedDateTime.of(2005, 10, 21, 18, 47, 22, 0, ZoneId.of("America/New_York"));
        TBasicUtil.assertValueEqual("DateTimeZoned", zdt, r.getSecond()[0]!);
        assertEquals(zdt, r.getSecond()[0]!);
    });

    test("testImportRData6", () =>
    {
        const loaded = RRead.readRData(resource("na.rds"));
        console.log(RPrettyPrint.prettyPrint(loaded));
        const typeManager = new TypeManager(new UnitManager());
        const r = ConvertFromR.convertRToTable(typeManager, loaded, false)[0]!.getSecond();
        // df <- data.frame(c(TRUE, NA, FALSE), c(36, NA, -35.2), c(1, NA, 2), factor(c("A", NA, "B")), as.character(c("Hello", NA, "Bye")), c(ISOdate(2005,10,21,18,47,22,tz="America/New_York"), NA, NA), stringsAsFactors=FALSE)

        assertEquals(maybeType(typeManager, DataType.BOOLEAN), r.getColumns()[0]!.getType().getType());
        TBasicUtil.assertValueListEqual("Bool column", [new TaggedValue(1, true, typeManager.getMaybeType()), new TaggedValue(0, null, typeManager.getMaybeType()), new TaggedValue(1, false, typeManager.getMaybeType())], asList(r.getColumns()[0]!));

        assertEquals(maybeType(typeManager, DataType.NUMBER), r.getColumns()[1]!.getType().getType());
        TBasicUtil.assertValueListEqual("Double column", [new TaggedValue(1, d("36"), typeManager.getMaybeType()), new TaggedValue(0, null, typeManager.getMaybeType()), new TaggedValue(1, d("-35.2"), typeManager.getMaybeType())], asList(r.getColumns()[1]!));

        assertEquals(maybeType(typeManager, DataType.NUMBER), r.getColumns()[2]!.getType().getType());
        TBasicUtil.assertValueListEqual("Int column", [new TaggedValue(1, d("1"), typeManager.getMaybeType()), new TaggedValue(0, null, typeManager.getMaybeType()), new TaggedValue(1, d("2"), typeManager.getMaybeType())], asList(r.getColumns()[2]!));

        const taggedTypeDefinition = typeManager.lookupDefinition(new TypeId("A 2"))!;
        assertEquals(maybeType(typeManager, taggedTypeDefinition.instantiate([], typeManager)), r.getColumns()[3]!.getType().getType());
        TBasicUtil.assertValueListEqual("Factor column", [typeManager.maybePresent(new TaggedValue(0, null, taggedTypeDefinition)), typeManager.maybeMissing(), typeManager.maybePresent(new TaggedValue(1, null, taggedTypeDefinition))], asList(r.getColumns()[3]!));

        assertEquals(maybeType(typeManager, DataType.date(new DateTimeInfo(DateTimeType.DATETIME))), r.getColumns()[5]!.getType().getType());
        TBasicUtil.assertValueListEqual("Date column", [typeManager.maybePresent(LocalDateTime.of(2005, 10, 21, 22, 47, 22, 0)), typeManager.maybeMissing(), typeManager.maybeMissing()], asList(r.getColumns()[5]!));
    });

    test("testImportRData7", () =>
    {
        const loaded = RRead.readRData(resource("df-df2.Rdata"));
        console.log(RPrettyPrint.prettyPrint(loaded));
        const typeManager = new TypeManager(new UnitManager());
        const rs = ConvertFromR.convertRToTable(typeManager, loaded, true);
        assertEquals(new Set(["df", "df2", "datetimeZoned2"]), new Set(rs.map(p => p.getFirst())));
    });

    test("testImportRData8", () =>
    {
        const loaded = RRead.readRData(resource("simple345.rds"));
        console.log(RPrettyPrint.prettyPrint(loaded));
        const typeManager = new TypeManager(new UnitManager());
        const rs = ConvertFromR.convertRToTable(typeManager, loaded, false)[0]!.getSecond();

        assertEquals([new ColumnId("bar")], rs.getColumnIds());

    });

    test("testImportRData9", () =>
    {
        const loaded = RRead.readRData(resource("tibble.rds"));
        console.log(RPrettyPrint.prettyPrint(loaded));
        const typeManager = new TypeManager(new UnitManager());
        const rs = ConvertFromR.convertRToTable(typeManager, loaded, false)[0]!.getSecond();

        assertEquals([new ColumnId("x"), new ColumnId("nested lists")], rs.getColumnIds());

        // t <- tibble(x = 1:3, "nested lists" = list(1:5, 1:10, 20:5))
        TBasicUtil.assertValueListEqual("Row 0", [d("1"), ints(1, 2, 3, 4, 5)], getRowVals(rs, 0));
        TBasicUtil.assertValueListEqual("Row 2", [d("3"), ints(20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5)], getRowVals(rs, 2));
    });

    function ints(...values: number[]): Value
    {
        return DataTypeUtility.valueImmediate(values.map(i => d("" + i)));
    }

    function asList(column: Column): Value[]
    {
        const r: Value[] = [];
        for (let i = 0; i < column.getLength(); i++)
        {
            r.push(column.getType().getCollapsed(i));
        }
        return r;
    }

    function maybeType(typeManager: TypeManager, dataType: DataType): DataType
    {
        return typeManager.getMaybeType().instantiate([Either.right<Unit, DataType>(dataType)], typeManager);
    }

    // Java: is R available (Runtime.exec throws an IOException if not)?
    const rAvailable = spawnSync("R", ["--version"]).error === undefined;

    propertyTest("testRoundTrip", [new GenRCompatibleRecordSet()], (original: GenRCompatibleRecordSet.RCompatibleRecordSet) =>
    {
        // Need to get rid of any numbers which won't survive round trip:
        for (const column of original.recordSet.getColumns())
        {
            column.getType().applyGet(new EnsureRoundTrip(column.getLength()));
        }

        // We can only test us->R->us, because to test R->us->R we'd still need to convert at start and end (i.e. us->R->us->R->us which is the same).
        for (const tableType of original.supportedTableTypes)
        {
            for (let kind = 0; kind < 3; kind++)
            {
                if (kind === 2 && !rAvailable)
                    continue; // See PORT-DEFERRED at the top
                const tableAsR = ConvertToR.convertTableToR(original.recordSet, tableType);
                let roundTripped: RValue;
                switch (kind)
                {
                    case 0:
                        roundTripped = tableAsR;
                        break;
                    case 1:
                    case 2:
                    {
                        const dir = mkdtempSync(join(tmpdir(), "columnaltest"));
                        const f = join(dir, "test.rds");
                        writeFileSync(f, RWrite.writeRData(tableAsR));
                        if (kind === 2)
                        {
                            const lenBefore = statSync(f).size;
                            // PORT-NOTE: as in Java, the expression is passed in single quotes (as if to
                            // a shell, but there is none), so R just evaluates a string literal and the
                            // file is not rewritten.
                            const command = ["-e", "'saveRDS(readRDS(\"" + javaReplace(f, "\\", "\\\\") + "\"),\"" + javaReplace(f, "\\", "\\\\") + "\");'"];
                            const process = spawnSync("R", command, { encoding: "utf8" });
                            assertEquals("stdout: " + process.stdout + "stderr: " + process.stderr, 0, process.status);
                            const lenAfter = statSync(f).size;
                            console.log("Length before R: " + lenBefore + " after: " + lenAfter);
                        }
                        roundTripped = RRead.readRData(new JavaFile(f, readFileSync(f)));
                        rmSync(dir, { recursive: true });
                        break;
                    }
                    default:
                        fail("Missing case");
                }
                const typeManager = original.typeManager;
                console.log(RPrettyPrint.prettyPrint(roundTripped));
                const reloaded = ConvertFromR.convertRToTable(typeManager, roundTripped, false)[0]!.getSecond();
                assertEquals(original.recordSet.getColumnIds(), reloaded.getColumnIds());
                assertEquals(original.recordSet.getLength(), reloaded.getLength());
                for (const column of original.recordSet.getColumns())
                {
                    const reloadedColumn = reloaded.getColumn(column.getName());

                    // Can't do this because it may need coercing:
                    //assertEquals(getTypeName(column.getType().getType()), getTypeName(reloadedColumn.getType().getType()));

                    for (let i = 0; i < original.recordSet.getLength(); i++)
                    {
                        const reloadedVal = reloadedColumn.getType().getCollapsed(i);
                        // Not all date types survive, so need to coerce:
                        const reloadedValCoerced = column.getType().getType().apply(new CoerceValueToThisType(reloadedVal, typeManager));
                        TBasicUtil.assertValueEqual("Row " + i + " column " + column.getName().toString(), column.getType().getCollapsed(i), reloadedValCoerced);
                    }
                }
            }
        }
    }, { trials: 100, timeout: 300_000 });

    function d(s: string): Decimal
    {
        return parseBigDecimal(s, true);
    }

    // Java: a public static method
    function getRowVals(recordSet: RecordSet, targetRow: number): Value[]
    {
        return recordSet.getColumns().map(c => c.getType().getCollapsed(targetRow));
    }
});

class EnsureRoundTrip implements DataTypeVisitorGet<null>
{
    public constructor(private readonly length: number)
    {
    }

    public number(g: GetValue<Decimal>, _displayInfo: NumberInfo): null
    {
        for (let i = 0; i < this.length; i++)
        {
            const orig = g.get(i);
            const dbl = doubleValue(orig);
            const bd = decimalFromDouble(dbl);
            if (Utility.compareNumbers(orig, bd) !== 0)
            {
                g.set(i, Either.right<string, Decimal>(bd));
            }
        }
        return null;
    }

    public text(g: GetValue<string>): null
    {
        // Make sure it can round trip:
        for (let i = 0; i < this.length; i++)
        {
            g.set(i, Either.right<string, string>(new TextDecoder().decode(javaUtf8Bytes(g.get(i)))));
        }
        return null;
    }

    public bool(_g: GetValue<boolean>): null
    {
        return null;
    }

    public date(dateTimeInfo: DateTimeInfo, g: GetValue<TemporalAccessor>): null
    {
        // R's double doesn't have enough precision for nanos, so we must only keep what can round trip through a double-valued instant:
        switch (dateTimeInfo.getType())
        {
            case DateTimeType.TIMEOFDAY:
                for (let i = 0; i < this.length; i++)
                {
                    const orig = g.get(i);
                    const secs = (orig as LocalTime).toNanoOfDay() / 1_000_000_000.0;
                    const value = DataTypeUtility.value(dateTimeInfo, LocalTime.ofNanoOfDay(Math.trunc(Math.round(secs) * 1_000_000_000.0)))!;
                    g.set(i, Either.right(value));
                }
                break;
            case DateTimeType.DATETIMEZONED:
            case DateTimeType.DATETIME:
                for (let i = 0; i < this.length; i++)
                {
                    const orig = g.get(i);
                    const origInstant = EnsureRoundTrip.makeInstant(orig);
                    let seconds = origInstant.epochSecond() + origInstant.nano() / 1_000_000_000.0;
                    seconds = Math.round(seconds / (60.0 * 60.0 * 24.0)) * (60.0 * 60.0 * 24.0);
                    // From https://stackoverflow.com/a/38544355/412908
                    const secondsRoundTowardsZero = Math.sign(seconds) * Math.floor(Math.abs(seconds));
                    const instantFromDouble = Instant.ofEpochSecond(Math.trunc(secondsRoundTowardsZero), Math.trunc(1_000_000_000.0 * (seconds - secondsRoundTowardsZero)));
                    const value = DataTypeUtility.value(dateTimeInfo, dateTimeInfo.getType() === DateTimeType.DATETIMEZONED ? ZonedDateTime.ofInstant(instantFromDouble, (orig as ZonedDateTime).zone()) : LocalDateTime.ofInstant(instantFromDouble, ZoneId.of("UTC")));
                    if (value === null)
                        throw new InternalException("Date cannot convert: " + String(orig));
                    g.set(i, Either.right<string, TemporalAccessor>(value));
                }
                break;
        }

        if (dateTimeInfo.getType() === DateTimeType.DATETIMEZONED && this.length > 1)
        {
            // R can only have one zone for the whole column,
            // so to round trip we must do same:
            const zoneId = (g.get(0) as ZonedDateTime).zone();
            for (let i = 1; i < this.length; i++)
            {
                g.set(i, Either.right<string, TemporalAccessor>(DataTypeUtility.valueZonedDateTime((g.get(i) as ZonedDateTime).withZoneSameInstant(zoneId))));
            }
        }
        return null;
    }

    private static makeInstant(orig: TemporalAccessor): Instant
    {
        if (orig instanceof ZonedDateTime)
            return Instant.from(orig);
        else if (orig instanceof LocalDateTime)
            return Instant.from(orig.atOffset(ZoneOffset.UTC));
        else
            throw new InternalException("Cannot make instant from " + String(orig));
    }

    public tagged(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], _tagTypes: readonly TagType<DataType>[], g: GetValue<TaggedValue>): null
    {
        if (typeName.getRaw() === "Optional")
        {
            const inners: Pair<number, Value>[] = [];
            for (let i = 0; i < this.length; i++)
            {
                const taggedValue = g.get(i);
                if (taggedValue.getInner() !== null)
                    inners.push(new Pair(i, taggedValue.getInner()!));
            }

            const typeManager = new TypeManager(new UnitManager());
            return typeVars[0]!.getRight("Err").fromCollapsed(new class extends GetValue<Value>
            {
                public override getWithProgress(i: number, _prog: ProgressListener | null): Value
                {
                    return inners[i]!.getSecond();
                }

                public override set(index: number, value: Either<string, Value>): void
                {
                    g.set(inners[index]!.getFirst(), Either.right(typeManager.maybePresent(value.getRight("Err"))));
                }
            }()).applyGet(new EnsureRoundTrip(inners.length));
        }
        return null;
    }

    public record(types: ReadonlyMap<ExpressionIdentifier, DataType>, g: GetValue<Record>): null
    {
        for (const [fieldKey, fieldValue] of types.entries())
        {
            fieldValue.fromCollapsed(new class extends GetValue<Value>
            {
                public override getWithProgress(i: number, _prog: ProgressListener | null): Value
                {
                    return g.get(i).getField(fieldKey);
                }

                public override set(i: number, value: Either<string, Value>): void
                {
                    g.set(i, Either.right<string, Record>(new RecordMap(Utility.appendToMap(g.get(i).getFullContent(), fieldKey, value.getRight("Setting error"), null))));
                }
            }()).applyGet(new EnsureRoundTrip(this.length));
        }
        return null;
    }

    public array(inner: DataType, g: GetValue<ListEx>): null
    {
        for (let i = 0; i < this.length; i++)
        {
            const listEx = g.get(i);
            const anyModified = [false];
            const modified: Value[] = [];
            for (let j = 0; j < listEx.size(); j++)
            {
                modified.push(listEx.get(j));
            }
            inner.fromCollapsed(new class extends GetValue<Value>
            {
                public override getWithProgress(listIndex: number, _prog: ProgressListener | null): Value
                {
                    return modified[listIndex]!;
                }

                public override set(index: number, value: Either<string, Value>): void
                {
                    modified[index] = value.getRight("No errs");
                    anyModified[0] = true;
                }
            }()).applyGet(new EnsureRoundTrip(listEx.size()));
            // Single item lists don't survive the trip, so double up:
            if (modified.length === 1)
            {
                modified.push(modified[0]!);
                anyModified[0] = true;
            }

            if (anyModified[0])
                g.set(i, Either.right<string, ListEx>(DataTypeUtility.value(modified)));


        }


        return null;
    }
}

class CoerceValueToThisType extends FlatDataTypeVisitor<Value>
{
    private readonly reloadedVal: Value;
    private readonly typeManager: TypeManager;

    public constructor(reloadedVal: Value, typeManager: TypeManager)
    {
        super(reloadedVal);
        this.reloadedVal = reloadedVal;
        this.typeManager = typeManager;
    }

    public override date(dateTimeInfo: DateTimeInfo): Value
    {
        if (dateTimeInfo.getType() === DateTimeType.TIMEOFDAY && !(this.reloadedVal instanceof LocalTime))
        {
            const bd = Utility.toBigDecimal(this.reloadedVal as Decimal);
            return DataTypeUtility.value(dateTimeInfo, LocalTime.ofNanoOfDay(Number(bd.times(parseBigDecimal("1000000000", true)).trunc().toFixed())))!;
        }
        return DataTypeUtility.value(dateTimeInfo, this.reloadedVal as TemporalAccessor)!;
    }

    public override tagged(typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): Value
    {
        if (typeName.getRaw() === "Optional" && !(this.reloadedVal instanceof TaggedValue))
            return this.typeManager.maybePresent(tags[1]!.getInner()!.apply(this));
        else
        {
            const taggedValue = this.reloadedVal as TaggedValue;
            if (typeName.getRaw() === "Optional" && taggedValue.getTagIndex() === 1)
                return this.typeManager.maybePresent(tags[1]!.getInner()!.apply(new CoerceValueToThisType(taggedValue.getInner()!, this.typeManager)));
            else
                return taggedValue;
        }
    }

    public override record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): Value
    {
        const mappedValues = new Map<ExpressionIdentifier, Value>();
        for (const [fieldKey, fieldValue] of Utility.cast(this.reloadedVal, Record).getFullContent().entries())
        {
            const fieldType = fields.get(fieldKey)!;
            mappedValues.set(fieldKey, fieldType.apply(new CoerceValueToThisType(fieldValue, this.typeManager)));
        }
        return new RecordMap(mappedValues);
    }

    public override array(inner: DataType): Value
    {
        try
        {
            let list: ListEx;
            if (this.reloadedVal instanceof ListEx)
                list = Utility.cast(this.reloadedVal, ListEx);
            else
                list = DataTypeUtility.value([this.reloadedVal]);
            const length = list.size();
            const coercedList: Value[] = [];
            for (let i = 0; i < length; i++)
            {
                coercedList.push(inner.apply(new CoerceValueToThisType(list.get(i), this.typeManager)));
            }
            return DataTypeUtility.value(coercedList);
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            // Fine because it's test code:
            throw new InternalException("UserEx", e);
        }
    }
}
