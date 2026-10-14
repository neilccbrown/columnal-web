// Port of test.gen.GenValueSpecifiedType (tests-functions testFixtures).
import type { DataType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import type { Value } from "../../../../../src/engine/utility/utility/Value.js";
import type { GenerationStatus, SourceOfRandomness } from "../../../../support/quickcheck.js";
import { GenValueBase } from "./GenValueBase.js";

/**
 * Generates a value of a type specified by the caller.
 */
export class GenValueSpecifiedType extends GenValueBase<GenValueSpecifiedType.ValueGenerator>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): GenValueSpecifiedType.ValueGenerator
    {
        // Not sure if this will mess with randomness by storing the items for later use:
        this.r = sourceOfRandomness;
        this.gs = generationStatus;
        return t => this.makeValue(t);
    }
}

export namespace GenValueSpecifiedType
{
    export type ValueGenerator = (t: DataType) => Value;
}
