// Maps and sets keyed by Java equality (equals/hashCode), for keys such as TableId or
// Columnal values, where a JavaScript Map would wrongly compare objects by identity.
//
// PORT-NOTE: by default iteration is in insertion order (like LinkedHashMap / Guava's
// ImmutableMap), not Java HashMap's hash order.  Where a ported HashMap's iteration order is
// observable, the ported code must say so with its own PORT-NOTE (see docs/CONVENTIONS.md),
// and can use HashMap.javaOrder / HashSet.javaOrder to iterate in the order Java would.
//
// Like Java, keys must not be mutated in a way that changes equals/hashCode while in the map.
import { javaEquals, javaHashCode } from "./JavaObject.js";

interface Entry<K, V>
{
    readonly key: K;
    readonly hash: number;
    value: V;
}

const DEFAULT_CAPACITY = 16;
// Java's TREEIFY_THRESHOLD and MIN_TREEIFY_CAPACITY:
const TREEIFY_THRESHOLD = 8;
const MIN_TREEIFY_CAPACITY = 64;

/** Java's HashMap.tableSizeFor: the smallest power of two >= cap. */
function tableSizeFor(cap: number): number
{
    let n = 1;
    while (n < cap)
        n *= 2;
    return n;
}

/**
 * Options for iterating in Java HashMap's order.  The map then simulates Java 17's hash table
 * (Columnal targets Java 17): iteration goes through the buckets in order, and each bucket in
 * the order of its linked list.  put (set) appends to a bucket and grows the table afterwards
 * if it is over three-quarters full; merge, compute and computeIfAbsent add at the head of
 * the bucket and grow the table beforehand, as Java does.  A bucket that reaches eight entries
 * grows a small table, as Java does; Java's conversion of large buckets into trees (which
 * changes the order within the bucket) is not simulated, as it needs many colliding keys.
 */
export interface JavaOrder
{
    // Java's initialCapacity constructor argument:
    readonly initialCapacity?: number;
}

/** Java's HashMap.hash: spreads the high bits of the hash code down. */
function spread(hash: number): number
{
    return hash ^ (hash >>> 16);
}

export class HashMap<K, V> implements Iterable<[K, V]>
{
    private readonly buckets = new Map<number, Entry<K, V>[]>();
    // A JS Set iterates in insertion order and supports O(1) deletion:
    private readonly order = new Set<Entry<K, V>>();
    // Java's hash table, when iterating in Java order (else null):
    private table: Entry<K, V>[][] | null = null;

    constructor(entries?: Iterable<readonly [K, V]>)
    {
        if (entries)
        {
            for (const [k, v] of entries)
                this.set(k, v);
        }
    }

    /**
     * A map that iterates in Java HashMap's order.  With entries, it is Java's
     * new HashMap<>(map) copy constructor, which sizes the table for the entries.
     */
    public static javaOrder<K, V>(options: JavaOrder = {}, entries?: Iterable<readonly [K, V]>): HashMap<K, V>
    {
        const m = new HashMap<K, V>();
        const all = entries === undefined ? [] : [...entries];
        // Java 17 putMapEntries: threshold = tableSizeFor((int)(size / 0.75f + 1.0f))
        const capacity = all.length === 0 ? tableSizeFor(options.initialCapacity ?? DEFAULT_CAPACITY) : tableSizeFor(Math.floor(all.length / 0.75 + 1.0));
        m.table = Array.from({ length: capacity }, () => []);
        m.setAll(all);
        return m;
    }

    /** True if this map iterates in Java HashMap's order. */
    public isJavaOrder(): boolean
    {
        return this.table !== null;
    }

    // All entries, in iteration order:
    private ordered(): Iterable<Entry<K, V>>
    {
        return this.table === null ? this.order : this.table.flat();
    }

    private find(key: K): Entry<K, V> | undefined
    {
        return this.buckets.get(javaHashCode(key))?.find(e => javaEquals(e.key, key));
    }

    public get size(): number
    {
        return this.order.size;
    }

