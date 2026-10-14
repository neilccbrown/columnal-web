// Port of test.gen.GenTableManager (tests-tables testFixtures).
import type { TableManager } from "../../../../../src/engine/data/data/TableManager.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { TFunctionUtil } from "../../../tests-functions/fixtures/functions/TFunctionUtil.js";

/**
 * No randomness involved; this is just an easy way to pass a fresh table manager to
 * a property test.
 */
export class GenTableManager extends Generator<TableManager>
{
    public override generate(_sourceOfRandomness: SourceOfRandomness, _generationStatus: GenerationStatus): TableManager
    {
        return TFunctionUtil.managerWithTestTypes().getFirst();
    }
}
