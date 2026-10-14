// Java's TreeMap and TreeSet: maps and sets kept sorted by a comparator (by default the
// natural ordering, javaCompare).  Keys are equal when the comparator returns 0, as in Java.
//
// PORT-NOTE: stored as a sorted array with binary search rather than a red-black tree;
// the maps ported code builds are small (e.g. the units in a unit expression).
import { javaCompare, javaEquals, javaHashCode, type Comparator } from "./JavaObject.js";
import { isMapLike, type ReadonlyMapLike } from "./HashMap.js";

export class TreeMap<K, V> implements ReadonlyMapLike<K, V>
{
    private readonly sortedKeys: K[] = [];
    private readonly sortedValues: V[] = [];

    constructor(entries?: Iterable<readonly [K, V]>, private readonly comparator: Comparator<K> = javaCompare)
    {
        if (entries)
            this.setAll(entries);
    }

    /** Java's new TreeMap<>(map) */
    public static copyOf<K, V>(original: TreeMap<K, V>): TreeMap<K, V>
    {
        return new TreeMap<K, V>(original, original.comparator);
    }

    public comparatorFunction(): Comparator<K>
    {
        return this.comparator;
    }

    // The index of the key if present, else -(insertion point) - 1, as Java's binarySearch.
    private search(key: K): number
    {
        let lo = 0;
        let hi = this.sortedKeys.length - 1;
        while (lo <= hi)
        {
            const mid = (lo + hi) >>> 1;
            const c = this.comparator(this.sortedKeys[mid]!, key);
            if (c < 0)
                lo = mid + 1;
            else if (c > 0)
                hi = mid - 1;
            else
                return mid;
        }
        return -(lo + 1);
    }

    public get size(): number
    {
        return this.sortedKeys.length;
    }

    public get(key: K): V | undefined
    {
        const i = this.search(key);
        return i >= 0 ? this.sortedValues[i] : undefined;
    }

    public has(key: K): boolean
    {
        return this.search(key) >= 0;
    }

    /** Java's put: an existing key keeps the original key object, with the new value. */
    public set(key: K, value: V): this
    {
        const i = this.search(key);
        if (i >= 0)
            this.sortedValues[i] = value;
        else
        {
            this.sortedKeys.splice(-i - 1, 0, key);
            this.sortedValues.splice(-i - 1, 0, value);
        }
        return this;
    }

    public setAll(entries: Iterable<readonly [K, V]>): void
    {
        for (const [k, v] of entries)
            this.set(k, v);
    }

    public delete(key: K): boolean
    {
        const i = this.search(key);
        if (i < 0)
            return false;
        this.sortedKeys.splice(i, 1);
        this.sortedValues.splice(i, 1);
        return true;
    }

    public clear(): void
    {
        this.sortedKeys.length = 0;
        this.sortedValues.length = 0;
    }

    public getOrDefault(key: K, defaultValue: V): V
    {
        const i = this.search(key);
        return i >= 0 ? this.sortedValues[i]! : defaultValue;
    }

    /** Java's compute: a null result removes the mapping. */
    public compute(key: K, remap: (key: K, old: V | null) => V | null): V | null
    {
        const i = this.search(key);
        const value = remap(key, i >= 0 ? this.sortedValues[i]! : null);
        if (value === null || value === undefined)
            this.delete(key);
        else
            this.set(key, value);
        return value;
    }

    /** Java's merge: combines with any existing value; a null result removes the mapping. */
    public merge(key: K, value: V, remap: (old: V, value: V) => V | null): V | null
    {
        const i = this.search(key);
        const result = i >= 0 ? remap(this.sortedValues[i]!, value) : value;
        if (result === null || result === undefined)
            this.delete(key);
        else
            this.set(key, result);
        return result;
    }

    /** Java's firstKey (throws if empty) */
    public firstKey(): K
    {
        if (this.sortedKeys.length === 0)
            throw new Error("NoSuchElementException");
        return this.sortedKeys[0]!;
    }

