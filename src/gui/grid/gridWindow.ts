// Which of a table's rows and columns are on the page.  A table puts on the page the blocks of rows,
// and the columns, that are in view, plus a margin; the window then stays as it is while what is in
// view is inside it, so that small scrolls change nothing (Java laid out its cells again only when a
// scroll went beyond the ones it had, which TestVirtualGridLayout checks).

/** Rows firstBlock * blockSize to lastBlockExcl * blockSize, and columns firstColumn to lastColumnExcl. */
export interface TableWindow
{
    readonly firstBlock: number;
    readonly lastBlockExcl: number;
    readonly firstColumn: number;
    readonly lastColumnExcl: number;
}

export const EMPTY_WINDOW: TableWindow = { firstBlock: 0, lastBlockExcl: 0, firstColumn: 0, lastColumnExcl: 0 };

export interface WindowInputs
{
    // The table's data rows: where the first is (px from the canvas top), how many, and their height
    readonly dataTop: number;
    readonly rows: number;
    readonly rowHeight: number;
    readonly blockSize: number;
    // The table's columns' left edges (px from the canvas left), and its right edge:
    readonly columnLefts: readonly number[];
    readonly right: number;
    // The visible part of the canvas:
    readonly viewLeft: number;
    readonly viewTop: number;
    readonly viewWidth: number;
    readonly viewHeight: number;
}

// The margin around what is in view, in blocks and columns:
const BLOCK_MARGIN = 1;
const COLUMN_MARGIN = 2;

/** The window for what is in view now, keeping the current one if it still covers it. */
export function tableWindow(current: TableWindow, w: WindowInputs): TableWindow
{
    const blocks = Math.ceil(w.rows / w.blockSize);
    const firstRow = Math.max(0, Math.floor((w.viewTop - w.dataTop) / w.rowHeight));
    const lastRowExcl = Math.min(w.rows, Math.ceil((w.viewTop + w.viewHeight - w.dataTop) / w.rowHeight));
    const columns = w.columnLefts.length;
    let firstColumn = 0;
    while (firstColumn < columns - 1 && w.columnLefts[firstColumn + 1]! <= w.viewLeft)
        firstColumn++;
    let lastColumnExcl = firstColumn;
    while (lastColumnExcl < columns && w.columnLefts[lastColumnExcl]! < w.viewLeft + w.viewWidth)
        lastColumnExcl++;
    const inView = firstRow < lastRowExcl && firstColumn < lastColumnExcl && w.right > w.viewLeft;
    if (!inView)
        return current.lastBlockExcl === 0 && current.lastColumnExcl === 0 ? current : EMPTY_WINDOW;
    const firstBlock = Math.floor(firstRow / w.blockSize);
    const lastBlockExcl = Math.ceil(lastRowExcl / w.blockSize);
    if (current.firstBlock <= firstBlock && lastBlockExcl <= current.lastBlockExcl && current.lastBlockExcl <= blocks
        && current.firstColumn <= firstColumn && lastColumnExcl <= current.lastColumnExcl && current.lastColumnExcl <= columns)
        return current;
    return {
        firstBlock: Math.max(0, firstBlock - BLOCK_MARGIN),
        lastBlockExcl: Math.min(blocks, lastBlockExcl + BLOCK_MARGIN),
        firstColumn: Math.max(0, firstColumn - COLUMN_MARGIN),
        lastColumnExcl: Math.min(columns, lastColumnExcl + COLUMN_MARGIN),
    };
}
