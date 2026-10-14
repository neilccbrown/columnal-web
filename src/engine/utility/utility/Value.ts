// The type of Columnal values: Java's @Value Object (a checker-framework qualifier on Object).
// TypeScript-only file in the utility module.
import type { Decimal } from "../../java/JavaBigDecimal.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import type { TaggedValue } from "./TaggedValue.js";
import type { ListEx, Record, ValueFunctionBase } from "./Utility.js";

/**
 * A Columnal value.  In Java this was any Object annotated @Value:
 * Number (Long/BigDecimal, here a canonical Decimal), Boolean, String, a java.time value,
 * TaggedValue, ListEx (lists), Record, or a function (ValueFunctionBase, whose subclass
 * ValueFunction is in the expressions module).
 */
export type Value = Decimal | boolean | string | TemporalAccessor | TaggedValue | ListEx | Record | ValueFunctionBase;
