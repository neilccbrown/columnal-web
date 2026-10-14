// Loads the DataSource class hierarchy in a safe order: the base class first, then its
// subclasses.  (DataSource.loadOne constructs an ImmediateDataSource, so the modules import
// each other.)  Import these classes' values from here; type-only imports can use the class's
// own module.  See "Class hierarchies split across files" in docs/CONVENTIONS.md.
export { DataSource } from "./DataSource.js";
export { ImmediateDataSource } from "./ImmediateDataSource.js";
export { LinkedDataSource } from "./LinkedDataSource.js";
