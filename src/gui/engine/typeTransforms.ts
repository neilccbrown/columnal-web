// In the engine: the column menu's "Transform type" (Java: TableDisplay.transformType): the types a
// column's values could be transformed into, each with the expression which does it, judged from a
// sample of the column's values.
import type { ExpressionIdentifier } from "../../engine/anns/Annotations.js";
import type { Table } from "../../engine/data/data/Table.js";
import type { TableManager } from "../../engine/data/data/TableManager.js";
import { ArrayExpression, CallExpression, EqualExpression, type Expression, IdentExpression, IfThenElseExpression, NumericLiteral, StringLiteral, TypeLiteralExpression } from "../../engine/expressions/transformations/expression/Expressions.js";
import { TypePrimitiveLiteral } from "../../engine/expressions/transformations/expression/type/TypePrimitiveLiteral.js";
import { FromString } from "../../engine/functions/transformations/function/FromString.js";
import { FunctionList } from "../../engine/functions/transformations/function/FunctionList.js";
import { ToDate } from "../../engine/functions/transformations/function/ToDate.js";
import { ToDateTime } from "../../engine/functions/transformations/function/ToDateTime.js";
import { ToString } from "../../engine/functions/transformations/function/ToString.js";
import { ToTime } from "../../engine/functions/transformations/function/ToTime.js";
import { ToYearMonth } from "../../engine/functions/transformations/function/ToYearMonth.js";
import { ExtractNumber } from "../../engine/functions/transformations/function/conversion/ExtractNumber.js";
import { ExtractNumberOrNone } from "../../engine/functions/transformations/function/conversion/ExtractNumberOrNone.js";
import { InList } from "../../engine/functions/transformations/function/list/InList.js";
import { StringLowerCase } from "../../engine/functions/transformations/function/text/StringLowerCase.js";
import type { ColumnId } from "../../engine/identifiers/id/ColumnId.js";
import { Decimal } from "../../engine/java/JavaBigDecimal.js";
import { DataType, type TagType } from "../../engine/types/data/datatype/DataType.js";
import type { TypeId } from "../../engine/types/data/datatype/TypeId.js";
import type { GetValue } from "../../engine/types/data/datatype/DataTypeValue.js";
import { DateTimeInfo } from "../../engine/types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../engine/types/data/datatype/NumberInfo.js";
import { Unit } from "../../engine/types/data/unit/Unit.js";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import { UserException } from "../../engine/utility-error/error/UserException.js";
import type { Value } from "../../engine/utility/utility/Value.js";
import { Utility } from "../../engine/utility/utility/Utility.js";

/**
 * Java: PickTypeTransformDialog.TypeTransform: the type (as its toString), and the expression, or for
 * unwrapping an Optional, the inner type (which a value is then asked for, the default for None).
 */
export type TypeTransform =
    | { readonly destType: DataType, readonly expression: Expression }
    | { readonly destType: DataType, readonly unwrap: DataType };

const DATE_TIME_TYPES: readonly DateTimeInfo.DateTimeType[] = [DateTimeInfo.DateTimeType.YEARMONTHDAY, DateTimeInfo.DateTimeType.YEARMONTH, DateTimeInfo.DateTimeType.TIMEOFDAY, DateTimeInfo.DateTimeType.DATETIME, DateTimeInfo.DateTimeType.DATETIMEZONED];

