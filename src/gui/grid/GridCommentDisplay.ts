// A comment on the grid, on the main thread (Java: GridCommentDisplay, a GridArea; the comment itself
// is in the engine).  Its text is shown in a text field over its cells (CommentView.vue); selecting it
// selects the whole comment (CommentSelection).  (docs/gui-spec/comments.md)
import type { GridAreaRowIndex } from "../../engine/anns/Annotations.js";
import { CellPosition } from "../../engine/data/data/CellPosition.js";
import { Either } from "../../engine/utility-adt/utility/adt/Either.js";
import type { CellSelection } from "../../gui-logic/stf/gui/grid/CellSelection.js";
import { GridArea } from "../../gui-logic/stf/gui/grid/GridArea.js";
import { RectangleBounds } from "../../gui-logic/stf/gui/grid/RectangleBounds.js";
import { writeClipboard } from "../clipboard.js";
import { type EngineClient, ignoreClosed } from "../engine/EngineClient.js";
import type { CommentInfo } from "../engine/protocol.js";
import { VersionCounter } from "../store/EngineStore.js";

export class GridCommentDisplay extends GridArea
{
    private infoValue: CommentInfo;
    private readonly client: EngineClient;
    // Bumped to focus the comment's field (Java: the floating item's keyboardActivate):
    public readonly focusRequests = new VersionCounter();
    // Bumped when the comment's details change:
    public readonly infoVersion = new VersionCounter();

    public constructor(info: CommentInfo, client: EngineClient)
    {
        super();
        this.infoValue = info;
        this.client = client;
        this.setPosition(new CellPosition(CellPosition.row(info.row), CellPosition.col(info.column)));
    }

    public get info(): CommentInfo
    {
        return this.infoValue;
    }

    /** A newer CommentInfo for this comment (the same id). */
    public update(info: CommentInfo): void
    {
        this.infoValue = info;
        this.infoVersion.bump();
        this.updateParent();
    }

    public getBottomRight(): CellPosition
    {
        return new CellPosition(CellPosition.row(this.info.bottomRow), CellPosition.col(this.info.bottomColumn));
    }

    protected override updateKnownRows(_checkUpToRowIncl: GridAreaRowIndex, _updateSizeAndPositions: () => void): void
    {
        // Nothing to do
    }

    protected override recalculateBottomRightIncl(): CellPosition
    {
        return this.getBottomRight();
    }

    private bounds(): RectangleBounds
    {
        return new RectangleBounds(new CellPosition(CellPosition.row(this.info.row), CellPosition.col(this.info.column)), this.getBottomRight());
    }

    public override getSelectionForSingleCell(cellPosition: CellPosition): CellSelection | null
    {
        if (this.bounds().contains(cellPosition))
            return new CommentSelection(this, cellPosition.columnIndex, cellPosition.rowIndex);
        else
            return null;
    }

    public override getSortKey(): string
    {
        return "";
    }

    /** Java: the floating item's keyboardActivate, focusing the field. */
    public requestFocus(): void
    {
        this.focusRequests.bump();
    }

    /** Java: GridComment.setContent (the document's setAndSave, and pasting). */
    public setContent(content: string): void
    {
        void this.client.request("setCommentContent", this.info.id, content).catch(ignoreClosed);
    }

    /** Java: GridComment.setBottomRight, after resizing. */
    public setBottomRight(bottomRight: CellPosition): void
    {
        void this.client.request("setCommentBottomRight", this.info.id, bottomRight.columnIndex, bottomRight.rowIndex).catch(ignoreClosed);
    }

    /** Java: CommentSelection.doDelete, TableManager.removeComment. */
    public remove(): void
    {
        void this.client.request("removeComment", this.info.id).catch(ignoreClosed);
    }
}

// Java: GridCommentDisplay.CommentSelection
class CommentSelection implements CellSelection
{
    // Although we select the whole comment, if they move out up/down, we stay
    // in the column they entered from:
    public constructor(private readonly display: GridCommentDisplay, private readonly column: number, private readonly row: number)
    {
    }

    public doCopy(): void
    {
        void writeClipboard({ "text/plain": this.display.info.content });
    }

    public doPaste(): void
    {
        void navigator.clipboard.readText().then(content =>
        {
            if (content !== "")
                this.display.setContent(content);
        }).catch(() => {});
    }

    public doDelete(): void
    {
        this.display.remove();
    }

    public getActivateTarget(): CellPosition
    {
        return this.display.getPosition();
    }

    public extendTo(): CellSelection | null
    {
        // Can't extend comment selections:
        return null;
    }

    public atHome(): CellSelection
    {
        return this;
    }

    public atEnd(): CellSelection
    {
        return this;
    }

    public move(_extendSelection: boolean, byRows: number, byColumns: number): Either<CellPosition, CellSelection>
    {
        const topLeft = this.display.getPosition();
        const bottomRight = this.display.getBottomRightIncl();
        const start = new CellPosition(
            CellPosition.row(byRows < 0 ? topLeft.rowIndex : (byRows > 0 ? bottomRight.rowIndex : this.row)),
            CellPosition.col(byColumns < 0 ? topLeft.columnIndex : (byColumns > 0 ? bottomRight.columnIndex : this.column)));
        return Either.left(start.offsetByRowCols(byRows, byColumns));
    }

    public positionToEnsureInView(): CellPosition
    {
        return this.display.getPosition();
    }

    public getSelectionDisplayRectangle(): RectangleBounds
    {
        return new RectangleBounds(this.display.getPosition(), this.display.getBottomRightIncl());
    }

    public isExactly(cellPosition: CellPosition): boolean
    {
        return cellPosition.equals(this.display.getPosition()) && this.display.getBottomRightIncl().equals(cellPosition);
    }

    public includes(area: GridArea): boolean
    {
        return this.display === area;
    }

    public gotoRow(): void
    {
        // Not applicable
    }

    public notifySelected(): void
    {
        // Nothing to do
    }

    public toString(): string
    {
        return "CommentSelection[" + this.display.getPosition().toString() + "]";
    }
}
