// Checks JavaRandom against values produced by java.util.Random on the JVM.
// Regenerate the GOLDEN block with: jshell -q scripts/golden/random.jsh
import { describe, expect, test } from "vitest";
import { JavaRandom } from "../../../src/engine/java/JavaRandom.js";

const GOLDEN = `
seed 42 = [-1170105035, 234785527, -1360544799, 4, 0, 5, 5, 8, 697878, 95760, 947254, 969067502, 791955276, 819572292, 5086654115216342560, 8552898714322622292, -4004755535478349341, true, false, false, false, true, 0.9306311813975403, 0.7982866194453608, 0.1505474834792303, 0.33830792, 0.20976752, 0.2506613, 10, 16, 5, 6, 6, 1, -1, -6, -1842367650, 344825474, -1803779346, 194700529, 616002790, 715016918, -0.2768317291873249, -0.08393897849486337, 1.255833005788796, -0.3252727938665772, [35, 103, 90, -7, -74, -60, -91, 20, -54, -54, -95]]
seed 0 = [-1155484576, -723955400, 1033096058, 7, 5, 3, 1, 1, 626571, 819498, 349404, 542832677, 827187473, 316484255, -279624296851435688, -2228689144322150137, -1083761183081836303, false, false, false, false, false, 0.7051747444754559, 0.0013866804054343262, 0.00922486133108813, 0.56294966, 0.10449064, 0.25288308, 7, 7, 14, 10, 15, -2, -7, 6, 2092649110, -568315836, -1089884900, 574432057, 224139319, 755132095, -0.19656094474544314, -0.035416253544602046, 0.1959655839537296, -1.3340267590704464, [-87, 27, -113, 78, 114, 101, -20, -72, 21, -89, -53]]
seed -123456789012345 = [1420237448, 95777618, -1897229184, 0, 1, 2, 2, 5, 1027336, 389623, 1002383, 817222595, 626809478, 345252690, -4751189306816864153, -77490261309484851, -3230129733792888551, true, false, true, false, true, 0.5319791082201784, 0.01788383279593253, 0.5909091684602239, 0.85082555, 0.21362162, 0.20804858, 11, 8, 5, 10, 8, -4, 5, -4, -104804227, 422885209, 599643064, 788758449, 534722485, 310445370, -1.0918124677502121, 0.18649764115791695, 0.9961629260919008, 0.820626919453051, [33, -26, 51, 96, 85, -26, 120, -87, 127, -96, 8]]
seed -9223372036854775808 = [-1155484576, -723955400, 1033096058, 7, 5, 3, 1, 1, 626571, 819498, 349404, 542832677, 827187473, 316484255, -279624296851435688, -2228689144322150137, -1083761183081836303, false, false, false, false, false, 0.7051747444754559, 0.0013866804054343262, 0.00922486133108813, 0.56294966, 0.10449064, 0.25288308, 7, 7, 14, 10, 15, -2, -7, 6, 2092649110, -568315836, -1089884900, 574432057, 224139319, 755132095, -0.19656094474544314, -0.035416253544602046, 0.1959655839537296, -1.3340267590704464, [-87, 27, -113, 78, 114, 101, -20, -72, 21, -89, -53]]
seed 9223372036854775807 = [1155099827, 1887904451, 52699159, 9, 4, 8, 7, 8, 866297, 59283, 845191, 665220512, 121954317, 149520196, 1519476466405487669, -5110998876361204119, -8129419283323851490, true, false, true, false, true, 0.33549353826994077, 0.0029176648860678167, 0.15135772245145152, 0.69415784, 0.2387231, 0.10549933, 10, 8, 8, 12, 16, -6, -2, -6, 341774279, -2051190111, -1083869439, 928184879, 923208968, 882898295, -0.5446725078013468, 0.505993989113119, -1.41969042799245, -1.6035278755540598, [108, -67, -40, 99, -60, 58, 106, 29, -1, -35, 91]]
`;

function parseGolden(): { seed: bigint; values: string[] }[]
{
    return GOLDEN.trim().split("\n").map(line =>
    {
        const m = /^seed (-?\d+) = \[(.*)\]$/.exec(line);
        if (!m)
            throw new Error("Bad golden line: " + line);
        // The final element is the nextBytes array, itself in [...]; split the rest on commas.
        const bytesStart = m[2]!.lastIndexOf("[");
        const scalars = m[2]!.substring(0, bytesStart).split(",").map(s => s.trim()).filter(s => s !== "");
        return { seed: BigInt(m[1]!), values: [...scalars, m[2]!.substring(bytesStart)] };
    });
}

// The calls made by scripts/golden/random.jsh, in order, each producing a string
// formatted the way Java prints the value.
function javaFloat(f: number): (expected: string) => boolean
{
    return expected => Math.fround(Number(expected)) === f;
}

describe("JavaRandom matches java.util.Random", () =>
{
    for (const { seed, values } of parseGolden())
    {
        test(`seed ${seed}`, () =>
        {
            const r = new JavaRandom(seed);
            const actual: (string | ((expected: string) => boolean))[] = [];
            const repeat = (n: number, f: () => string | ((expected: string) => boolean)) => { for (let i = 0; i < n; i++) actual.push(f()); };
            repeat(3, () => String(r.nextInt()));
            repeat(5, () => String(r.nextInt(10)));
            repeat(3, () => String(r.nextInt(1 << 20)));
            repeat(3, () => String(r.nextInt(1_000_000_007)));
            repeat(3, () => String(r.nextLong()));
            repeat(5, () => String(r.nextBoolean()));
            repeat(3, () => String(r.nextDouble()));
            repeat(3, () => javaFloat(r.nextFloat()));
            repeat(5, () => String(r.nextInt(5, 17)));
            repeat(3, () => String(r.nextInt(-8, 8)));
            repeat(3, () => String(r.nextInt(-0x80000000, 0x7fffffff)));
            repeat(3, () => String(r.nextInt(-5, 1_000_000_007)));
            repeat(4, () => String(r.nextGaussian()));
            const bytes = new Int8Array(11);
            r.nextBytes(bytes);
            actual.push("[" + Array.from(bytes).join(", ") + "]");

            expect(actual.length).toBe(values.length);
            actual.forEach((a, i) =>
            {
                if (typeof a === "function")
                    expect(a(values[i]!), `value ${i}: ${values[i]}`).toBe(true);
                else
                    expect(a, `value ${i}`).toBe(values[i]);
            });
        });
    }

    test("nextInt rejects invalid bounds like Java", () =>
    {
        const r = new JavaRandom(1);
        expect(() => r.nextInt(0)).toThrow(RangeError);
        expect(() => r.nextInt(5, 5)).toThrow(RangeError);
    });
});
