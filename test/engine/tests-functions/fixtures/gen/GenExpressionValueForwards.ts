// Port of test.gen.GenExpressionValueForwards (tests-functions testFixtures).
import type { ExpressionIdentifier } from "../../../../../src/engine/anns/Annotations.js";
import type { Column } from "../../../../../src/engine/data/data/Column.js";
import { ColumnUtility } from "../../../../../src/engine/data/data/ColumnUtility.js";
import { KnownLengthRecordSet } from "../../../../../src/engine/data/data/KnownLengthRecordSet.js";
import { MemoryBooleanColumn } from "../../../../../src/engine/data/data/MemoryBooleanColumn.js";
import type { RecordSet } from "../../../../../src/engine/data/data/RecordSet.js";
import { AddSubtractExpression, AndExpression, ArrayExpression, BooleanLiteral, CallExpression, ComparisonExpression, DivideExpression, EqualExpression, FieldAccessExpression, IdentExpression, IfThenElseExpression, NotEqualExpression, NumericLiteral, OrExpression, RecordExpression, StringConcatExpression, StringLiteral, TemporalLiteral, TimesExpression, TypeLiteralExpression, type Expression } from "../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { TypePrimitiveLiteral } from "../../../../../src/engine/expressions/transformations/expression/type/TypeExpressions.js";
import { FunctionList } from "../../../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../../../src/engine/identifiers/id/TableId.js";
import { Decimal, parseBigDecimal, ZERO } from "../../../../../src/engine/java/JavaBigDecimal.js";
import { javaShuffle } from "../../../../../src/engine/java/JavaCollections.js";
import { JavaRandom } from "../../../../../src/engine/java/JavaRandom.js";
import { LocalDate, LocalDateTime, LocalTime, YearMonth, ZonedDateTime, type TemporalAccessor as JsJodaTemporalAccessor } from "../../../../../src/engine/java/time/JavaTime.js";
import type { TemporalAccessor } from "../../../../../src/engine/java/time/TemporalAccessor.js";
import { TreeSet } from "../../../../../src/engine/java/TreeMap.js";
import { DataType, FlatDataTypeVisitor, type DataTypeVisitor, type TagType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { DateTimeInfo } from "../../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { NumberInfo } from "../../../../../src/engine/types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../../../../src/engine/types/data/datatype/TypeId.js";
import { TypeManager } from "../../../../../src/engine/types/data/datatype/TypeManager.js";
import { Unit } from "../../../../../src/engine/types/data/unit/Unit.js";
import { JellyType } from "../../../../../src/engine/types/jellytype/JellyTypes.js";
import { Either } from "../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../../src/engine/utility-error/error/InternalException.js";
import { IdentifierUtility } from "../../../../../src/engine/utility/utility/IdentifierUtility.js";
import { TaggedValue } from "../../../../../src/engine/utility/utility/TaggedValue.js";
import { ListExList, RecordMap, Utility } from "../../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../../src/engine/utility/utility/Value.js";
import { TBasicUtil } from "../../../tests-basic/fixtures/data/TBasicUtil.js";
import { GenNumberAsString } from "../../../tests-basic/fixtures/gen/GenNumberAsString.js";
import { TFunctionUtil } from "../functions/TFunctionUtil.js";
import { ExpressionValue } from "./ExpressionValue.js";
import { GenExpressionValueBase } from "./GenExpressionValueBase.js";

const DateTimeType = DateTimeInfo.DateTimeType;
const ComparisonOperator = ComparisonExpression.ComparisonOperator;
type ComparisonOperator = ComparisonExpression.ComparisonOperator;
type ValuesAndExpression = Pair<Value[], Expression>;

// The java.time values are Columnal values:
const tv = (t: JsJodaTemporalAccessor): TemporalAccessor => t as unknown as TemporalAccessor;
const n = (i: number): Decimal => new Decimal(i);

/**
 * Generates expressions and resulting values by working the value forwards.
 * At each step, we generate an expression and then work out what its
 * value will be.  This allows us to test numeric expressions because
 * we can track its exact expected value, accounting for lost precision.
 * Types still go backwards.  i.e. we first decide we want say a year-month.
 * Then we decide to make one using the year-month function from two integers.
 * Then we generate the integers, say two literals, then feed those values back
 * down the tree to see what year-month value we end up with.
 * In contrast, going backwards we would start with the year-month value we want,
 * then generate the integer values to match.
 */
export class GenExpressionValueForwards extends GenExpressionValueBase
{
    private readonly tableId = new TableId("Gen Forwards Table");
    // Easier than passing parameters around:
    private columns!: ((rs: RecordSet) => Column)[];
    // The length of the column we are generating:
    private targetSize!: number;

    protected override generateValue(): ExpressionValue
    {
        this.columns = [];
        this.targetSize = this.r.nextInt(1, 100);
        const type = this.makeType(this.r);
        const p = this.makeOfType(type);
        return new ExpressionValue(type, p.getFirst(), this.dummyManager.getTypeManager(), this.tableId, this.getRecordSet(), p.getSecond(), this);
    }

    public getRecordSet(): KnownLengthRecordSet
    {
        let columns: readonly ((rs: RecordSet) => Column)[] = this.columns;
        if (columns.length === 0)
            columns = [rs => new MemoryBooleanColumn(rs, new ColumnId("Column to avoid being empty"), Utility.replicate(this.targetSize, Either.right<string, boolean>(true)), true)];
        return new KnownLengthRecordSet(columns, this.targetSize);
    }

    // Only valid after calling generate
    public makeOfType(type: DataType): ValuesAndExpression
    {
        return this.make(type, 4);
    }

    private make(type: DataType, maxLevels: number): ValuesAndExpression
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the visitor's outer instance (GenExpressionValueForwards.this)
        const g = this;
        const r = this.r;
        return type.apply<ValuesAndExpression>(new class implements DataTypeVisitor<ValuesAndExpression>
        {
            public number(displayInfo: NumberInfo): ValuesAndExpression
            {
                return g.termDeep(maxLevels, type, g.l(
                    g.columnRef(type),
                    () =>
                    {
                        const number = TBasicUtil.generateNumberV(r, g.gs);
                        return g.literal(number, new NumericLiteral(number, g.makeUnitExpression(displayInfo.getUnit())));
                    }
                ), g.l(g.fix(maxLevels - 1, type), () => {
                    const numArgs = r.nextInt(2, 6);
                    const expressions: Expression[] = [];
                    const addSubtractOps: AddSubtractExpression.AddSubtractOp[] = [];
                    const curTotals: Decimal[] = g.replicate(DataTypeUtility.value(ZERO));
                    for (let i = 0; i < numArgs; i++)
                    {
                        const pair = g.make(type, maxLevels - 1);
                        expressions.push(pair.getSecond());
                        // First one we count as add, because we're adding to the zero running total:
                        const opIsAdd = i === 0 || r.nextBoolean();
                        g.eachI(curTotals, (row, curTotal) => Utility.addSubtractNumbers(curTotal, Utility.cast(pair.getFirst()[row]!, Decimal), opIsAdd));
                        if (i > 0)
                            addSubtractOps.push(opIsAdd ? AddSubtractExpression.AddSubtractOp.ADD : AddSubtractExpression.AddSubtractOp.SUBTRACT);
                    }
                    return g.num(curTotals, new AddSubtractExpression(expressions, addSubtractOps));
                }, () => {
                    // Either just use target unit, or make up crazy one
                    const numUnit = r.nextBoolean() ? displayInfo.getUnit() : g.makeUnit();
                    const denomUnit = g.calculateRequiredMultiplyUnit(numUnit, displayInfo.getUnit()).reciprocal();
                    const numerator = g.make(DataType.number(new NumberInfo(numUnit)), maxLevels - 1);
                    const denominator = g.make(DataType.number(new NumberInfo(denomUnit)), maxLevels - 1);
                    // We avoid divide by zeros and return -7 in that case (arbitrary pick unlikely to come up by accident/bug):
                    return g.map2(numerator, denominator, (top, bottom) => Utility.compareValues(bottom, DataTypeUtility.value(ZERO)) === 0 ? DataTypeUtility.value(n(-7)) : Utility.divideNumbers(top as Decimal, bottom as Decimal), (topE, bottomE) => IfThenElseExpression.unrecorded(new EqualExpression([bottomE, new NumericLiteral(ZERO, g.makeUnitExpression(denomUnit))], false), new NumericLiteral(n(-7), g.makeUnitExpression(displayInfo.getUnit())), new DivideExpression(topE, bottomE)));
                }, /* TODO put RaiseExpression back again (see the Java) */
                () => {
                    const runningTotals: Decimal[] = g.replicate(DataTypeUtility.value(n(1)));
                    let runningUnit = Unit.SCALAR;
                    const numArgs = r.nextInt(2, 6);
                    const expressions: Expression[] = [];
                    for (let i = 0; i < numArgs; i++)
                    {
                        const unit = i === numArgs - 1 ? g.calculateRequiredMultiplyUnit(runningUnit, displayInfo.getUnit()) : g.makeUnit();
                        runningUnit = runningUnit.times(unit);
                        const pair = g.make(DataType.number(new NumberInfo(unit)), maxLevels - 1);
                        g.eachI(runningTotals, (row, runningTotal) => Utility.multiplyNumbers(runningTotal, Utility.cast(pair.getFirst()[row]!, Decimal)));
                        expressions.push(pair.getSecond());
                    }
                    return g.num(runningTotals, new TimesExpression(expressions));
                }));
            }

            public text(): ValuesAndExpression
            {
                return g.termDeep(maxLevels, type, g.l(
                    g.columnRef(type),
                    () =>
                    {
                        const value = TBasicUtil.makeStringV(r, g.gs);
                        return g.literal(value, TFunctionUtil.makeStringLiteral(value, r));
                    }
                ), g.l(g.fix(maxLevels - 1, type), () => {
                    const numOperands = r.nextInt(2, 5);
                    const operands: Expression[] = [];
                    const results: Value[] = g.replicate<Value>(DataTypeUtility.value(""));
                    for (let i = 0; i < numOperands; i++)
                    {
                        const item = g.make(DataType.TEXT, maxLevels - 1);
                        operands.push(item.getSecond());
                        for (let row = 0; row < g.targetSize; row++)
                        {
                            results[row] = (results[row] as string) + (item.getFirst()[row] as string);
                        }
                    }
                    return new Pair(results, new StringConcatExpression(operands));
                }));
            }

            public date(dateTimeInfo: DateTimeInfo): ValuesAndExpression
            {
                const deep: GenExpressionValueForwards.ExpressionMaker[] = [];
                // We don't use the from-integer versions here with deeper expressions because we can't
                // guarantee the values are in range, so we'd likely get an error.
                // Instead we use the narrowing versions or the ones that compose valid values:
                switch (dateTimeInfo.getType())
                {
                    case DateTimeType.YEARMONTHDAY:
                        deep.push(() => {
                            const convertAndType = r.choose([
                                new Pair("date from datetime", DateTimeType.DATETIME),
                                new Pair("date from datetimezoned", DateTimeType.DATETIMEZONED)]);
                            const dateTimes = g.make(DataType.date(new DateTimeInfo(convertAndType.getSecond())), maxLevels - 1);
                            return g.map(dateTimes, v => tv(LocalDate.from(v as TemporalAccessor)), e => g.call(convertAndType.getFirst(), e));
                        });
                        break;
                    case DateTimeType.YEARMONTH:
                        deep.push(() => {
                            const convertAndType = r.choose([
                                new Pair("dateym from date", DateTimeType.YEARMONTHDAY)]);
                            const dateTimes = g.make(DataType.date(new DateTimeInfo(convertAndType.getSecond())), maxLevels - 1);
                            return g.map(dateTimes, v => tv(YearMonth.from(v as TemporalAccessor)), e => g.call(convertAndType.getFirst(), e));
                        });
                        break;
                    case DateTimeType.TIMEOFDAY:
                        deep.push(() => {
                            const convertAndType = r.choose([
                                //new Pair<>("time.from.timezoned", DateTimeType.TIMEOFDAYZONED),
                                new Pair("time from datetime", DateTimeType.DATETIME),
                                new Pair("time from datetimezoned", DateTimeType.DATETIMEZONED)]);
                            const dateTimes = g.make(DataType.date(new DateTimeInfo(convertAndType.getSecond())), maxLevels - 1);
                            return g.map(dateTimes, v => tv(LocalTime.from(v as TemporalAccessor)), e => g.call(convertAndType.getFirst(), e));
                        });
                        break;
                    case DateTimeType.DATETIME:
                        // down cast:
                        deep.push(() => {
                            const dateTimes = g.make(DataType.date(new DateTimeInfo(r.choose([DateTimeType.DATETIMEZONED]))), maxLevels - 1);
                            return g.map(dateTimes, v => tv(LocalDateTime.from(v as TemporalAccessor)), e => g.call("datetime from datetimezoned", e));
                        });
                        // date + time:
                        deep.push(() => {
                            const dates = g.make(DataType.date(new DateTimeInfo(r.choose([DateTimeType.YEARMONTHDAY]))), maxLevels - 1);
                            const times = g.make(DataType.date(new DateTimeInfo(r.choose([DateTimeType.TIMEOFDAY]))), maxLevels - 1);
                            return g.map2(dates, times, (date, time) => tv(LocalDateTime.of(date as unknown as LocalDate, time as unknown as LocalTime)), (dateE, timeE) => g.call("datetime from dt", dateE, timeE));
                        });
                        break;
                    case DateTimeType.DATETIMEZONED:
                        // date+time+zone:
                        deep.push(() => {
                            const dates = g.make(DataType.date(new DateTimeInfo(r.choose([DateTimeType.YEARMONTHDAY]))), maxLevels - 1);
                            const times = g.make(DataType.date(new DateTimeInfo(r.choose([DateTimeType.TIMEOFDAY]))), maxLevels - 1);
                            const zone = TBasicUtil.generateZoneOffset(r, g.gs);
                            return g.map2(dates, times, (date, time) => tv(ZonedDateTime.of(date as unknown as LocalDate, time as unknown as LocalTime, zone)), (dateE, timeE) => g.call("datetimezoned from dtz", dateE, timeE, TFunctionUtil.makeStringLiteral(zone.toString(), r)));
                        });
                        break;
                }
                const shallow: GenExpressionValueForwards.ExpressionMaker[] = [];
                shallow.push(() =>
                {
                    const value = g.makeTemporalValue(dateTimeInfo);
                    return g.literal(value, g.call("from text to", new TypeLiteralExpression(new TypePrimitiveLiteral(DataType.date(dateTimeInfo))), new StringLiteral(value.toString())));
                });
                shallow.push(() =>
                {
                    const value = g.makeTemporalValue(dateTimeInfo);
                    return g.literal(value, new TemporalLiteral(dateTimeInfo.getType(), value.toString()));
                });

                switch (dateTimeInfo.getType())
                {
                    case DateTimeType.YEARMONTHDAY:
                        shallow.push(() => {
                            const year = r.nextInt(1, 9999);
                            const month = r.nextInt(1, 12);
                            const day = r.nextInt(1, 28);
                            return g.literal(tv(LocalDate.of(year, month, day)), g.call("date from ymd",
                                new NumericLiteral(n(year), g.makeUnitExpression(g.getUnit("year"))),
                                new NumericLiteral(n(month), g.makeUnitExpression(g.getUnit("month"))),
                                new NumericLiteral(n(day), g.makeUnitExpression(g.getUnit("day")))
                            ));
                        });
                        break;
                    case DateTimeType.YEARMONTH:
                        shallow.push(() => {
                            const year = r.nextInt(1, 9999);
                            const month = r.nextInt(1, 12);
                            return g.literal(tv(YearMonth.of(year, month)), g.call("dateym from ym",
                                new NumericLiteral(n(year), g.makeUnitExpression(g.getUnit("year"))),
                                new NumericLiteral(n(month), g.makeUnitExpression(g.getUnit("month")))
                            ));
                        });
                        break;
                    case DateTimeType.TIMEOFDAY:
                        shallow.push(() => {
                            const hour = r.nextInt(0, 23);
                            const minute = r.nextInt(0, 59);
                            const second = r.nextInt(0, 59);
                            const nano = r.nextInt(0, 999999999);
                            return g.literal(tv(LocalTime.of(hour, minute, second, nano)), g.call("time from hms",
                                new NumericLiteral(n(hour), g.makeUnitExpression(g.getUnit("hour"))),
                                new NumericLiteral(n(minute), g.makeUnitExpression(g.getUnit("minute"))),
                                new NumericLiteral(n(nano).div(n(1_000_000_000)).plus(n(second)), g.makeUnitExpression(g.getUnit("s")))
                            ));
                        });
                }
                shallow.push(g.columnRef(type));

                return g.termDeep(maxLevels, type, shallow, deep);
            }

            public bool(): ValuesAndExpression
            {
                return g.termDeep(maxLevels, type, g.l(g.columnRef(type), () =>
                {
                    const value = r.nextBoolean();
                    return g.literal(DataTypeUtility.value(value), new BooleanLiteral(value));
                }), g.l(g.fix(maxLevels - 1, type),
                    () => {
                        const t = g.makeType(r);
                        const size = r.nextInt(2, 5);
                        const items: ValuesAndExpression[] = [];
                        const result: boolean[] = g.replicate(true);
                        for (let i = 0; i < size; i++)
                        {
                            const item = g.make(t, maxLevels - 1);
                            items.push(item);
                            // Java's non-short-circuit &:
                            g.eachI(result, (j, v) => { const eq = Utility.compareValues(items[0]!.getFirst()[j]!, item.getFirst()[j]!) === 0; return v && eq; });
                        }
                        return new Pair(Utility.mapList(result, b => DataTypeUtility.value(b) as Value), new EqualExpression(Utility.mapList(items, p => p.getSecond()), false));
                    },
                    () => {
                        const t = g.makeType(r);

                        const lhs = g.make(t, maxLevels - 1);
                        const rhs = g.make(t, maxLevels - 1);
                        return g.map2(lhs, rhs, (l, rv) => DataTypeUtility.value(Utility.compareValues(l, rv) !== 0), (a, b) => new NotEqualExpression(a, b));
                    },
                    () =>
                    {
                        const t = g.makeType(r);

                        const args = TBasicUtil.makeList(r, 2, 4, () => g.make(t, maxLevels - 1));
                        const lt = r.nextBoolean();
                        const ops: ComparisonOperator[] = [];
                        const result: boolean[] = g.replicate(true);
                        for (let argIndex = 0; argIndex < args.length - 1; argIndex++)
                        {
                            ops.push(r.nextBoolean() ?
                                (lt ? ComparisonOperator.LESS_THAN : ComparisonOperator.GREATER_THAN)
                                : (lt ? ComparisonOperator.LESS_THAN_OR_EQUAL_TO : ComparisonOperator.GREATER_THAN_OR_EQUAL_TO)
                            );
                            const lhs = args[argIndex]!.getFirst();
                            const rhs = args[argIndex + 1]!.getFirst();
                            const op = ops[ops.length - 1]!;
                            // Java's non-short-circuit &:
                            if (op === ComparisonOperator.LESS_THAN)
                                g.eachI(result, (i, v) => { const c = Utility.compareValues(lhs[i]!, rhs[i]!) < 0; return v && c; });
                            else if (op === ComparisonOperator.LESS_THAN_OR_EQUAL_TO)
                                g.eachI(result, (i, v) => { const c = Utility.compareValues(lhs[i]!, rhs[i]!) <= 0; return v && c; });
                            else if (op === ComparisonOperator.GREATER_THAN)
                                g.eachI(result, (i, v) => { const c = Utility.compareValues(lhs[i]!, rhs[i]!) > 0; return v && c; });
                            else if (op === ComparisonOperator.GREATER_THAN_OR_EQUAL_TO)
                                g.eachI(result, (i, v) => { const c = Utility.compareValues(lhs[i]!, rhs[i]!) >= 0; return v && c; });
                        }
                        return new Pair(Utility.mapList(result, b => DataTypeUtility.value(b) as Value), new ComparisonExpression(Utility.mapList(args, p => p.getSecond()), ops));
                    },
                    () => {
                        const size = r.nextInt(2, 5);
                        const and = r.nextBoolean();
                        const values: boolean[] = g.replicate(and ? true : false);
                        const exps: Expression[] = [];
                        for (let i = 0; i < size; i++)
                        {
                            const pair = g.make(DataType.BOOLEAN, maxLevels - 1);
                            if (and)
                                g.eachI(values, (vi, v) => v && (pair.getFirst()[vi] as boolean));
                            else
                                g.eachI(values, (vi, v) => v || (pair.getFirst()[vi] as boolean));
                            exps.push(pair.getSecond());
                        }
                        return new Pair(Utility.mapList(values, b => DataTypeUtility.value(b) as Value), and ? new AndExpression(exps) : new OrExpression(exps));
                    }
                ));
            }

            public tagged(typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): ValuesAndExpression
            {
                const terminals: GenExpressionValueForwards.ExpressionMaker[] = [];
                const nonTerm: GenExpressionValueForwards.ExpressionMaker[] = [];
                terminals.push(g.columnRef(type));
                nonTerm.push(g.fix(maxLevels - 1, type));
                const tagIndex = r.nextInt(0, tags.length - 1);
                const tag = tags[tagIndex]!;
                const typeDefinition = g.dummyManager.getTypeManager().lookupDefinition(typeName);
                if (typeDefinition === null)
                    throw new InternalException("Looked up type but null definition: " + typeName.toString());
                const tagInfo = new TypeManager.TagInfo(typeDefinition, tagIndex);
                const inner = tag.getInner();
                if (inner === null)
                {
                    terminals.push(() => g.literal(new TaggedValue(tagIndex, null, DataTypeUtility.fromTags(tags)), TFunctionUtil.tagged(g.dummyManager.getUnitManager(), tagInfo, null, type, true)));
                }
                else
                {
                    const nonNullInner = inner;
                    nonTerm.push(() =>
                    {
                        const innerVal = g.make(nonNullInner, maxLevels - 1);
                        return g.map(innerVal, v => new TaggedValue(tagIndex, v, DataTypeUtility.fromTags(tags)), e => TFunctionUtil.tagged(g.dummyManager.getUnitManager(), tagInfo, e, type, true));
                    });
                }
                return g.termDeep(maxLevels, type, terminals, nonTerm);
            }

            public record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): ValuesAndExpression
            {
                if (fields.size < 1)
                    throw new InternalException("Invalid record type of size " + fields.size + " during generation");

                return g.termDeep(maxLevels, type, g.l(g.columnRef(type)), g.l(g.fix(maxLevels - 1, type), () =>
                {
                    const records: Map<ExpressionIdentifier, Value>[] = g.replicateM(() => new Map<ExpressionIdentifier, Value>());
                    const expressions: Pair<ExpressionIdentifier, Expression>[] = [];
                    for (const [key, value] of fields)
                    {
                        // We don't reduce max levels as it may make nested tuples
                        // not feature complex expressions, and the finiteness of the type
                        // prevents infinite expansion:
                        const item = g.make(value, maxLevels);
                        for (let row = 0; row < records.length; row++)
                            records[row]!.set(key, item.getFirst()[row]!);
                        expressions.push(new Pair(key, item.getSecond()));
                    }
                    javaShuffle(expressions, new JavaRandom(r.nextLong()));

                    return new Pair(Utility.mapList(records, rec => DataTypeUtility.value(new RecordMap(rec)) as Value), new RecordExpression(expressions));
                }));
            }

            public array(inner: DataType | null): ValuesAndExpression
            {
                if (inner === null)
                    return g.literal(DataTypeUtility.value([]), new ArrayExpression([]));
                const innerFinal = inner;
                return g.termDeep(maxLevels, type, g.l(g.columnRef(type)), g.l(g.fix(maxLevels - 1, type), () =>
                {
                    const length = r.nextInt(1, 12);
                    // Each outer list item is one row in the final set of expression values
                    // Each inner list is an entire array.
                    const values: Value[][] = g.replicateM(() => [] as Value[]);
                    const expressions: Expression[] = [];
                    for (let i = 0; i < length; i++)
                    {
                        const item = g.make(innerFinal, maxLevels - 1);
                        // This is the set of items for the i-th item in each array, so add accordingly:
                        for (let j = 0; j < item.getFirst().length /* aka targetSize */; j++)
                            values[j]!.push(item.getFirst()[j]!);
                        expressions.push(item.getSecond());
                    }
                    return new Pair(Utility.mapList(values, v => DataTypeUtility.value(v) as Value), new ArrayExpression(expressions));
                }));
            }
        }());
    }

    protected makeTemporalValue(dateTimeInfo: DateTimeInfo): TemporalAccessor
    {
        let value: TemporalAccessor;
        switch (dateTimeInfo.getType())
        {
            case DateTimeType.YEARMONTHDAY:
                value = tv(TBasicUtil.generateDate(this.r, this.gs));
                break;
            case DateTimeType.YEARMONTH:
                value = tv(YearMonth.from(TBasicUtil.generateDate(this.r, this.gs)));
                break;
            case DateTimeType.TIMEOFDAY:
                value = tv(TBasicUtil.generateTime(this.r, this.gs));
                break;
            case DateTimeType.DATETIME:
                value = tv(TBasicUtil.generateDateTime(this.r, this.gs));
                break;
            case DateTimeType.DATETIMEZONED:
                value = tv(TBasicUtil.generateDateTimeZoned(this.r, this.gs));
                break;
            default:
                throw new Error("No date generator for " + String(dateTimeInfo.getType()));
        }
        return value;
    }

    private num(values: readonly Decimal[], expression: Expression): ValuesAndExpression
    {
        return new Pair<Value[], Expression>(Utility.mapList(values, v => v as Value), expression);
    }

    // What unit do you have to multiply src by to get dest?
    private calculateRequiredMultiplyUnit(src: Unit, dest: Unit): Unit
    {
        // So we have src * x = dest
        // This can be rearranged to x = dest/src
        return dest.divideBy(src);
    }

    private getUnit(name: string): Unit
    {
        const m = this.dummyManager.getUnitManager();
        return m.loadUse(name);
    }

    private makeUnit(): Unit
    {
        const m = this.dummyManager.getUnitManager();
        return this.r.choose([
            m.loadUse("m"),
            m.loadUse("cm"),
            m.loadUse("inch"),
            m.loadUse("g"),
            m.loadUse("kg"),
            m.loadUse("deg"),
            m.loadUse("s"),
            m.loadUse("hour"),
            m.loadUse("USD"),
        ]);
    }

    // Unused in Java too
    protected genBD(): Decimal
    {
        return parseBigDecimal(new GenNumberAsString().generate(this.r, this.gs), false);
    }

    private columnRef(type: DataType): GenExpressionValueForwards.ExpressionMaker
    {
        const name = new ColumnId(IdentifierUtility.identNum("GEV Col" as ExpressionIdentifier, this.columns.length));
        return () => {
            const listInnerType = type.apply(new class extends FlatDataTypeVisitor<DataType | null>
            {
                public override array(inner: DataType): DataType | null
                {
                    return inner;
                }
            }(null));
            if (listInnerType !== null)
            {
                // Return whole column:
                const value: Value[] = this.replicateM(() => this.makeValue(listInnerType));
                this.columns.push(rs => ColumnUtility.makeCalculatedColumn(listInnerType, rs, name, i => value[i]!, t => t));
                // Each row gets the same full list:
                return new Pair<Value[], Expression>(this.replicateM<Value>(() => new ListExList(value)), IdentExpression.makeEntireColumnReference(this.tableId, name));
            }
            else
            {
                const value: Value[] = this.replicateM(() => this.makeValue(type));
                this.columns.push(rs => ColumnUtility.makeCalculatedColumn(type, rs, name, i => value[i]!, t => t));

                const functionLookup = FunctionList.getFunctionLookup(this.dummyManager.getUnitManager());
                // Index into a whole column:
                if (this.r.nextBoolean())
                {
                    // Use #column name
                    return new Pair<Value[], Expression>(value, new CallExpression(functionLookup, "element", IdentExpression.makeEntireColumnReference(this.tableId, name), IdentExpression.load("row" as ExpressionIdentifier)));
                }
                else
                {
                    // Use #rows
                    return new Pair<Value[], Expression>(value, new FieldAccessExpression(new CallExpression(functionLookup, "element", new FieldAccessExpression(IdentExpression.table(this.tableId.getRaw()), "rows" as ExpressionIdentifier), IdentExpression.load("row" as ExpressionIdentifier)), name.getRaw()));
                }
            }
        };
    }

    private fix(maxLevels: number, type: DataType): GenExpressionValueForwards.ExpressionMaker
    {
        const m = this.dummyManager.getTypeManager();
        return () => {
            const inner = this.make(type, maxLevels);
            return new Pair(inner.getFirst(), TypeLiteralExpression.fixType(m, FunctionList.getFunctionLookup(m.getUnitManager()), JellyType.fromConcrete(type), inner.getSecond()));
        };
    }

    // Replicates the first argument.  Useful when you have a constant expression
    // which will just be repeated:
    private literal(o: Value, e: Expression): ValuesAndExpression
    {
        return new Pair(this.replicate<Value>(o), e);
    }

    // Replicates an item targetSize times into a list:
    private replicate<T>(single: T): T[]
    {
        const repeated: T[] = [];
        for (let i = 0; i < this.targetSize; i++)
        {
            repeated.push(single);
        }
        return repeated;
    }

    // Replicates a generator targetSize times into a list:
    private replicateM<T>(single: () => T): T[]
    {
        const repeated: T[] = [];
        for (let i = 0; i < this.targetSize; i++)
        {
            repeated.push(single());
        }
        return repeated;
    }

    // Modifies a list in-place by applying the given function
    private each<T>(list: T[], modify: (t: T) => T): void
    {
        for (let i = 0; i < list.length; i++)
        {
            list[i] = modify(list[i]!);
        }
    }

    // Like each but supplies index too
    private eachI<T>(list: T[], modify: (i: number, t: T) => T): void
    {
        for (let i = 0; i < list.length; i++)
        {
            list[i] = modify(i, list[i]!);
        }
    }

    private map(src: ValuesAndExpression, eachValue: (v: Value) => Value, withExpression: (e: Expression) => Expression): ValuesAndExpression
    {
        const list: Value[] = [...src.getFirst()];
        this.each(list, eachValue);
        return new Pair(list, withExpression(src.getSecond()));
    }

    // zipWith, by another name
    private map2(srcA: ValuesAndExpression, srcB: ValuesAndExpression, eachValue: (a: Value, b: Value) => Value, withExpression: (a: Expression, b: Expression) => Expression): ValuesAndExpression
    {
        const list: Value[] = [...srcA.getFirst()];
        const listB: Value[] = [...srcB.getFirst()];
        for (let i = 0; i < list.length; i++)
        {
            list[i] = eachValue(list[i]!, listB[i]!);
        }
        return new Pair(list, withExpression(srcA.getSecond(), srcB.getSecond()));
    }

    private l(...suppliers: GenExpressionValueForwards.ExpressionMaker[]): GenExpressionValueForwards.ExpressionMaker[]
    {
        return suppliers;
    }

    private termDeep(maxLevels: number, type: DataType, terminals: readonly GenExpressionValueForwards.ExpressionMaker[], deeper: readonly GenExpressionValueForwards.ExpressionMaker[]): ValuesAndExpression
    {
        //TODO generate match expressions here (valid for all types)
        let valueExp: ValuesAndExpression;
        if (deeper.length === 0 || (terminals.length !== 0 && (maxLevels <= 1 || deeper.length === 0 || this.r.nextInt(0, 2) === 0)))
            valueExp = this.r.choose(terminals)();
        else
            valueExp = this.r.choose(deeper)();
        // Can only substitute with literal if it has constant value:
        const allValues = new TreeSet<Value>([], (a, b) => Utility.compareValues(a, b));
        for (const v of valueExp.getFirst())
            allValues.add(v);
        if (allValues.size === 1)
            this.register(valueExp.getSecond(), type, [...allValues][0]!);
        return valueExp;
    }
}

export namespace GenExpressionValueForwards
{
    export type ExpressionMaker = () => Pair<Value[], Expression>;
}
