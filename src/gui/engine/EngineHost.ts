// The engine's side of the GUI–engine messages (protocol.ts): owns the TableManager, answers the
// GUI's requests and sends it events.  Runs in the engine worker (engineWorker.ts), or in the page
// for GUI tests (InPageTransport), where tests can also read the engine's objects through it.
import { CellPosition } from "../../engine/data/data/CellPosition.js";
import { Column } from "../../engine/data/data/Column.js";
import { DataSource, ImmediateDataSource } from "../../engine/data/data/DataSources.js";
import { ColumnUtility } from "../../engine/data/data/ColumnUtility.js";
import { EditableRecordSet } from "../../engine/data/data/EditableRecordSet.js";
import { TypeExpression } from "../../engine/expressions/transformations/expression/type/TypeExpressions.js";
import { ColumnId } from "../../engine/identifiers/id/ColumnId.js";
import { TableId } from "../../engine/identifiers/id/TableId.js";
import { Table } from "../../engine/data/data/Table.js";
import { TableManager } from "../../engine/data/data/TableManager.js";
import { TransformationManager } from "../../engine/transformations/transformations/TransformationManager.js";
import { ClipboardUtils } from "../../engine/importers/importers/ClipboardUtils.js";
import type { DataType } from "../../engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../engine/types/data/datatype/DataTypeUtility.js";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../engine/utility-error/error/InternalException.js";
import { InvalidImmediateValueException } from "../../engine/utility-error/error/InvalidImmediateValueException.js";
import { UserException } from "../../engine/utility-error/error/UserException.js";
import { Log } from "../../engine/utility/log/Log.js";
import { ParseProgress } from "../../engine/utility/utility/ParseProgress.js";
import { TranslationUtility } from "../../engine/utility/utility/TranslationUtility.js";
import { TableDisplayUtility } from "../../gui-logic/stf/gui/dtf/TableDisplayUtility.js";
import { Workers } from "../../engine/utility/utility/Workers.js";
import type { Value } from "../../engine/utility/utility/Value.js";
import { Transformation } from "../../engine/data/data/Transformation.js";
import { EditableColumn } from "../../engine/data/data/EditableColumn.js";
import { CSVExporter } from "../../engine/exporters/exporters/CSVExporter.js";
import { ExcelExporter } from "../../engine/exporters/exporters/ExcelExporter.js";
import { HTMLExporter } from "../../engine/exporters/exporters/HTMLExporter.js";
import { ExporterManager } from "../../engine/exporters/exporters/manager/ExporterManager.js";
import { RExporter } from "../../engine/exporters/exporters/RExporter.js";
import { CallExpression, Expression, IdentExpression } from "../../engine/expressions/transformations/expression/Expressions.js";
import { TypeState } from "../../engine/expressions/transformations/expression/TypeState.js";
import { FunctionList } from "../../engine/functions/transformations/function/FunctionList.js";
import { Mean } from "../../engine/functions/transformations/function/Mean.js";
import { Sum } from "../../engine/functions/transformations/function/Sum.js";
import { SaveTag } from "../../engine/identifiers/id/SaveTag.js";
import { TableAndColumnRenames } from "../../engine/identifiers/id/TableAndColumnRenames.js";
import { GridComment } from "../../engine/data/data/GridComment.js";
import { Aggregate } from "../../engine/transformations/transformations/Aggregate.js";
import { ManualEdit } from "../../engine/transformations/transformations/ManualEdit.js";
import { Sort } from "../../engine/transformations/transformations/Sort.js";
import { VisitableTransformation } from "../../engine/transformations/transformations/VisitableTransformation.js";
import { ErrorHandler } from "../../engine/utility/log/ErrorHandler.js";
import { IdentifierUtility } from "../../engine/utility/utility/IdentifierUtility.js";
import { Utility } from "../../engine/utility/utility/Utility.js";
import { TableHat } from "../../gui-logic/app/gui/table/app/TableHat.js";
import { ENGINE_METHODS, type CellContent, type ColumnLookupInfo, type ColumnRecipe, type RenameOnEditKind, type EditResult, type EngineAlert, type EngineApi, type EngineError, type EngineEvent, type ExporterInfo, type FromEngine, type LoadResult, type NewColumnDetails, type TableDisplayMode, type TableInfo, type ToEngine, type TypeInfo } from "./protocol.js";
import { columnLookupInfo } from "./columnLookupInfo.js";
import { RenameOnEdit } from "../../engine/data/data/RenameOnEdit.js";
import { BracketedStatus } from "../../engine/expressions/transformations/expression/BracketedStatus.js";
import { ExpressionUtil } from "../../engine/expressions/transformations/expression/ExpressionUtil.js";
import { HashMap } from "../../engine/java/HashMap.js";
import { ExpressionVersion } from "../../engine/parsers/grammar/Versions.js";
import { Calculate } from "../../engine/transformations/transformations/Calculate.js";

// How many rows requests are done for each table at once (newest first); older ones are skipped:
const MAX_ROWS_REQUESTS_PER_TABLE = 2;

interface RowsRequest
{
    readonly id: string;
    readonly version: number;
    readonly firstRow: number;
    readonly lastRowExcl: number;
    readonly resolve: (cells: readonly (readonly CellContent[])[] | null) => void;
}

