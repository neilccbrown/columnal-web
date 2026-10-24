// Port of test.gen.GenGridAreaList (tests-gui-grid).
import { CellPosition } from "../../../../src/engine/data/data/CellPosition.js";
import type { CellSelection } from "../../../../src/gui-logic/stf/gui/grid/CellSelection.js";
import { GridArea } from "../../../../src/gui-logic/stf/gui/grid/GridArea.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../support/quickcheck.js";

export class GenGridAreaList extends Generator<GenGridAreaList.GridAreaList>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, _generationStatus: GenerationStatus): GenGridAreaList.GridAreaList
    {
        const length = sourceOfRandomness.nextInt(2, 40);
        const r: GridArea[] = [];
        for (let i = 0; i < length; i++)
        {
            const x0 = sourceOfRandomness.nextInt(1, 25);
            const x1 = x0 + sourceOfRandomness.nextInt(1, 15);
            const y0 = sourceOfRandomness.nextInt(1, 25);
            const y1 = y0 + sourceOfRandomness.nextInt(1, 15);
            const gridArea = GenGridAreaList.makeGridArea(x0, y0, x1, y1);
            r.push(gridArea);
        }
        return new GenGridAreaList.GridAreaList(r);
    }

    public static makeGridArea(x0: number, y0: number, x1: number, y1: number): GridArea
    {
        const gridArea = new class extends GridArea
        {
            protected override updateKnownRows(_checkUpToRowIncl: number, _updateSizeAndPositions: () => void): void
            {

            }

            protected override recalculateBottomRightIncl(): CellPosition
            {
                return this.getPosition().offsetByRowCols(x1 - x0, y1 - y0);
            }

            public override getSelectionForSingleCell(_cellPosition: CellPosition): CellSelection | null
            {
                return null;
            }

            public override getSortKey(): string
            {
                return "";
            }
        }();
        gridArea.setPosition(new CellPosition(CellPosition.row(y0), CellPosition.col(x0)));
        return gridArea;
    }
}

export namespace GenGridAreaList
{
    export class GridAreaList
    {
        public readonly gridAreas: readonly GridArea[];

        /** @internal Java: private */
        public constructor(gridAreas: readonly GridArea[])
        {
            this.gridAreas = gridAreas;
        }
    }
}
