// Java: ExplanationDisplay's content (app): an explanation's text, worked out in the engine (Java did it
// on a worker thread), with its hyperlinked locations and the expressions it shows, for
// ExplanationDisplay.vue to show.
import type { Expression } from "../../engine/expressions/transformations/expression/Expression.js";
import type { Explanation } from "../../engine/expressions/transformations/expression/explanation/Explanation.js";
import type { ExplanationLocation } from "../../engine/expressions/transformations/expression/explanation/ExplanationLocation.js";
import type { TableId } from "../../engine/identifiers/id/TableId.js";
import { HashMap } from "../../engine/java/HashMap.js";
import { InternalException } from "../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../engine/utility-error/error/UserException.js";
import { StyledString, type StyleTarget } from "../../engine/utility-error/styled/StyledString.js";
import { Log } from "../../engine/utility/log/Log.js";
import { Utility } from "../../engine/utility/utility/Utility.js";
import type { ExplanationHighlight, ExplanationInfo, ExplanationSegment } from "./protocol.js";

// Java: the Clickable that hyperlinkLocation adds (its tooltip "click.to.view")
class LocationLink extends StyledString.Style<LocationLink>
{
    public constructor(public readonly location: ExplanationLocation)
    {
        super(LocationLink);
    }

    public override applyTo(target: StyleTarget): void
    {
        target.classes.add("styled-text-clickable");
    }

    public override combine(_withStyle: LocationLink): LocationLink
    {
        // (As Clickable: cannot combine, so make arbitrary choice)
        return this;
    }

    protected override equalsStyle(item: LocationLink): boolean
    {
        return this === item;
    }
}

// Java: ExplanationDisplay.HighlightExpression: an expression shown in the explanation
class HighlightExpression extends StyledString.Style<HighlightExpression>
{
    // Inner items that are children of this expression:
    public readonly inner = new Set<HighlightExpression>();
    // The opposite of inner; our parents (from nearest to furthest up in tree) of this expression in the AST.
    public readonly parents = new Set<HighlightExpression>();

    public constructor(public readonly expression: Expression, public readonly isExplainedDirectly: () => boolean)
    {
        super(HighlightExpression);
    }

    public override applyTo(target: StyleTarget): void
    {
        target.classes.add("explained-expression");
    }

    public override combine(withStyle: HighlightExpression): HighlightExpression
    {
        // Keep innermost, which is the first to be applied:
        withStyle.inner.add(this);
        this.parents.add(withStyle);
        return this;
    }

    protected override equalsStyle(item: HighlightExpression): boolean
    {
        return this === item;
    }
}

/** The explanation's content, its locations relative to the source table. */
export function explanationInfo(explanation: Explanation, srcTableId: TableId): ExplanationInfo
{
    const highlights: HighlightExpression[] = [];
    let content: StyledString[];
    try
    {
        const lines: StyledString[] = [];
        const alreadyExplained = new HashMap<Explanation, boolean>();
        makeString(explanation, alreadyExplained, highlights, lines, false, srcTableId);
        content = lines.reverse();
    }
    catch (e)
    {
        if (!(e instanceof InternalException || e instanceof UserException))
            throw e;
        Log.log(e);
        content = [StyledString.concat(StyledString.s("Error: "), e.getStyledMessage())];
    }

    // Each distinct expression's number (Java: the Multimap's keys, compared with equals):
    const expressions: Expression[] = [];
    const expressionNumber = (e: Expression): number =>
    {
        let i = expressions.findIndex(x => x.equals(e));
        if (i === -1)
            i = expressions.push(e) - 1;
        return i;
    };
    const lines = content.map(line =>
    {
        const segments: ExplanationSegment[] = [];
        line.forEach((styles, text) =>
        {
            const target = { classes: new Set<string>(), inlineStyles: new Map<string, string>() };
            let link: LocationLink | null = null;
            let highlight: HighlightExpression | null = null;
            for (const style of styles)
            {
                style.applyTo(target);
                if (style instanceof LocationLink)
                    link = style;
                else if (style instanceof HighlightExpression)
                    highlight = style;
            }
            segments.push({
                text,
                classes: [...target.classes],
                link: link === null ? null : { table: link.location.tableId.getRaw(), column: link.location.columnId?.getRaw() ?? null, row: link.location.rowIndex },
                highlight: highlight === null ? null : highlights.indexOf(highlight),
            });
        });
        return segments;
    });
    // (All of them, shown or not: Java's Multimap had every one made, and hovering one highlights its
    // expression's appearances only if there are several)
    const infos: ExplanationHighlight[] = highlights.map(h => ({
        expression: expressionNumber(h.expression),
        explainedDirectly: h.isExplainedDirectly(),
        inner: [...h.inner].map(x => highlights.indexOf(x)),
        parents: [...h.parents].map(x => highlights.indexOf(x)),
    }));
    return { lines, highlights: infos };
}

// Returns any locations which were not shown in skipped children
function makeString(explanation: Explanation, alreadyExplained: HashMap<Explanation, boolean>, highlights: HighlightExpression[], lines: StyledString[], skipIfTrivial: boolean, srcTableId: TableId): readonly ExplanationLocation[]
{
    if (explanation.isValue() && alreadyExplained.has(explanation))
        return [];

    const skippedLocationsBuilder: ExplanationLocation[] = [];
    // Go from lowest child upwards:
    for (const child of explanation.getDirectSubExplanations())
        skippedLocationsBuilder.push(...makeString(child, alreadyExplained, highlights, lines, explanation.excludeChildrenIfTrivial(), srcTableId));
    const skippedLocations = skippedLocationsBuilder;
    const description = explanation.describe(alreadyExplained, l => hyperlinkLocation(l, srcTableId), (s, e) =>
    {
        // (Java: the Multimap holds every appearance, and whether it is explained directly is worked
        // out when hovered, after all the lines are made)
        const h = new HighlightExpression(e, () =>
        {
            let r = false;
            alreadyExplained.forEach((v, k) =>
            {
                if (k.isDescribing(e))
                    r = r || v;
            });
            return r;
        });
        highlights.push(h);
        return s.withStyle(h);
    }, skippedLocations, skipIfTrivial);
    alreadyExplained.set(explanation, description !== null);
    if (description !== null)
    {
        lines.push(description);
        return [];
    }
    else
    {
        return Utility.concatI(skippedLocations, explanation.getDirectlyUsedLocations());
    }
}

function hyperlinkLocation(explanationLocation: ExplanationLocation, srcTableId: TableId): StyledString
{
    let content = "";
    if (!explanationLocation.tableId.equals(srcTableId))
        content += explanationLocation.tableId.getRaw() + ":";
    if (explanationLocation.columnId !== null)
        content += explanationLocation.columnId.getRaw();
    // +1 to turn back into user index:
    if (explanationLocation.rowIndex !== null)
        content += " (row " + String(explanationLocation.rowIndex + 1) + ")";
    return StyledString.s(content).withStyle(new LocationLink(explanationLocation));
}
