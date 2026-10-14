// Port of test.DummyManager (tests-functions testFixtures).
//
// PORT-DEFERRED: Java passes TransformationManager.getInstance() as the transformation loader;
// the transformations are ported in Phase 5.  Until then, loading a transformation fails.
import type { DataSource } from "../../../../src/engine/data/data/DataSource.js";
import type { GridComment } from "../../../../src/engine/data/data/GridComment.js";
import type { Table } from "../../../../src/engine/data/data/Table.js";
import { TableManager } from "../../../../src/engine/data/data/TableManager.js";
import type { Transformation } from "../../../../src/engine/data/data/Transformation.js";
import { UnimplementedException } from "../../../../src/engine/utility-error/error/UnimplementedException.js";

const transformationLoaderUntilPhase5: TableManager.TransformationLoader = {
    loadOne(): Transformation
    {
        throw new UnimplementedException();
    },
};

/**
 * A TableManager implementation useful for testing
 */
export class DummyManager extends TableManager
{
    public constructor()
    {
        super(transformationLoaderUntilPhase5, { getHandledContent: _onError => new Map() });
        this.addListener({
            removeTable(_t: Table, _remainingCount: number): void
            {
            },

            addSource(_dataSource: DataSource): void
            {
            },

            addTransformation(_transformation: Transformation): void
            {
            },

            addComment(_gridComment: GridComment): void
            {
            },

            removeComment(_gridComment: GridComment): void
            {
            },
        });
    }

    public static make(): DummyManager
    {
        return new DummyManager();
    }
}
