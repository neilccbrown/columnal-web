// A shim reproducing the parts of junit-quickcheck that Columnal's tests use, on top of
// fast-check, so the Java generators and @Property tests port almost line for line:
//
//   Java:  @Property(trials = 2000)
//          public void testFoo(@From(GenNumber.class) Number n) { ... }
//
//   TS:    propertyTest("testFoo", [new GenNumber()], (n) => { ... }, { trials: 2000 });
//
// Each generated parameter gets its own SourceOfRandomness, seeded from fast-check, so a
// failing run is reproducible from the seed fast-check reports.  A generator's doShrink
// is used for shrinking, as junit-quickcheck does.  Values are not bit-identical to
// junit-quickcheck's (its seeding differs), but SourceOfRandomness has the same API and
// semantics: in particular, nextInt(min, max) includes max, unlike JavaRandom.nextInt(origin, bound).
import fc from "fast-check";
import { test } from "vitest";
import { JavaRandom } from "../../src/engine/java/JavaRandom.js";

/** junit-quickcheck's SourceOfRandomness: a convenience wrapper around a java.util.Random. */
export class SourceOfRandomness
{
    constructor(private readonly delegate: JavaRandom)
    {
    }

    /** The underlying java.util.Random equivalent. */
    public toJDKRandom(): JavaRandom
    {
        return this.delegate;
    }

    public setSeed(seed: bigint | number): void
    {
        this.delegate.setSeed(seed);
    }

    public nextBoolean(): boolean
    {
        return this.delegate.nextBoolean();
    }

    public nextBytes(count: number): Int8Array
    {
        const bytes = new Int8Array(count);
        this.delegate.nextBytes(bytes);
        return bytes;
    }

    public nextDouble(): number;
    /** A double in [min, max). */
    public nextDouble(min: number, max: number): number;
    public nextDouble(min?: number, max?: number): number
    {
        if (min === undefined || max === undefined)
            return this.delegate.nextDouble();
        checkRange(min, max);
        return min === max ? min : min + (max - min) * this.delegate.nextDouble();
    }

    public nextFloat(): number
    {
        return this.delegate.nextFloat();
    }

    public nextGaussian(): number
    {
        return this.delegate.nextGaussian();
    }

    public nextInt(): number;
    /** An int in [0, n), as java.util.Random.nextInt(n). */
    public nextInt(n: number): number;
    /** An int in [min, max]: note that max is INCLUSIVE, unlike JavaRandom.nextInt(origin, bound). */
    public nextInt(min: number, max: number): number;
    public nextInt(minOrN?: number, max?: number): number
    {
        if (minOrN === undefined)
            return this.delegate.nextInt();
        if (max === undefined)
            return this.delegate.nextInt(minOrN);
        return Number(this.chooseLong(BigInt(minOrN), BigInt(max)));
    }

    public nextLong(): bigint;
    /** A long in [min, max] (inclusive). */
    public nextLong(min: bigint, max: bigint): bigint;
    public nextLong(min?: bigint, max?: bigint): bigint
    {
        if (min === undefined || max === undefined)
            return this.delegate.nextLong();
        return this.chooseLong(min, max);
    }

    /** A Java char in [min, max] (inclusive), returned as a one-character string. */
    public nextChar(min: string, max: string): string
    {
        return String.fromCharCode(Number(this.chooseLong(BigInt(min.charCodeAt(0)), BigInt(max.charCodeAt(0)))));
    }

    /** A non-negative integer with up to the given number of random bits, exactly as new BigInteger(numberOfBits, random). */
    public nextBigInteger(numberOfBits: number): bigint
    {
        const numBytes = Math.ceil(numberOfBits / 8);
        if (numBytes === 0)
            return 0n;
        const bytes = new Uint8Array(numBytes);
        this.delegate.nextBytes(bytes);
        const excessBits = 8 * numBytes - numberOfBits;
        bytes[0]! &= (1 << (8 - excessBits)) - 1;
        let result = 0n;
        for (const b of bytes)
            result = (result << 8n) | BigInt(b);
        return result;
    }

    /** A randomly chosen item. */
    public choose<T>(items: readonly T[]): T
    {
        if (items.length === 0)
            throw new RangeError("Cannot choose from an empty collection");
        return items[this.delegate.nextInt(items.length)]!;
    }

    // A uniformly distributed value in [min, max], following junit-quickcheck's Ranges.choose.
    private chooseLong(min: bigint, max: bigint): bigint
    {
        checkRange(min, max);
        if (min === max)
            return min;
        const range = max - min + 1n;
        if (range <= 0x80000000n && min > -(1n << 52n) && max < (1n << 52n))
            return BigInt(this.chooseSmall(Number(min), Number(range)));
        const LIMIT = 1n << 62n;
        if (max < LIMIT && min > -LIMIT)
        {
            // Mask to the next power of two and reject values out of range (avoids modulo bias):
            const mask = nextPowerOfTwo(range) - 1n;
            let generated: bigint;
            do
            {
                const l = this.delegate.nextLong();
                generated = (l < 0n ? BigInt.asIntN(64, -l) : l) & mask;
            }
            while (generated >= range);
            return generated + min;
        }
        const bits = range.toString(2).length;
        let generated: bigint;
        do
            generated = this.nextBigInteger(bits);
        while (generated >= range);
        return generated + min;
    }

