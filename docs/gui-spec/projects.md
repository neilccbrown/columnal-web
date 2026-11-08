# Projects and windows

Java: `app/.../InitialWindow.java`, `MainWindow.java`, `View.java` (saving, undo, column widths, the title),
`SaveMenuItem.java`, `UndoManager.java`, `utility/.../Utility.java` (`getNewAutoSaveFile`, `usedFile`,
`readRecentFilesList`), `dialogs-non-expression/.../AboutDialog.java`. Styles: `initial.scss`,
`mainview.scss` (`.banner-message`), `general.scss` (`.menu-bar`). Tests: `TestInitialWindow`,
`TestBlankMainWindow` (`testStartState`, `testNewClick`, `testCloseMenu`; the rest make tables). Web:
`src/gui/App.vue`, `src/gui/windows/`, `src/gui/project/` (`ProjectStore`, `ProjectSession`,
`projectLock`, `appContext`), `src/gui-logic/app/gui/UndoManager.ts`, `src/gui/components/menus/MenuBar.vue`,
`src/gui/components/dialogs/AboutDialog.vue` and `AlertHost.vue`. Tests: `test/gui/windows/`,
`test/gui-logic/app/UndoManager.test.ts`.

## Storage

Decided with the project owner (Phase 9): Java kept projects in files, each window saving its own; here
they are kept in the browser's storage (IndexedDB), each with a name, its saved content (the same text as
Java's file), when it was saved, and when it was last opened. Files come in by upload and go out by
download. Saving to real files isn't planned.

## Windows and tabs

Decided with the project owner (Phase 9): Java opened each project in a window of its own; here a browser
tab shows the initial window or one project. The project's id is in the URL (`#project=<id>`), so
reloading the tab opens it again.
- From the initial window, New and Open show the project in the same tab (Java: the initial window hides,
  and a main window shows).
- From a project's window, New and Open open the project in another tab (Java: another window).
- Close shows the initial window in the tab (Java: the window closes).
- A tab that has a project open holds it (a Web Lock) until it closes it; a project already open in
  another tab opens for reading only, with a red banner: "This project is open in another tab, so it is
  open here for reading only. Changes will not be saved."
- Java's Exit (Ctrl/Cmd+Q) is left out: closing the tab does it (as decided in Phase 7).

## Initial window

- The menu bar: Project (New project, Open project..., Open recent ▸), Help (About).
- The title and logo images on white, a grey line below; "New project" (heading) with a "Create new"
  button and "After making a new project, you can import existing data (CSV files, etc)"; "Open existing
  project" (heading) with "Open existing..." and "Recent projects" (subheading) over a list of the recent
  projects (200 px high). Double-clicking a recent project, or Enter or Space on the selected one, opens
  it. The page's title is "Columnal".
- New: a new project named "Untitled-N", for the lowest N not in use (Java: `getNewAutoSaveFile`), empty.

## Project window

- The menu bar:
  - Project: New project... (Alt+Shift+N), Open project... (Ctrl/Cmd+O), Open recent ▸, Save (saved Ns
    ago) or "Saving" while a change is being saved (it saves now), Save as... (Ctrl/Cmd+Alt+S), Save a
    copy..., Close project (Alt+Shift+W).
  - Edit: Undo (Ctrl/Cmd+Z).
  - View: Goto row... (`tables.md`), then Types... and Units... (`types-and-units.md`), then "Close left
    pane" and "All check results" (radio items: the checks pane, `transformations.md`).
  - Help: About.
  - Not yet: Edit's Settings (Phase 12, with R), and the View menu's Task Manager (Phase 11). (Java's
    Find is commented out.)
  - The menus have the class `id-menu-…` (Java: their id); their items too (Java: `GUI.makeId`). Menus show
    no mnemonics (the browser keeps Alt and a letter); they can be used by keyboard once one is open.
    Items' shortcuts work anywhere in the page, unless the focused control takes the key (the cell and
    lex editors take every key, as in Java) or a dialog is open (Java's dialogs were windows of their own).
- The page's title is the project's name (Java: the file's name and directory).
- While loading, a beige banner at the top: "Loading...". If the project can't be loaded, an alert ("Error
  loading <name>": `Error loading file "<name>": <error>`) and a red banner: "This file is open for reading
  only, due to a loading error. Changes will not be saved."
- A project that no longer exists (deleted, in another tab): an alert, and the initial window.
- Closing a project (or the tab) while a change is being saved shows no error for the save the engine
  didn't finish.

## Saving

- After loading, writing is enabled: an empty project is saved at once; otherwise the content loaded is
  kept for undo (Java: `enableWriting`).
- Each change is saved straight away (Java: `View.modified`, and its table listener): editing or deleting
  cells, moving a table, adding or removing a table or comment, changing a comment's text or size (Java
  didn't save those: see `comments.md`). Changing a column's width is saved after 5
  seconds without another change of width. The file includes the customised column widths
  (`COLUMNWIDTH <column> <width>` in its display section), which loading sets again.
- Before each save after a change, the previous save is kept for undo: up to 20, one of any run of the
  same content (Java: `UndoManager`, which copied the file; here the content is kept in memory, so, as in
  Java, it lasts while the project is open).
- Undo goes back to the save before the last (skipping any the same as the current one), loading it and
  saving it. With nothing to undo, nothing happens. (Java bug, fixed: with nothing to undo, Java left writing
  off, so nothing more was saved.) Undo does nothing while the project is read-only (Java's would make a
  project read-only after a loading error writable).
  If the earlier save can't be loaded, it is saved as a new project, "emergency<time>", and an alert says
  so (Java: a file in the home directory, or else the clipboard).

## Open dialog

- The stored projects, the most recently saved first, with when each was saved; one is chosen by
  double-clicking it, or selecting it (click, or Up and Down) and OK. Opening a project puts it at the top
  of the recent list (Java: `usedFile`); recent holds the 12 last opened, not new ones (as in Java).
- "Upload a file..." makes a stored project of a file (named after it, without `.clmnl`) and opens it.
- Delete removes the selected project, after a confirmation ("Delete the project "<name>"? This can't be
  undone."); not a project open in a tab.

## Save as and Save a copy

- Save as asks for a name (the current one, selected), then saves the project as a new project of that
  name, which is then the one open (in the URL, the title, and at the top of the recent list); later
  changes go to it (Java: `setDiskFileAndSave`).
- Save a copy downloads the project as `<name>.clmnl` (Java: saving to a chosen file, keeping this one open).

## About

- The title and logo images, then (read-only) "Version: <version>" and "Browser: <user agent>" (Java: the
  operating system and the app's directory), and Close.

## Web differences

- Not done: Java's hashes of saved files, which made files not saved by Columnal open with R banned
  (Phase 12, with R); the upgrade banner (Java checked for a newer version).
