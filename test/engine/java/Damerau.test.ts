import { describe, expect, test } from "vitest";
import { Damerau } from "../../../src/engine/java/Damerau.js";

describe("Damerau", () =>
{
    // Examples from the java-string-similarity README:
    test.each([
        ["ABCDEF", "ABDCEF", 1], // substitution... no, transposition of C and D
        ["ABCDEF", "BACDFE", 2], // two transpositions
        ["ABCDEF", "ABCDE", 1], // deletion
        ["ABCDEF", "BCDEF", 1],
        ["ABCDEF", "ABCGDEF", 1], // insertion
        ["ABCDEF", "POIU", 6],
        ["CA", "ABC", 2], // unrestricted Damerau-Levenshtein (optimal string alignment would give 3)
        ["same", "same", 0],
        ["", "abc", 3],
    ])("distance(%s, %s) = %d", (a, b, expected) =>
    {
        expect(new Damerau().distance(a, b)).toBe(expected);
    });
});
