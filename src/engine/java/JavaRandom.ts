// A bit-for-bit port of java.util.Random (the 48-bit linear congruential generator
// specified in its Javadoc).  The same seed produces the same sequence as on the JVM,
// so tests and code that use fixed seeds behave identically to the Java original.
//
// Java long values (seeds, nextLong) are represented as bigint; Java int values as number.

// The multiplier 0x5DEECE66D split into high and low 24-bit halves, so the
// arithmetic can be done exactly in doubles: 0x5DEECE66D = 0x5DE * 2^24 + 0xECE66D.
const MULTIPLIER = 0x5deece66dn;
const MULTIPLIER_HI = 0x5de;
const MULTIPLIER_LO = 0xece66d;
const ADDEND = 0xb;
const TWO_24 = 0x1000000;
const MASK_48 = (1n << 48n) - 1n;
const DOUBLE_UNIT = 2 ** -53;
const FLOAT_UNIT = 2 ** -24;

export class JavaRandom
{
    // The 48-bit seed, stored as two 24-bit halves: seed = seedHi * 2^24 + seedLo.
    private seedHi = 0;
    private seedLo = 0;
    private nextNextGaussian = 0;
    private haveNextNextGaussian = false;

    /** Like Java, the no-argument constructor picks an unpredictable seed. */
    constructor(seed?: bigint | number)
    {
        this.setSeed(seed ?? JavaRandom.unpredictableSeed());
    }

    private static unpredictableSeed(): bigint
    {
        const words = crypto.getRandomValues(new Uint32Array(2));
        return BigInt.asIntN(64, (BigInt(words[0]!) << 32n) | BigInt(words[1]!));
    }

    public setSeed(seed: bigint | number): void
    {
        const scrambled = (BigInt.asIntN(64, BigInt(seed)) ^ MULTIPLIER) & MASK_48;
        this.seedHi = Number(scrambled >> 24n);
        this.seedLo = Number(scrambled & 0xffffffn);
        this.haveNextNextGaussian = false;
    }

    /** Generates the next pseudorandom number with the given number of random bits (1-32), as a Java int. */
    protected next(bits: number): number
    {
        // seed = (seed * 0x5DEECE66D + 0xB) mod 2^48, computed in 24-bit halves:
        const lo = this.seedLo * MULTIPLIER_LO + ADDEND;
        const carry = Math.floor(lo / TWO_24);
        const newLo = lo - carry * TWO_24;
        const newHi = (this.seedHi * MULTIPLIER_LO + this.seedLo * MULTIPLIER_HI + carry) % TWO_24;
        this.seedHi = newHi;
        this.seedLo = newLo;
        // (int)(seed >>> (48 - bits)):
        return Math.floor((newHi * TWO_24 + newLo) / 2 ** (48 - bits)) | 0;
    }

    /** nextInt(): any Java int. nextInt(bound): in [0, bound). nextInt(origin, bound): in [origin, bound). */
    public nextInt(): number;
    public nextInt(bound: number): number;
    public nextInt(origin: number, bound: number): number;
    public nextInt(originOrBound?: number, bound?: number): number
    {
        if (originOrBound === undefined)
            return this.next(32);
        if (bound === undefined)
            return this.nextIntBounded(originOrBound);
        return this.nextIntRange(originOrBound, bound);
    }

    private nextIntBounded(bound: number): number
    {
        if (bound <= 0)
            throw new RangeError("bound must be positive");
        let r = this.next(31);
        const m = bound - 1;
        if ((bound & m) === 0) // i.e., bound is a power of 2
        {
            // (int)((bound * (long)r) >> 31), with bound = 2^k:
            const k = 31 - Math.clz32(bound);
            r = r >> (31 - k);
        }
        else
        {
            for (let u = r; ((u - (r = u % bound) + m) | 0) < 0; u = this.next(31))
            {
                // Reject over-represented candidates
            }
        }
        return r;
    }

    // RandomGenerator.nextInt(int, int) as inherited by java.util.Random (Java 17+),
    // implemented by RandomSupport.boundedNextInt.
    private nextIntRange(origin: number, bound: number): number
    {
        if (origin >= bound)
            throw new RangeError("bound must be greater than origin");
        let r = this.nextInt();
        const n = (bound - origin) | 0;
        const m = (n - 1) | 0;
        if ((n & m) === 0)
        {
            // Length of range is a power of 2:
            r = ((r & m) + origin) | 0;
        }
        else if (n > 0)
        {
            // Reject over-represented candidates:
            for (let u = r >>> 1; ((u + m - (r = u % n)) | 0) < 0; u = this.nextInt() >>> 1)
            {
                // Retry
            }
            r = (r + origin) | 0;
        }
        else
        {
            // Length of range is not representable as an int:
            while (r < origin || r >= bound)
                r = this.nextInt();
        }
        return r;
    }

    /** Any Java long, as a bigint. */
    public nextLong(): bigint
    {
        const high = BigInt(this.next(32));
        const low = BigInt(this.next(32));
        return BigInt.asIntN(64, (high << 32n) + low);
    }

    public nextBoolean(): boolean
    {
        return this.next(1) !== 0;
    }

    /** A Java float in [0, 1), returned as the (exactly equal) double. */
    public nextFloat(): number
    {
        return this.next(24) * FLOAT_UNIT;
    }

    /** A double in [0, 1). */
    public nextDouble(): number
    {
        const high = this.next(26);
        const low = this.next(27);
        return (high * 2 ** 27 + low) * DOUBLE_UNIT;
    }

    /** The legacy polar-method Gaussian that java.util.Random still uses. */
    public nextGaussian(): number
    {
        if (this.haveNextNextGaussian)
        {
            this.haveNextNextGaussian = false;
            return this.nextNextGaussian;
        }
        let v1: number;
        let v2: number;
        let s: number;
        do
        {
            v1 = 2 * this.nextDouble() - 1; // between -1 and 1
            v2 = 2 * this.nextDouble() - 1; // between -1 and 1
            s = v1 * v1 + v2 * v2;
        }
        while (s >= 1 || s === 0);
        const multiplier = Math.sqrt(-2 * Math.log(s) / s);
        this.nextNextGaussian = v2 * multiplier;
        this.haveNextNextGaussian = true;
        return v1 * multiplier;
    }

    /** Fills the array with random bytes, exactly as Java's nextBytes(byte[]) does. */
    public nextBytes(bytes: Int8Array | Uint8Array): void
    {
        for (let i = 0; i < bytes.length;)
        {
            for (let rnd = this.nextInt(), n = Math.min(bytes.length - i, 4); n-- > 0; rnd >>= 8)
                bytes[i++] = rnd; // Typed arrays keep the low 8 bits, like Java's (byte) cast
        }
    }
}
