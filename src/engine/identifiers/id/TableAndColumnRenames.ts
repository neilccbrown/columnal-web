// Port of xyz.columnal.id.TableAndColumnRenames (identifiers module).
import { HashMap } from "../../java/HashMap.js";
import { javaEquals } from "../../java/JavaObject.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import type { ColumnId } from "./ColumnId.js";
import type { TableId } from "./TableId.js";

type RenameInfo = Pair<TableId | null, HashMap<ColumnId, ColumnId>>;

/**
 * A class keeping track of any pending table and/or column renames.  Column renames
 * are stored with a reference to the table that they originate from.
 *
 * Note that this class is mutable.  We save tables in dependency order, and let's imagine that we have:
 * A <- Sort <- ManualEdit <- Calculate <- Filter
 *
 * If you rename a column in A, the same column should be renamed in Sort
 * -- but it should also be renamed in the ManualEdit, and in the
 * Calculate and the Filter.  So each table, as it queries for its own
 * renames, passes the table id which defined the column, and this is
 * used to propagate renames to later tables, one step at a time.
 */
export class TableAndColumnRenames
{
    // Maps an old table id to a pair of:
    //  - possible new table id (null if unchanged)
    //  - map from old column ids to new column ids for that table
    //    if a column id is not present, it means it is unaffected.
    private readonly renames: HashMap<TableId, RenameInfo>;
    private readonly defaultTableId: TableId | null;

    // Java has a public constructor taking the renames, and a private one also taking
    // a default table id first.  PORT-NOTE: here the default table id is the optional second argument.
    public constructor(renames: Iterable<readonly [TableId, Pair<TableId | null, Iterable<readonly [ColumnId, ColumnId]>>]>, defaultTableId: TableId | null = null)
    {
        this.defaultTableId = defaultTableId;
        this.renames = new HashMap();
        for (const [t, p] of renames)
        {
            this.renames.set(t, p.mapSecond(m => new HashMap(m)));
        }
    }

    public tableId(tableId: TableId): TableId
    {
        const info = this.renames.get(tableId);
        if (info !== undefined && info.getFirst() !== null)
            return info.getFirst()!;
        else
            return tableId;
    }

    // Note: pass the OLD TableId, not the new one.  If you pass null, the default is used (if set)
    public columnId(oldTableId: TableId | null, columnId: ColumnId, columnNameOriginatesFromTableId: TableId | null): Pair<TableId | null, ColumnId>
    {
        let tableId: TableId;
        // If no table id known, no way to locate:
        if (oldTableId === null)
        {
            if (this.defaultTableId === null)
                return new Pair<TableId | null, ColumnId>(null, columnId);
            else
                tableId = this.defaultTableId;
        }
        else
            tableId = oldTableId;

        let info: RenameInfo | undefined = this.renames.get(tableId);
        let renamed: Pair<TableId | null, ColumnId>;
        if (info !== undefined)
        {
            renamed = info.map<TableId | null, ColumnId>(t =>
            {
                if (oldTableId === null && t !== null && javaEquals(t, this.defaultTableId))
                    return oldTableId;
                else
                    return t;
            }, c => c.getOrDefault(columnId, columnId));
        }
        else
            renamed = new Pair<TableId | null, ColumnId>(oldTableId, columnId);

        if (columnNameOriginatesFromTableId !== null && renamed.getSecond().equals(columnId))
        {
            // If it is not renamed in our table, check source table:
            // (Passing null as third param here prevents further recursion)
            const renamedInSource = this.columnId(columnNameOriginatesFromTableId, columnId, null).getSecond();
            if (!renamedInSource.equals(columnId))
            {
                // Propagate:
                if (info === undefined)
                {
                    info = new Pair<TableId | null, HashMap<ColumnId, ColumnId>>(null, new HashMap());
                    this.renames.set(tableId, info);
                }
                info.getSecond().set(columnId, renamedInSource);
                renamed = renamed.mapSecond(_c => renamedInSource);
            }
        }
        return renamed;
    }

    public static readonly EMPTY = new TableAndColumnRenames([]);

    // Note that this is copy operation, so any table registration
    // (of which columns are derived from which source table) is not stored in parent.
    // This is okay as it stands, because this method is only used
    // for passing column renames to expressions.
    public withDefaultTableId(tableId: TableId): TableAndColumnRenames
    {
        return new TableAndColumnRenames(this.renames, tableId);
    }

    // Are we renaming the given table, or any of its columns?
    public isRenamingTableId(tableId: TableId): boolean
    {
        const details = this.renames.get(tableId);
        return details !== undefined && (details.getFirst() !== null || details.getSecond().size !== 0);
    }

    // Copies all renames forward from srcTableId to id
    public useColumnsFromTo(srcTableId: TableId, id: TableId): void
    {
        this.renames.computeIfAbsent(id, _t => new Pair<TableId | null, HashMap<ColumnId, ColumnId>>(null, new HashMap()))
            .getSecond().setAll(this.renames.getOrDefault(srcTableId, new Pair<TableId | null, HashMap<ColumnId, ColumnId>>(null, new HashMap())).getSecond());
    }
}