    public get(key: K): V | undefined
    {
        return this.find(key)?.value;
    }

    public has(key: K): boolean
    {
        return this.find(key) !== undefined;
    }

    // The Java table's growth threshold:
    private threshold(): number
    {
        return Math.floor(this.table!.length * 0.75);
    }

    // Java's resize(): doubles the table, keeping the relative order of entries in each bucket.
    private resize(): void
    {
        const old = this.table!;
        const table: Entry<K, V>[][] = Array.from({ length: old.length * 2 }, () => []);
        for (const bucket of old)
        {
            for (const e of bucket)
                table[spread(e.hash) & (table.length - 1)]!.push(e);
        }
        this.table = table;
    }

    // Adds a new entry (the key must not be present), at the tail of its Java bucket (Java's
    // put) or at the head (Java's merge/compute/computeIfAbsent).
    private add(key: K, value: V, atHead: boolean): void
    {
        const hash = javaHashCode(key);
        const entry: Entry<K, V> = { key, hash, value };
        if (this.table !== null)
        {
            if (atHead && this.order.size > this.threshold())
                this.resize();
            const bucket = this.table[spread(hash) & (this.table.length - 1)]!;
            const existing = bucket.length;
            if (atHead)
                bucket.unshift(entry);
            else
                bucket.push(entry);
            // Java's treeifyBin grows a small table instead of making a tree:
            if (existing >= (atHead ? TREEIFY_THRESHOLD - 1 : TREEIFY_THRESHOLD) && this.table.length < MIN_TREEIFY_CAPACITY)
                this.resize();
        }
        const bucket = this.buckets.get(hash);
        if (bucket)
            bucket.push(entry);
        else
            this.buckets.set(hash, [entry]);
        this.order.add(entry);
        if (this.table !== null && !atHead && this.order.size > this.threshold())
            this.resize();
    }

    /** Java's put: an existing key keeps its position in the iteration order. */
    public set(key: K, value: V): this
    {
        const existing = this.find(key);
        if (existing)
            existing.value = value;
        else
            this.add(key, value, false);
        return this;
    }

    public delete(key: K): boolean
    {
        const hash = javaHashCode(key);
        const bucket = this.buckets.get(hash);
        if (!bucket)
            return false;
        const index = bucket.findIndex(e => javaEquals(e.key, key));
        if (index === -1)
            return false;
        const entry = bucket[index]!;
        this.order.delete(entry);
        bucket.splice(index, 1);
        if (bucket.length === 0)
            this.buckets.delete(hash);
        if (this.table !== null)
        {
            const tableBucket = this.table[spread(hash) & (this.table.length - 1)]!;
            tableBucket.splice(tableBucket.indexOf(entry), 1);
        }
        return true;
    }

    /** Java's clear, which keeps the table's capacity. */
    public clear(): void
    {
        this.buckets.clear();
        this.order.clear();
        if (this.table !== null)
            this.table = Array.from({ length: this.table.length }, () => []);
    }

    /** Java's getOrDefault. */
    public getOrDefault(key: K, defaultValue: V): V
    {
        const e = this.find(key);
        return e ? e.value : defaultValue;
    }

    /** Java's computeIfAbsent (null results are not stored, as in Java). */
    public computeIfAbsent(key: K, make: (key: K) => V): V
    {
        const e = this.find(key);
        if (e)
            return e.value;
        const value = make(key);
        if (value !== null && value !== undefined)
            this.add(key, value, true);
        return value;
    }

    /** Java's compute: a null result removes the mapping. */
    public compute(key: K, remap: (key: K, old: V | null) => V | null): V | null
    {
        const e = this.find(key);
        const value = remap(key, e ? e.value : null);
        if (value === null || value === undefined)
            this.delete(key);
        else if (e)
            e.value = value;
        else
            this.add(key, value, true);
        return value;
    }

