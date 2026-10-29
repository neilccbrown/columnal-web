// Small things the test helpers share.

export function sleep(ms: number): Promise<void>
{
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** An element, for failure messages: its tag, id, classes and role. */
export function describeElement(element: Element | null): string
{
    if (element === null)
        return "null";
    const role = element.getAttribute("role");
    return element.tagName.toLowerCase() + (element.id !== "" ? "#" + element.id : "")
        + [...element.classList].map(c => "." + c).join("") + (role !== null ? `[role=${role}]` : "");
}
