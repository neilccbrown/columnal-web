// Port of xyz.columnal.data.DataSource (data module).
// Load this class (and its subclasses) through DataSources.ts: loadOne constructs an
// ImmediateDataSource, so this module and its subclasses' modules import each other.
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { SaveTag } from "../../identifiers/id/SaveTag.js";
import { TableId } from "../../identifiers/id/TableId.js";
import { DataLexer } from "../../parsers/generated/DataLexer.js";
import { DataLexer2 } from "../../parsers/generated/DataLexer2.js";
import { DataParser } from "../../parsers/generated/DataParser.js";
import { DataParser2 } from "../../parsers/generated/DataParser2.js";
import { DisplayLexer } from "../../parsers/generated/DisplayLexer.js";
import { DisplayParser } from "../../parsers/generated/DisplayParser.js";
import { FormatLexer } from "../../parsers/generated/FormatLexer.js";
import { FormatParser } from "../../parsers/generated/FormatParser.js";
import type { DataSourceImmediateContext, TableContext } from "../../parsers/generated/MainParser.js";
import type * as TableParser2 from "../../parsers/generated/TableParser2.js";
import { DataType } from "../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../types/data/datatype/TypeManager.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UnimplementedException } from "../../utility-error/error/UnimplementedException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import type { ColumnMaker } from "./ColumnMaker.js";
import { ColumnUtility } from "./ColumnUtility.js";
import type { EditableColumn } from "./EditableColumn.js";
import { EditableRecordSet } from "./EditableRecordSet.js";
import { ImmediateDataSource } from "./DataSources.js";
import type { RecordSet } from "./RecordSet.js";
import { Table } from "./Table.js";
import type { TableManager } from "./TableManager.js";

/**
 * Created by neil on 09/11/2016.
 */
