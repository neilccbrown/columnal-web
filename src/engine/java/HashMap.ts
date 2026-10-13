// Maps and sets keyed by Java equality (equals/hashCode), for keys such as TableId or
// Columnal values, where a JavaScript Map would wrongly compare objects by identity.
//
// PORT-NOTE: iteration is in insertion order (like LinkedHashMap / Guava's ImmutableMap),
// not Java HashMap's hash order.  Where a ported HashMap's iteration order is observable,
// the ported code must say so with its own PORT-NOTE (see docs/CONVENTIONS.md).
//
// Like Java, keys must not be mutated in a way that changes equals/hashCode while in the map.
import { javaEquals, javaHashCode } from "./JavaObject.js";

interface Entry<K, V>
{
    readonly key: K;
    value: V;
}

export class HashMap<K, V> implements Iterable<[K, V]>
{
    private readonly buckets = new Map<number, Entry<K, V>[]>();
    // A JS Set iterates in insertion order and supports O(1) deletion:
    private readonly order = new Set<Entry<K, V>>();

    constructor(entries?: Iterable<readonly [K, V]>)
    {
        if (entries)
        {
            for (const [k, v] of entries)
                this.set(k, v);
        }
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

    /** Java's put: an existing key keeps its position in the iteration order. */
    public set(key: K, value: V): this
    {
        const existing = this.find(key);
        if (existing)
        {
            existing.value = value;
            return this;
        }
        const entry: Entry<K, V> = { key, value };
        const hash = javaHashCode(key);
        const bucket = this.buckets.get(hash);
        if (bucket)
            bucket.push(entry);
        else
            this.buckets.set(hash, [entry]);
        this.order.add(entry);
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
        this.order.delete(bucket[index]!);
        bucket.splice(index, 1);
        if (bucket.length === 0)
            this.buckets.delete(hash);
        return true;
    }

    public clear(): void
    {
        this.buckets.clear();
        this.order.clear();
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
            this.set(key, value);
        return value;
    }

    /** Java's compute: a null result removes the mapping. */
    public compute(key: K, remap: (key: K, old: V | null) => V | null): V | null
    {
        const e = this.find(key);
        const value = remap(key, e ? e.value : null);
        if (value === null || value === undefined)
            this.delete(key);
        else
            this.set(key, value);
        return value;
    }

    /** Java's putAll. */
    public setAll(entries: Iterable<readonly [K, V]>): void
    {
        for (const [k, v] of entries)
            this.set(k, v);
    }

    public *entries(): IterableIterator<[K, V]>
    {
        for (const e of this.order)
            yield [e.key, e.value];
    }

    public *keys(): IterableIterator<K>
    {
        for (const e of this.order)
            yield e.key;
    }

    public *values(): IterableIterator<V>
    {
        for (const e of this.order)
            yield e.value;
    }

    public forEach(f: (value: V, key: K) => void): void
    {
        for (const e of [...this.order])
            f(e.value, e.key);
    }

    public [Symbol.iterator](): IterableIterator<[K, V]>
    {
        return this.entries();
    }

    /** Java's Map.equals: same keys mapping to equal values, regardless of order. */
    public equals(other: unknown): boolean
    {
        if (!(other instanceof HashMap) || other.size !== this.size)
            return false;
        for (const e of this.order)
        {
            const theirs = (other as HashMap<K, V>).find(e.key);
            if (!theirs || !javaEquals(e.value, theirs.value))
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
        return "{" + [...this.order].map(e => `${String(e.key)}=${String(e.value)}`).join(", ") + "}";
    }
}

export class HashSet<T> implements Iterable<T>
{
    private readonly map = new HashMap<T, true>();

    constructor(items?: Iterable<T>)
    {
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