export class EngineHost implements EngineApi
{
    public readonly tableManager: TableManager;
    private readonly post: (m: FromEngine) => void;
    // The current tables by id, with the version the GUI knows them by:
    private readonly tables = new Map<string, { readonly table: Table, readonly version: number }>();
    private nextVersion = 1;
    // Each table's position.  (Java: its TableDisplay, which the table asks for its position when
    // saving; a re-run table takes the position of the table it replaces.)
    private readonly positions = new Map<Table, CellPosition>();
    // Each table's columns shown (Java: TableDisplay.columnDisplay, which the table gives its display
    // when it is set, and which the display changes):
    private readonly displays = new Map<Table, Pair<Table.Display, readonly ColumnId[]>>();
    // The comments, with the ids the GUI knows them by:
    private readonly comments = new Map<GridComment, string>();
    private nextCommentId = 1;
    private tablesEventScheduled = false;
    private modifiedEventScheduled = false;
    private rowsQueue: RowsRequest[] = [];
    private rowsScheduled = false;

    public constructor(post: (m: FromEngine) => void)
    {
        this.post = post;
        this.tableManager = new TableManager(TransformationManager.getInstance(), { getHandledContent: () => new Map() });
        this.tableManager.addListener({
            // Java: View's TableManagerListener, which saves after each
            removeTable: t =>
            {
                if (this.tables.get(t.getId().getRaw())?.table === t)
                    this.tables.delete(t.getId().getRaw());
                this.tablesChanged();
                this.modified();
            },
            addSource: t =>
            {
                this.addTable(t);
                this.modified();
            },
            addTransformation: t =>
            {
                this.addTable(t);
                this.modified();
            },
            addComment: c =>
            {
                this.comments.set(c, String(this.nextCommentId++));
                this.tablesChanged();
                this.modified();
            },
            removeComment: c =>
            {
                this.comments.delete(c);
                this.tablesChanged();
                this.modified();
            },
        });
        // Java: the app's ErrorHandler shows errors in an alert (FXUtility.showError)
        const sendAlert = (alert: EngineAlert): void => this.sendEvent({ kind: "alert", alert });
        ErrorHandler.setErrorHandler(new class extends ErrorHandler
        {
            protected override doShowError(title: string, errWrap: (s: string) => string, e: Error): void
            {
                if (e instanceof InternalException)
                    Log.log(e);
                sendAlert({ title, message: errWrap(e instanceof UserException || e instanceof InternalException ? e.getLocalizedMessage() ?? "" : e.message) });
            }
        }());
        registerExporters();
    }

    /** A message from the GUI. */
    public receive(m: ToEngine): void
    {
        const reply = (value: unknown): void => this.post({ kind: "reply", requestId: m.requestId, ok: true, value });
        const fail = (e: unknown): void => this.post({ kind: "reply", requestId: m.requestId, ok: false, error: toEngineError(e) });
        try
        {
            if (!ENGINE_METHODS.has(m.method))
                throw new Error("Unknown engine request: " + m.method);
            const method = this[m.method] as (...args: readonly unknown[]) => unknown;
            const result = method.apply(this, [...m.args]);
            if (result instanceof Promise)
                result.then(reply, fail);
            else
                reply(result);
        }
        catch (e)
        {
            fail(e);
        }
    }

    public load(text: string): LoadResult
    {
        let columnWidths: (readonly [number, number])[] = [];
        const loaded = this.tableManager.loadAll(text, widths => { columnWidths = widths.map(w => [w.getFirst(), w.getSecond()] as const); });
        return { errors: loaded.errors.map(e => e.toPlain()), columnWidths };
    }

    public save(displayDetailLines: readonly string[]): string
    {
        const saver = new Table.FullSaver(displayDetailLines);
        this.tableManager.save(null, saver);
        return saver.getCompleteFile();
    }

    public typeInfo(): TypeInfo
    {
        // (Each on its own line, as Table.FullSaver writes them)
        const lines = (items: readonly string[]): string => items.map(s => s.endsWith("\n") ? s : s + "\n").join("");
        return { units: lines(this.tableManager.getUnitManager().save()), types: lines(this.tableManager.getTypeManager().save()) };
    }

    public setTypeInfo(info: TypeInfo): EngineAlert | null
    {
        try
        {
            // (Units first, which the types can use)
            const unitManager = this.tableManager.getUnitManager();
            const typeManager = this.tableManager.getTypeManager();
            unitManager.clearAllUser();
            unitManager.loadUserUnits(info.units);
            typeManager.clearAllUser();
            typeManager.loadTypeDecls(info.types);
            // Java: MainWindow's menu items, View.modified after the dialog
            this.modified();
            return null;
        }
        catch (e)
        {
            return alertFor("error.saving.type.change", e);
        }
    }

    // Java: View.createTable's COMMENT, a new GridComment
    public addComment(column: number, row: number): void
    {
        this.tableManager.addComment(new GridComment(SaveTag.generateRandom(), "", new CellPosition(CellPosition.row(row), CellPosition.col(column)), 2, 2));
    }

    private comment(id: string): GridComment | null
    {
        for (const [c, cid] of this.comments)
        {
            if (cid === id)
                return c;
        }
        return null;
    }

    public setCommentContent(id: string, content: string): void
    {
        // (Java didn't mark the file as modified, so the change was only saved with the next one: a bug)
        this.comment(id)?.setContent(content);
        this.tablesChanged();
        this.modified();
    }

    public setCommentBottomRight(id: string, column: number, row: number): void
    {
        // (Java didn't mark the file as modified either)
        this.comment(id)?.setBottomRight(new CellPosition(CellPosition.row(row), CellPosition.col(column)));
        this.tablesChanged();
        this.modified();
    }

