// Java: GuidanceWindow.Guidance and its conditions (utility-gui): a step of guidance, shown in
// GuidanceWindow.vue, with what to highlight on the page and when to go on to the next step.

/** Java: GuidanceWindow.Condition: calls back (once) when satisfied; returns a function which stops it. */
export type Condition = (onSatisfied: () => void) => () => void;

/** Java: GuidanceWindow.Guidance. */
export interface Guidance
{
    readonly content: string;
    // When to go on (for a step with a button, clicking it):
    readonly condition: Condition | { readonly buttonKey: string };
    // What to highlight (Java: TargetFinder), as its client rectangle, or null:
    readonly highlight: (() => DOMRect | null) | null;
    // The next step, if any (Java: next):
    readonly next: () => Guidance | null;
}

/** Java: LookupCondition: when an element matching the selector is (or with showing false, isn't) on the page, checked every 300 ms. */
export function lookupCondition(selector: string, showing: boolean = true): Condition
{
    return onSatisfied =>
    {
        const timer = setInterval(() =>
        {
            if ((document.querySelector(selector) !== null) === showing)
            {
                clearInterval(timer);
                setTimeout(onSatisfied);
            }
        }, 300);
        return () => clearInterval(timer);
    };
}

/** Java: nodeFinder: the element matching the selector (null if none). */
export function elementFinder(selector: string): () => DOMRect | null
{
    return () => document.querySelector(selector)?.getBoundingClientRect() ?? null;
}
