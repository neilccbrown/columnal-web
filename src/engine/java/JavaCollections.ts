// Equivalents of java.util.Collections methods whose exact behaviour matters for
// reproducing seeded random tests.
import { IndexOutOfBoundsException } from "./JavaExceptions.js";
import type { JavaRandom } from "./JavaRandom.js";

/** Collections.shuffle(list, rnd): the same permutation as Java for the same Random state. */
export function javaShuffle<T>(list: T[], rnd: JavaRandom): void
{
    for (let i = list.length; i > 1; i--)
    {
        const j = rnd.nextInt(i);
        const tmp = list[i - 1]!;
        list[i - 1] = list[j]!;
        list[j] = tmp;
    }
}

/**
 * Java's List.get(index), which throws an IndexOutOfBoundsException (with Java's message) for an
 * index out of range.  Use it where ported code can reach a bad index, so it fails as Java does
 * rather than continuing with undefined.
 */
export function javaListGet<T>(list: readonly T[], index: number): T
{
    if (index < 0 || index >= list.length)
        throw new IndexOutOfBoundsException("Index " + index + " out of bounds for length " + list.length);
    return list[index]!;
}

/**
 * Java's List.addAll(index, items).  Use it rather than list.splice(index, 0, ...items), which
 * fails with a RangeError (too many arguments) when inserting many items, as a large table can.
 */
export function javaListAddAll<T>(list: T[], index: number, items: readonly T[]): void
{
    if (index < 0 || index > list.length)
        throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + list.length);
    const tail = list.splice(index);
    for (const item of items)
        list.push(item);
    for (const item of tail)
        list.push(item);
}
