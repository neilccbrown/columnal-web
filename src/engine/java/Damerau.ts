// Port of info.debatty.java.stringsimilarity.Damerau (java-string-similarity 2.0.0,
// MIT License, Copyright 2015 Thibault Debatty), used by Utility.findAlternatives.
//
// Implementation of Damerau-Levenshtein metric with transposition of adjacent characters.
// Works on UTF-16 chars, as the Java does.

export class Damerau
{
    public distance(s1: string, s2: string): number
    {
        if (s1 === s2)
        {
            return 0;
        }

        // INFinite distance is the max possible distance
        const inf = s1.length + s2.length;

        // Create and initialize the character array indices
        const da = new Map<string, number>();

        for (let d = 0; d < s1.length; d++)
        {
            da.set(s1[d]!, 0);
        }

        for (let d = 0; d < s2.length; d++)
        {
            da.set(s2[d]!, 0);
        }

        // Create the distance matrix H[0 .. s1.length+1][0 .. s2.length+1]
        const h: number[][] = Array.from({ length: s1.length + 2 }, () => new Array<number>(s2.length + 2).fill(0));

        // initialize the left and top edges of H
        for (let i = 0; i <= s1.length; i++)
        {
            h[i + 1]![0] = inf;
            h[i + 1]![1] = i;
        }

        for (let j = 0; j <= s2.length; j++)
        {
            h[0]![j + 1] = inf;
            h[1]![j + 1] = j;
        }

        // fill in the distance matrix H
        // look at each character in s1
        for (let i = 1; i <= s1.length; i++)
        {
            let db = 0;

            // look at each character in b
            for (let j = 1; j <= s2.length; j++)
            {
                const i1 = da.get(s2[j - 1]!)!;
                const j1 = db;

                let cost = 1;
                if (s1[i - 1] === s2[j - 1])
                {
                    cost = 0;
                    db = j;
                }

                h[i + 1]![j + 1] = Math.min(
                    h[i]![j]! + cost, // substitution
                    h[i + 1]![j]! + 1, // insertion
                    h[i]![j + 1]! + 1, // deletion
                    h[i1]![j1]! + (i - i1 - 1) + 1 + (j - j1 - 1));
            }

            da.set(s1[i - 1]!, i);
        }

        return h[s1.length + 1]![s2.length + 1]!;
    }
}