    public removeComment(id: string): void
    {
        const c = this.comment(id);
        if (c !== null)
            this.tableManager.removeComment(c);
    }

    public createDataTable(tableName: string, column: NewColumnDetails, columnIndex: number, rowIndex: number): EngineAlert | null
    {
        try
        {
            const { columnId, dataType, defaultValue } = this.newColumn(column);
            // (A blank name is made up, as Table does for an empty TableId)
            const initialLoadDetails = new Table.InitialLoadDetails(new TableId(tableName), null, new CellPosition(CellPosition.row(rowIndex), CellPosition.col(columnIndex)), null);
            this.tableManager.record(new ImmediateDataSource(this.tableManager, initialLoadDetails, EditableRecordSet.newRecordSetSingleColumn(columnId, dataType, defaultValue)));
            return null;
        }
        catch (e)
        {
            return alertFor("error.creating.first.column", e);
        }
    }

    public addColumn(id: string, version: number, beforeColumn: string | null, column: NewColumnDetails): EngineAlert | null
    {
        const table = this.current(id, version);
        if (!(table instanceof ImmediateDataSource))
            return null;
        try
        {
            const { columnId, dataType, defaultValue } = this.newColumn(column);
            const maker = ColumnUtility.makeImmediateColumn(dataType, columnId, defaultValue);
            table.getData().addColumn(beforeColumn === null ? null : new ColumnId(beforeColumn), rs => maker.apply(rs));
            return null;
        }
        catch (e)
        {
            return alertFor("error.adding.column", e);
        }
    }

    public appendRows(id: string, version: number, count: number): EngineAlert | null
    {
        const appendRows = this.current(id, version)?.getOperations().appendRows ?? null;
        if (appendRows === null)
            return null;
        try
        {
            appendRows(count);
            return null;
        }
        catch (e)
        {
            return alertFor("error.finding.length", e, id);
        }
    }

    public insertRows(id: string, version: number, row: number, count: number): EngineAlert | null
    {
        const insertRows = this.current(id, version)?.getOperations().insertRows ?? null;
        if (insertRows === null)
            return null;
        try
        {
            insertRows(row, count);
            return null;
        }
        catch (e)
        {
            // (Java logged it, on its worker thread)
            return alertFor("error.inserting.rows", e);
        }
    }

    public deleteRows(id: string, version: number, row: number, count: number): EngineAlert | null
    {
        const deleteRows = this.current(id, version)?.getOperations().deleteRows ?? null;
        if (deleteRows === null)
            return null;
        try
        {
            deleteRows(row, count);
            return null;
        }
        catch (e)
        {
            // (Java logged it, on its worker thread)
            return alertFor("error.removing.rows", e);
        }
    }

    public renameTable(id: string, newName: string): EngineAlert | null
    {
        const renameTable = this.tables.get(id)?.table.getOperations().renameTable ?? null;
        // (Its errors are shown through the ErrorHandler)
        renameTable?.(new TableId(newName));
        return null;
    }

    public deleteTable(id: string): void
    {
        const table = this.tables.get(id)?.table;
        if (table !== undefined)
            this.tableManager.remove(table.getId());
    }

    public deleteColumn(id: string, version: number, column: string): EngineAlert | null
    {
        const columnId = new ColumnId(column);
        const deleteColumn = this.current(id, version)?.getOperations().deleteColumn(columnId) ?? null;
        if (deleteColumn === null)
            return null;
        try
        {
            deleteColumn(columnId);
            return null;
        }
        catch (e)
        {
            // (Java logged it, on its worker thread)
            return alertFor("error.deleting.column", e);
        }
    }

    public columnDetails(id: string, version: number, column: string): { readonly type: string, readonly defaultValue: string | null } | null
    {
        const c = this.current(id, version)?.getData().getColumnOrNull(new ColumnId(column)) ?? null;
        if (c === null)
            return null;
        const defaultValue = c.getDefaultValue();
        return {
            // (Java: EditImmediateColumnDialog's TypeExpression.fromDataType)
            type: TypeExpression.fromDataType(c.getType().getType()).save(Expression.SaveDestination.TO_FILE, TableAndColumnRenames.EMPTY),
            defaultValue: defaultValue === null ? null : DataTypeUtility.valueToString(defaultValue),
        };
    }

    public columnLookup(us: string | null, src: string | null): ColumnLookupInfo
    {
        return columnLookupInfo(this.tableManager, us, src);
    }

    // Java: View's new-table dialog's TRANSFORM: TransformationInfo.make, with the source table picked
    public createTransformation(_kind: "calculate", src: string, column: number, row: number): { readonly id: string } | EngineAlert
    {
        try
        {
            const srcTable = this.tableManager.getSingleTableOrThrow(new TableId(src));
            const make = new Calculate.Info().make(this.tableManager, new CellPosition(CellPosition.row(row), CellPosition.col(column)), () => srcTable);
            if (make === null)
                throw new InternalException("No source table");
            const transformation = this.tableManager.record(make());
            return { id: transformation.getId().getRaw() };
        }
        catch (e)
        {
            return alertFor("error.creating.transformation", e);
        }
    }

    public calculateColumn(id: string, column: string): { readonly expression: string | null } | null
    {
        const calc = this.tables.get(id)?.table;
        if (!(calc instanceof Calculate))
            return null;
        const columnId = new ColumnId(column);
        // Start with the existing value.
        let expression: Expression | null = calc.getCalculatedColumns().get(columnId) ?? null;
        // If that doesn't exist, copy the name of the column if appropriate:
        try
        {
            if (expression === null && calc.getData().getColumns().some(c => c.getName().equals(columnId)))
                expression = IdentExpression.column(columnId);
        }
        catch (e)
        {
            if (!(e instanceof UserException || e instanceof InternalException))
                throw e;
        }
        return { expression: expression === null ? null : saveExpression(expression) };
    }

