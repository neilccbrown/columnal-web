// Port of xyz.columnal.data.Table (data module).
// The nested types (Display, InitialLoadDetails, Saver, BlankSaver, FullSaver, TableDisplayBase,
// WholeTableException) are in the Table namespace.
import type { AbsColIndex, AbsRowIndex, ExpressionIdentifier } from "../../anns/Annotations.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import { SaveTag } from "../../identifiers/id/SaveTag.js";
import type { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import type { TableId } from "../../identifiers/id/TableId.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { javaParseInt } from "../../java/JavaString.js";
import { DisplayLexer } from "../../parsers/generated/DisplayLexer.js";
import { DisplayParser, type TableDisplayDetailsContext } from "../../parsers/generated/DisplayParser.js";
import { MainLexer } from "../../parsers/generated/MainLexer.js";
import type { DetailPrefixedContext, DisplayContext } from "../../parsers/generated/MainParser.js";
import { OverallVersion } from "../../parsers/grammar/Versions.js";
import { vocabularyOf } from "../../parsers/grammar/Vocabularies.js";
import type { DataType } from "../../types/data/datatype/DataType.js";
import type { OutputBuilder } from "../../types/loadsave/OutputBuilder.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import { Log } from "../../utility/log/Log.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import { CellPosition } from "./CellPosition.js";
import type { RecordSet } from "./RecordSet.js";
import type { TableManager } from "./TableManager.js";
import type { TableOperations } from "./TableOperations.js";

/**
 * A Table is a wrapper for a RecordSet which keeps various metadata
 * on where the data originates from, and details about displaying it.
 */
export abstract class Table
{
    private readonly mgr: TableManager;
    private readonly id: TableId;
    protected readonly saveTag: SaveTag;
    private display: Table.TableDisplayBase | null = null;
    private prevPosition: CellPosition = new CellPosition(1, 1);

    // The list is the blacklist, only applicable if first is CUSTOM:
    private showColumns: Pair<Table.Display, readonly ColumnId[]> = new Pair<Table.Display, readonly ColumnId[]>(Table.Display.ALL, []);

    /**
     * If id is null, an arbitrary free id is taken
     * @param mgr
     * @param id
     */
    protected constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails)
    {
        this.mgr = mgr;
        if (initialLoadDetails.tableId === null || initialLoadDetails.tableId.getRaw().length === 0)
            this.id = mgr.registerNextFreeId();
        else
        {
            this.id = initialLoadDetails.tableId;
        }
        if (initialLoadDetails.saveTag === null || initialLoadDetails.saveTag.getTag().length === 0)
        {
            this.saveTag = SaveTag.generateRandom();
        }
        else
        {
            this.saveTag = initialLoadDetails.saveTag;
        }
        if (initialLoadDetails.initialPosition !== null)
            this.prevPosition = initialLoadDetails.initialPosition;
        if (initialLoadDetails.initialShowColumns !== null)
            this.showColumns = initialLoadDetails.initialShowColumns;
    }

    public getId(): TableId
    {
        return this.id;
    }

    public abstract getData(): RecordSet;

    public abstract save(destination: JavaFile | null, then: Table.Saver, renames: TableAndColumnRenames): void;

    public setDisplay(display: Table.TableDisplayBase): void
    {
        if (this.display !== null)
        {
            Utility.report(new InternalException("Overwriting table display!"));
        }
        this.display = display;
        display.loadPosition(this.prevPosition, this.showColumns);
    }

    /**
     * Java has two overloads:
     *  - loadDetails(TableId, DetailPrefixedContext tagFromContext, @Nullable DisplayContext detailContext)
     *  - loadDetails(TableId, SaveTag, TableDisplayDetailsContext displayContext)
     */
    public static loadDetails(tableId: TableId, tagFromContext: DetailPrefixedContext, detailContext: DisplayContext | null): Table.InitialLoadDetails;
    public static loadDetails(tableId: TableId, saveTag: SaveTag, displayContext: TableDisplayDetailsContext): Table.InitialLoadDetails;
    public static loadDetails(tableId: TableId, b: DetailPrefixedContext | SaveTag, c: DisplayContext | TableDisplayDetailsContext | null): Table.InitialLoadDetails
    {
        if (b instanceof SaveTag)
            return Table.loadDetailsFromDisplay(tableId, b, c as TableDisplayDetailsContext);
        const tagFromContext = b;
        const detailContext = c as DisplayContext | null;
        if (detailContext === null)
            return new Table.InitialLoadDetails(tableId, new SaveTag(tagFromContext.BEGIN().getText().substring("@BEGIN".length).trim()), null, null);
        return Utility.parseAsOne(Utility.getDetail(detailContext.detail()), s => new DisplayLexer(s), t => new DisplayParser(t), p =>
        {
            return Table.loadDetailsFromDisplay(tableId, new SaveTag(tagFromContext.BEGIN().getText().substring("@BEGIN".length).trim()), p.tableDisplayDetails());
        });
    }

    private static loadDetailsFromDisplay(tableId: TableId, saveTag: SaveTag, displayContext: TableDisplayDetailsContext): Table.InitialLoadDetails
    {
        try
        {
            const x: AbsColIndex = javaParseInt(displayContext.displayTablePosition().item(0)!.getText());
            const y: AbsRowIndex = javaParseInt(displayContext.displayTablePosition().item(1)!.getText());
            const initialPosition = new CellPosition(y, x);

            let initialShowColumns: Pair<Table.Display, readonly ColumnId[]>;
            // Now handle the show-columns:
            if (displayContext.displayShowColumns().ALL() !== null)
                initialShowColumns = new Pair<Table.Display, readonly ColumnId[]>(Table.Display.ALL, []);
            else if (displayContext.displayShowColumns().ALTERED() !== null)
                initialShowColumns = new Pair<Table.Display, readonly ColumnId[]>(Table.Display.ALTERED, []);
            else if (displayContext.displayShowColumns().COLLAPSED() !== null)
                initialShowColumns = new Pair<Table.Display, readonly ColumnId[]>(Table.Display.COLLAPSED, []);
            else
            {
                const blackList = displayContext.displayShowColumns().item().map(itemContext =>
                {
                    const text = IdentifierUtility.fixExpressionIdentifier(itemContext.getText(), "Could Not Load" as ExpressionIdentifier);
                    return new ColumnId(text);
                });
                initialShowColumns = new Pair<Table.Display, readonly ColumnId[]>(Table.Display.CUSTOM, blackList);
            }

            return new Table.InitialLoadDetails(tableId, saveTag, initialPosition, initialShowColumns);
        }
        catch (_e)
        {
            throw new UserException("Could not parse position: \"" + displayContext.getText() + "\"");
        }
    }

    protected savePosition(out: OutputBuilder): void
    {
        if (this.display !== null)
        {
            this.prevPosition = this.display.getMostRecentPosition();
        }
        const displayVocab = vocabularyOf(DisplayLexer);
        out.t(MainLexer.DISPLAY, vocabularyOf(MainLexer)).begin().nl();
        out.t(DisplayLexer.POSITION, displayVocab).n(this.prevPosition.columnIndex).n(this.prevPosition.rowIndex).nl();
        out.t(DisplayLexer.SHOWCOLUMNS, displayVocab);
        switch (this.showColumns.getFirst())
        {
            case Table.Display.ALL: out.t(DisplayLexer.ALL, displayVocab); break;
            case Table.Display.ALTERED: out.t(DisplayLexer.ALTERED, displayVocab); break;
            case Table.Display.COLLAPSED: out.t(DisplayLexer.COLLAPSED, displayVocab); break;
            case Table.Display.CUSTOM:
                out.t(DisplayLexer.EXCEPT, displayVocab);
                // TODO output the list;
                break;
        }
        out.nl();
        out.end().t(MainLexer.DISPLAY, vocabularyOf(MainLexer)).nl();
    }

    public setShowColumns(newState: Table.Display, blackList: readonly ColumnId[]): void
    {
        this.showColumns = new Pair<Table.Display, readonly ColumnId[]>(newState, blackList);
    }

    public getShowColumns(): Pair<Table.Display, (columnId: ColumnId) => boolean>
    {
        return this.showColumns.mapSecond(blackList => (s: ColumnId) => !blackList.some(b => b.equals(s)));
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (o === null || typeof o !== "object" || o.constructor !== this.constructor) return false;

        const table = o as Table;

        if (!this.id.equals(table.id)) return false;
        return this.prevPosition.equals(table.prevPosition);

    }

    public hashCode(): number
    {
        let result = this.id.hashCode();
        result = (Math.imul(31, result) + this.prevPosition.hashCode()) | 0;
        return result;
    }

    public getDisplay(): Table.TableDisplayBase | null
    {
        return this.display;
    }

    public abstract getOperations(): TableOperations;

    public getManager(): TableManager
    {
        return this.mgr;
    }

    public _test_getPrevPosition(): CellPosition
    {
        return this.prevPosition;
    }

    public getDetailsForCopy(overrideId: TableId): Table.InitialLoadDetails
    {
        return new Table.InitialLoadDetails(overrideId, this.saveTag, this.prevPosition, this.showColumns);
    }

    public proposeNewColumnName(): ColumnId | null
    {
        try
        {
            let name: ColumnId | null = null;
            const stem = "C" as ExpressionIdentifier;
            const columnIds = this.getData().getColumnIds();
            for (let i = 1; i < 100000; i++)
            {
                name = new ColumnId(IdentifierUtility.identNum(stem, i));
                const n = name;
                if (!columnIds.some(c => c.equals(n)))
                    break;
            }
            // Give up!
            const finalName = name;
            if (finalName === null || columnIds.some(c => c.equals(finalName)))
                throw new UserException("Column name already exists in table: " + String(finalName));
            return finalName;
        }
        catch (e)
        {
            if (!(e instanceof UserException || e instanceof InternalException))
                throw e;
            Log.log(e);
            return null;
        }
    }

    // Returns the runnable that re-evaluates the table, if applicable
    public getReevaluateOperation(): SimulationRunnable | null
    {
        return null;
    }

    // Gets the suggested name for this table
    public abstract getSuggestedName(): TableId;
}