    /** Java's merge: combines with any existing value; a null result removes the mapping. */
    public merge(key: K, value: V, remap: (old: V, value: V) => V | null): V | null
    {
        const e = this.find(key);
        if (!e)
        {
            this.add(key, value, true);
            return value;
        }
        const result = remap(e.value, value);
        if (result === null || result === undefined)
            this.delete(key);
        else
            e.value = result;
        return result;
    }

    /** Java's putAll. */
    public setAll(entries: Iterable<readonly [K, V]>): void
    {
        for (const [k, v] of entries)
            this.set(k, v);
    }

    public *entries(): IterableIterator<[K, V]>
    {
        for (const e of this.ordered())
            yield [e.key, e.value];
    }

    public *keys(): IterableIterator<K>
    {
        for (const e of this.ordered())
            yield e.key;
    }

    public *values(): IterableIterator<V>
    {
        for (const e of this.ordered())
            yield e.value;
    }

    public forEach(f: (value: V, key: K) => void): void
    {
        for (const e of [...this.ordered()])
            f(e.value, e.key);
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
        for (const e of this.order)
        {
            if (!other.has(e.key) || !javaEquals(e.value, other.get(e.key)))
                return false;
        }
        return true;
    }

    /** Java's Map.hashCode: the sum over entries of key hash XOR value hash. */
    public hashCode(): number
    {
        let h = 0;
        for (const e of this.order)
            h = (h + (javaHashCode(e.key) ^ javaHashCode(e.value))) | 0;
        return h;
    }

    public toString(): string
    {
        return "{" + [...this.ordered()].map(e => `${String(e.key)}=${String(e.value)}`).join(", ") + "}";
    }
}

export class HashSet<T> implements Iterable<T>
{
    private readonly map: HashMap<T, true>;

    constructor(items?: Iterable<T>, map?: HashMap<T, true>)
    {
        this.map = map ?? new HashMap<T, true>();
        if (items)
        {
            for (const item of items)
                this.add(item);
        }
    }

    /**
     * A set that iterates in Java HashSet's order.  With items, it is Java's
     * new HashSet<>(collection) copy constructor, which sizes the table for the items.
     */
    public static javaOrder<T>(options: JavaOrder = {}, items?: Iterable<T>): HashSet<T>
    {
        if (items === undefined)
            return new HashSet<T>(undefined, HashMap.javaOrder<T, true>(options));
        const all = [...items];
        // Java 17: new HashMap<>(Math.max((int) (c.size()/.75f) + 1, 16))
        return new HashSet<T>(all, HashMap.javaOrder<T, true>({ initialCapacity: Math.max(Math.floor(all.length / 0.75) + 1, 16) }));
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

    public clear(): void
    {
        this.map.clear();
    }

    public values(): IterableIterator<T>
    {
        return this.map.keys();
    }

    public [Symbol.iterator](): IterableIterator<T>
    {
        return this.map.keys();
    }

    /** Java's Set.equals: the same elements, regardless of order. */
    public equals(other: unknown): boolean
    {
        if (!(other instanceof HashSet) || other.size !== this.size)
            return false;
        for (const item of this)
        {
            if (!(other as HashSet<T>).has(item))
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

/**
 * The read-only operations shared by JavaScript's Map and HashMap, for ported code that
 * accepts any Java Map.  (Use Map for string/number keys and HashMap for object keys.)
 */
export interface ReadonlyMapLike<K, V> extends Iterable<[K, V]>
{
    readonly size: number;
    get(key: K): V | undefined;
    has(key: K): boolean;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<[K, V]>;
    forEach(f: (value: V, key: K) => void): void;
}

/** True for any of the map types that ported Java Maps use (Map, HashMap, TreeMap). */
export function isMapLike(x: unknown): x is ReadonlyMapLike<unknown, unknown>
{
    return typeof x === "object" && x !== null && typeof (x as Partial<ReadonlyMapLike<unknown, unknown>>).size === "number"
        && typeof (x as Partial<ReadonlyMapLike<unknown, unknown>>).get === "function" && typeof (x as Partial<ReadonlyMapLike<unknown, unknown>>).entries === "function";
}
