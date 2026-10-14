// java.time values in Columnal (LocalDate, LocalTime, LocalDateTime, YearMonth, ZonedDateTime) are
// js-joda objects (see JavaTime.ts); this is their common type, as java.time.temporal.TemporalAccessor.
import { TemporalAccessor as JsJodaTemporalAccessor } from "./JavaTime.js";
import type { Comparable } from "../JavaObject.js";

/** A java.time value: a js-joda TemporalAccessor, which (for Columnal's types) is Comparable. */
export type TemporalAccessor = JsJodaTemporalAccessor & Comparable<TemporalAccessor>;

export function isTemporalAccessor(x: unknown): x is TemporalAccessor
{
    return x instanceof JsJodaTemporalAccessor;
}
