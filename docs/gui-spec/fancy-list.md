# Fancy list

Java: `utility-gui/.../FancyList.java`, `SmallDeleteButton.java`. Styles: `dialogs.scss` (for the table list
and sort list dialogs), `general.scss` (`.small-delete`). Used by the table list, sort, tag and record
type dialogs (Phases 9–10). Covered by the Java GUI tests through those dialogs.
Web: `src/gui/components/FancyList.vue`.

## What is shown

- A scrolling column of cells (alternating even/odd backgrounds), each the item's content and, if
  deleting is allowed, a small cross on the right (grey; with a dark red circle and white cross on
  hover). Then an end area, with a top border and, if adding is allowed, an "Add" button
  (`fancylist.add`, or the text the list sets) centred in it.
- Selected cells have the focus colour background (and a white cross).

## Interaction

- Press on a cell: selects only it. With Ctrl (Cmd on macOS): adds it. With Shift: if it isn't
  selected, selects the range from the nearest selected cell above (or, if none, to the nearest selected
  cell below), else nothing. A press on a control in the cell is the control's.
- Press on the background: clears the selection.
- Delete or Backspace (not in a text field): deletes the selected cells.
- The cross: deletes the selection if its cell is selected, else just its cell. Hovering over the cross
  of a selected cell highlights the crosses of all the selected cells.
- Deleted cells slide out to the right (200 ms), then go.
- Dragging (if reordering is allowed) from a press on a cell or the background: a dashed line above the
  cell (or the end) the selection would go before, nearest to the pointer; releasing moves the
  selected cells there, in order, and clears the selection.
- Add: adds a new item at the end, its cell editing straight away.

## Web differences

- Java bug, fixed: deleting didn't change the selection, which was kept by position, so after deleting
  the selected cells (or a cell before them), the cells then at those positions were selected (though
  they didn't look it), and Delete deleted them. The selection now stays on the same cells.

- The items are data (`v-model:items`); the `cell` slot shows one and calls `setItem` to change it.
  Cells are cleaned up when they unmount (Java: `cleanup`).
- Pressing a cell gives the list the keyboard focus (and the cross doesn't take it), so that Delete goes to it (in Java, a press on a
  cell didn't move the focus, so Delete only worked if something in the list already had it).
