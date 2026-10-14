// Port of test.gen.GenColumnId (tests-tables testFixtures).
import type { ColumnId } from "../../../../../src/engine/identifiers/id/ColumnId.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../tests-basic/fixtures/data/TBasicUtil.js";

export class GenColumnId extends Generator<ColumnId>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, _generationStatus: GenerationStatus): ColumnId
    {
        return TBasicUtil.generateColumnId(sourceOfRandomness);
    }
}