export namespace Table
{
    export enum Display
    {
        /** No table shown, just a label */
        COLLAPSED,
        /** All columns shown */
        ALL,
        /** Only those affected by transformation compared to source table */
        ALTERED,
        /** A custom set (done by black list, not white list) */
        CUSTOM
    }

    export class InitialLoadDetails
    {
        /** @internal Java: private, but read by Table */
        public readonly tableId: TableId | null;
        /** @internal Java: private, but read by Table */
        public readonly saveTag: SaveTag | null;
        /** @internal Java: private, but read by Table */
        public readonly initialPosition: CellPosition | null;
        /** @internal Java: private, but read by Table */
        public readonly initialShowColumns: Pair<Display, readonly ColumnId[]> | null;

        // Java has two constructors: (tableId, saveTag, initialPosition, initialShowColumns) and (initialPosition).
        public constructor(initialPosition: CellPosition);
        public constructor(tableId: TableId | null, saveTag: SaveTag | null, initialPosition: CellPosition | null, initialShowColumns: Pair<Display, readonly ColumnId[]> | null);
        public constructor(a: TableId | CellPosition | null, saveTag?: SaveTag | null, initialPosition?: CellPosition | null, initialShowColumns?: Pair<Display, readonly ColumnId[]> | null)
        {
            if (a instanceof CellPosition)
            {
                this.tableId = null;
                this.saveTag = null;
                this.initialPosition = a;
                this.initialShowColumns = null;
            }
            else
            {
                this.tableId = a;
                this.saveTag = saveTag ?? null;
                this.initialPosition = initialPosition ?? null;
                this.initialShowColumns = initialShowColumns ?? null;
            }
        }

