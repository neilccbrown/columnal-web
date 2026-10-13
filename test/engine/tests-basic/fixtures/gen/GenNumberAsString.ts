// Port of test.gen.GenNumberAsString (tests-basic testFixtures).
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";

/**
 * Created by neil on 09/12/2016.
 */
export class GenNumberAsString extends Generator<string>
{
    private readonly fixBits: boolean;
    private maxBits = -1;

    /**
     * @param fixBits If true then
     */
    public constructor(fixBits: boolean = false)
    {
        super();
        this.fixBits = fixBits;
    }

    public override generate(sourceOfRandomness: SourceOfRandomness, _generationStatus: GenerationStatus | null): string
    {
        if (sourceOfRandomness.nextBoolean())
        {
            // Use awkward numbers:
            return sourceOfRandomness.choose<bigint>([
                0n, 1n, -1n,
                -128n, -127n, 127n, // Byte.MIN_VALUE, Byte.MIN_VALUE + 1, Byte.MAX_VALUE
                -32768n, -32767n, 32767n, // Short
                -2147483648n, -2147483647n, 2147483647n, // Integer
                -2147483649n, 2147483648n, // (long)Integer.MIN_VALUE - 1L, (long)Integer.MAX_VALUE + 1L
                -9223372036854775808n, -9223372036854775807n, 9223372036854775807n, // Long
                -9223372036854775809n, 9223372036854775808n, // BigInteger beyond Long
            ]).toString();
        }
        if (!this.fixBits || this.maxBits === -1)
        {
            this.maxBits = sourceOfRandomness.nextInt(3, 80);
        }
        const includeFractional = this.maxBits >= 48;
        if (includeFractional && sourceOfRandomness.nextBoolean())
        {
            // I don't think it matters here whether we come up with
            // double or big decimal; will be stored in big decimal either way.
            // PORT-NOTE: Java's String.format("%f") rounds the shortest decimal half-up; toFixed(6) uses the exact binary value.
            return sourceOfRandomness.nextDouble().toFixed(6);
        }
        else
        {
            // We geometrically distribute by uniformly distributing number of bits:
            return sourceOfRandomness.nextBigInteger(sourceOfRandomness.nextInt(1, this.maxBits)).toString();
        }
    }
}
