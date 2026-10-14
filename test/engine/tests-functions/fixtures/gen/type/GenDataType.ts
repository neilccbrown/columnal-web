// Port of test.gen.type.GenDataType (tests-functions testFixtures).
import { javaEnumValues } from "../../../../../../src/engine/java/JavaEnum.js";
import type { DataType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { GenDataTypeMaker } from "./GenDataTypeMaker.js";
import { GenJellyTypeMaker } from "./GenJellyTypeMaker.js";

/**
 * A simplifying wrapper for GenDataTypeMaker that just gives the data type
 */
export class GenDataType extends Generator<DataType>
{
    private readonly genDataTypeMaker: GenDataTypeMaker;

    // Java has (), (mustHaveValues) and (typeKinds, mustHaveValues) constructors; by default, all kinds
    public constructor(typeKindsOrMustHaveValues: ReadonlySet<GenJellyTypeMaker.TypeKinds> | boolean = false, mustHaveValues: boolean = false)
    {
        super();
        if (typeof typeKindsOrMustHaveValues === "boolean")
            this.genDataTypeMaker = new GenDataTypeMaker(new Set(javaEnumValues<GenJellyTypeMaker.TypeKinds>(GenJellyTypeMaker.TypeKinds)), typeKindsOrMustHaveValues);
        else
            this.genDataTypeMaker = new GenDataTypeMaker(typeKindsOrMustHaveValues, mustHaveValues);
    }

    public override generate(r: SourceOfRandomness, generationStatus: GenerationStatus): DataType
    {
        return this.genDataTypeMaker.generate(r, generationStatus).makeType().getDataType();
    }

    /*
    public static class GenTaggedType extends Generator<DataTypeAndManager>
    { ... }
    */
}
