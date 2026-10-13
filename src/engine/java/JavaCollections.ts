// Equivalents of java.util.Collections methods whose exact behaviour matters for
// reproducing seeded random tests.
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