    // Java: TableDisplay.addColumnBefore_Calc and TransformationEdits.editColumn_Calc
    public setCalculateColumn(id: string, oldColumn: string | null, newColumn: string, expression: string, rename: RenameOnEditKind): EngineAlert | null
    {
        const calc = this.tables.get(id)?.table;
        if (!(calc instanceof Calculate))
            return null;
        try
        {
            const mgr = this.tableManager;
            const newCols = Utility.appendToMap(calc.getCalculatedColumns(), new ColumnId(newColumn), this.loadExpression(expression), oldColumn === null ? null : new ColumnId(oldColumn));
            const toCalculate = new HashMap<ColumnId, Expression>();
            newCols.forEach((v, k) => toCalculate.set(k, v));
            const renameOnEdit = rename === "UNNEEDED" ? RenameOnEdit.UNNEEDED : rename === "IF_OLD_AUTO" ? RenameOnEdit.ifOldAuto(Calculate.suggestedName(toCalculate)) : RenameOnEdit.renameToSuggested(Calculate.suggestedName(toCalculate));
            mgr.edit(calc, newId => new Calculate(mgr, calc.getDetailsForCopy(newId), calc.getSrcTableId(), toCalculate), renameOnEdit);
            return null;
        }
        catch (e)
        {
            return alertFor(oldColumn === null ? "error.adding.column" : "error.saving.column", e);
        }
    }

    public moveCalculateColumn(id: string, editingColumn: string, newColumn: string | null, expression: string): EngineAlert | null
    {
        const calc = this.tables.get(id)?.table;
        if (!(calc instanceof Calculate))
            return null;
        try
        {
            calc.makeEditor(new ColumnId(editingColumn)).moveExpressionToNewCalculation()(new Pair(newColumn === null ? null : new ColumnId(newColumn), this.loadExpression(expression)));
            return null;
        }
        catch (e)
        {
            return alertFor("error.moving.calculate", e);
        }
    }

    // An expression from the GUI, saved as in a file
    private loadExpression(expression: string): Expression
    {
        return ExpressionUtil.parse(null, expression, ExpressionVersion.latest(), this.tableManager.getTypeManager(), FunctionList.getFunctionLookup(this.tableManager.getUnitManager()));
    }

    // Java: TransformationEdits.editColumn_IDS
    public editColumn(id: string, version: number, column: string, details: NewColumnDetails): EngineAlert | null
    {
        const data = this.current(id, version);
        if (!(data instanceof ImmediateDataSource))
            return null;
        const columnId = new ColumnId(column);
        try
        {
            const columnDetails = this.newColumn(details);
            let makeReplacement: (() => ImmediateDataSource) | null = null;
            // If column type and default value are unaltered, don't need to re-do table:
            const oldColumn = data.getData().getColumn(columnId);
            if (!(oldColumn instanceof EditableColumn))
                throw new InternalException("Non-editable column in original data set");
            // Important to check type first, because if type has changed,
            // default values cannot be compared:
            if (!columnDetails.dataType.equals(oldColumn.getType().getType()) || Utility.compareValues(oldColumn.getDefaultValue(), columnDetails.defaultValue) !== 0)
            {
                // Need to redo whole table to edit the column type/default:
                const length = data.getData().getLength();
                const columns = data.getData().getColumns().map(c =>
                {
                    if (c.getName().equals(columnId))
                    {
                        const newValues: Either<string, Value>[] = [];
                        for (let i = 0; i < length; i++)
                        {
                            let stringVersion: string;
                            try
                            {
                                stringVersion = DataTypeUtility.valueToString(c.getType().getCollapsed(i));
                            }
                            catch (e)
                            {
                                if (!(e instanceof InvalidImmediateValueException))
                                    throw e;
                                stringVersion = e.getInvalid();
                            }
                            // Now turn String back into the new type:
                            newValues.push(columnDetails.dataType.loadSingleItem(stringVersion.trim()));
                        }
                        return ColumnUtility.makeImmediateColumn(columnDetails.dataType, c.getName(), newValues, columnDetails.defaultValue);
                    }
                    else
                        return EditableRecordSet.copyColumn(c);
                });
                const newRecordSet = new EditableRecordSet(columns, () => length);
                makeReplacement = () => new ImmediateDataSource(this.tableManager, data.getDetailsForCopy(data.getId()), newRecordSet);
            }
            const renames = new TableAndColumnRenames([[data.getId(), new Pair<TableId | null, Iterable<readonly [ColumnId, ColumnId]>>(data.getId(), [[columnId, columnDetails.columnId]])]]);
            if (makeReplacement === null)
                this.tableManager.editData(data.getId(), null, renames);
            else
                this.tableManager.editData(data.getId(), makeReplacement, renames);
            return null;
        }
        catch (e)
        {
            return alertFor("error.saving.column", e);
        }
    }

    public setDisplay(id: string, display: TableDisplayMode): void
    {
        const table = this.tables.get(id)?.table;
        if (table === undefined)
            return;
        // Java: TableDisplay.setDisplay; the menu's items clear the custom list of hidden columns, and
        // middle-clicking the header keeps it (as here)
        const blackList = this.displays.get(table)?.getSecond() ?? [];
        const newState = Table.Display[display];
        this.displays.set(table, new Pair<Table.Display, readonly ColumnId[]>(newState, blackList));
        table.setShowColumns(newState, blackList);
        this.resized(table);
        this.modified();
    }

