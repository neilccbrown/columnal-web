// Port of test.gen.GenImmediateData (tests-tables testFixtures).
// PORT-NOTE: the configuration annotations (@NumTables, @MustIncludeNumber,
// @CanHaveErrorValues) become constructor options.
import type { ExpressionIdentifier } from "../../../../../src/engine/anns/Annotations.js";
import { ImmediateDataSource } from "../../../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../../../src/engine/data/data/EditableRecordSet.js";
import type { RecordSet } from "../../../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../../../src/engine/data/data/Table.js";
import type { TableManager } from "../../../../../src/engine/data/data/TableManager.js";
import { TableId } from "../../../../../src/engine/identifiers/id/TableId.js";
import { DataType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import { IdentifierUtility } from "../../../../../src/engine/utility/utility/IdentifierUtility.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { TFunctionUtil } from "../../../tests-functions/fixtures/functions/TFunctionUtil.js";
import { GenColumn } from "../../../tests-functions/fixtures/gen/GenColumn.js";

/**
 * Created by neil on 07/12/2016.
 */
export class GenImmediateData extends Generator<GenImmediateData.ImmediateData_Mgr>
{
    private readonly numTables: GenImmediateData.NumTables | null;
    private readonly mustIncludeNumber: boolean;
    private nextTableNum = 0;
    private readonly canHaveErrorValues: boolean;

    public constructor(options: { numTables?: GenImmediateData.NumTables, mustIncludeNumber?: boolean, canHaveErrorValues?: boolean } = {})
    {
        super();
        this.numTables = options.numTables === undefined ? null : { minTables: 1, maxTables: 1, ...options.numTables };
        this.mustIncludeNumber = options.mustIncludeNumber ?? false;
        this.canHaveErrorValues = options.canHaveErrorValues ?? false;
    }

    public override generate(r: SourceOfRandomness, generationStatus: GenerationStatus): GenImmediateData.ImmediateData_Mgr
    {
        const mgrAndTypes = TFunctionUtil.managerWithTestTypes();

        const tables: ImmediateDataSource[] = [];

        const numTables = this.numTables === null ? 1 : r.nextInt(this.numTables.minTables!, this.numTables.maxTables!);

        for (let t = 0; t < numTables; t++)
        {
            // Bias towards small:
            const length = r.nextBoolean() ? r.nextInt(0, 10) : r.nextInt(0, 400);

            const numColumns = r.nextInt(1, 12);
            const columns: ((rs: RecordSet) => EditableColumn)[] = [];
            const genColumn = new GenColumn(mgrAndTypes.getFirst(), mgrAndTypes.getSecond(), this.canHaveErrorValues);
            for (let i = 0; i < numColumns; i++)
            {
                const col = genColumn.generate(r, generationStatus);
                columns.push(rs => col(length, rs) as EditableColumn/*TODO*/);
            }
            if (this.mustIncludeNumber)
            {
                // Can't tell what types have been added, so just add another number one in case:
                const col = genColumn.columnForType(DataType.NUMBER, r);
                columns.push(rs => col(length, rs) as EditableColumn);
            }

            const dataSource = new ImmediateDataSource(mgrAndTypes.getFirst(), new Table.InitialLoadDetails(new TableId(IdentifierUtility.identNum("Test" as ExpressionIdentifier, this.nextTableNum++)), null, null, null), new EditableRecordSet(columns, () => length));
            mgrAndTypes.getFirst().record(dataSource);
            tables.push(dataSource);
        }
        return new GenImmediateData.ImmediateData_Mgr(mgrAndTypes.getFirst(), tables);
    }
}

export namespace GenImmediateData
{
    export class ImmediateData_Mgr
    {
        public readonly mgr: TableManager;
        // Amount is set by Precision annotation (for laziness), default is 1
        public readonly data: readonly ImmediateDataSource[];

        public constructor(mgr: TableManager, data: readonly ImmediateDataSource[])
        {
            this.mgr = mgr;
            this.data = [...data];
        }

        // Shortcut for first item: (Java: data(), which would clash with the field here)
        public dataFirst(): Table
        {
            return this.data[0]!;
        }
    }

    /** Java: the @NumTables annotation (both default to 1) */
    export interface NumTables
    {
        minTables?: number;
        maxTables?: number;
    }
}
