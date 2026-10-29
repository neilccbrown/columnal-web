# Context menus and tooltips

Java: JavaFX `ContextMenu`, with items made by `GUI.menuItem`, `menuItemPos`, `menu`, `checkMenuItem`
(`utility-gui/.../GUI.java`); `Tooltip`, and `GUI.showTooltipWhenAbbrev`. Styles: `general.scss`
(`.context-menu`, `.menu-item`, `.tooltip`). The Java GUI tests find menu items by their `id-…` class.
Web: `src/gui/components/menus/` (`menus.ts`, `ContextMenu.vue`, `MenuEntries.vue`), `HoverTooltip.vue`,
`AbbrevLabel.vue`.

## Context menus

- Shown on a right click (or the context menu key) on the node, at the pointer.
- A 1 px border (control border), control background, items padded 3 px 5 px; the focused item has the
  focus colour background and text colour. Separators; submenus (with ▸), opening on hover or →;
  check items (✓); disabled items greyed and not selectable.
- An item's text is the translation without the mnemonic marker (mnemonics aren't underlined in context
  menus), with its shortcut (accelerator) on the right, as the platform shows it.
- Items have the class `id-<key, with - for .>` (`GUI.makeId`).
- `menuItemPos` actions get the centre of the menu (Java: of its window).
- Selecting an item, Escape, or a click elsewhere closes the menu. Arrow keys move through items, Enter
  selects, typing a letter goes to the next item starting with it.

## Tooltips

- Shown after the pointer has rested on the node for 1 s (JavaFX's default), below the pointer (here: below
  the node, at its left), hidden when the pointer leaves.
- Styled: a 1 px brown-grey border, an off-white background, brown-grey text, a soft shadow.
- `showTooltipWhenAbbrev`: a label shows its full text as a tooltip only while it is cut short (with "…").

## Web differences

- Menu items are made as data (`menus.ts`), and a menu's items are made when it opens.
- JavaFX hid a tooltip after 5 s; here it stays until the pointer leaves.
- Context menu items' shortcuts are only shown; the components that use a menu make its shortcuts work
  (`useShortcut`) where Java's did.
