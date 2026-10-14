// The java.lang.Object equals/hashCode protocol, and Comparable, for ported code.
//
// Classes ported from Java that override equals/hashCode implement JavaObject.  The helpers
// here extend the protocol to built-in values the way Java's boxed types behave:
//   - string: String.equals / String.hashCode / String.compareTo
//   - number: compared with == (NaN equals NaN), hashed like Integer (int values) or Double
//   - bigint: Java long (Long.hashCode)
//   - boolean: Boolean.hashCode (1231/1237), false < true
//   - decimal.js Decimal: Columnal's canonical numbers, compared by value
//   - arrays: Java Lists (element-wise equals, List.hashCode)
//   - null/undefined: Java null
import { Decimal } from "decimal.js";

export interface JavaObject
{
    equals(other: unknown): boolean;
    /** A Java int hash code, consistent with equals. */
    hashCode(): number;
}

export interface Comparable<T>
{
    compareTo(other: T): number;
}

/** A Java-style comparator: negative, zero or positive. */
export type Comparator<T> = (a: T, b: T) => number;

function hasEquals(x: unknown): x is JavaObject
{
    return typeof x === "object" && x !== null && typeof (x as Partial<JavaObject>).equals === "function";
}

function hasHashCode(x: unknown): x is JavaObject
{
    return typeof x === "object" && x !== null && typeof (x as Partial<JavaObject>).hashCode === "function";
}

/** Java's Objects.equals(a, b), extended to the built-in values above. */
export function javaEquals(a: unknown, b: unknown): boolean
{
    if (a === b)
        return true;
    if (a === null || b === null || a === undefined || b === undefined)
        return false;
    if (typeof a === "number" && typeof b === "number")
        return Number.isNaN(a) && Number.isNaN(b);
    if (Decimal.isDecimal(a))
        return Decimal.isDecimal(b) && a.eq(b);
    if (Array.isArray(a))
        return Array.isArray(b) && a.length === b.length && a.every((x, i) => javaEquals(x, b[i]));
    if (hasEquals(a))
        return a.equals(b);
    // JavaScript Maps and Sets (used for string-keyed Java maps and sets):
    if (a instanceof Map)
        return b instanceof Map && a.size === b.size && [...a].every(([k, v]) => b.has(k) && javaEquals(v, b.get(k)));
    if (a instanceof Set)
        return b instanceof Set && a.size === b.size && [...a].every(k => b.has(k));
    return false;
}

/** Java's String.hashCode. */
export function javaStringHashCode(s: string): number
{
    let h = 0;
    for (let i = 0; i < s.length; i++)
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h;
}

/** Java's Long.hashCode. */
export function javaLongHashCode(l: bigint): number
{
    const v = BigInt.asUintN(64, l);
    return Number(BigInt.asIntN(32, v ^ (v >> 32n)));
}

const doubleView = new DataView(new ArrayBuffer(8));

/** Java's Double.hashCode. */
export function javaDoubleHashCode(d: number): number
{
    // Double.doubleToLongBits canonicalises NaN:
    doubleView.setFloat64(0, Number.isNaN(d) ? NaN : d);
    return (doubleView.getInt32(0) ^ doubleView.getInt32(4)) | 0;
}

/** Java's Objects.hashCode(x), extended to the built-in values above. */
export function javaHashCode(x: unknown): number
{
    if (x === null || x === undefined)
        return 0;
    switch (typeof x)
    {
        case "string":
            return javaStringHashCode(x);
        case "number":
            return Number.isInteger(x) && x >= -0x80000000 && x <= 0x7fffffff ? x | 0 : javaDoubleHashCode(x);
        case "bigint":
            return javaLongHashCode(x);
        case "boolean":
            return x ? 1231 : 1237;
        default:
            break;
    }
    if (Decimal.isDecimal(x))
        return x.isZero() ? 0 : javaStringHashCode(x.toString());
    if (Array.isArray(x))
    {
        let h = 1;
        for (const e of x)
            h = (Math.imul(31, h) + javaHashCode(e)) | 0;
        return h;
    }
    if (hasHashCode(x))
        return x.hashCode() | 0;
    // JavaScript Maps and Sets (used for string-keyed Java maps and sets): Map.hashCode and Set.hashCode
    if (x instanceof Map)
    {
        let h = 0;
        for (const [k, v] of x)
            h = (h + (javaHashCode(k) ^ javaHashCode(v))) | 0;
        return h;
    }
    if (x instanceof Set)
    {
        let h = 0;
        for (const k of x)
            h = (h + javaHashCode(k)) | 0;
        return h;
    }
    return identityHashCode(x as object);
}

const identityHashes = new WeakMap<object, number>();
let nextIdentityHash = 1;

/**
 * Java's System.identityHashCode / Object.hashCode (for objects that don't override it):
 * a hash that is stable for the object and consistent with reference equality.
 */
export function identityHashCode(x: object): number
{
    let h = identityHashes.get(x);
    if (h === undefined)
    {
        // Spread the values out a little, as Java's are not sequential:
        h = Math.imul(nextIdentityHash++, 0x9e3779b1) | 0;
        identityHashes.set(x, h);
    }
    return h;
}

/** Java's String.compareTo: the difference of the first differing chars, else of the lengths. */
export function javaStringCompare(a: string, b: string): number
{
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++)
    {
        const c1 = a.charCodeAt(i);
        const c2 = b.charCodeAt(i);
        if (c1 !== c2)
            return c1 - c2;
    }
    return a.length - b.length;
}

/** Comparable.compareTo for ported Comparable objects and the built-in values above. */
export function javaCompare(a: unknown, b: unknown): number
{
    if (typeof a === "string" && typeof b === "string")
        return javaStringCompare(a, b);
    if (typeof a === "boolean" && typeof b === "boolean")
        return a === b ? 0 : a ? 1 : -1; // Boolean.compare
    if ((typeof a === "number" && typeof b === "number") || (typeof a === "bigint" && typeof b === "bigint"))
        return a < b ? -1 : a > b ? 1 : 0;
    if (Decimal.isDecimal(a) && Decimal.isDecimal(b))
        return a.cmp(b);
    if (typeof a === "object" && a !== null && typeof (a as Partial<Comparable<unknown>>).compareTo === "function")
        return (a as Comparable<unknown>).compareTo(b);
    throw new TypeError(`Cannot compare ${String(a)} with ${String(b)}`);
}

/** Java's Comparator.comparing(key) followed by any number of thenComparing(key). */
export function comparing<T>(...keys: ((t: T) => unknown)[]): Comparator<T>
{
    return (a, b) =>
    {
        for (const key of keys)
        {
            const c = javaCompare(key(a), key(b));
            if (c !== 0)
                return c;
        }
        return 0;
    };
}

/** Java's Objects.hash(values...) (that is, Arrays.hashCode of the values). */
export function javaObjectsHash(...values: unknown[]): number
{
    return javaHashCode(values);
}