    // chooseLong for a range of at most 2^31, in exact number arithmetic (bigint arithmetic is
    // slow, and the property tests make millions of these calls).  The same calls to the
    // delegate give the same result as the bigint version: nextLong() is (next(32) << 32) +
    // next(32), and only its sign and low bits matter here.
    private chooseSmall(min: number, range: number): number
    {
        const mask = (range <= 1 ? 1 : 2 ** (32 - Math.clz32(range - 1))) - 1;
        let generated: number;
        do
        {
            const hi = this.delegate.nextInt();
            const lo = this.delegate.nextInt();
            const negative = hi < 0 || (hi === 0 && lo < 0);
            // The low 32 bits of -l are those of -lo:
            generated = (negative ? -lo : lo) & mask;
        }
        while (generated >= range);
        return generated + min;
    }
}

function checkRange<N extends number | bigint>(min: N, max: N): void
{
    if (min > max)
        throw new RangeError(`bad range, ${min} > ${max}`);
}

function nextPowerOfTwo(n: bigint): bigint
{
    let p = 1n;
    while (p < n)
        p <<= 1n;
    return p;
}

/** junit-quickcheck's GenerationStatus: information about the current generation attempt. */
export interface GenerationStatus
{
    /** An arbitrary "size" hint for generated values, which grows with the attempt number. */
    size(): number;
    /** How many attempts have been made so far. */
    attempts(): number;
}

/** junit-quickcheck's GeometricDistribution, used to pick GenerationStatus sizes. */
export class GeometricDistribution
{
    public sampleWithMean(mean: number, random: SourceOfRandomness): number
    {
        if (mean <= 0)
            throw new RangeError(`Need a positive mean, got ${mean}`);
        return this.sample(1 / mean, random);
    }

    private sample(p: number, random: SourceOfRandomness): number
    {
        if (p <= 0 || p > 1)
            throw new RangeError(`Need a probability in (0, 1], got ${p}`);
        if (p === 1)
            return 0;
        const uniform = random.nextDouble();
        return Math.ceil(Math.log(1 - uniform) / Math.log(1 - p));
    }
}

/** junit-quickcheck's SimpleGenerationStatus.  As in Java, calling size() consumes randomness. */
export class SimpleGenerationStatus implements GenerationStatus
{
    constructor(private readonly distribution: GeometricDistribution, private readonly random: SourceOfRandomness, private readonly attemptCount: number)
    {
    }

    public size(): number
    {
        return this.distribution.sampleWithMean(this.attemptCount + 1, this.random);
    }

    public attempts(): number
    {
        return this.attemptCount;
    }
}

/** junit-quickcheck's Generator: produces random values of type T. */
export abstract class Generator<T>
{
    public abstract generate(random: SourceOfRandomness, status: GenerationStatus): T;

    /** Smaller values to try when a property fails for `larger`.  Default: no shrinking. */
    public doShrink(_random: SourceOfRandomness, _larger: T): T[]
    {
        return [];
    }
}

/**
 * junit-quickcheck's composite generator, for a parameter with several @From annotations:
 * each value comes from one of the generators, chosen at random (all weights are 1, the
 * default).  Shrinking asks every component; Java only asks those whose canShrink accepts
 * the value, which component generators that need it check in doShrink instead.
 */
export class CompositeGenerator<T> extends Generator<T>
{
    constructor(private readonly components: readonly Generator<T>[])
    {
        super();
    }

    public override generate(random: SourceOfRandomness, status: GenerationStatus): T
    {
        const choice = random.nextInt(0, this.components.length - 1);
        return this.components[choice]!.generate(random, status);
    }

    public override doShrink(random: SourceOfRandomness, larger: T): T[]
    {
        return this.components.flatMap(c => c.doShrink(random, larger));
    }
}

/** junit-quickcheck's generator for an enum (and so @From(Ctor.class) of a class whose constructor takes one). */
export class EnumGenerator<T> extends Generator<T>
{
    constructor(private readonly values: readonly T[])
    {
        super();
    }

    public override generate(random: SourceOfRandomness, _status: GenerationStatus): T
    {
        return this.values[random.nextInt(0, this.values.length - 1)]!;
    }
}

interface GeneratedContext
{
    random: SourceOfRandomness;
}

// Adapts a junit-quickcheck style Generator to a fast-check Arbitrary.
class GeneratorArbitrary<T> extends fc.Arbitrary<T>
{
    private attempts = 0;

    constructor(private readonly generator: Generator<T>)
    {
        super();
    }

    public override generate(mrng: fc.Random): fc.Value<T>
    {
        const seed = mrng.nextBigInt(-(1n << 63n), (1n << 63n) - 1n);
        const random = new SourceOfRandomness(new JavaRandom(seed));
        const status = new SimpleGenerationStatus(new GeometricDistribution(), random, this.attempts++);
        const context: GeneratedContext = { random };
        return new fc.Value(this.generator.generate(random, status), context);
    }

