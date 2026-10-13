// Placeholder for java.time values (LocalDate, LocalTime, LocalDateTime, YearMonth,
// ZonedDateTime), which are ported in Phase 2.  They will implement this interface.
import type { Comparable, JavaObject } from "../JavaObject.js";

export interface TemporalAccessor extends JavaObject, Comparable<TemporalAccessor>
{
    /** Marks java.time values at runtime. */
    readonly isTemporalAccessor: true;
}

export function isTemporalAccessor(x: unknown): x is TemporalAccessor
{
    return typeof x === "object" && x !== null && (x as Partial<TemporalAccessor>).isTemporalAccessor === true;
}
