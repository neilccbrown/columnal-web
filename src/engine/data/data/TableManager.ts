// Port of xyz.columnal.data.TableManager (data module).
//
// PORT-NOTE: Java's `synchronized` blocks are dropped (there is one thread).  The identity hash
// sets of tables (Guava's Sets.newIdentityHashSet) are JS Sets: Java iterates them in an order
// that varies between runs, so no behaviour can depend on it.  The HashMaps and HashSets of table
// ids that are passed to GraphUtility.lineariseDAG use Java's hash order, as that decides the
// order of tables in a saved file and the order in which tables are re-run.
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { SaveTag } from "../../identifiers/id/SaveTag.js";
import { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../identifiers/id/TableId.js";
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import { HashMap, HashSet } from "../../java/HashMap.js";
import { javaParseDouble } from "../../java/JavaDouble.js";
import { javaEquals, javaObjectsHash } from "../../java/JavaObject.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { JavaRandom } from "../../java/JavaRandom.js";
import { NumberFormatException, javaParseInt, javaTrim } from "../../java/JavaString.js";
import { TreeMap } from "../../java/TreeMap.js";
import { DisplayLexer } from "../../parsers/generated/DisplayLexer.js";
import { DisplayParser } from "../../parsers/generated/DisplayParser.js";
import { MainLexer } from "../../parsers/generated/MainLexer.js";
import { MainLexer2 } from "../../parsers/generated/MainLexer2.js";
import { MainParser, type CommentContext, type TableContext } from "../../parsers/generated/MainParser.js";
import { MainParser2, type ContentContext } from "../../parsers/generated/MainParser2.js";
import { TableLexer2 } from "../../parsers/generated/TableLexer2.js";
import { TableParser2, type CommentContext as CommentContext2, type TableTransformationContext } from "../../parsers/generated/TableParser2.js";
import { GrammarUtility } from "../../parsers/grammar/GrammarUtility.js";
import { ExpressionVersion, getExpressionVersion, getMainVersion, MainVersion, OverallVersion } from "../../parsers/grammar/Versions.js";
import { TypeManager } from "../../types/data/datatype/TypeManager.js";
import { UnitManager } from "../../types/data/unit/UnitManager.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { SimulationConsumer } from "../../utility-functional/utility/function/simulation/SimulationConsumer.js";
import { ErrorHandler } from "../../utility/log/ErrorHandler.js";
import { Log } from "../../utility/log/Log.js";
import { GraphUtility } from "../../utility/utility/GraphUtility.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import { CellPosition } from "./CellPosition.js";
import { DataSource } from "./DataSources.js";
import { GridComment } from "./GridComment.js";
import type { PluggedContentHandler } from "./PluggedContentHandler.js";
import type { RenameOnEdit } from "./RenameOnEdit.js";
import { Settings } from "./Settings.js";
import { Table } from "./Table.js";
import type { TableOperations } from "./TableOperations.js";
import { Transformation } from "./Transformation.js";

/**
 * Created by neil on 14/11/2016.
 */
export class TableManager
{
    private static readonly RANDOM = new JavaRandom();
    private static settings: Settings | null = null;

    // We use a TreeMap here to have reliable ordering for tables, especially when saving:
    private readonly usedIds = new TreeMap<TableId, Set<Table>>();
    private readonly sources = new Set<DataSource>();
    private readonly transformations = new Set<Transformation>();
    private readonly comments: GridComment[] = [];
    private readonly unitManager: UnitManager;
    private readonly typeManager: TypeManager;
    private readonly listeners: TableManager.TableManagerListener[] = [];
    private readonly transformationLoader: TableManager.TransformationLoader;
    private readonly pluginManager: PluggedContentHandler;

    // R expressions are automatically run, which is dangerous as they could be modified by an external program, or especially
    // could be sent from an untrusted source then opened.  So we keep track of files we made and their hashes, and those files
    // are trusted.  Everything else is untrusted, which is done by banning R expressions during load, and keeping track of all
    // the banned ones.  They remain banned for the whole session until manually re-run or modified.
    private banningAllRExpressions = false;
    private readonly bannedRExpressions = new Set<string>();

    public constructor(transformationLoader: TableManager.TransformationLoader, pluggedContentHandler: PluggedContentHandler)
    {
        this.transformationLoader = transformationLoader;
        this.unitManager = new UnitManager();
        this.typeManager = new TypeManager(this.unitManager);
        this.pluginManager = pluggedContentHandler;
    }

    /**
     * PORT-DEFERRED: Java reads (and setSettings writes) the settings from a properties file in
     * the user's Columnal directory; storing them in the browser is for Phase 9.  Until then the
     * settings start as Java's defaults (no R path, use Columnal's R libraries).
     */
    public static getSettings(): Settings
    {
        if (TableManager.settings === null)
        {
            TableManager.settings = new Settings(null, true);
        }
        return TableManager.settings;
    }

    public static setSettings(settings: Settings): void
    {
        TableManager.settings = settings;
    }

    public getSingleTableOrNull(tableId: TableId): Table | null
    {
        const tables = this.usedIds.get(tableId);
        if (tables !== undefined && tables.size === 1)
            return tables.values().next().value!;
        else
            return null;
    }

    public getSingleTableOrThrow(tableId: TableId): Table
    {
        const t = this.getSingleTableOrNull(tableId);
        if (t === null)
            throw new UserException("Could not find table \"" + tableId.toString() + "\"");
        return t;
    }

    // Generates a new unused ID and registers it.
    public registerNextFreeId(): TableId
    {
        let id: TableId;
        // So GUID is very unlikely to be in use already, but no harm in checking:
        do
        {
            id = new TableId(IdentifierUtility.identNum("T" as ExpressionIdentifier, TableManager.RANDOM.nextInt(1_000_000)));
        }
        while (this.usedIds.has(id));
        // Reserve the spot for now:
        this.usedIds.set(id, new Set<Table>());
        return id;
    }

    public record<T extends Table>(table: T): T
    {
        let tablesForId = this.usedIds.get(table.getId());
        if (tablesForId === undefined)
        {
            tablesForId = new Set<Table>();
            this.usedIds.set(table.getId(), tablesForId);
        }
        if (tablesForId.size !== 0)
        {
            Log.logStackTrace("Adding duplicate table for table ID: " + table.getId().toString());
        }
        tablesForId.add(table);
        if (table instanceof DataSource)
        {
            if (!this.sources.has(table))
            {
                this.sources.add(table);
                this.listeners.forEach(l => l.addSource(table));
            }
        }
        else if (table instanceof Transformation)
        {
            if (!this.transformations.has(table))
            {
                this.transformations.add(table);
                this.listeners.forEach(l => l.addTransformation(table));
            }
        }

        // Re-run any dependents which might have been missing this table:
        try
        {
            this.editImpl<Table>(table.getId(), null, TableAndColumnRenames.EMPTY);
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
        }
        return table;
    }

    public getUnitManager(): UnitManager
    {
        return this.unitManager;
    }

    public static detectVersion(completeSrc: string): OverallVersion
    {
        // Bit of manual parsing to find file version:
        const lines = completeSrc.split(/\r?\n/).map(s => javaTrim(s)).filter(s => s.length !== 0)[Symbol.iterator]();
        let next = lines.next();
        if (!next.done)
        {
            const top = next.value;
            next = lines.next();
            if (top === "COLUMNAL" && !next.done)
            {
                const version = next.value;
                if (version.startsWith("VERSION"))
                {
                    try
                    {
                        const v = javaParseInt(javaTrim(version.substring("COLUMNAL".length)));
                        switch (v)
                        {
                            case 1: return OverallVersion.ONE;
                            case 2: return OverallVersion.TWO;
                            case 3: return OverallVersion.THREE;
                            default:
                                throw new UserException("Unknown file version: " + version + "; you may need to update Columnal to the latest version to read this file.");
                        }
                    }
                    catch (e)
                    {
                        if (!(e instanceof NumberFormatException))
                            throw e;
                        // Not a number, fall through to error
                    }
                }
            }
        }
        throw new UserException("Cannot locate file version; corrupt file or not a Columnal file?");
    }

    // Throws exception if not OK
    public checkROKToRun(rExpression: string): void
    {
        // This is called while loading the R transformation, so if we're in banning mode, ban this one too:
        if (this.banningAllRExpressions)
        {
            this.bannedRExpressions.add(rExpression);
        }

        // It's ok if it's not explicitly banned
        if (this.bannedRExpressions.has(rExpression))
        {
            throw new UserException("R expression in untrusted file; click the circular arrow above to run");
        }
    }

    public setBanAllR(banAllR: boolean): void
    {
        this.banningAllRExpressions = banAllR;
    }

    public unban(rExpression: string): void
    {
        this.bannedRExpressions.delete(rExpression);
    }

    public isBannedRExpression(rExpression: string): boolean
    {
        return this.bannedRExpressions.has(rExpression);
    }

    public loadAll(completeSrc: string, setColumnWidths: SimulationConsumer<readonly Pair<number, number>[]>): TableManager.Loaded
    {
        const version = TableManager.detectVersion(completeSrc);
        const loaded: Table[] = [];
        const errors: StyledString[] = [];
        const exceptions: unknown[] = [];
        if (getMainVersion(version) === MainVersion.ONE)
        {
            const file = Utility.parseAsOne(completeSrc, s => new MainLexer(s), t => new MainParser(t), p => p.file());
            this.unitManager.clearAllUser();
            this.unitManager.loadUserUnits(Utility.getDetail(file.units().detail()));
            this.typeManager.clearAllUser();
            this.typeManager.loadTypeDecls(Utility.getDetail(file.types().detail()));
            const ids = [...this.usedIds.keys()];
            for (const id of ids)
            {
                this.remove(id);
            }


            for (const topLevelItemContext of file.topLevelItem())
            {
                const table = topLevelItemContext.table();
                if (table !== null)
                    this.loadOneTable(table, getExpressionVersion(version)).either_(e => exceptions.push(e), t => loaded.push(t));
                const comment = topLevelItemContext.comment();
                if (comment !== null)
                    this.loadComment(SaveTag.generateRandom(), comment).either_(e => exceptions.push(e), c =>
                    {
                        this.comments.push(c);
                        this.listeners.forEach(l => l.addComment(c));
                    });
            }

            const display = file.display();
            if (display !== null)
            {
                const displayDetail = Utility.getDetail(display.detail());
                this.parseDisplayDetail(setColumnWidths, displayDetail);
            }
        }
        else if (getMainVersion(version) === MainVersion.TWO)
        {
            const file = Utility.parseAsOne(completeSrc, s => new MainLexer2(s), t => new MainParser2(t), p => p.file());

            const contentHandlers = new Map<string, SimulationConsumer<Pair<SaveTag, string>>>();
            this.typeManager.clearAllUser();
            this.unitManager.clearAllUser();
            const ids = [...this.usedIds.keys()];
            for (const id of ids)
            {
                this.remove(id);
            }
            contentHandlers.set("TYPES", tagAndContent =>
            {
                this.typeManager.loadTypeDecls(tagAndContent.getSecond());
            });
            contentHandlers.set("UNITS", tagAndContent =>
            {
                this.unitManager.loadUserUnits(tagAndContent.getSecond());
            });

            contentHandlers.set("DATA", tagAndContent =>
            {
                const data = this.loadOneDataTable(tagAndContent);
                loaded.push(data);
            });

            contentHandlers.set("TRANSFORMATION", tagAndContent =>
            {
                const trans = this.loadOneTransformation(tagAndContent, getExpressionVersion(version));
                loaded.push(trans);
            });

            contentHandlers.set("COMMENT", tagAndContent =>
            {
                this.loadComment(tagAndContent.getFirst(), Utility.parseAsOne(tagAndContent.getSecond(), s => new TableLexer2(s), t => new TableParser2(t), p => p.comment())).either_(e => exceptions.push(e), c =>
                {
                    this.comments.push(c);
                    this.listeners.forEach(l => l.addComment(c));
                });
            });
            contentHandlers.set("DISPLAY", tagAndContent =>
            {
                this.parseDisplayDetail(setColumnWidths, tagAndContent.getSecond());
            });

            for (const [key, value] of this.pluginManager.getHandledContent(e => errors.push(e)))
            {
                if (contentHandlers.has(key))
                {
                    errors.push(StyledString.s("Plugin error: handled content " + key + " clashes with built-in content."));
                }
                else
                    contentHandlers.set(key, value);
            }

            for (const contentContext of file.content())
            {
                const contentType = contentContext.ATOM(0)!.getText();
                const handler = contentHandlers.get(contentType);
                if (handler === undefined)
                {
                    // TODO give warning, but keep content for writing again
                }
                else
                {
                    try
                    {
                        handler(new Pair(new SaveTag(contentContext.detail()), Utility.getDetail(contentContext.detail())));
                    }
                    catch (e)
                    {
                        exceptions.push(e);
                    }
                }
            }
        }
        else
        {
            throw new UserException("Unknown file version: " + String(version) + "; corrupt file or not a Columnal file?");
        }

        if (exceptions.length === 0)
            return new TableManager.Loaded([...errors], [...loaded], [...this.comments]);
        else if (exceptions[0] instanceof UserException)
            throw new UserException("Loading problem", exceptions[0]);
        else if (exceptions[0] instanceof InternalException)
            throw new InternalException("Loading problem", exceptions[0]);
        else
            throw new InternalException("Unrecognised exception", exceptions[0]);
    }

    private loadOneTransformation(tagAndContent: Pair<SaveTag, string>, expressionVersion: ExpressionVersion): Transformation
    {
        const trans = Utility.parseAsOne(tagAndContent.getSecond(), s => new TableLexer2(s), t => new TableParser2(t), p => p.tableTransformation());
        return this.transformationLoader.loadOne(this, tagAndContent.getFirst(), trans, expressionVersion);
    }

    private loadOneDataTable(tagAndContent: Pair<SaveTag, string>): Table
    {
        const table = Utility.parseAsOne(tagAndContent.getSecond(), s => new TableLexer2(s), t => new TableParser2(t), p => p.tableData());
        return DataSource.loadOne(this, tagAndContent.getFirst(), table);
    }

    public parseDisplayDetail(setColumnWidths: SimulationConsumer<readonly Pair<number, number>[]>, displayDetail: string): void
    {
        const widths: Pair<number, number>[] = [];
        const displayDetails = Utility.parseAsOne(displayDetail, s => new DisplayLexer(s), t => new DisplayParser(t), p => p.globalDisplayDetails());
        for (const columnWidthContext of displayDetails.columnWidth())
        {
            try
            {
                const columnIndex = javaParseInt(columnWidthContext.item(0)!.getText());
                const columnWidth = javaParseDouble(columnWidthContext.item(1)!.getText());
                widths.push(new Pair(columnIndex, columnWidth));
            }
            catch (e)
            {
                if (!(e instanceof NumberFormatException))
                    throw e;
                // Not a big deal, log but don't worry user
                Log.log(e);
            }
        }
        setColumnWidths(widths);
    }

    // Java has two overloads, for MainParser.CommentContext and TableParser2.CommentContext, with the same body.
    public loadComment(saveTag: SaveTag, commentContext: CommentContext | CommentContext2): Either<unknown, GridComment>
    {
        const comment = GrammarUtility.processEscapes(javaTrim(Utility.getDetail(commentContext.detail())), false);

        const items = Utility.parseAsOne(Utility.getDetail(commentContext.display().detail()), s => new DisplayLexer(s), t => new DisplayParser(t), p =>
        {
            try
            {
                return p.commentDisplayDetails().item().map(i => javaParseInt(i.getText()));
            }
            catch (e)
            {
                if (!(e instanceof NumberFormatException))
                    throw e;
                throw new UserException("Problem parsing comment position", e);
            }
        });

        return Either.right(new GridComment(saveTag, comment, new CellPosition(items[1]!, items[0]!), items[2]!, items[3]!));
    }

    public loadOneTable(tableContext: TableContext, expressionVersion: ExpressionVersion): Either<unknown, Table>
    {
        if (tableContext.dataSource() !== null)
        {
            try
            {
                return Either.right(DataSource.loadOne(this, tableContext));
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                Log.log(e);
                return Either.left(e);
            }
        }
        else if (tableContext.transformation() !== null)
        {
            try
            {
                return Either.right(this.transformationLoader.loadOne(this, tableContext, expressionVersion));
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                Log.log(e);
                return Either.left(e);
            }
        }
        return Either.left(new UserException("Unknown table type"));
    }

    public getTypeManager(): TypeManager
    {
        return this.typeManager;
    }

    public save(destination: JavaFile | null, saver: Table.Saver): void
    {
        this.unitManager.save().forEach(u => saver.saveUnit(u));
        this.typeManager.save().forEach(t => saver.saveType(t));
        const values = HashMap.javaOrder<TableId, TablesWithSameId>();
        // Deep copy:
        for (const [key, tables] of this.usedIds.entries())
        {
            values.set(key, new TablesWithSameId(key, tables));
        }

        const incomingEdges = HashMap.javaOrder<TablesWithSameId, TablesWithSameId[]>();
        for (const tablesWithSameId of values.values())
        {
            for (const table of tablesWithSameId.tables)
            {
                if (table instanceof Transformation)
                {
                    for (const srcId of table.getSources())
                    {
                        const dest = values.get(srcId);
                        // Avoid any that have a circular edge:
                        if (dest !== undefined && !srcId.equals(tablesWithSameId.id))
                        {
                            const incoming = incomingEdges.computeIfAbsent(dest, _k => []);
                            incoming.push(tablesWithSameId);
                        }
                    }
                }
            }
        }


        const ordered = GraphUtility.lineariseDAG([...values.values()], incomingEdges, []);
        // lineariseDAG makes all edges point forwards, but we want them pointing backwards
        // so reverse:
        ordered.reverse();
        for (const tables of ordered)
        {
            for (const table of tables.tables)
            {
                table.save(destination, saver, TableAndColumnRenames.EMPTY);
            }
        }

        for (const comment of this.comments)
        {
            comment.save(saver);
        }
    }

    public getAllTablesAvailableTo(tableId: TableId | null, includeSelf: boolean): Table[]
    {
        // Sources are always available.  Transformations require that they do not
        // (transitively) depend on us.
        const edges = HashMap.javaOrder<TableId, Iterable<TableId>>();
        const allIds = HashSet.javaOrder<TableId>();
        this.fetchIdsAndEdges(edges, allIds);
        const linearised = GraphUtility.lineariseDAG(allIds, edges, tableId === null ? [] : [tableId]);
        let lastIndexIncl = tableId !== null ? linearised.findIndex(t => t.equals(tableId)) : linearised.length - 1;
        if (lastIndexIncl === -1)
            lastIndexIncl = linearised.length - 1;
        // Shouldn't be any nulls but must satisfy type checker:
        return Utility.filterOutNulls(linearised.slice(0, lastIndexIncl + 1)
            .filter(id => includeSelf || !id.equals(tableId))
            .map(t => this.getSingleTableOrNull(t)));
    }

    public getAllTables(): Table[]
    {
        return [...this.sources, ...this.transformations];
    }

    /**
     * Finds a suitable position for a table inserted to the
     * right of the given position, or at the far right-hand end
     */
    public getNextInsertPosition(toRightOf: TableId | null): CellPosition
    {
        let toRightOfDisplay = toRightOf === null ? null : (this.getSingleTableOrNull(toRightOf)?.getDisplay() ?? null);
        if (toRightOfDisplay === null)
        {
            let max: CellPosition | null = null;
            for (const d of Utility.filterOutNulls(this.getAllTables().map(t => t.getDisplay())))
            {
                const p = this.getTopRight(d);
                // Stream.max keeps the last of equal maxima
                if (max === null || p.columnIndex >= max.columnIndex)
                    max = p;
            }
            return (max ?? CellPosition.ORIGIN).offsetByRowCols(1, 1);
        }
        else
        {
            // We usually leave a blank space to the right
            // of the table, unless there's another table beginning in that column:
            let tableToRight: Table.TableDisplayBase | null = toRightOfDisplay;
            do
            {
                toRightOfDisplay = tableToRight;
                const nextCol: number = toRightOfDisplay.getBottomRightIncl().offsetByRowCols(0, 1).columnIndex;
                tableToRight = this.getAllTables().map(t => t.getDisplay()).find(d => d !== null && d.getMostRecentPosition().columnIndex === nextCol) ?? null;
            }
            while (tableToRight !== null);

            return this.getTopRight(toRightOfDisplay).offsetByRowCols(0, 1);
        }
    }

    private getTopRight(display: Table.TableDisplayBase): CellPosition
    {
        return new CellPosition(display.getMostRecentPosition().rowIndex, display.getBottomRightIncl().columnIndex);
    }

    public addComment(comment: GridComment): void
    {
        this.comments.push(comment);
        this.listeners.forEach(l => l.addComment(comment));
    }

    public removeComment(comment: GridComment): void
    {
        // Java's List.remove(Object), which compares with equals
        const index = this.comments.findIndex(c => c.equals(comment));
        if (index !== -1)
            this.comments.splice(index, 1);
        this.listeners.forEach(l => l.removeComment(comment));
    }

    public edit<T extends Table>(oldTable: Table, makeReplacement: (newTableId: TableId) => T, renameOnEdit: RenameOnEdit): T
    {
        const newTableId = renameOnEdit(oldTable);
        return this.editImpl(oldTable.getId(), () => makeReplacement(newTableId), oldTable.getId().equals(newTableId) ? TableAndColumnRenames.EMPTY : new TableAndColumnRenames([[oldTable.getId(), new Pair<TableId | null, Iterable<readonly [ColumnId, ColumnId]>>(newTableId, [])]]));
    }

    public reRun(table: Table): void
    {
        this.editImpl<Table>(table.getId(), null, TableAndColumnRenames.EMPTY);
    }

    public editData<T extends Table>(affectedTableId: TableId | null, makeReplacement: TableManager.TableMaker<T>, renames: TableAndColumnRenames): T;
    public editData(affectedTableId: TableId | null, makeReplacement: null, renames: TableAndColumnRenames): null;
    public editData<T extends Table>(affectedTableId: TableId | null, makeReplacement: TableManager.TableMaker<T> | null, renames: TableAndColumnRenames): T | null
    {
        return this.editImpl(affectedTableId, makeReplacement, renames);
    }

    /**
     * When you edit a table, we must update all dependent tables.  The way we do this
     * is to work out what all the dependent tables *are*, then save them as a script.
     * Then all dependent tables are removed, and the edited table is replaced.
     * The saved scripts are then re-run with the new data (which may mean they
     * contain errors where they did not before)
     *
     * @param affectedTableId The TableId which is affected, i.e. the table for which all dependents will need to be re-run/
     *                        If makeReplacement is non-null, this table will be removed
     * @param makeReplacement If null, existing table will be
     *                        left untouched (apart from renames) and only its dependents re-run.  If non-null,
     *                        the table will be replaced by output
     *                        of this supplier (and its dependents re-run).
     * @param renames         The tables to rename, and columns within them to rename if you use a reference to them.
     *
     * @throws InternalException
     * @throws UserException
     */
    private editImpl<T extends Table>(affectedTableId: TableId | null, makeReplacement: TableManager.TableMaker<T>, renames: TableAndColumnRenames): T;
    private editImpl<T extends Table>(affectedTableId: TableId | null, makeReplacement: TableManager.TableMaker<T> | null, renames: TableAndColumnRenames): T | null;
    private editImpl<T extends Table>(affectedTableId: TableId | null, makeReplacement: TableManager.TableMaker<T> | null, renames: TableAndColumnRenames): T | null
    {
        const affected = HashSet.javaOrder<TableId>();
        // If it is null, new table, so nothing should be affected:
        if (affectedTableId !== null)
            affected.add(affectedTableId);
        const edges = HashMap.javaOrder<TableId, Iterable<TableId>>();
        const allIds = HashSet.javaOrder<TableId>();
        this.fetchIdsAndEdges(edges, allIds);
        for (const a of affected)
            allIds.add(a);
        const linearised = GraphUtility.lineariseDAG(allIds, edges, [...affected]);

        // Find first affected:
        let processFrom = -1;
        for (const o of affected)
        {
            const index = linearised.findIndex(t => t.equals(o));
            if (processFrom === -1 || index < processFrom)
                processFrom = index;
        }
        // If it's not in affected itself, serialise it:
        const reRun: string[] = [];
        let toSave = 1; // Keep one extra until we've lined up all jobs
        // Java: a CompletableFuture<List<String>> savedToReRun, completed once all the
        // dependents have been saved, whose thenAccept re-adds them.
        let savedToReRun: string[] | null = null;
        let thenAccept: ((ss: string[]) => void) | null = null;
        const complete = (ss: string[]): void =>
        {
            if (savedToReRun !== null)
                return;
            savedToReRun = ss;
            if (thenAccept !== null)
                thenAccept(ss);
        };

        if (processFrom !== -1)
        {
            for (let i = processFrom; i < linearised.length; i++)
            {
                const id = linearised[i]!;
                // Don't include the original changed transformation itself, unless it got renamed:
                if (!affected.has(id) || (makeReplacement === null && renames.isRenamingTableId(id)))
                {
                    // Add job:
                    toSave += 1;
                    this.removeAndSerialise(id, new class extends Table.BlankSaver
                    {
                        // Ignore types and units because they are all already loaded
                        public override saveTable(script: string): void
                        {
                            reRun.push(script);
                            if (--toSave === 0)
                            {
                                // Saved all of them
                                complete(reRun);
                            }
                        }
                    }(), renames);
                }
            }
        }
        if (--toSave === 0) // Remove extra; can complete now when hits zero
        {
            complete(reRun);
        }

        let newTable: T | null = null;
        if (makeReplacement !== null)
        {
            if (affectedTableId !== null)
                this.removeAndSerialise(affectedTableId, new Table.BlankSaver(), renames);
            newTable = makeReplacement();
            this.record(newTable);
        }

        thenAccept = ss =>
        {
            this.reAddAll(ss);
        };
        if (savedToReRun !== null)
            thenAccept(savedToReRun);

        return newTable;
    }

    public fetchIdsAndEdges(edges: HashMap<TableId, Iterable<TableId>>, allIds: HashSet<TableId>): void
    {
        for (const t of this.sources)
            allIds.add(t.getId());
        for (const t of this.transformations)
        {
            allIds.add(t.getId());
            edges.set(t.getId(), t.getSources());
        }
    }

    /**
     * Removes the given table, saving a script to reproduce it
     * in the given Saver.
     */
    private removeAndSerialise(tableId: TableId, then: Table.Saver | null, renames: TableAndColumnRenames): void
    {
        //Log.normalStackTrace("Removing table " + tableId + (then == null ? " permanently" : " as part of edit"), 3);
        let removed: Table | null = null;
        for (const t of this.sources)
        {
            if (t.getId().equals(tableId))
            {
                this.sources.delete(t);
                removed = t;
                break;
            }
        }
        // Otherwise check transformations:
        if (removed === null)
        {
            for (const t of this.transformations)
            {
                if (t.getId().equals(tableId))
                {
                    this.transformations.delete(t);
                    removed = t;
                    break;
                }
            }
        }

        const remainingCount = this.sources.size + this.transformations.size;
        if (removed !== null)
        {
            const tables = this.usedIds.get(tableId);
            if (tables !== undefined)
            {
                tables.delete(removed);
                if (tables.size === 0)
                    this.usedIds.delete(tableId);
            }
            for (const l of this.listeners)
            {
                l.removeTable(removed, remainingCount);
            }
            if (then !== null)
                removed.save(null, then, renames);
        }
    }

    // Removes the table from the data and from the display.
    public remove(tableId: TableId): void
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the anonymous class's outer instance
        const outer = this;
        this.removeAndSerialise(tableId, new class extends Table.BlankSaver
        {
            public override saveTable(_tableSrc: string): void
            {
                // Re-run dependents:
                try
                {
                    outer.editImpl<Table>(tableId, null, TableAndColumnRenames.EMPTY /* no rename when removing */);
                }
                catch (e)
                {
                    if (!(e instanceof InternalException))
                        throw e;
                    Log.log(e);
                }
            }
        }(), TableAndColumnRenames.EMPTY);
    }

    /**
     * Re-runs the list of scripts to re-insert a set of transformations.
     *
     * They will be re-run in order, so it is important to pass them in
     * an order where each item only depends on those before it in the list.
     */
    private reAddAll(scripts: readonly string[]): void
    {
        for (const script of scripts)
        {
            Log.debug("Reloading:\n" + script);
            ErrorHandler.getErrorHandler().alertOnError_(TranslationUtility.getString("error.rerunning.transformations"), () =>
            {
                const ctxt: ContentContext = Utility.parseAsOne(script, s => new MainLexer2(s), t => new MainParser2(t), (p: MainParser2) => p.content());
                if (ctxt.ATOM(0)!.getText() === "DATA")
                    this.loadOneDataTable(new Pair<SaveTag, string>(new SaveTag(ctxt.detail()), Utility.getDetail(ctxt.detail())));
                else if (ctxt.ATOM(0)!.getText() === "TRANSFORMATION")
                    this.loadOneTransformation(new Pair<SaveTag, string>(new SaveTag(ctxt.detail()), Utility.getDetail(ctxt.detail())), ExpressionVersion.latest());
            });
        }
    }

    /**
     * Is the given id available?
     * @param tableId
     * @param similarIds If you pass a non-null list, it will be filled with any ids
     *                   deemed similar (e.g. differ only in case)
     * @return
     */
    public isFreeId(tableId: TableId, similarIds: TableId[] | null): boolean
    {
        if (similarIds !== null)
        {
            for (const t of this.usedIds.keys())
            {
                if (t.getRaw().toLowerCase() === tableId.getRaw().toLowerCase())
                    similarIds.push(t);
            }
        }
        return !this.usedIds.has(tableId);
    }

    public getRenameTableOperation(table: Table): TableOperations.RenameTable
    {
        return newName =>
        {
            ErrorHandler.getErrorHandler().alertOnError_(TranslationUtility.getString("error.renaming.table"), () =>
            {
                this.editImpl<Table>(table.getId(), null, new TableAndColumnRenames([[table.getId(), new Pair<TableId | null, Iterable<readonly [ColumnId, ColumnId]>>(newName, [])]]));
            });
        };
    }

    public addListener(listener: TableManager.TableManagerListener): void
    {
        this.listeners.push(listener);
    }
}

