// Port of test.PropRunTransformation (tests-tables).
import { describe } from "vitest";
import type { TableDataRowIndex } from "../../../src/engine/anns/Annotations.js";
import type { Column } from "../../../src/engine/data/data/Column.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { CallExpression, ComparisonExpression, IdentExpression, NumericLiteral, type Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import type { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { Decimal, ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { immutableMapBuilderPut } from "../../../src/engine/java/JavaCollections.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Aggregate } from "../../../src/engine/transformations/transformations/Aggregate.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { Concatenate } from "../../../src/engine/transformations/transformations/Concatenate.js";
import { Filter } from "../../../src/engine/transformations/transformations/Filter.js";
import { HideColumns } from "../../../src/engine/transformations/transformations/HideColumns.js";
import { Sort } from "../../../src/engine/transformations/transformations/Sort.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import type { DataTypeValue } from "../../../src/engine/types/data/datatype/DataTypeValue.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { UserException } from "../../../src/engine/utility-error/error/UserException.js";
import { IdentifierUtility } from "../../../src/engine/utility/utility/IdentifierUtility.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { assertThat, Matchers } from "../../support/hamcrest.js";
import { assertEquals, assertTrue, assumeTrue, fail } from "../../support/junit.js";
import { BooleanGenerator, propertyTest } from "../../support/quickcheck.js";
import { TBasicUtil } from "../tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../tests-basic/fixtures/gen/GenRandom.js";
import { TFunctionUtil } from "../tests-functions/fixtures/functions/TFunctionUtil.js";
import { GenImmediateData } from "./fixtures/gen/GenImmediateData.js";
import { TTableUtil } from "./fixtures/TTableUtil.js";

import ComparisonOperator = ComparisonExpression.ComparisonOperator;
import Direction = Sort.Direction;
import IncompleteColumnHandling = Concatenate.IncompleteColumnHandling;

/**
 * Created by neil on 01/12/2016.
 */
