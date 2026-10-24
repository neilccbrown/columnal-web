// Port of xyz.columnal.importers.ImportPlainTable (importers module).
import type { Localized } from "../../anns/Annotations.js";
import { TextColumnType } from "../../data/data/columntype/ColumnTypes.js";
import type { RecordSet } from "../../data/data/RecordSet.js";
import type { TableManager } from "../../data/data/TableManager.js";
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { HashSet } from "../../java/HashMap.js";
import { SimpleObjectProperty, type ObjectExpression } from "../../java/JavaFXBeans.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { UnitType } from "../../utility/utility/UnitType.js";
import { ColumnInfo } from "./ColumnInfo.js";
import { GuessFormat } from "./GuessFormat.js";
import { ImporterUtility } from "./ImporterUtility.js";

export abstract class ImportPlainTable implements GuessFormat.Import<UnitType, ImportPlainTable.PlainImportInfo>
{
    private readonly numSrcColumns: number;
    private readonly mgr: TableManager;
    private readonly vals: readonly (readonly string[])[];
    protected readonly format = new SimpleObjectProperty<UnitType | null>(UnitType.UNIT);

    // vals must be rectangular
    public constructor(numSrcColumns: number, mgr: TableManager, vals: readonly (readonly string[])[])
    {
        this.numSrcColumns = numSrcColumns;
        this.mgr = mgr;
        // Fix type issue:
        this.vals = [...vals];
    }

    public currentSrcFormat(): ObjectExpression<UnitType | null>
    {
        return this.format;
    }

    public loadSource(_u: UnitType): GuessFormat.Import.SrcDetails
    {
        const trimChoice = GuessFormat.guessTrim(this.vals);
        const columns: ColumnInfo[] = [];
        const columnDisplayNames: Localized[] = [];
        // PORT-NOTE: bug fix.  Java used the names as given, so a table with two columns of the same
        // name (as an HTML table's header can have) failed to show; now a repeated name gets a number.
        const usedNames = new HashSet<ColumnId>();
        for (let i = 0; i < this.numSrcColumns; i++)
        {
            const name = this.srcColumnName(i);
            const columnName = GuessFormat.uniqueName(usedNames, name.getFirst());
            usedNames.add(columnName);
            columns.push(new ColumnInfo(new TextColumnType(), columnName));
            columnDisplayNames.push(name.getSecond());
        }
        const recordSet = ImporterUtility.makeEditableRecordSet(this.mgr.getTypeManager(), this.vals, columns);
        return new GuessFormat.Import.SrcDetails(trimChoice, recordSet, columnDisplayNames);
    }

    // Gets internal column name, and name to display in GUI for src table
    public abstract srcColumnName(index: number): Pair<ColumnId, Localized>;

    public destColumnName(_trimChoice: GuessFormat.TrimChoice, index: number): ColumnId
    {
        return this.srcColumnName(index).getFirst();
    }

    public loadDest(_u: UnitType, trimChoice: GuessFormat.TrimChoice): Pair<ImportPlainTable.PlainImportInfo, RecordSet>
    {
        const columns = GuessFormat.guessGeneralFormat(this.mgr.getUnitManager(), this.processTrimmed(this.vals), trimChoice, (trim, i) => this.destColumnName(trim, i));
        return new Pair(new ImportPlainTable.PlainImportInfo(columns, trimChoice), ImporterUtility.makeEditableRecordSet(this.mgr.getTypeManager(), this.processTrimmed(trimChoice.trim(this.vals)), columns));
    }

    // Allows for String trim()ing in subclass
    public processTrimmed(trimmed: readonly (readonly string[])[]): readonly (readonly string[])[]
    {
        return trimmed;
    }
}

export namespace ImportPlainTable
{
    export class PlainImportInfo
    {
        public readonly columnInfo: readonly ColumnInfo[];
        public readonly trim: GuessFormat.TrimChoice;

        public constructor(columnInfo: readonly ColumnInfo[], trim: GuessFormat.TrimChoice)
        {
            this.columnInfo = columnInfo;
            this.trim = trim;
        }
    }
}