    // Java: TableDisplay's column recipes (columnQuickTransform), each a SimpleColumnOperation, which
    // puts the new table to the right of the others
    public recipe(id: string, version: number, column: string, recipe: ColumnRecipe): EngineAlert | null
    {
        const table = this.current(id, version);
        if (table === null)
            return null;
        const tableManager = this.tableManager;
        const c = new ColumnId(column);
        const insertPos = tableManager.getNextInsertPosition(table.getId());
        const details = new Table.InitialLoadDetails(null, null, insertPos, null);
        try
        {
            // Java: columnQuickTransform's new column's name, the first of "Prefix column", "Prefix column 1", ...
            const newId = (suggestedPrefix: string): ColumnId =>
            {
                const stem = IdentifierUtility.fixExpressionIdentifier(suggestedPrefix + " " + c.getRaw(), c.getRaw());
                let nextId = stem;
                for (let i = 1; i <= 1000; i++)
                {
                    if (!table.getData().getColumnIds().some(x => x.equals(new ColumnId(nextId))))
                        break;
                    nextId = IdentifierUtility.identNum(stem, i);
                }
                // If we reach 999, just go with that and let user fix it
                return new ColumnId(nextId);
            };
            const functionLookup = FunctionList.getFunctionLookup(tableManager.getUnitManager());
            let t: Table;
            switch (recipe)
            {
                case "sum":
                    t = new Aggregate(tableManager, details, table.getId(), [new Pair<ColumnId, Expression>(newId("Sum"), new CallExpression(functionLookup, Sum.NAME, IdentExpression.column(c)))], []);
                    break;
                case "average":
                    t = new Aggregate(tableManager, details, table.getId(), [new Pair<ColumnId, Expression>(newId("Average"), new CallExpression(functionLookup, Mean.NAME, IdentExpression.column(c)))], []);
                    break;
                case "frequency":
                    t = new Aggregate(tableManager, details, table.getId(), [new Pair<ColumnId, Expression>(newId("Freq"), IdentExpression.load(TypeState.GROUP_COUNT))], [c]);
                    break;
                case "sort":
                    t = new Sort(tableManager, details, table.getId(), [new Pair(c, Sort.Direction.ASCENDING)]);
                    break;
            }
            tableManager.record(t);
            return null;
        }
        catch (e)
        {
            return alertFor("error.adding.column", e);
        }
    }

    public copyAllValues(id: string, version: number): Promise<{ readonly content: Readonly<Record<string, string>> } | { readonly alert: EngineAlert } | null>
    {
        const table = this.current(id, version);
        if (table === null)
            return Promise.resolve(null);
        return new Promise(resolve =>
        {
            try
            {
                const columns = table.getData().getColumns().map(c => new Pair(c.getName(), c.getType()));
                ClipboardUtils.copyValuesToClipboard(this.tableManager.getUnitManager(), this.tableManager.getTypeManager(), columns,
                    () => new ClipboardUtils.RowRange(0, table.getData().getLength() - 1),
                    content => resolve({ content: Object.fromEntries(content) }),
                    copied => { if (!copied) resolve(null); });
            }
            catch (e)
            {
                resolve({ alert: alertFor("error.copying.values", e) });
            }
        });
    }

    public exporters(): readonly ExporterInfo[]
    {
        return ExporterManager.getInstance().getRegisteredExporters().map(e => ({ name: e.getName(), fileTypes: e.getSupportedFileTypes() }));
    }

    public exportTable(id: string, exporter: number): { readonly data: Uint8Array } | { readonly alert: EngineAlert }
    {
        const table = this.tables.get(id)?.table;
        const e = ExporterManager.getInstance().getRegisteredExporters()[exporter];
        try
        {
            if (table === undefined || e === undefined)
                throw new UserException("No such table or exporter");
            return { data: e.exportData(table) };
        }
        catch (err)
        {
            return { alert: alertFor("error.exporting", err) };
        }
    }

    // A new column's name, type and default value, from the GUI's column dialog
    private newColumn(details: NewColumnDetails): { readonly columnId: ColumnId, readonly dataType: DataType, readonly defaultValue: Value }
    {
        const dataType = TypeExpression.parseTypeExpression(details.type).toDataType(this.tableManager.getTypeManager());
        if (dataType === null)
            throw new UserException("Invalid type: " + details.type);
        const recognised = TableDisplayUtility.recogniser(dataType, true).recogniser.process(ParseProgress.fromStart(details.defaultValue), false).flatMap(s => s.requireEnd());
        const defaultValue = recognised.either<Value>(err => { throw new UserException(err.error.toPlain()); }, success => success.value);
        return { columnId: new ColumnId(details.columnName), dataType, defaultValue };
    }

    public copy(id: string, version: number, firstColumn: number, lastColumnIncl: number, rows: { readonly firstRow: number, readonly lastRowIncl: number } | null): Promise<Readonly<Record<string, string>> | null>
    {
        const table = this.current(id, version);
        if (table === null)
            return Promise.resolve(null);
        const columns = this.shownColumns(table).slice(firstColumn, lastColumnIncl + 1).map(c => new Pair(c.getName(), c.getType()));
        return new Promise(resolve =>
        {
            ClipboardUtils.copyValuesToClipboard(this.tableManager.getUnitManager(), this.tableManager.getTypeManager(), columns,
                () => rows === null ? new ClipboardUtils.RowRange(0, table.getData().getLength() - 1) : new ClipboardUtils.RowRange(rows.firstRow, rows.lastRowIncl),
                content => resolve(Object.fromEntries(content)),
                copied => { if (!copied) resolve(null); });
        });
    }

