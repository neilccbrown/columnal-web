// Port of test.gen.GenUnitDefinition (tests-functions testFixtures).
import type { UnitIdentifier } from "../../../../../src/engine/anns/Annotations.js";
import { isAlphabetic, isOtherLetter } from "../../../../../src/engine/java/JavaCharacter.js";
import { Rational } from "../../../../../src/engine/java/Rational.js";
import { SingleUnit } from "../../../../../src/engine/types/data/unit/SingleUnit.js";
import type { Unit } from "../../../../../src/engine/types/data/unit/Unit.js";
import { UnitDeclaration } from "../../../../../src/engine/types/data/unit/UnitDeclaration.js";
import { Either } from "../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { GenString } from "../../../tests-basic/fixtures/gen/GenString.js";
import { GenUnit } from "../../../tests-basic/fixtures/gen/GenUnit.js";

// Java: Character.getType(i) == Character.CURRENCY_SYMBOL
const CURRENCY_SYMBOL = /^\p{Sc}$/u;

let valid: number[] | null = null;

// Java: computed in a static initialiser; here on first use, as it takes a moment
function getValid(): number[]
{
    if (valid === null)
    {
        const validBuild: number[] = [];
        for (let i = 0; i <= 0x10FFFF; i++)
        {
            if (isAlphabetic(i)
                || isOtherLetter(i)
                || CURRENCY_SYMBOL.test(String.fromCodePoint(i)))
                validBuild.push(i);
        }
        valid = validBuild;
    }
    return valid;
}

export class GenUnitDefinition extends Generator<GenUnitDefinition.UnitDetails>
{
    public override generate(random: SourceOfRandomness, status: GenerationStatus): GenUnitDefinition.UnitDetails
    {
        const id = this.genIdent(random);
        if (random.nextInt(4) === 1)
        {
            return new GenUnitDefinition.UnitDetails(id, Either.left(this.genIdent(random)));
        }
        else
        {
            const unitDeclaration = new UnitDeclaration(
                    new SingleUnit(id, new GenString().generate(random, status), "", ""),
                random.nextInt(3) === 1 ? null :
                    new Pair<Rational, Unit>(this.genRational(random), new GenUnit().generate(random, status)), ""
            );
            return new GenUnitDefinition.UnitDetails(id, Either.right(unitDeclaration));
        }
    }

    private genRational(random: SourceOfRandomness): Rational
    {
        const abs = (b: bigint): bigint => b < 0n ? -b : b;
        let num = abs(random.nextBigInteger(128));
        if (num === 0n)
            num = 1n;
        let den = abs(random.nextBigInteger(128));
        if (den === 0n)
            den = 1n;
        return Rational.of(num, den);
    }

    private genIdent(random: SourceOfRandomness): UnitIdentifier
    {
        let sb = String.fromCodePoint(this.pickValid(random));
        const segments = random.nextInt(1, 3);
        for (let i = 0; i < segments; i++)
        {
            if (i > 0)
                sb += "_";
            const length = random.nextInt(1, 4);
            for (let j = 0; j < length; j++)
            {
                sb += String.fromCodePoint(this.pickValid(random));
            }
        }
        return sb;
    }

    private pickValid(random: SourceOfRandomness): number
    {
        const v = getValid();
        return v[random.nextInt(v.length)]!;
    }
}

export namespace GenUnitDefinition
{
    export class UnitDetails
    {
        public readonly name: UnitIdentifier;
        public readonly aliasOrDeclaration: Either<UnitIdentifier, UnitDeclaration>;

        public constructor(name: UnitIdentifier, aliasOrDeclaration: Either<UnitIdentifier, UnitDeclaration>)
        {
            this.name = name;
            this.aliasOrDeclaration = aliasOrDeclaration;
        }

        // For debugging:
        public toString(): string
        {
            return "UnitDetails{" +
                    "name='" + this.name + "'" +
                    ", aliasOrDeclaration=" + this.aliasOrDeclaration.toString() +
                    "}";
        }
    }
}