    /** Java's lastKey (throws if empty) */
    public lastKey(): K
    {
        if (this.sortedKeys.length === 0)
            throw new Error("NoSuchElementException");
        return this.sortedKeys[this.sortedKeys.length - 1]!;
    }

    public *entries(): IterableIterator<[K, V]>
    {
        // Iterate a snapshot, so that deleting the current key during iteration is safe:
        const keys = [...this.sortedKeys];
        const values = [...this.sortedValues];
        for (let i = 0; i < keys.length; i++)
            yield [keys[i]!, values[i]!];
    }

    public keys(): IterableIterator<K>
    {
        return [...this.sortedKeys][Symbol.iterator]();
    }

    public values(): IterableIterator<V>
    {
        return [...this.sortedValues][Symbol.iterator]();
    }

    public forEach(f: (value: V, key: K) => void): void
    {
        for (const [k, v] of this.entries())
            f(v, k);
    }

    public [Symbol.iterator](): IterableIterator<[K, V]>
    {
        return this.entries();
    }

    /** Java's Map.equals: same keys mapping to equal values, regardless of order. */
    public equals(other: unknown): boolean
    {
        if (!isMapLike(other) || other.size !== this.size)
            return false;
        for (let i = 0; i < this.sortedKeys.length; i++)
        {
            const k = this.sortedKeys[i]!;
            if (!other.has(k) || !javaEquals(this.sortedValues[i], other.get(k)))
                return false;
        }
        return true;
    }

    /** Java's Map.hashCode: the sum over entries of key hash XOR value hash. */
    public hashCode(): number
    {
        let h = 0;
        for (let i = 0; i < this.sortedKeys.length; i++)
            h = (h + (javaHashCode(this.sortedKeys[i]) ^ javaHashCode(this.sortedValues[i]))) | 0;
        return h;
    }

    public toString(): string
    {
        return "{" + this.sortedKeys.map((k, i) => `${String(k)}=${String(this.sortedValues[i])}`).join(", ") + "}";
    }
}

export class TreeSet<T> implements Iterable<T>
{
    private readonly map: TreeMap<T, true>;

    constructor(items?: Iterable<T>, comparator: Comparator<T> = javaCompare)
    {
        this.map = new TreeMap<T, true>(undefined, comparator);
        if (items)
        {
            for (const item of items)
                this.add(item);
        }
    }

    public get size(): number
    {
        return this.map.size;
    }

    public has(item: T): boolean
    {
        return this.map.has(item);
    }

    /** Adds the item, returning true if it was not already present (like Java's Set.add). */
    public add(item: T): boolean
    {
        if (this.map.has(item))
            return false;
        this.map.set(item, true);
        return true;
    }

    public delete(item: T): boolean
    {
        return this.map.delete(item);
    }

    public values(): IterableIterator<T>
    {
        return this.map.keys();
    }

    public [Symbol.iterator](): IterableIterator<T>
    {
        return this.map.keys();
    }

    public first(): T
    {
        return this.map.firstKey();
    }

    public last(): T
    {
        return this.map.lastKey();
    }

    /** Java's Set.equals: the same elements, regardless of order. */
    public equals(other: unknown): boolean
    {
        if (typeof other !== "object" || other === null || typeof (other as Partial<TreeSet<T>>).has !== "function"
            || (other as Partial<TreeSet<T>>).size !== this.size || isMapLike(other))
            return false;
        for (const item of this)
        {
            if (!(other as TreeSet<T>).has(item))
                return false;
        }
        return true;
    }

    /** Java's Set.hashCode: the sum of the element hashes. */
    public hashCode(): number
    {
        let h = 0;
        for (const item of this)
            h = (h + javaHashCode(item)) | 0;
        return h;
    }

    public toString(): string
    {
        return "[" + [...this].map(String).join(", ") + "]";
    }
}