export namespace TableManager
{
    export class Loaded
    {
        public readonly errors: readonly StyledString[];
        public readonly loadedTables: readonly Table[];
        public readonly gridComments: readonly GridComment[];

        public constructor(errors: readonly StyledString[], loadedTables: readonly Table[], gridComments: readonly GridComment[])
        {
            this.errors = errors;
            this.loadedTables = loadedTables;
            this.gridComments = gridComments;
        }

        public equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof Loaded)) return false;
            const loaded = o;
            return javaEquals(this.errors, loaded.errors) &&
                    javaEquals(this.loadedTables, loaded.loadedTables) &&
                    javaEquals(this.gridComments, loaded.gridComments);
        }

        public hashCode(): number
        {
            return javaObjectsHash(this.errors, this.loadedTables, this.gridComments);
        }
    }

    /** Java: a functional interface */
    export type TableMaker<T extends Table> = () => T;

    export interface TableManagerListener
    {
        removeTable(t: Table, tablesRemaining: number): void;

        addSource(dataSource: DataSource): void;

        addTransformation(transformation: Transformation): void;

        addComment(gridComment: GridComment): void;

        removeComment(gridComment: GridComment): void;
    }

    export interface TransformationLoader
    {
        loadOne(mgr: TableManager, table: TableContext, expressionVersion: ExpressionVersion): Transformation;

        loadOne(mgr: TableManager, saveTag: SaveTag, table: TableTransformationContext, expressionVersion: ExpressionVersion): Transformation;
    }
}

class TablesWithSameId
{
    public readonly id: TableId;
    public readonly tables: readonly Table[];

    public constructor(id: TableId, tables: Iterable<Table>)
    {
        this.id = id;
        this.tables = [...tables];
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TablesWithSameId)) return false;

        const that = o;

        return this.id.equals(that.id);
    }

    public hashCode(): number
    {
        return this.id.hashCode();
    }
}
