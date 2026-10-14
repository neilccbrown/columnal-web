// Port of test.gen.GenTableId (tests-tables testFixtures).
import type { TableId } from "../../../../../src/engine/identifiers/id/TableId.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../tests-basic/fixtures/data/TBasicUtil.js";

export class GenTableId extends Generator<TableId>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, _generationStatus: GenerationStatus): TableId
    {
        return TBasicUtil.generateTableId(sourceOfRandomness);
    }
}
