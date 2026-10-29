# Help box

Java: `utility-gui/.../HelpBox.java`, `Help.java`, made by `GUI.helpBox(helpId, relevantNode)`; the text
is the dialog help (`resources/help/*.xml`, through `make-help-indiv.xsl`). No Java GUI test covers it.
Web: `src/gui/components/HelpBox.vue`, `src/gui-logic/utility-gui/utility/gui/Help.ts`.

## What is shown

- A grey circle (24 px across) with a "?" in it, next to a dialog field. The "?" turns 45° anticlockwise
  while the full help is showing.
- A popup (ControlsFX PopOver) below it, arrow at the top left, titled with the help item's title, with
  the short text in bold, then either "Click ? icon to show more" (`help.more`, 80%, grey) or the full
  text's paragraphs, with blank lines between. At most 400 px wide.

## States

Not showing → showing short → showing full (pinned).

- Mouse over the circle for 400 ms: shows the short help, unless already showing.
- Mouse leaves the circle: cancels that; hides the popup unless it is showing full.
- Click on the circle: shows the full help (opening the popup if needed); if it was already showing full,
  hides it.
- F1 in the related field (`cycleStates`): not showing → short → full → not showing.
- The popup hides on a click elsewhere or Escape (PopOver's auto-hide); hiding resets it to short.
- While the related field has the focus, the hint says "Click ? icon or press F1 to show more"
  (`help.more.keyboard`).

## Web differences

- The circle has the `button` role and the help title as its label, for screen readers, but (as in Java)
  isn't a tab stop.
- The popup doesn't take the focus, so typing in the field carries on.