/** Java: TableDisplay.transformType's possibles, for the column of the table. */
export function typeTransforms(tableManager: TableManager, table: Table, columnId: ColumnId): TypeTransform[]
{
    const functionLookup = FunctionList.getFunctionLookup(tableManager.getUnitManager());
    const columnReference: Expression = IdentExpression.column(columnId);
    const toText = (): TypeTransform => ({ destType: DataType.TEXT, expression: new CallExpression(IdentExpression.function(new ToString().getFullName()), [columnReference]) });

    // Spend up to half a second getting as many values as possible:
    const sample = <T extends Value>(getValue: GetValue<T>): T[] =>
    {
        const r: T[] = [];
        const startMillis = Date.now();
        const recordSet = table.getData();
        let i = 0;
        do
        {
            if (!recordSet.indexValid(i))
                break;
            try
            {
                r.push(getValue.get(i));
            }
            catch (e)
            {
                // Ignore values that we can't fetch
                if (!(e instanceof UserException))
                    throw e;
            }
            i += 1;
        }
        while (Date.now() < startMillis + 500);
        return r;
    };

    const foldFunctions = (functions: readonly string[], cur: Expression): Expression =>
        functions.length === 0 ? cur : foldFunctions(functions.slice(1), new CallExpression(functionLookup, functions[0]!, cur));

    return table.getData().getColumn(columnId).getType().applyGet<TypeTransform[]>({
        number(g: GetValue<Decimal>, displayInfo: NumberInfo): TypeTransform[]
        {
            const r: TypeTransform[] = [toText()];
            const values = sample(g);
            if (values.length > 0 && displayInfo.getUnit().equals(Unit.SCALAR))
            {
                const zeroCount = values.filter(n => Utility.compareNumbers(n, new Decimal(0)) === 0).length;
                const oneCount = values.filter(n => Utility.compareNumbers(n, new Decimal(1)) === 0).length;
                // Offer boolean
                if (zeroCount > 0 && oneCount > 0 && zeroCount + oneCount === values.length)
                    r.push({ destType: DataType.BOOLEAN, expression: new EqualExpression([columnReference, new NumericLiteral(new Decimal(1), null)], false) });
            }
            return r;
        },

        text(g: GetValue<string>): TypeTransform[]
        {
            // Don't offer toText as that is redundant.
            interface FromText
            {
                readonly destType: DataType;
                readonly conversionTrial: (s: string) => boolean;
                readonly conversionExpression: Expression;
                // Mutable:
                failCount: number;
            }
            const conversions: FromText[] = [];
            const extractNumber = new ExtractNumber().getInstance();
            conversions.push({ destType: DataType.NUMBER, conversionTrial: s => { extractNumber.call([s]); return true; }, conversionExpression: new CallExpression(functionLookup, ExtractNumber.NAME, columnReference), failCount: 0 });
            conversions.push({ destType: tableManager.getTypeManager().getMaybeType().instantiate([Either.right<Unit, DataType>(DataType.NUMBER)], tableManager.getTypeManager()), conversionTrial: s => { extractNumber.call([s]); return true; }, conversionExpression: new CallExpression(functionLookup, ExtractNumberOrNone.NAME, columnReference), failCount: 0 });
            for (const dtt of DATE_TIME_TYPES)
            {
                const destType = DataType.date(new DateTimeInfo(dtt));
                conversions.push({ destType, conversionTrial: s => { FromString.convertEntireString(s, destType); return true; }, conversionExpression: new CallExpression(functionLookup, FromString.FROM_TEXT_TO, new TypeLiteralExpression(new TypePrimitiveLiteral(destType)), columnReference), failCount: 0 });
            }
            const trues = ["true", "t", "yes", "y", "on"];
            const bools = [...trues, "no", "n", "false", "f", "off"];
            conversions.push({ destType: DataType.BOOLEAN, conversionTrial: s => bools.includes(s.toLowerCase()), conversionExpression: new CallExpression(functionLookup, InList.NAME, new ArrayExpression(trues.map(t => new StringLiteral(t))), new CallExpression(functionLookup, StringLowerCase.NAME, columnReference)), failCount: 0 });

            const samples = sample(g);
            // Everything will look plausible if no data:
            if (samples.length === 0)
                return [];
            const maxFail = Math.trunc(samples.length / 5);
            for (const s of samples)
            {
                if (conversions.length === 0)
                    break;
                for (const conversion of conversions)
                {
                    let failed: boolean;
                    try
                    {
                        failed = !conversion.conversionTrial(s);
                    }
                    catch (e)
                    {
                        if (!(e instanceof UserException))
                            throw e;
                        failed = true;
                    }
                    if (failed)
                        conversion.failCount += 1;
                }
                for (let i = conversions.length - 1; i >= 0; i--)
                {
                    if (conversions[i]!.failCount > maxFail)
                        conversions.splice(i, 1);
                }
            }
            return conversions.map(c => ({ destType: c.destType, expression: c.conversionExpression }));
        },

        bool(_g: GetValue<boolean>): TypeTransform[]
        {
            return [toText(), { destType: DataType.NUMBER, expression: IfThenElseExpression.unrecorded(columnReference, new NumericLiteral(new Decimal(1), null), new NumericLiteral(new Decimal(0), null)) }];
        },

        date(dateTimeInfo: DateTimeInfo, _g: unknown): TypeTransform[]
        {
            const destTypesAndFunctions = new Map<DateTimeInfo.DateTimeType, readonly string[]>();
            destTypesAndFunctions.set(dateTimeInfo.getType(), []);
            const add = (from: DateTimeInfo.DateTimeType, to: DateTimeInfo.DateTimeType, f: string): void =>
            {
                const funcs = destTypesAndFunctions.get(from);
                if (funcs !== undefined)
                    destTypesAndFunctions.set(to, [...funcs, f]);
            };
            // Important to go in descending order:
            add(DateTimeInfo.DateTimeType.DATETIMEZONED, DateTimeInfo.DateTimeType.DATETIME, ToDateTime.DATETIME_FROM_DATETIMEZONED);
            add(DateTimeInfo.DateTimeType.DATETIME, DateTimeInfo.DateTimeType.YEARMONTHDAY, ToDate.DATE_FROM_DATETIME);
            add(DateTimeInfo.DateTimeType.DATETIME, DateTimeInfo.DateTimeType.TIMEOFDAY, ToTime.TIME_FROM_DATETIME);
            add(DateTimeInfo.DateTimeType.YEARMONTHDAY, DateTimeInfo.DateTimeType.YEARMONTH, ToYearMonth.DATEYM_FROM_DATE);
            // (By the types' order)
            const smaller = [...destTypesAndFunctions.entries()].filter(([, fs]) => fs.length > 0).sort(([a], [b]) => a - b)
                .map(([t, fs]): TypeTransform => ({ destType: DataType.date(new DateTimeInfo(t)), expression: foldFunctions(fs, columnReference) }));
            return [toText(), ...smaller];
        },

        tagged(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], _tagTypes: readonly TagType<DataType>[], _g: unknown): TypeTransform[]
        {
            if (typeName.equals(tableManager.getTypeManager().getMaybeType().getTaggedTypeName()))
            {
                if (typeVars.length !== 1)
                    throw new UserException("Wrong number of type variables for type " + typeName.getRaw());
                const inner = typeVars[0]!.eitherEx(_u => { throw new UserException("Unit as parameter to type " + typeName.getRaw()); }, t => t);
                return [{ destType: inner, unwrap: inner }, toText()];
            }
            return [toText()];
        },

        record(_types: ReadonlyMap<ExpressionIdentifier, DataType>, _g: unknown): TypeTransform[]
        {
            return [toText()];
        },

        array(_inner: DataType, _g: unknown): TypeTransform[]
        {
            return [toText()];
        },
    });
}

