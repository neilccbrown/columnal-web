// Loads TypeExp before its subclasses, whichever module is imported first.
//
// TypeExp's static methods construct its subclasses, so TypeExp.ts and the subclass modules
// import each other.  With ES modules, importing TypeExp.ts first would evaluate a subclass
// module (and its "extends TypeExp") before TypeExp itself.  So all value imports of these
// classes go through this module, which lists the base class first (see docs/CONVENTIONS.md).
export * from "./TypeExp.js";
export * from "./MutVar.js";
export * from "./NumTypeExp.js";
export * from "./RecordTypeExp.js";
export * from "./TypeCons.js";