    public setPosition(id: string, column: number, row: number): void
    {
        const t = this.tables.get(id);
        if (t === undefined)
            return;
        const position = new CellPosition(CellPosition.row(row), CellPosition.col(column));
        if (this.positions.get(t.table)?.equals(position) === true)
            return;
        this.positions.set(t.table, position);
        this.tablesChanged();
        this.modified();
    }

    public canEdit(id: string, version: number, column: number, row: number): boolean
    {
        const table = this.current(id, version);
        const c = table === null ? undefined : this.shownColumns(table)[column];
        if (c === undefined)
            return false;
        try
        {
            const status = c.getEditableStatus();
            return status.editable && (status.checkEditable === null || status.checkEditable(row));
        }
        catch (e)
        {
            // (Java: an InternalException is logged and the edit goes ahead)
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
            return true;
        }
    }

    public edit(id: string, version: number, column: number, row: number, text: string): EditResult
    {
        const table = this.current(id, version);
        const c = table === null ? undefined : this.shownColumns(table)[column];
        if (table === null || c === undefined)
            return { kind: "stale" };
        // Java: RecogniserDocument.recognise(true): the value, or the text if it isn't one
        let value: Either<string, Value>;
        try
        {
            const recognised = TableDisplayUtility.recogniser(c.getType().getType(), true).recogniser.process(ParseProgress.fromStart(text), false).flatMap(s => s.requireEnd());
            value = recognised.either<Either<string, Value>>(() => Either.left(text), success => Either.right(success.value));
        }
        catch (e)
        {
            return { kind: "saved", cell: cellContent(c, column, row), alert: alertFor("error.storing.data", e) };
        }
        let alert = this.store(() => c.getType().setCollapsed(row, value));
        // Java: TableDisplay's onModify, View.modified
        this.modified();
        alert ??= this.reRun(table);
        return { kind: "saved", cell: cellContent(c, column, row), alert };
    }

    public deleteCells(id: string, version: number, firstColumn: number, lastColumnIncl: number, firstRow: number, lastRowIncl: number, shownFirstRow: number, shownLastRowExcl: number): { readonly shownFirst: number, readonly cells: readonly (readonly CellContent[])[], readonly alert: EngineAlert | null } | null
    {
        const table = this.current(id, version);
        if (table === null)
            return null;
        const columns = this.shownColumns(table).slice(firstColumn, lastColumnIncl + 1);
        let alert: EngineAlert | null = null;
        for (const c of columns)
        {
            // (Java: the cells' documents; a read-only one ignores it)
            if (!c.getEditableStatus().editable)
                continue;
            const defaultValue = c.getDefaultValue();
            if (defaultValue === null)
                continue;
            for (let row = firstRow; row <= lastRowIncl; row++)
                alert ??= this.store(() => c.getType().setCollapsed(row, Either.right(defaultValue)));
        }
        this.modified();
        alert ??= this.reRun(table);
        const shownFirst = Math.max(firstRow, shownFirstRow);
        const cells: CellContent[][] = [];
        for (let row = shownFirst; row <= Math.min(lastRowIncl, shownLastRowExcl - 1); row++)
            cells.push(columns.map((c, i) => cellContent(c, firstColumn + i, row)));
        return { shownFirst, cells, alert };
    }

    // Java: the Saver's FXUtility.alertOnError_ (a SilentCancelEditException just leaves the old value)
    private store(set: () => void): EngineAlert | null
    {
        try
        {
            set();
            return null;
        }
        catch (e)
        {
            if (e instanceof Transformation.SilentCancelEditException)
                return null;
            return alertFor("error.storing.data", e);
        }
    }

    // Java: TableDisplay's onModify, which re-runs the tables that depend on the table (and marks the
    // file as modified, which the callers do)
    private reRun(table: Table): EngineAlert | null
    {
        try
        {
            this.tableManager.reRun(table);
            return null;
        }
        catch (e)
        {
            return alertFor("error.updating.dependent.transformations", e);
        }
    }

    public length(id: string, version: number): number | null
    {
        return this.current(id, version)?.getData().getLength() ?? null;
    }

    public rows(id: string, version: number, firstRow: number, lastRowExcl: number): Promise<readonly (readonly CellContent[])[] | null>
    {
        return new Promise(resolve =>
        {
            this.rowsQueue.push({ id, version, firstRow, lastRowExcl, resolve });
            if (!this.rowsScheduled)
            {
                this.rowsScheduled = true;
                setTimeout(() => this.runRowsRequests(), 0);
            }
        });
    }

    public idle(): Promise<void>
    {
        // The engine's work (Workers) runs in timer tasks, as do Platform.runLater callbacks and rows
        // requests, so wait until a timer task finds nothing waiting:
        return new Promise(resolve =>
        {
            const check = (): void =>
            {
                if (Workers.getTaskList().length === 0 && this.rowsQueue.length === 0 && !this.tablesEventScheduled && !this.modifiedEventScheduled)
                    resolve();
                else
                    setTimeout(check, 1);
            };
            setTimeout(check, 0);
        });
    }

