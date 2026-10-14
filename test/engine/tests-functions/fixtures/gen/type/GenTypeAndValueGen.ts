// Port of test.gen.type.GenTypeAndValueGen (tests-functions testFixtures).
import type { JavaRandom } from "../../../../../../src/engine/java/JavaRandom.js";
import type { DataType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../../../src/engine/types/data/datatype/TypeManager.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import { GeometricDistribution, Generator, SimpleGenerationStatus, SourceOfRandomness, type GenerationStatus } from "../../../../../support/quickcheck.js";
import { GenDataTypeMaker } from "./GenDataTypeMaker.js";
import { GenJellyTypeMaker } from "./GenJellyTypeMaker.js";

/**
 * Generates a class which wraps a type and allows for generation of
 * as many values of that type as you want.
 *
 * A thin simplifying wrapper over GenDataTypeMaker that makes one type
 * and sticks with it.
 */
export class GenTypeAndValueGen extends Generator<GenTypeAndValueGen.TypeAndValueGen>
{
    private readonly genDataTypeMaker: GenDataTypeMaker;

    // If false, can be any type
    public constructor(onlyNumTextTemporal: boolean = false)
    {
        super();
        this.genDataTypeMaker = onlyNumTextTemporal ?
            new GenDataTypeMaker(new Set([GenJellyTypeMaker.TypeKinds.NUM_TEXT_TEMPORAL]), true) :
            new GenDataTypeMaker(undefined, true);
    }

    // Java also has generate(Random r), which uses a SimpleGenerationStatus with 1 attempt
    public override generate(sourceOfRandomness: SourceOfRandomness | JavaRandom, generationStatus?: GenerationStatus): GenTypeAndValueGen.TypeAndValueGen
    {
        if (!(sourceOfRandomness instanceof SourceOfRandomness))
        {
            const s = new SourceOfRandomness(sourceOfRandomness);
            return this.generate(s, new SimpleGenerationStatus(new GeometricDistribution(), s, 1));
        }
        const generated = this.genDataTypeMaker.generate(sourceOfRandomness, generationStatus!);
        const result = generated.makeType();
        return new GenTypeAndValueGen.TypeAndValueGen(result);
    }
}

export namespace GenTypeAndValueGen
{
    export class TypeAndValueGen
    {
        private readonly dataTypeAndValueMaker: GenDataTypeMaker.DataTypeAndValueMaker;

        public constructor(dataTypeAndValueMaker: GenDataTypeMaker.DataTypeAndValueMaker)
        {
            this.dataTypeAndValueMaker = dataTypeAndValueMaker;
        }

        public getType(): DataType
        {
            return this.dataTypeAndValueMaker.getDataType();
        }

        public getTypeManager(): TypeManager
        {
            return this.dataTypeAndValueMaker.getTypeManager();
        }

        public makeValue(): Value
        {
            return this.dataTypeAndValueMaker.makeValue();
        }
    }
}
