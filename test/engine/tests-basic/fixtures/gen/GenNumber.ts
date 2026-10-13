// Port of test.gen.GenNumber (tests-basic testFixtures).
import { Decimal, doubleValue, intValue, longValue } from "../../../../../src/engine/java/JavaBigDecimal.js";
import { Utility } from "../../../../../src/engine/utility/utility/Utility.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { GenNumberAsString } from "./GenNumberAsString.js";

export class GenNumber extends Generator<Decimal>
{
    private readonly fixBits: boolean;

    public constructor(fixBits: boolean = false)
    {
        super();
        this.fixBits = fixBits;
    }

    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus | null): Decimal
    {
        const n = Utility.parseNumber(new GenNumberAsString(this.fixBits).generate(sourceOfRandomness, generationStatus));
        // PORT-NOTE: Java offers the same number stored as Integer/Short/Byte/BigDecimal, to test
        // code with each Java number class; here all numbers are canonical Decimals.  The logic
        // is kept exactly, including that a non-integer that is equal to an int as a double
        // offers the truncated int values as alternatives.
        const rets: Decimal[] = [n];
        const iv = intValue(n);
        const lv = longValue(n);
        if (doubleValue(n) === iv)
        {
            // If it fits in smaller, we may randomly choose to use smaller:
            rets.push(new Decimal(iv)); // BigDecimal.valueOf(n.intValue())
            if (BigInt(iv) === lv)
                rets.push(new Decimal(iv)); // n.intValue()
            const sv = (iv << 16) >> 16; // n.shortValue()
            if (BigInt(sv) === lv)
                rets.push(new Decimal(sv));
            const bv = (iv << 24) >> 24; // n.byteValue()
            if (BigInt(bv) === lv)
                rets.push(new Decimal(bv));
        }
        return sourceOfRandomness.choose(rets);
    }
}