    private addTable(table: Table): void
    {
        this.tables.set(table.getId().getRaw(), { table, version: this.nextVersion++ });
        if (table instanceof ImmediateDataSource)
        {
            // Java: TableDisplay, the record set's listener: a change re-runs the tables that depend on
            // it (onModify), and rows or columns added or removed change the table's size
            const onModify = (): void =>
            {
                const alert = this.reRun(table);
                if (alert !== null)
                    this.sendEvent({ kind: "alert", alert });
                this.modified();
            };
            table.getData().setListener({
                modifiedDataItems: onModify,
                removedAddedRows: () =>
                {
                    this.resized(table);
                    onModify();
                },
                addedColumn: () => this.resized(table),
                removedColumn: () => this.resized(table),
            });
        }
        // Java: TableHat's listener, which remade a manual edit's hat when it was modified
        if (table instanceof ManualEdit)
            table.addModificationListener(() => this.tablesChanged());
        table.setDisplay({
            loadPosition: (position, display) =>
            {
                this.positions.set(table, position);
                this.displays.set(table, display);
            },
            getMostRecentPosition: () => this.position(table),
            getBottomRightIncl: () => this.position(table),
            // PORT-DEFERRED: offering a Manual Edit when a transformation's cell is edited (Phase 11, with
            // its PickManualEditIdentifierDialog); the edit is cancelled meanwhile, as in Java
            promptForTransformationEdit: () => {},
            getTable: () => table,
        });
        this.tablesChanged();
    }

    // The table's size or columns changed: it has a new version, for the GUI to fetch it again
    private resized(table: Table): void
    {
        const id = table.getId().getRaw();
        if (this.tables.get(id)?.table === table)
        {
            this.tables.set(id, { table, version: this.nextVersion++ });
            this.tablesChanged();
        }
    }

    private position(table: Table): CellPosition
    {
        // (Until the GUI places it; GridArea's position starts at the origin)
        return this.positions.get(table) ?? CellPosition.ORIGIN;
    }

    private current(id: string, version: number): Table | null
    {
        const t = this.tables.get(id);
        return t !== undefined && t.version === version ? t.table : null;
    }

    // Tables change several at a time (loading, re-running), so the event is sent once they're done:
    private tablesChanged(): void
    {
        if (this.tablesEventScheduled)
            return;
        this.tablesEventScheduled = true;
        setTimeout(() =>
        {
            this.tablesEventScheduled = false;
            const tables = [...this.tables.values()].map(t => this.tableInfo(t.table, t.version));
            const comments = [...this.comments].map(([c, id]) => ({
                id,
                column: c.getPosition().columnIndex,
                row: c.getPosition().rowIndex,
                bottomColumn: c.getBottomRight().columnIndex,
                bottomRow: c.getBottomRight().rowIndex,
                content: c.getContent(),
            }));
            this.sendEvent({ kind: "tables", tables, comments });
        }, 0);
    }

    // Several changes come together (loading, re-running), so the event is sent once they're done:
    private modified(): void
    {
        if (this.modifiedEventScheduled)
            return;
        this.modifiedEventScheduled = true;
        setTimeout(() =>
        {
            this.modifiedEventScheduled = false;
            this.sendEvent({ kind: "modified" });
        }, 0);
    }

    private sendEvent(event: EngineEvent): void
    {
        this.post({ kind: "event", event });
    }

    // Java: TableDisplay's displayColumns (TableDisplayUtility.makeStableViewColumns), the columns shown
    private shownColumns(table: Table): readonly Column[]
    {
        const display = this.displays.get(table) ?? new Pair<Table.Display, readonly ColumnId[]>(Table.Display.ALL, []);
        const selection = display.mapSecond(blackList => (c: ColumnId) => !blackList.some(b => b.equals(c)));
        return table.getData().getColumns().filter(c => c.shouldShow(selection));
    }

    private tableInfo(table: Table, version: number): TableInfo
    {
        let columnNames: string[] = [];
        let columnTypes: string[] = [];
        let columnEditable: boolean[] = [];
        let columnNumber: boolean[] = [];
        let columnStyles: (readonly string[])[] = [];
        let columnDeletable: boolean[] = [];
        let columnHeaderClasses: (readonly string[])[] = [];
        let columnAfter: (string | null)[] = [];
        let someAltered = false;
        let error: string | null = null;
        const operations = table.getOperations();
        try
        {
            const columns = this.shownColumns(table);
            columnNames = columns.map(c => c.getName().getRaw());
            columnTypes = columns.map(c => typeText(c));
            columnEditable = columns.map(c => c.getEditableStatus().editable);
            columnNumber = columns.map(c => isNumberType(c.getType().getType()));
            columnStyles = columns.map(c => TableDisplayUtility.stfStylesFor(c.getType().getType()));
            columnDeletable = columns.map(c => operations.deleteColumn(c.getName()) !== null);
            columnHeaderClasses = columns.map(c => c.getAlteredState() === Column.AlteredState.OVERWRITTEN ? ["column-title-overwritten"] : []);
            const all = table.getData().getColumns();
            columnAfter = columns.map(c =>
            {
                const index = all.indexOf(c);
                return index + 1 < all.length ? all[index + 1]!.getName().getRaw() : null;
            });
            // Java: headerMiddleClicked's count of altered columns
            const altered = all.filter(c => c.getAlteredState() !== Column.AlteredState.UNALTERED).length;
            someAltered = altered !== 0 && altered !== all.length;
        }
        catch (e)
        {
            error = toEngineError(e).message;
        }
        const position = this.positions.get(table);
        return {
            id: table.getId().getRaw(),
            version,
            kind: table instanceof DataSource ? "data" : "transformation",
            column: position?.columnIndex ?? 0,
            row: position?.rowIndex ?? 0,
            columnNames,
            columnTypes,
            columnEditable,
            columnNumber,
            columnStyles,
            canAppendRows: error === null && operations.appendRows !== null,
            canAddColumn: error === null && (table instanceof ImmediateDataSource || table instanceof Calculate),
            error,
            display: Table.Display[this.displays.get(table)?.getFirst() ?? Table.Display.ALL] as TableDisplayMode,
            someAltered,
            canRename: operations.renameTable !== null,
            canInsertRows: error === null && operations.insertRows !== null,
            canDeleteRows: error === null && operations.deleteRows !== null,
            columnDeletable,
            // (Java: any of a Calculate's columns, TransformationEdits.editColumn_Calc)
            // PORT-DEFERRED: editing Aggregate's columns by clicking their headers (Java:
            // TransformationEdits.editColumn_Agg, Phase 11)
            columnHeaderEditable: columnNames.map(() => table instanceof ImmediateDataSource || table instanceof Calculate),
            columnHeaderClasses,
            columnAfter,
            hat: table instanceof VisitableTransformation ? TableHat.content(this.tableManager, table) : null,
            calculate: table instanceof Calculate ? { src: table.getSrcTableId().getRaw() } : null,
        };
    }

