// Port of test.TTableUtil (tests-tables testFixtures).
// PORT-NOTE: StreamEx streams become generators.
import { Column } from "../../../../src/engine/data/data/Column.js";
import type { RecordSet } from "../../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../../src/engine/data/data/Table.js";
import type { TableManager } from "../../../../src/engine/data/data/TableManager.js";
import { TreeMap } from "../../../../src/engine/java/TreeMap.js";
import { Pair } from "../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../src/engine/utility-error/error/InternalException.js";
import { UserException } from "../../../../src/engine/utility-error/error/UserException.js";
import { TaggedValue } from "../../../../src/engine/utility/utility/TaggedValue.js";
import { ListEx, Utility } from "../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../src/engine/utility/utility/Value.js";

export class TTableUtil
{
    // Java has two overloads: streamFlattened(Column) gives the column's values, and
    // streamFlattened(RecordSet) gives each row with its index.
    public static streamFlattened(column: Column): Generator<Value>;
    public static streamFlattened(src: RecordSet): Generator<Pair<number, Value[]>>;
    public static *streamFlattened(src: Column | RecordSet): Generator<Value | Pair<number, Value[]>>
    {
        if (src instanceof Column)
        {
            for (let nextIndex = 0; src.indexValid(nextIndex); nextIndex++)
                yield src.getType().getCollapsed(nextIndex);
            return;
        }
        for (let nextIndex = 0; src.indexValid(nextIndex); nextIndex++)
        {
            const collapsed = src.getColumns()/*.sorted(Comparator.comparing(Column::getName))*/.map(c => c.getType().getCollapsed(nextIndex));
            yield new Pair(nextIndex, collapsed);
        }
    }

    public static save(tableManager: TableManager): string
    {
        try
        {
            const saver = new Table.FullSaver(null);
            tableManager.save(null, saver);
            return saver.getCompleteFile();
        }
        catch (t)
        {
            console.error(t);
            return "";
        }
    }

    // Java has two overloads: getRowFreq(Stream<List<Object>>) and getRowFreq(RecordSet).
    public static getRowFreq(src: Iterable<readonly Value[]> | RecordSet): TreeMap<readonly Value[], number>
    {
        if (!(Symbol.iterator in src))
            return TTableUtil.getRowFreq([...TTableUtil.streamFlattened(src)].map(p => p.getSecond()));
        const r = new TreeMap<readonly Value[], number>([], (a, b) =>
        {
            if (a.length !== b.length)
                return a.length - b.length;
            for (let i = 0; i < a.length; i++)
            {
                const cmp = Utility.compareValues(a[i]!, b[i]!);
                if (cmp !== 0)
                    return cmp;
            }
            return 0;
        });
        for (const row of src)
        {
            r.compute(row, (_k, v) => v === null || v === undefined ? 1 : v + 1);
        }
        return r;
    }

    // Java has two overloads: toString(Object value) and toString(Column).
    public static toString(value: Value | Column): string
    {
        if (value instanceof Column)
        {
            let sb = "[";
            const t = value.getType();
            for (let i = 0; i < value.getLength(); i++)
            {
                if (i !== 0)
                    sb += ", ";
                sb += TTableUtil.toString(t.getCollapsed(i));
            }
            sb += "]";
            return sb;
        }
        if (value instanceof ListEx)
        {
            let sb = "[";
            const list = value;
            try
            {
                for (let i = 0; i < list.size(); i++)
                {
                    if (i !== 0)
                        sb += ", ";
                    sb += TTableUtil.toString(list.get(i));
                }
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                sb += "ERROR...";
            }
            sb += "]";
            return sb;
        }
        else if (value instanceof TaggedValue)
        {
            const t = value;
            const inner = t.getInner();
            return t.getTagIndex() + (inner === null ? "" : ":" + TTableUtil.toString(inner));
        }
        else
            return value.toString();
    }
}
