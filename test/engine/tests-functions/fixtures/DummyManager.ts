// Port of test.DummyManager (tests-functions testFixtures).
import type { DataSource } from "../../../../src/engine/data/data/DataSource.js";
import type { GridComment } from "../../../../src/engine/data/data/GridComment.js";
import type { Table } from "../../../../src/engine/data/data/Table.js";
import { TableManager } from "../../../../src/engine/data/data/TableManager.js";
import type { Transformation } from "../../../../src/engine/data/data/Transformation.js";
import { TransformationManager } from "../../../../src/engine/transformations/transformations/TransformationManager.js";

/**
 * A TableManager implementation useful for testing
 */
export class DummyManager extends TableManager
{
    public constructor()
    {
        super(TransformationManager.getInstance(), { getHandledContent: _onError => new Map() });
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
