// Port of xyz.columnal.utility.DumbObjectPool (utility module).
import { javaCompare, javaEquals, type Comparator } from "../../java/JavaObject.js";
import { InternalException } from "../../utility-error/error/InternalException.js";

/**
 * A string pool which keeps in every String it is given up to a limit
 * after which no new Strings are added.
 *
 * This may seem dangerous, but it only slightly increases memory usage
 * (if the String is kept in memory forever, it just adds one extra reference
 * size to that String) and most columns are unlikely to have huge numbers
 * of completely distinct Strings.
 */
export class DumbObjectPool<T>
{
    private readonly comparator: Comparator<T>;
    private items: T[] = [];
    private readonly limit: number;

    // Java: DumbObjectPool(Class<T> cls, int limit, @Nullable Comparator<T> comparator); a null
    // comparator means natural ordering.
    public constructor(limit: number, comparator: Comparator<T> | null)
    {
        this.limit = limit;
        this.comparator = comparator ?? javaCompare;
    }

    // Arrays.binarySearch: the index if found, else (-(insertion point) - 1).
    private binarySearch(s: T): number
    {
        let low = 0;
        let high = this.items.length - 1;
        while (low <= high)
        {
            const mid = (low + high) >>> 1;
            const cmp = this.comparator(this.items[mid]!, s);
            if (cmp < 0)
                low = mid + 1;
            else if (cmp > 0)
                high = mid - 1;
            else
                return mid;
        }
        return -(low + 1);
    }

    /**
     * Gets a String of equal content, using the stringPool if appropriate;
     */
    public pool(s: T): T
    {
        let index = this.binarySearch(s);
        if (index >= 0)
        {
            const found = this.items[index]!;
            if (javaEquals(found, s))
                return found;
            else
                throw new InternalException("Object found in pool yet does not satisfy equals: " + String(found) + " vs " + String(s));
        }
        // Change to insertion point:
        index = ~index;
        if (this.items.length < this.limit)
        {
            this.items.splice(index, 0, s);
        }
        return s;
    }

    public isFull(): boolean
    {
        return this.items.length >= this.limit;
    }

    public get(): T[]
    {
        return [...this.items];
    }
}
