# The grid (table canvas)

Java: `stf/.../gui/grid/VirtualGrid.java` (the node, its scrolling and `ResizableColumnBar`),
`VirtualGridLineSupplier.java`; `table-gui/.../DataDisplay.java` (column names and types, floating),
`HeadedDisplay.java` (the table name row and border), `RowLabelSupplier.java`. Styles: `virtual-grid.scss`,
`stableview.scss`. Tests: `TestVirtualGridLayout` (its overlap checks are at the logic level in
`test/gui-logic/stf/Grid.test.ts`, the rest in `test/gui/grid/GridLayout.test.ts`).
Also `TestKeyboardMovement` (`test/gui/grid/KeyboardMovement.test.ts`) and `TestNumberColumnDisplay`'s display
checks (`test/gui/grid/NumberColumnDisplay.test.ts`); cells are `stf/.../EditorKitCache.java`,
`DocumentTextField.java` (unfocused), `NumberColumnFormatter.java` and `TableDisplayUtility.java`.
Web: `src/gui/grid/` (`EngineGrid.vue`, `TableGrid.vue`, `GridTable.vue`, `GridTableDisplay.ts`,
`gridWindow.ts`), on the ported `VirtualGrid` (`src/gui-logic/stf/gui/grid/`).

## Layout

- Rows are 24 px. The first column is 20 px; the others 100 px unless resized. The grid extends 10 columns
  right of and 20 rows below the tables (`new VirtualGrid(…, 10, 20)`), and to fill the view.
- Grid lines on each column's right edge and each row's bottom edge, over the empty background.
- Each table: the table name row (header background; a transformation's is darker), then the column
  names, the column types, and the data rows, with a border and drop shadow. Row labels (the row numbers,
  1-based, right-aligned in the mono font) are to the left of the data rows.
- While a table is in view, its column names stay at the top of the view (but no lower than just above
  its last data row), and its row labels stay at the left edge of the view.
- A table whose columns can't be worked out shows its error in a dark red box below its header.

## Scrolling and loading

- Only the rows and columns in view, plus a margin (a block of 16 rows, two columns), are on the page;
  small scrolls change nothing, and a large scroll brings in the new rows once.
- Rows are fetched from the engine in blocks as they come into view, and kept (the 256 most recently
  used blocks per table), so scrolling back doesn't fetch them again. Until they arrive, cells are empty.

## Cells

- A cell shows its value as text (`DataTypeUtility.valueToString`: text in quotes, booleans, dates, …),
  padded 2 px, clipped at its edges, on the cell background with dividers on its right and bottom.
  Each column's cells have its type's style class (`stf-cell-number`, `stf-cell-text`, …).
- Number columns are right-aligned. In an editable number column, the visible numbers are laid out by
  `NumberColumnFormatter`: integer digits in Noto Mono, the fraction and the dot at 85%, lined up on the
  decimal point, padded with spaces, and shortened with "…" (fraction first, keeping at least two
  places, then the integer part) to fit the column. Numbers in other columns are shown as they are.
- An invalid value (typed and stored as text) shows its text with the character where its recogniser
  finds the error marked (`input-error`), and the cell has a red inner border (`has-error`).
- A value that can't be worked out shows "ERR: " and the error (or "ERROR"), with the red border.
- Copying (F11 or Ctrl/Cmd+C) puts the selected cells (or, for an entire table selection, the whole
  table) on the clipboard, as values separated by ", " and lines; if any can't be worked out, nothing is
  copied (Java logged it).

## Column widths

- A 10 px bar above the grid, scrolled sideways with it, has a line at each column's right edge, with
  ↔ arrows except for the first column. Near a line (within 6 px) the cursor is a resize cursor; dragging
  resizes the column (at least 20 px). Shift-press does nothing.
- A double click there sizes the column to its widest column name or type label (between 20 and 600 px),
  or 100 px if none is shown.

## Selection and keyboard

- The selection is drawn as a 3 px focus-colour outline outside its cells. An entire table selection
  also colours the table's name row (and its cursor is the move cursor).
- Keys (Java: VirtualGrid's InputMap): Ctrl/Cmd+Home goes to the top-left cell (1, 1); Home, End,
  arrows, Page Up and Page Down move (with Shift, extend); Enter or Space activates the selection;
  Delete or Backspace deletes it; F11 or Ctrl/Cmd+C copies, Ctrl/Cmd+V pastes; typing a character
  starts editing with it. Moving keeps the selection in view, scrolling smoothly.
- A click (still since the press): on a cell selects it (with Shift, extends the selection to it); on
  an empty cell (not in row or column 0) selects it; on the cell that is selected by itself, or a double
  click, starts editing (`cell-editor.md`). A click on a table's name row selects the entire table (focused on the column
  whose left edge is nearest). Column names and types, and row labels, handle their own clicks (their
  actions come in Phase 9).
- When the grid loses the focus, the selection goes.

## Moving tables

- Dragging a table's name row (after a few pixels' movement) blurs the table, and shows a translucent
  rectangle following the pointer and a black 3 px outline where the table would go: the nearest cell
  corner to the rectangle's top left, at least row 1 and column 1. Releasing moves the table there, and
  the engine records the position (for saving).
- While dragging, the pointer within 30 px of an edge of the view scrolls it that way at 100 px/s, within
  5 px at 500 px/s (Java's nudge scrolling).
- Tables that would overlap are moved apart by the grid (VirtualGrid), and the engine is told those
  positions too.

## Web differences

- Native scrolling (one scroll container), with CSS sticky positioning for the column names and row
  labels; Java scrolled smoothly with its own scroll bars, and laid out its own nodes.
- The selection doesn't flash, and moving it scrolls with the browser's smooth scrolling.
- The digit widths for the formatter are measured once the fonts have loaded (number columns wait for
  them). Java's code measures the dot's width in the fraction's style, but its tests (which passed)
  need the dot's own width, so that is measured.
- Copying writes text, and Columnal's format as a "web application/records" custom format where the
  browser supports it. Pasting into selected cells does nothing (Java's was a TODO); pasting text into a
  cell being edited works.
- Left for later: the table name's editing and the table's "hat", the table and column menus, row label
  menus, "Goto row" and actions on empty cells (Phase 9, with `TableDisplay` and the main window).
