# Types and Units dialogs

Java: `app/.../TypesDialog.java` (with `EditTypeDialog` and `TagValueEdit`), `UnitsDialog.java` (with
`UnitList` and `EditUnitDialog`), `MainWindow.java` (the View menu). Styles: `dialogs.scss`. Help:
`resources/help/edit-unit.xml`. Tests: `TestTypeEdit`, `TestUnitEdit`. Web: `src/gui/windows/types/`, the
logic in `src/gui-logic/app/gui/TypesDialog.ts` and `UnitsDialog.ts`. Tests:
`test/gui/windows/TypeEdit.test.ts`, `UnitEdit.test.ts`.

## Opening them

- View ▸ "Types..." and "Units..." (after "Goto row...", with a separator between). Each works on a copy
  of the project's types and units; when it closes, they replace the project's, and the project is saved
  (Java: the dialogs changed the project's as they went, then `View.modified`).

## Types

- "User-Defined Types" over a list of the types (`types-list`), each shown as its name then its type
  arguments in brackets ("Pair(a)(b)"); click or Up/Down/Home/End select one, a double click edits it.
  Below: "Add type", "Edit type", "Remove type" (`id-types-…`), and Close.
- Add or Edit shows the edit dialog (buttons to the side, OK and Cancel; the type name focused):
  - "Type name", then two tabs:
    - Plain: "Tag names (one per line, or separated with commas)" over a text area. Blank items are
      ignored.
    - Inner Values: "Optional type arguments (separated with commas)" (a unit variable in braces, `{u}`),
      then a list of tags (the fancy list: `fancy-list.md`), each a tag name field and an inner type
      editor (empty for none), with "Add" at the end.
  - Editing the plain tags (on the plain tab) clears the type arguments and makes the inner values' list
    the plain tags. Editing the inner values (on that tab) rewrites the plain tags while there are no
    type arguments and no inner types; otherwise the plain tab is disabled. An existing type opens on the
    plain tab if it can be shown there, else on the inner values.
  - OK takes the selected tab's definition. Errors (under the fields): "Not valid type identifier: <name>",
    "Invalid tag name: "<name>"", "Invalid type argument: "<arg>"", a tag's inner type's error.
- A new type is added ("Error adding new type" if that fails); an edited one replaces the old ("Error
  saving type change"). Remove removes the selected type.

## Units

- Two parts, one above the other: "User-Defined Units", a table (Name, Definition, Description) with
  "Add Unit", "Edit Unit", "Remove Unit" (`id-units-userDeclared-…`; Edit and Remove disabled with nothing
  selected; a double click edits); and "Built-In Units" (Category, Name, Definition, Description), read
  only. Both are sorted by category, each canonical unit just before those defined from it. A definition
  shows as "<scale> * <unit>", an alias as its target. Close.
- The edit dialog (buttons to the side; the name focused), each row with its help:
  - "Name", then "Units can either be a new unit, or a new name (alias) for an existing unit:".
  - "New Unit" (`id-unit-full`): "Description", and "Equal to" (a tick box) with a scale field ("1" to
    start), " * ", and a unit editor.
  - "Alias" (`id-unit-alias`): "Target".
  - The other kind's fields are disabled, and the scale and unit while "Equal to" is unticked; a new unit
    has neither kind chosen.
  - Errors: "Invalid name.  Names must be only letters, …", "Must select new unit or alias", "Invalid alias
    target name. …", "Invalid scale: …", the unit's error (or "Invalid unit").
- OK adds the unit (replacing the one edited). Remove removes the selected unit.

## Web differences

- Java closed the Units dialog while a unit was edited, and showed it again after; here the edit dialog
  shows over it.
- No title bars (the dialogs are within the page): their titles ("Edit types", "Units", "Edit type", "Edit
  Unit") are their accessible names.