    public override canShrinkWithoutContext(_value: unknown): _value is T
    {
        return false;
    }

    public override shrink(value: T, context: unknown): fc.Stream<fc.Value<T>>
    {
        const ctx = context as GeneratedContext | undefined;
        if (ctx === undefined)
            return fc.Stream.nil();
        const generator = this.generator;
        return new fc.Stream((function* ()
        {
            for (const smaller of generator.doShrink(ctx.random, value))
                yield new fc.Value(smaller, ctx);
        })());
    }
}

/** Converts a Generator to a fast-check Arbitrary, e.g. to combine with fast-check's own arbitraries. */
export function arbitraryOf<T>(generator: Generator<T>): fc.Arbitrary<T>
{
    return new GeneratorArbitrary(generator);
}

export interface PropertyOptions
{
    /** Number of trials (junit-quickcheck's @Property(trials = N)).  Default 100, as in junit-quickcheck. */
    trials?: number;
    /** A fixed seed for the whole run (junit-quickcheck's @When(seed = N), which applies per parameter). */
    seed?: bigint | number;
    /** Whether to shrink failing values (junit-quickcheck's @Property(shrink = ...)).  Default true. */
    shrink?: boolean;
    /** Vitest timeout for the whole property, in milliseconds. */
    timeout?: number;
}

let propertyDepth = 0;

/** True while running the body of a property; used by assume* to discard the trial. */
export function inProperty(): boolean
{
    return propertyDepth > 0;
}

/**
 * Runs a property over freshly generated values, each trial in turn; the equivalent
 * of a junit-quickcheck @Property method whose parameters are all @From(generator).
 */
export function propertyTest<Ts extends unknown[]>(
    name: string,
    generators: { [K in keyof Ts]: Generator<Ts[K]> },
    body: (...args: Ts) => void | Promise<void>,
    options: PropertyOptions = {}): void
{
    test(name, async () =>
    {
        await checkProperty(generators, body, options);
    }, options.timeout);
}

/** Checks a property directly (without registering a Vitest test); see propertyTest. */
export async function checkProperty<Ts extends unknown[]>(
    generators: { [K in keyof Ts]: Generator<Ts[K]> },
    body: (...args: Ts) => void | Promise<void>,
    options: PropertyOptions = {}): Promise<void>
{
    const arbitraries = (generators as Generator<unknown>[]).map(g =>
    {
        const arb = arbitraryOf(g);
        return options.shrink === false ? fc.noShrink(arb) : arb;
    });
    const property = fc.asyncProperty(...(arbitraries as [fc.Arbitrary<unknown>]), async (...args: unknown[]) =>
    {
        propertyDepth += 1;
        try
        {
            await body(...(args as Ts));
        }
        finally
        {
            propertyDepth -= 1;
        }
    });
    await fc.assert(property, {
        numRuns: options.trials ?? 100,
        ...(options.seed === undefined ? {} : { seed: Number(BigInt.asIntN(32, BigInt(options.seed))) }),
    });
}

/**
 * junit-quickcheck's AbstractStringGenerator: a string of status.size() code points, each
 * from nextCodePoint.  Shrinking removes code points, as junit-quickcheck does.
 */
export abstract class AbstractStringGenerator extends Generator<string>
{
    public override generate(random: SourceOfRandomness, status: GenerationStatus): string
    {
        const size = status.size();
        let s = "";
        for (let i = 0; i < size; i++)
            s += String.fromCodePoint(this.nextCodePoint(random));
        return s;
    }

    public override doShrink(_random: SourceOfRandomness, larger: string): string[]
    {
        const cps = Array.from(larger);
        if (cps.length === 0)
            return [];
        // Try removing the second half, then each single code point:
        const candidates = [cps.slice(0, Math.floor(cps.length / 2)).join("")];
        for (let i = 0; i < cps.length && candidates.length < 20; i++)
            candidates.push([...cps.slice(0, i), ...cps.slice(i + 1)].join(""));
        return candidates.filter(c => Array.from(c).every(cp => this.codePointInRange(cp.codePointAt(0)!)));
    }

    protected abstract nextCodePoint(random: SourceOfRandomness): number;

    protected abstract codePointInRange(codePoint: number): boolean;
}

/**
 * junit-quickcheck's default String generator (used for an un-annotated String parameter):
 * any code point that can be encoded in UTF-8, i.e. anything except a surrogate.
 */
export class StringGenerator extends AbstractStringGenerator
{
    protected override nextCodePoint(random: SourceOfRandomness): number
    {
        const n = random.nextInt(0, 0x10ffff - 0x800);
        return n < 0xd800 ? n : n + 0x800; // Skip the surrogate range
    }

    protected override codePointInRange(codePoint: number): boolean
    {
        return codePoint >= 0 && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff);
    }
}

/** junit-quickcheck's default int generator (used for an un-annotated int parameter): any int. */
export class IntegerGenerator extends Generator<number>
{
    public override generate(random: SourceOfRandomness, _status: GenerationStatus): number
    {
        return random.nextInt(-2147483648, 2147483647);
    }
}
