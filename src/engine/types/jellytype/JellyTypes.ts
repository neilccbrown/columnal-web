// Loads JellyType before its subclasses, whichever module is imported first.
//
// JellyType's static methods construct its subclasses, so JellyType.ts and the subclass modules
// import each other.  With ES modules, importing JellyType.ts first would evaluate a subclass
// module (and its "extends JellyType") before JellyType itself.  So all value imports of these
// classes go through this module, which lists the base class first (see docs/CONVENTIONS.md).
export * from "./JellyType.js";
export * from "./JellyTypeApply.js";
export * from "./JellyTypeArray.js";
export * from "./JellyTypeFunction.js";
export * from "./JellyTypeIdent.js";
export * from "./JellyTypeNumberWithUnit.js";
export * from "./JellyTypePrimitive.js";
export * from "./JellyTypeRecord.js";