describe("PropRunTransformation", () =>
{
    propertyTest("testSort", [new GenImmediateData(), new GenRandom()], (srcTable: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
    {
        // Pick an arbitrary column and sort by it
        const src = srcTable.dataFirst().getData();
        const sortBy = src.getColumns()[r.nextInt(src.getColumns().length)]!;
        const direction = r.nextBoolean() ? Direction.ASCENDING : Direction.DESCENDING;

        const sort = new Sort(srcTable.mgr, TFunctionUtil.ILD, srcTable.dataFirst().getId(), [new Pair(sortBy.getName(), direction)]);

        // TODO sort by multiple columns, too

        // Java: StreamEx.pairMap over adjacent values, checking none is out of order
        const sorted = [...TTableUtil.streamFlattened(sort.getData().getColumn(sortBy.getName()))];
        const inOrder = sorted.slice(1).map((b, i) =>
        {
            const a = sorted[i]!;
            let cmp = Utility.compareValues(a, b);
            // Flip if descending:
            if (direction === Direction.DESCENDING)
                cmp = -cmp;

            if (cmp > 0)
            {
                console.error("Problematic comparison: " + TTableUtil.toString(a) + " vs " + TTableUtil.toString(b));
            }
            return cmp <= 0;
        });
        assertTrue("Sorting by " + sortBy.getName().toString() + " " + direction.toString() + ":\n" + src.debugGetVals(), !inOrder.includes(false));
        // Check that the same set of rows is present:
        assertEquals(TTableUtil.getRowFreq(src), TTableUtil.getRowFreq(sort.getData()));
    });

    propertyTest("testFilter", [new GenImmediateData(), new GenRandom()], (srcTable: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
    {
        // Pick a column to filter on:
        const columns = srcTable.dataFirst().getData().getColumns();
        const targetColumnIndex = r.nextInt(columns.length);
        const target = columns[targetColumnIndex]!;

        assumeTrue(target.getLength() > 0);

        // Pick a random value:
        const targetRowIndex = r.nextInt(target.getLength());
        const targetValue = target.getType().getCollapsed(targetRowIndex);

        let op: ComparisonOperator;
        let check: (cmp: number) => boolean;
        switch (r.nextInt(4))
        {
            case 0:
                op = ComparisonOperator.GREATER_THAN;
                check = cmp => cmp > 0;
                break;
            case 1:
                op = ComparisonOperator.GREATER_THAN_OR_EQUAL_TO;
                check = cmp => cmp >= 0;
                break;
            case 2:
                op = ComparisonOperator.LESS_THAN;
                check = cmp => cmp < 0;
                break;
            default:
                op = ComparisonOperator.LESS_THAN_OR_EQUAL_TO;
                check = cmp => cmp <= 0;
                break;
        }

        // Then filter on <= that:
        const filter = new Filter(srcTable.mgr, TFunctionUtil.ILD, srcTable.dataFirst().getId(),
            new ComparisonExpression(
                [
                    IdentExpression.column(target.getName()),
                    new CallExpression(FunctionList.getFunctionLookup(srcTable.mgr.getUnitManager()), "element", IdentExpression.makeEntireColumnReference(srcTable.dataFirst().getId(), target.getName()), new NumericLiteral(new Decimal(targetRowIndex + 1) /* User index */, null)),
                ], [op]));
        srcTable.mgr.record(filter);
        for (let row = 0; row < filter.getData().getLength(); row++)
        {
            const data = filter.getData().getColumn(target.getName()).getType().getCollapsed(row);
            assertTrue("Value " + TTableUtil.toString(targetValue) + " should be " + op.saveOp() + " " + TTableUtil.toString(data) + " (but wasn't)", check(Utility.compareValues(data, targetValue)));
        }


        const invertedFilter = new Filter(srcTable.mgr, TFunctionUtil.ILD, srcTable.dataFirst().getId(),
            new ComparisonExpression(
                [
                    IdentExpression.column(target.getName()),
                    new CallExpression(FunctionList.getFunctionLookup(srcTable.mgr.getUnitManager()), "element", IdentExpression.makeEntireColumnReference(srcTable.dataFirst().getId(), target.getName()), new NumericLiteral(new Decimal(targetRowIndex + 1) /* User index */, null)),
                ], [invert(op)]));
        srcTable.mgr.record(invertedFilter);

        // Lengths should equal original:
        const filterLength: TableDataRowIndex = filter.getData().getLength();
        const invertedFilterLength: TableDataRowIndex = invertedFilter.getData().getLength();
        assertEquals(srcTable.dataFirst().getData().getLength(), filterLength + invertedFilterLength);



        const includeSourceColumn = r.nextBoolean();
        const concatFilters = new Concatenate(srcTable.mgr, TFunctionUtil.ILD, [filter.getId(), invertedFilter.getId()], IncompleteColumnHandling.DEFAULT, includeSourceColumn);

        let srcColNames: ColumnId[] = srcTable.dataFirst().getData().getColumnIds();
        if (includeSourceColumn)
            srcColNames = Utility.prependToList(new ColumnId("Source"), srcColNames);
        // Should be same column names in same order, modulo the extra Source column:
        assertEquals(srcColNames, concatFilters.getData().getColumnIds());

        // Check that the same set of rows is present:
        const srcWithSrc = [...TTableUtil.streamFlattened(srcTable.dataFirst().getData())].map((p): Value[] =>
        {
            if (!includeSourceColumn)
                return p.getSecond();
            else
                return TBasicUtil.checkedToRuntime(() =>
                {
                    const matchesFilter = check(Utility.compareValues(p.getSecond()[targetColumnIndex]!, targetValue));
                    return Utility.prependToList<Value>(matchesFilter ? filter.getId().getRaw() : invertedFilter.getId().getRaw(), p.getSecond());
                });
        });
        const srcData = [...TTableUtil.getRowFreq(srcWithSrc).entries()];
        const destData = [...TTableUtil.getRowFreq(concatFilters.getData()).entries()];
        assertEquals(srcData.length, destData.length);
        for (let i = 0; i < srcData.length; i++)
        {
            TBasicUtil.assertValueListEqual("Row " + i, srcData[i]![0], destData[i]![0]);
            assertEquals("Row " + i, srcData[i]![1], destData[i]![1]);
        }
    });

    function invert(op: ComparisonOperator): ComparisonOperator
    {
        switch (op)
        {
            case ComparisonOperator.LESS_THAN:
                return ComparisonOperator.GREATER_THAN_OR_EQUAL_TO;
            case ComparisonOperator.LESS_THAN_OR_EQUAL_TO:
                return ComparisonOperator.GREATER_THAN;
            case ComparisonOperator.GREATER_THAN:
                return ComparisonOperator.LESS_THAN_OR_EQUAL_TO;
            case ComparisonOperator.GREATER_THAN_OR_EQUAL_TO:
                return ComparisonOperator.LESS_THAN;
        }
        throw new Error("Missing case for inverting comparison op");
    }

    propertyTest("testSummaryStats", [new GenImmediateData()], (original: GenImmediateData.ImmediateData_Mgr) =>
    {
        const numericColumn = original.dataFirst().getData().getColumns().find(c => DataTypeUtility.isNumber(c.getType().getType())) ?? null;
        assumeTrue(numericColumn !== null);

        const countExpression: Expression = new CallExpression(FunctionList.getFunctionLookup(original.mgr.getUnitManager()), "list length", IdentExpression.makeEntireColumnReference(original.dataFirst().getId(), original.dataFirst().getData().getColumns()[0]!.getName()));
        let aggregate = new Aggregate(original.mgr, TFunctionUtil.ILD, original.dataFirst().getId(), [new Pair(new ColumnId("COUNT"), countExpression)], []);
        let summaryRS = aggregate.getData();
        assertEquals(1, summaryRS.getLength());
        assertEquals(1, summaryRS.getColumns().length);
        assertEquals(original.dataFirst().getData().getLength(), DataTypeUtility.requireInteger(summaryRS.getColumns()[0]!.getType().getCollapsed(0)));

        const sumExpression: Expression = new CallExpression(FunctionList.getFunctionLookup(original.mgr.getUnitManager()), "sum", IdentExpression.makeEntireColumnReference(original.dataFirst().getId(), numericColumn!.getName()));
        aggregate = new Aggregate(original.mgr, TFunctionUtil.ILD, original.dataFirst().getId(), [new Pair(new ColumnId("SUM"), sumExpression)], []);
        summaryRS = aggregate.getData();
        assertEquals(1, summaryRS.getLength());
        assertEquals(1, summaryRS.getColumns().length);
        assertThat(TTableUtil.toString(numericColumn!), Utility.toBigDecimal(Utility.valueNumber(summaryRS.getColumns()[0]!.getType().getCollapsed(0))), Matchers.comparesEqualTo(bdSum(numericColumn!.getLength(), numericColumn!.getType())));
    });

    function bdSum(length: number, type: DataTypeValue): Decimal
    {
        let total = ZERO;
        for (let i = 0; i < length; i++)
            total = total.plus(Utility.toBigDecimal(Utility.valueNumber(type.getCollapsed(i))));
        return total;
    }

    propertyTest("testConcatSelf", [new GenImmediateData(), new BooleanGenerator()], (original: GenImmediateData.ImmediateData_Mgr, includeSource: boolean) =>
    {
        const ids: TableId[] = [];
        const originalLength: TableDataRowIndex = original.dataFirst().getData().getLength();
        for (let repeats = 1; repeats < 4; repeats++)
        {
            // Add once each time round the loop:
            ids.push(original.dataFirst().getId());
            const concatenate = new Concatenate(original.mgr, TFunctionUtil.ILD, [...ids], IncompleteColumnHandling.DEFAULT, includeSource);
            for (const column of concatenate.getData().getColumns())
            {
                // Compare each value from the original set with the corresponding later repeated values:
                for (let originalRow = 0; originalRow < originalLength; originalRow++)
                {
                    // This will compare to self, but why not:
                    for (let repeatCompare = 0; repeatCompare < repeats; repeatCompare++)
                    {
                        assertEquals(0, Utility.compareValues(column.getType().getCollapsed(originalRow), column.getType().getCollapsed(originalRow + repeatCompare * originalLength)));
                    }
                }

            }
        }
    });

    // TODO test more concat failure cases

    propertyTest("testSuccessfulHide", [new GenImmediateData()], (original: GenImmediateData.ImmediateData_Mgr) =>
    {
        const originalIds = original.dataFirst().getData().getColumnIds();

        assumeTrue(originalIds.length > 1);

        // Test zero:
        {
            const expected = [...originalIds];
            const hidden = new HideColumns(original.mgr, TFunctionUtil.ILD, original.dataFirst().getId(), []);
            assertEquals(expected, hidden.getData().getColumnIds());
            assertDataSame(hidden.getData(), original.dataFirst().getData(), c => c);
        }

        // Test one:
        for (const single of originalIds)
        {
            const expected = [...originalIds];
            // Java: List.remove(Object), which removes the first equal item
            expected.splice(expected.findIndex(c => c.equals(single)), 1);
            const hidden = new HideColumns(original.mgr, TFunctionUtil.ILD, original.dataFirst().getId(), [single]);
            assertEquals(expected, hidden.getData().getColumnIds());
            assertDataSame(hidden.getData(), original.dataFirst().getData(), c => c);
        }
    });

    propertyTest("testTransformAsRename", [new GenImmediateData(), new GenRandom()], (original: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
    {
        // Pick a few new destination columns:
        const numNew = r.nextInt(5);
        const newCols = new HashMap<ColumnId, Expression>();
        const oldColumns = original.dataFirst().getData().getColumns();
        const columnMapping = new HashMap<ColumnId, ColumnId>();

        for (const oldColumn of oldColumns)
        {
            columnMapping.set(oldColumn.getName(), oldColumn.getName());
        }
        for (let i = 0; i < numNew; i++)
        {
            const old = oldColumns[r.nextInt(oldColumns.length)]!.getName();
            const newId = new ColumnId(IdentifierUtility.identNum("Trans", i));
            immutableMapBuilderPut(newCols, newId, IdentExpression.column(old));
            columnMapping.set(newId, old);
        }


        const calculate = new Calculate(original.mgr, TFunctionUtil.ILD, original.dataFirst().getId(), newCols);

        assertDataSame(calculate.getData(), original.dataFirst().getData(), c => columnMapping.getOrDefault(c, new ColumnId("TEST_UNKNOWN")));
    });

    // Checks that all columns from first parameter have same data as
    // their counterpart in second parameter, where counterpart
    // is determined by applying the function to map the column name
    // Note this is not symmetrical between the two data sets!
    // Any columns that are in second param but not first are ignored.
    function assertDataSame(smaller: RecordSet, bigger: RecordSet, smallToBig: (c: ColumnId) => ColumnId): void
    {
        for (const a of smaller.getColumns())
        {
            const b: Column = bigger.getColumn(smallToBig(a.getName()));
            assertEquals(a.getLength(), b.getLength());
            for (let i = 0; i < a.getLength(); i++)
            {
                assertEquals(0, Utility.compareValues(a.getType().getCollapsed(i), b.getType().getCollapsed(i)));
            }
        }
    }

    propertyTest("testUnsuccessfulHide", [new GenImmediateData()], (original: GenImmediateData.ImmediateData_Mgr) =>
    {
        // Hiding all should be invalid:
        try
        {
            new HideColumns(original.mgr, TFunctionUtil.ILD, original.dataFirst().getId(), [...original.dataFirst().getData().getColumnIds()]).getData();
            fail("Hide all");
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            // As expected
        }

        // Hiding a column which doesn't feature (perhaps alongside legit columns):
        const toRemove: ColumnId[] = [];
        toRemove.push(new ColumnId("hdgsufdhggggiosfsgdf"));
        for (const c of original.dataFirst().getData().getColumnIds())
        {
            try
            {
                new HideColumns(original.mgr, TFunctionUtil.ILD, original.dataFirst().getId(), [...toRemove]).getData();
                fail("Hide non-existing");
            }
            catch (e)
            {
                if (!(e instanceof UserException))
                    throw e;
                // As expected
            }
            // Java: new Random().nextInt(toRemove.size()), an unseeded random
            toRemove.splice(Math.floor(Math.random() * toRemove.length), 0, c);
        }
    });
});
