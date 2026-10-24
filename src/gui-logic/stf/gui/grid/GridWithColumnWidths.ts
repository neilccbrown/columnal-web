// Port of xyz.columnal.gui.grid.GridWithColumnWidths (stf module).
import type { AbsColIndex } from "../../../../engine/anns/Annotations.js";

export class GridWithColumnWidths
{
    public static readonly DEFAULT_COLUMN_WIDTH = 100;
    public static readonly fixedFirstColumnWidth = 20;

    protected readonly customisedColumnWidths = new Map<AbsColIndex, number>();

    public getColumnWidth(columnIndex: number): number
    {
        if (columnIndex === 0)
            return GridWithColumnWidths.fixedFirstColumnWidth;
        else
            return this.customisedColumnWidths.get(columnIndex) ?? GridWithColumnWidths.DEFAULT_COLUMN_WIDTH;
    }
}
