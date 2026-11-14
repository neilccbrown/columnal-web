// Port of test.gen.GenDataAndTransforms (tests-gui-transformations): a project of data tables and
// transformations of them (one data table first, and a transformation last).
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { ColumnUtility } from "../../../src/engine/data/data/ColumnUtility.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import type { Table } from "../../../src/engine/data/data/Table.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import type { Transformation } from "../../../src/engine/data/data/Transformation.js";
import { BooleanLiteral, IdentExpression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { TypeState } from "../../../src/engine/expressions/transformations/expression/TypeState.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { Aggregate } from "../../../src/engine/transformations/transformations/Aggregate.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { Filter } from "../../../src/engine/transformations/transformations/Filter.js";
import { HideColumns } from "../../../src/engine/transformations/transformations/HideColumns.js";
import { Sort } from "../../../src/engine/transformations/transformations/Sort.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { IdentifierUtility } from "../../../src/engine/utility/utility/IdentifierUtility.js";
import { TBasicUtil } from "../../engine/tests-basic/fixtures/data/TBasicUtil.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { DummyManager } from "../../engine/tests-functions/fixtures/DummyManager.js";
import { GenDataTypeMaker } from "../../engine/tests-functions/fixtures/gen/type/GenDataTypeMaker.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../support/quickcheck.js";

// Most of the transformations are currently identity transform or similar,
// but that's fine for the manual edit test.
export class GenDataAndTransforms extends Generator<TableManager>
{
    public override generate(random: SourceOfRandomness, status: GenerationStatus): TableManager
    {
        const dataTypeMaker = new GenDataTypeMaker(undefined, true).generate(random, status);
        const mgr = new DummyManager();

        // Must have at least one immediate and one transformation (at end):
        this.addImmediateTable(mgr, dataTypeMaker, random);

        // Add a mix of others:
        const other = random.nextInt(0, 10);
        for (let i = 0; i < other; i++)
        {
            if (random.nextInt(3) === 1)
                this.addImmediateTable(mgr, dataTypeMaker, random);
            else
                this.addTransformation(mgr, random);
        }
        this.addTransformation(mgr, random);

        // Must copy at end, as types are generated while adding tables:
        mgr.getTypeManager()._test_copyTaggedTypesFrom(dataTypeMaker.getTypeManager());

        return mgr;
    }

    private addTransformation(mgr: TableManager, r: SourceOfRandomness): void
    {
        const genTransforms: (() => Transformation)[] = [
            // Sort:
            () =>
            {
                const src = this.pickSrc(mgr, r);
                const sortBy: Pair<ColumnId, Sort.Direction>[] = [];
                const possibles = [...src.getData().getColumnIds()];
                const numSortBy = r.nextInt(0, possibles.length);
                for (let i = 0; i < numSortBy; i++)
                    sortBy.push(new Pair(possibles.splice(r.nextInt(possibles.length), 1)[0]!, r.nextBoolean() ? Sort.Direction.ASCENDING : Sort.Direction.DESCENDING));
                return new Sort(mgr, TFunctionUtil.ILD, src.getId(), sortBy);
            },
            // Filter:
            () => new Filter(mgr, TFunctionUtil.ILD, this.pickSrc(mgr, r).getId(), new BooleanLiteral(true)),
            // Join: (Java: commented out, TODO avoid issue with duplicate column names from merging with self)
            // Hide:
            () => new HideColumns(mgr, TFunctionUtil.ILD, this.pickSrc(mgr, r).getId(), []),
            // Calculate:
            () => new Calculate(mgr, TFunctionUtil.ILD, this.pickSrc(mgr, r).getId(), new HashMap()),
            // Concatenate: (Java: commented out, TODO fix issues with columns having different types)
            // Aggregate:
            () => new Aggregate(mgr, TFunctionUtil.ILD, this.pickSrc(mgr, r).getId(), [new Pair(new ColumnId("Count"), IdentExpression.load(TypeState.GROUP_COUNT))], []),
            // R: (Java: commented out)
        ];
        mgr.record(genTransforms[r.nextInt(genTransforms.length)]!());
    }

    private pickSrc(mgr: TableManager, r: SourceOfRandomness): Table
    {
        const allTables = mgr.getAllTables();
        return allTables[r.nextInt(allTables.length)]!;
    }

    private addImmediateTable(mgr: TableManager, dataTypeMaker: GenDataTypeMaker.DataTypeMaker, r: SourceOfRandomness): void
    {
        const numRows = r.nextInt(1, 20);
        const numCols = r.nextInt(1, 6);

        const cols: ((rs: RecordSet) => EditableColumn)[] = [];
        for (let i = 0; i < numCols; i++)
        {
            const t = dataTypeMaker.makeType();
            cols.push(ColumnUtility.makeImmediateColumn(t.getDataType(), new ColumnId(IdentifierUtility.identNum("Col", i)), TBasicUtil.makeList(r, numRows, numRows, () => Either.right<string, Value>(t.makeValue())), t.makeValue()));
        }

        mgr.record(new ImmediateDataSource(mgr, TFunctionUtil.ILD, new EditableRecordSet(cols, () => numRows)));
    }
}
