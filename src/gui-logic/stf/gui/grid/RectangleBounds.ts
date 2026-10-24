// Port of xyz.columnal.gui.grid.RectangleBounds (stf module).
import { CellPosition } from "../../../../engine/data/data/CellPosition.js";
import { javaObjectsHash } from "../../../../engine/java/JavaObject.js";
import { InternalException } from "../../../../engine/utility-error/error/InternalException.js";
import { Log } from "../../../../engine/utility/log/Log.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";

export class RectangleBounds
{
    public readonly topLeftIncl: CellPosition;
    public readonly bottomRightIncl: CellPosition;

    public constructor(topLeftIncl: CellPosition, bottomRightIncl: CellPosition)
    {
        if (bottomRightIncl.rowIndex < topLeftIncl.rowIndex || bottomRightIncl.columnIndex < topLeftIncl.columnIndex)
        {
            Log.log(new InternalException("Bottom right " + bottomRightIncl.toString() + " is left/above the top left: " + topLeftIncl.toString()));
            // For safety:
            this.bottomRightIncl = new CellPosition(Utility.maxRow(topLeftIncl.rowIndex, bottomRightIncl.rowIndex), Utility.maxCol(topLeftIncl.columnIndex, bottomRightIncl.columnIndex));
            this.topLeftIncl = topLeftIncl;
        }
        else
        {
            this.topLeftIncl = topLeftIncl;
            this.bottomRightIncl = bottomRightIncl;
        }
    }

    public contains(cellPosition: CellPosition): boolean
    {
        return this.topLeftIncl.columnIndex <= cellPosition.columnIndex && cellPosition.columnIndex <= this.bottomRightIncl.columnIndex
            && this.topLeftIncl.rowIndex <= cellPosition.rowIndex && cellPosition.rowIndex <= this.bottomRightIncl.rowIndex;
    }

    // Makes sure bottom right isn't left/above the top left
    public static fixBottomRight(topLeft: CellPosition, bottomRight: CellPosition): RectangleBounds
    {
        return new RectangleBounds(topLeft, new CellPosition(Utility.maxRow(topLeft.rowIndex, bottomRight.rowIndex), Utility.maxCol(topLeft.columnIndex, bottomRight.columnIndex)));
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof RectangleBounds)) return false;
        const that = o;
        return this.topLeftIncl.equals(that.topLeftIncl) &&
            this.bottomRightIncl.equals(that.bottomRightIncl);
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.topLeftIncl, this.bottomRightIncl);
    }

    public toString(): string
    {
        return "[" + this.topLeftIncl.toString() + " - " + this.bottomRightIncl.toString() + "]";
    }

    public intersectWith(rectangleBounds: RectangleBounds): RectangleBounds | null
    {
        const topLeft = new CellPosition(
            Utility.maxRow(this.topLeftIncl.rowIndex, rectangleBounds.topLeftIncl.rowIndex),
            Utility.maxCol(this.topLeftIncl.columnIndex, rectangleBounds.topLeftIncl.columnIndex)
        );
        const bottomRight = new CellPosition(
            Utility.minRow(this.bottomRightIncl.rowIndex, rectangleBounds.bottomRightIncl.rowIndex),
            Utility.minCol(this.bottomRightIncl.columnIndex, rectangleBounds.bottomRightIncl.columnIndex)
        );

        return topLeft.rowIndex <= bottomRight.rowIndex && topLeft.columnIndex <= bottomRight.columnIndex ?
            new RectangleBounds(topLeft, bottomRight) : null;
    }

    public touches(rectangleBounds: RectangleBounds): boolean
    {
        return this.intersectWith(rectangleBounds) !== null;
    }
}
