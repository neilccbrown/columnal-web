// Port of xyz.columnal.data.GridComment (data module).
import { javaObjectsHash } from "../../java/JavaObject.js";
import type { SaveTag } from "../../identifiers/id/SaveTag.js";
import { GrammarUtility } from "../../parsers/grammar/GrammarUtility.js";
import { CellPosition } from "./CellPosition.js";
import type { Table } from "./Table.js";

export class GridComment
{
    private readonly saveTag: SaveTag;
    // Note that the fields below are all mutable;

    // No escapes
    private content: string;
    private position: CellPosition;
    private widthInColumns: number;
    private heightInColumns: number;

    private display: GridComment.GridCommentDisplayBase | null = null;

    public constructor(saveTag: SaveTag, content: string, position: CellPosition, widthInColumns: number, heightInColumns: number)
    {
        this.saveTag = saveTag;
        this.content = content;
        this.position = position;
        this.widthInColumns = widthInColumns;
        this.heightInColumns = heightInColumns;
    }

    public save(saver: Table.Saver): void
    {
        const p = this.saveTag.getTag();
        const commentSrc = "COMMENT @BEGIN " + p + "\n" + [
            "CONTENT @BEGIN",
            GrammarUtility.escapeChars(this.content),
            "@END CONTENT",
            "DISPLAY @BEGIN",
            "POSITION " + [this.position.columnIndex, this.position.rowIndex, this.widthInColumns, this.heightInColumns].map(n => n.toString()).join(" "),
            "@END DISPLAY"].map(s => p + " " + s).join("\n") + "\n@END " + p + " COMMENT";
        saver.saveComment(commentSrc);
    }

    public getContent(): string
    {
        return this.content;
    }

    public setContent(content: string): void
    {
        this.content = content;
    }

    public getDisplay(): GridComment.GridCommentDisplayBase | null
    {
        return this.display;
    }

    public setDisplay(display: GridComment.GridCommentDisplayBase): void
    {
        this.display = display;
    }

    public getPosition(): CellPosition
    {
        return this.position;
    }

    public getBottomRight(): CellPosition
    {
        return this.position.offsetByRowCols(this.heightInColumns - 1, this.widthInColumns - 1);
    }

    public setBottomRight(bottomRight: CellPosition): void
    {
        this.widthInColumns = Math.max(1, bottomRight.columnIndex - this.getPosition().columnIndex + 1);
        this.heightInColumns = Math.max(1, bottomRight.rowIndex - this.getPosition().rowIndex + 1);
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof GridComment)) return false;
        const that = o;
        return this.widthInColumns === that.widthInColumns &&
                this.heightInColumns === that.heightInColumns &&
                this.content === that.content &&
                this.position.equals(that.position);
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.content, this.position, this.widthInColumns, this.heightInColumns);
    }
}

export namespace GridComment
{
    /**
     * Slightly ham-fisted way to break the data->gui module dependency
     * while still letting Table store a link to its display.
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    export interface GridCommentDisplayBase
    {
    }
}
