import { describe, expect, test } from "vitest";
import { JavaRandom } from "../../src/engine/java/JavaRandom.js";
import { GenRandom } from "../engine/tests-basic/fixtures/gen/GenRandom.js";
import { assumeTrue } from "./junit.js";
import { checkProperty, GeometricDistribution, Generator, propertyTest, SimpleGenerationStatus, SourceOfRandomness, type GenerationStatus } from "./quickcheck.js";

class GenSmallInt extends Generator<number>
{
    public override generate(random: SourceOfRandomness, _status: GenerationStatus): number
    {
        return random.nextInt(0, 1000);
    }

    // Shrink towards zero, the way Columnal's generators provide smaller candidates.
    public override doShrink(_random: SourceOfRandomness, larger: number): number[]
    {
        return larger === 0 ? [] : [0, Math.floor(larger / 2), larger - 1];
    }
}

describe("SourceOfRandomness", () =>
{
    const random = () => new SourceOfRandomness(new JavaRandom(1234));

    test("nextInt(min, max) includes both ends and nothing outside", () =>
    {
        const r = random();
        const seen = new Set<number>();
        for (let i = 0; i < 2000; i++)
            seen.add(r.nextInt(-2, 2));
        expect([...seen].sort()).toEqual([-1, -2, 0, 1, 2].sort());
    });

    test("nextLong(min, max) handles ranges wider than 2^62", () =>
    {
        const r = random();
        const min = -(1n << 63n);
        const max = (1n << 63n) - 1n;
        for (let i = 0; i < 100; i++)
        {
            const v = r.nextLong(min, max);
            expect(v >= min && v <= max).toBe(true);
        }
        expect(r.nextLong(5n, 5n)).toBe(5n);
        expect(() => r.nextLong(6n, 5n)).toThrow(RangeError);
    });

    test("nextChar(min, max) is inclusive", () =>
    {
        const r = random();
        const seen = new Set<string>();
        for (let i = 0; i < 500; i++)
            seen.add(r.nextChar("a", "c"));
        expect([...seen].sort()).toEqual(["a", "b", "c"]);
    });

    test("nextBigInteger matches Java's new BigInteger(numBits, random)", () =>
    {
        // From scripts/golden/biginteger.jsh
        const golden: [bigint, bigint[]][] = [
            [42n, [1n, 119n, 225n, 192n, 1681655887n, 5457003689784766022n, 28042988809162435226n, 1061925161662808610028560866952n, 0n]],
            [-7n, [0n, 3n, 44n, 493n, 1549303941n, 16080520443910493402n, 272837880642213121n, 179755735925492974041978824231n, 0n]],
        ];
        for (const [seed, expected] of golden)
        {
            const r = new SourceOfRandomness(new JavaRandom(seed));
            expect([1, 7, 8, 9, 31, 64, 65, 100, 0].map(bits => r.nextBigInteger(bits))).toEqual(expected);
        }
    });

    test("choose picks every item eventually", () =>
    {
        const r = random();
        const seen = new Set<string>();
        for (let i = 0; i < 200; i++)
            seen.add(r.choose(["x", "y", "z"]));
        expect(seen.size).toBe(3);
        expect(() => r.choose([])).toThrow(RangeError);
    });

    test("SimpleGenerationStatus reports attempts and a non-negative size", () =>
    {
        const status = new SimpleGenerationStatus(new GeometricDistribution(), random(), 10);
        expect(status.attempts()).toBe(10);
        expect(status.size()).toBeGreaterThanOrEqual(0);
    });
});

describe("propertyTest", () =>
{
    let runs = 0;
    propertyTest("runs the requested number of trials", [new GenSmallInt()], (n) =>
    {
        runs += 1;
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(1000);
    }, { trials: 37 });
    test("(check trial count)", () => expect(runs).toBe(37));

    propertyTest("passes a JavaRandom from GenRandom, as @From(GenRandom.class) does", [new GenRandom(), new GenSmallInt()], (r, n) =>
    {
        expect(r).toBeInstanceOf(JavaRandom);
        expect(typeof n).toBe("number");
    });

    test("the same seed generates the same values", async () =>
    {
        const collect = async () =>
        {
            const values: number[] = [];
            await checkProperty([new GenSmallInt()], (n) => { values.push(n); }, { trials: 20, seed: 99 });
            return values;
        };
        expect(await collect()).toEqual(await collect());
    });

    test("a failing property is shrunk using doShrink", async () =>
    {
        let error: unknown;
        try
        {
            await checkProperty([new GenSmallInt()], (n) => { expect(n).toBeLessThan(10); }, { trials: 200, seed: 1 });
        }
        catch (e)
        {
            error = e;
        }
        expect(error).toBeInstanceOf(Error);
        // Shrinking towards zero by halving and decrementing must reach the boundary exactly:
        expect(String(error)).toContain("Counterexample: [10]");
    });

    test("assumeTrue discards trials instead of failing them", async () =>
    {
        let checked = 0;
        await checkProperty([new GenSmallInt()], (n) =>
        {
            assumeTrue(n % 2 === 0);
            checked += 1;
            expect(n % 2).toBe(0);
        }, { trials: 50 });
        expect(checked).toBe(50);
    });
});