    private runRowsRequests(): void
    {
        this.rowsScheduled = false;
        const queue = this.rowsQueue;
        this.rowsQueue = [];
        const counts = new Map<string, number>();
        // Newest first:
        for (let i = queue.length - 1; i >= 0; i--)
        {
            const r = queue[i]!;
            const n = counts.get(r.id) ?? 0;
            counts.set(r.id, n + 1);
            const table = this.current(r.id, r.version);
            if (table === null || n >= MAX_ROWS_REQUESTS_PER_TABLE)
            {
                r.resolve(null);
                continue;
            }
            const columns = this.shownColumns(table);
            const cells: CellContent[][] = [];
            for (let row = r.firstRow; row < r.lastRowExcl; row++)
                cells.push(columns.map((c, i) => cellContent(c, i, row)));
            r.resolve(cells);
        }
    }
}

// An expression for the GUI, saved as in a file (which the GUI loads, and saves for its editor)
function saveExpression(expression: Expression): string
{
    return expression.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
}

function typeText(column: Column): string
{
    try
    {
        return column.getType().getType().toString();
    }
    catch (e)
    {
        return toEngineError(e).message;
    }
}

// A stand-in for showing a cell, until Phase 8 brings Java's display rules (e.g. NumberColumnFormatter).
// Java: TableDisplayUtility.valueAndComponent gives number columns a NumberColumnFormatter
function isNumberType(type: DataType): boolean
{
    return type.apply<boolean>({
        number: () => true,
        text: () => false,
        date: () => false,
        bool: () => false,
        tagged: () => false,
        record: () => false,
        array: () => false,
    });
}

/** Java: EditorKitCache.ValueLoader.run, and the error position the cell's RecogniserDocument finds. */
function cellContent(column: Column, _columnIndex: number, row: number): CellContent
{
    try
    {
        return { kind: "value", text: DataTypeUtility.valueToString(column.getType().getCollapsed(row)) };
    }
    catch (e)
    {
        if (e instanceof InvalidImmediateValueException)
            return { kind: "invalid", text: e.getInvalid(), errorPosition: errorPosition(column, e.getInvalid()) };
        if (e instanceof InternalException)
            Log.log(e);
        if (e instanceof UserException || e instanceof InternalException)
        {
            const msg = e.getLocalizedMessage();
            return { kind: "error", text: msg === null ? TranslationUtility.getString("loading.error.nodetail") : TranslationUtility.getString("loading.error.detail", msg) };
        }
        throw e;
    }
}

// Where the column's recogniser finds an error in the text (Java: RecogniserDocument.recognise):
function errorPosition(column: Column, text: string): number | null
{
    try
    {
        const result = TableDisplayUtility.recogniser(column.getType().getType(), true).recogniser.process(ParseProgress.fromStart(text), false).flatMap(s => s.requireEnd());
        return result.either(err => err.errorPosition, () => null);
    }
    catch (e)
    {
        if (!(e instanceof InternalException || e instanceof UserException))
            throw e;
        return null;
    }
}

// Java: FXUtility.alertOnError_, which shows UserExceptions and InternalExceptions
function alertFor(titleKey: string, e: unknown, ...titleValues: string[]): EngineAlert
{
    if (!(e instanceof UserException || e instanceof InternalException))
        throw e;
    if (e instanceof InternalException)
        Log.log(e);
    return { title: TranslationUtility.getString(titleKey, ...titleValues), message: e.getLocalizedMessage() ?? "Unknown error" };
}

function toEngineError(e: unknown): EngineError
{
    if (e instanceof Error)
        return { name: e.name, message: e.message, stack: e.stack ?? null };
    return { name: "Error", message: String(e), stack: null };
}

let exportersRegistered = false;

// Java: Main's registering of the exporters (once, as the manager is shared)
function registerExporters(): void
{
    if (exportersRegistered)
        return;
    exportersRegistered = true;
    ExporterManager.getInstance().registerExporter(new CSVExporter());
    ExporterManager.getInstance().registerExporter(new HTMLExporter());
    ExporterManager.getInstance().registerExporter(new ExcelExporter());
    ExporterManager.getInstance().registerExporter(new RExporter());
}