        public withTableId(tableId: TableId): InitialLoadDetails
        {
            return new InitialLoadDetails(tableId, this.saveTag, this.initialPosition, this.initialShowColumns);
        }
    }

    export interface Saver
    {
        saveTable(tableSrc: string): void;

        saveUnit(unitSrc: string): void;

        saveType(typeSrc: string): void;

        saveComment(commentSrc: string): void;
    }

    export class BlankSaver implements Saver
    {
        public saveTable(_tableSrc: string): void
        {
        }

        public saveUnit(_unitSrc: string): void
        {
        }

        public saveType(_typeSrc: string): void
        {
        }

        public saveComment(_commentSrc: string): void
        {
        }
    }

    export class FullSaver implements Saver
    {
        private readonly units: string[] = [];
        private readonly types: string[] = [];
        private readonly tables: string[] = [];
        private readonly comments: string[] = [];
        private readonly displayDetailLines: readonly string[] | null;

        public constructor(displayDetailLines: readonly string[] | null)
        {
            this.displayDetailLines = displayDetailLines;
        }

        public saveTable(tableSrc: string): void
        {
            this.tables.push(tableSrc);
        }

        public saveUnit(unitSrc: string): void
        {
            this.units.push(unitSrc.endsWith("\n") ? unitSrc : unitSrc + "\n");
        }

        public saveType(typeSrc: string): void
        {
            this.types.push(typeSrc.endsWith("\n") ? typeSrc : typeSrc + "\n");
        }

        public saveComment(commentSrc: string): void
        {
            this.comments.push(commentSrc);
        }

        public getCompleteFile(): string
        {
            return "COLUMNAL\nVERSION " + OverallVersion.asNumber(OverallVersion.latest()) + "\n\nUNITS @BEGIN UU\n"
                + this.units.map(u => "UU " + u).join("")
                + "@END UU UNITS\n\nTYPES @BEGIN TT\n"
                + this.types.map(t => "TT " + t).join("")
                + "@END TT TYPES\n"
                + this.tables.join("\n")
                + this.comments.join("\n")
                + (this.displayDetailLines === null ? "" : ("DISPLAY @BEGIN DD" + this.displayDetailLines.map(d => "\nDD " + d).join("") + "\n@END DD DISPLAY"))
                + "\n";
        }
    }

    // Java: a protected inner class
    export class WholeTableException extends UserException
    {
        public constructor(message: string)
        {
            super(message);
        }
    }

    /**
     * Slightly ham-fisted way to break the data->gui module dependency
     * while still letting Table store a link to its display.
     */
    export interface TableDisplayBase
    {
        loadPosition(position: CellPosition, display: Pair<Display, readonly ColumnId[]>): void;

        getMostRecentPosition(): CellPosition;

        getBottomRightIncl(): CellPosition;

        /**
         * The user has made an edit in a transformation;
         * prompt them to ask if they want a manual edit, and
         * if yes, pop it in.
         * @param index The edited row index
         * @param column The edited column name and type
         * @param value The resulting value.
         */
        promptForTransformationEdit(index: number, column: Pair<ColumnId, DataType>, value: Either<string, Value>): void;

        getTable(): Table;
    }
}
