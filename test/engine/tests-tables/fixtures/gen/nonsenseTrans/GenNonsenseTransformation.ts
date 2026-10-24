// Port of test.gen.nonsenseTrans.GenNonsenseTransformation (tests-tables testFixtures).
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../../support/quickcheck.js";
import type { Transformation_Mgr } from "../../Transformation_Mgr.js";
import { GenNonsenseCheck } from "./GenNonsenseCheck.js";
import { GenNonsenseConcatenate } from "./GenNonsenseConcatenate.js";
import { GenNonsenseFilter } from "./GenNonsenseFilter.js";
import { GenNonsenseHideColumns } from "./GenNonsenseHideColumns.js";
import { GenNonsenseJoin } from "./GenNonsenseJoin.js";
import { GenNonsenseManualEdit } from "./GenNonsenseManualEdit.js";
import { GenNonsenseRTransform } from "./GenNonsenseRTransform.js";
import { GenNonsenseSort } from "./GenNonsenseSort.js";
import { GenNonsenseSummaryStats } from "./GenNonsenseSummaryStats.js";
import { GenNonsenseTransform } from "./GenNonsenseTransform.js";

/**
 * Generates a transformation which can be successfully loaded and saved,
 * but not necessarily executed successfully.
 */
export class GenNonsenseTransformation extends Generator<Transformation_Mgr>
{
    private readonly generators: readonly Generator<Transformation_Mgr>[] = [
        new GenNonsenseCheck(),
        new GenNonsenseConcatenate(),
        new GenNonsenseFilter(),
        new GenNonsenseJoin(),
        new GenNonsenseHideColumns(),
        new GenNonsenseManualEdit(),
        new GenNonsenseSort(),
        new GenNonsenseSummaryStats(),
        new GenNonsenseTransform(),
        new GenNonsenseRTransform(),
    ];

    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): Transformation_Mgr
    {
        return sourceOfRandomness.choose(this.generators).generate(sourceOfRandomness, generationStatus);
    }
}