export abstract class DataSource extends Table
{
    public constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails)
    {
        super(mgr, initialLoadDetails);
    }

    /**
     * Java has two overloads: loadOne(TableManager, MainParser.TableContext) for the old file
     * format, and loadOne(TableManager, SaveTag, TableParser2.TableDataContext).
     */
    public static loadOne(manager: TableManager, table: TableContext): Table;
    public static loadOne(manager: TableManager, saveTag: SaveTag, table: TableParser2.TableDataContext): Table;
    public static loadOne(manager: TableManager, b: TableContext | SaveTag, c?: TableParser2.TableDataContext): Table
    {
        if (c !== undefined)
            return DataSource.loadOne2(manager, b as SaveTag, c);
        const table = b as TableContext;
        const dataSource = table.dataSource();
        if (dataSource === null)
        {
            throw new UserException("Error parsing: \"" + (table.getText().length > 100 ? (table.getText().substring(0, 100) + "...") : table.getText()) + "\"");
        }

        const immed = dataSource.dataSourceImmediate();
        if (immed !== null)
        {
            const format = DataSource.loadFormat(manager.getTypeManager(), Utility.getDetailLines(immed.dataFormat().detailPrefixed()), true);
            const columns: ColumnMaker<EditableColumn, Value>[] = [];

            //TODO check for data row even length, error if not (allow & ignore blank lines)
            for (let i = 0; i < format.length; i++)
            {
                const t = format[i]!.dataType;
                const columnId = format[i]!.columnId;
                const defaultValueUnparsed = format[i]!.defaultValueUnparsed;
                if (defaultValueUnparsed === null)
                {
                    throw new InternalException("Null default value even though we are editable; should have thrown earlier.");
                }
                const defaultValue = Utility.parseAsOne(defaultValueUnparsed.trim(), s => new DataLexer(s), t => new DataParser(t), p => DataType.loadSingleItem(t, p, false));
                columns.push(ColumnUtility.makeImmediateColumn(t, columnId, defaultValue.getRight("Default values cannot be invalid")));
            }
            const recordSet = DataSource.loadedRecordSet1(columns, immed);
            const columnName = IdentifierUtility.fixExpressionIdentifier(immed.tableId().getText(), "Table" as ExpressionIdentifier);
            const immediateDataSource = new ImmediateDataSource(manager, Table.loadDetails(new TableId(columnName), immed.dataFormat().detailPrefixed(), table.display()), recordSet);
            manager.record(immediateDataSource);
            return immediateDataSource;
        }
        else
            throw new UnimplementedException();
    }

    private static loadOne2(manager: TableManager, saveTag: SaveTag, table: TableParser2.TableDataContext): Table
    {
        const dataSource = table.dataSource();
        // Java checks dataSource for null, but the grammar means it never is.

        const immed = dataSource.dataSourceImmediate();
        const format = DataSource.loadFormat(manager.getTypeManager(), Utility.getDetailLines(immed.dataFormat().detail()), true);
        const columns: ColumnMaker<EditableColumn, Value>[] = [];

        //TODO check for data row even length, error if not (allow & ignore blank lines)
        for (let i = 0; i < format.length; i++)
        {
            const t = format[i]!.dataType;
            const columnId = format[i]!.columnId;
            const defaultValueUnparsed = format[i]!.defaultValueUnparsed;
            if (defaultValueUnparsed === null)
            {
                throw new InternalException("Null default value even though we are editable; should have thrown earlier.");
            }
            const defaultValue = Utility.parseAsOne(defaultValueUnparsed.trim(), s => new DataLexer2(s), t => new DataParser2(t), p => DataType.loadSingleItem(t, p, false));
            columns.push(ColumnUtility.makeImmediateColumn(t, columnId, defaultValue.getRight("Default values cannot be invalid")));
        }
        const recordSet = DataSource.loadedRecordSet2(columns, immed);
        const columnName = IdentifierUtility.fixExpressionIdentifier(immed.tableId().getText(), "Table" as ExpressionIdentifier);
        const immediateDataSource = Utility.parseAsOne(Utility.getDetail(table.display()!.detail()), s => new DisplayLexer(s), t => new DisplayParser(t), p => new ImmediateDataSource(manager, Table.loadDetails(new TableId(columnName), saveTag, p.tableDisplayDetails()), recordSet));
        manager.record(immediateDataSource);
        return immediateDataSource;
    }

    public static loadFormat(typeManager: TypeManager, formatLines: readonly string[], editable: boolean): DataSource.LoadedFormat[]
    {
        const r: DataSource.LoadedFormat[] = [];
        for (const line of formatLines)
        {
            Utility.parseAsOne(line, s => new FormatLexer(s), t => new FormatParser(t), p =>
            {
                const column = p.column();
                const colName = column.columnName();
                // (Java also checks column and colName for null, which antlr never returns.)
                const name = new ColumnId(IdentifierUtility.fromParsed(colName));
                if (r.some(pr => pr.columnId.equals(name)))
                    throw new UserException("Duplicate column name: \"" + name.toString() + "\"");

                const type = column.type();
                const defaultCtx = column.defaultValue();
                if (defaultCtx === null && editable)
                    throw new UserException("Default value missing for potentially-editable table " + name.toString());
                const dataType = typeManager.loadTypeUse(type);
                r.push(new DataSource.LoadedFormat(name, dataType, defaultCtx === null ? null : defaultCtx.VALUE().getText()));
                return 0;
            });
        }
        return r;
    }

    // hashCode and equals must be implemented properly (used for testing).
    // To make sure we don't forget, we introduce abstract methods which must
    // be overridden.  (We don't make hashCode and equals themselves abstract
    // because subclasses would then lose access to Table.hashCode which they'd need).
    public override hashCode(): number
    {
        return (Math.imul(31, super.hashCode()) + this.dataHashCode()) | 0;
    }

    protected abstract dataHashCode(): number;

    public override equals(obj: unknown): boolean
    {
        if (!super.equals(obj))
            return false;
        return this.dataEquals(obj as DataSource);
    }

    protected abstract dataEquals(obj: DataSource): boolean;

    // Java: the two constructors of the private nested class LoadedRecordSet extends EditableRecordSet
    private static loadedRecordSet1(columns: readonly ColumnMaker<EditableColumn, Value>[], immed: DataSourceImmediateContext): EditableRecordSet
    {
        return new EditableRecordSet(Utility.mapList(columns, c => DataSource.create(c)), () => Utility.loadDataOld1(Utility.getDetailLines(immed.values().detailPrefixed()), p =>
        {
            for (let i = 0; i < columns.length; i++)
            {
                columns[i]!.loadRow1(p);
            }
        }));
    }

    private static loadedRecordSet2(columns: readonly ColumnMaker<EditableColumn, Value>[], immed: TableParser2.DataSourceImmediateContext): EditableRecordSet
    {
        return new EditableRecordSet(Utility.mapList(columns, c => DataSource.create(c)), () => Utility.loadData(Utility.getDetailLines(immed.values().detail()), p =>
        {
            for (let i = 0; i < columns.length; i++)
            {
                if (i !== 0)
                    p.comma();
                columns[i]!.loadRow(p);
            }
        }));
    }

    private static create(c: ColumnMaker<EditableColumn, Value>): SimulationFunction<RecordSet, EditableColumn>
    {
        return rs => c.apply(rs);
    }
}

export namespace DataSource
{
    export class LoadedFormat
    {
        public readonly columnId: ColumnId;
        public readonly dataType: DataType;
        public readonly defaultValueUnparsed: string | null;

        public constructor(columnId: ColumnId, dataType: DataType, defaultValueUnparsed: string | null)
        {
            this.columnId = columnId;
            this.dataType = dataType;
            this.defaultValueUnparsed = defaultValueUnparsed;
        }
    }
}
