// Port of the content of xyz.columnal.gui.table.app.TableHat (app module): the text describing a
// transformation, shown above its table (its "hat").  The GUI shows it (GridTable.vue), with Java's
// positioning and collapsing.
//
// PORT-NOTE: Java's hat is a FloatingItem holding a StyledString whose Clickable parts open the
// transformations' dialogs.  Here the text is made in the engine (where the tables are) and sent to the
// GUI as segments (HatSegment): each clickable part's style is a HatClickable, which records what it
// links to.  PORT-DEFERRED: what clicking them does (the source table's PickTableDialog; the
// expression, sort, split-by, concatenate, hide-columns, manual edit, join and R dialogs) and hovering
// over a source link (highlighting the source table, Phase 9 step 6), Phase 11 with the dialogs.
// Clicking "with/without source column" toggles it in Java with no dialog; it waits with the rest.
import type { LocalizableKey } from "../../../../../engine/anns/Annotations.js";
import type { Table } from "../../../../../engine/data/data/Table.js";
import type { TableManager } from "../../../../../engine/data/data/TableManager.js";
import type { TableId } from "../../../../../engine/identifiers/id/TableId.js";
import type { Aggregate } from "../../../../../engine/transformations/transformations/Aggregate.js";
import type { Calculate } from "../../../../../engine/transformations/transformations/Calculate.js";
import { Check } from "../../../../../engine/transformations/transformations/Check.js";
import type { Concatenate } from "../../../../../engine/transformations/transformations/Concatenate.js";
import type { Filter } from "../../../../../engine/transformations/transformations/Filter.js";
import type { HideColumns } from "../../../../../engine/transformations/transformations/HideColumns.js";
import type { Join } from "../../../../../engine/transformations/transformations/Join.js";
import type { ManualEdit } from "../../../../../engine/transformations/transformations/ManualEdit.js";
import type { RTransformation } from "../../../../../engine/transformations/transformations/RTransformation.js";
import type { Sort } from "../../../../../engine/transformations/transformations/Sort.js";
import type { TransformationVisitor } from "../../../../../engine/transformations/transformations/TransformationVisitor.js";
import type { VisitableTransformation } from "../../../../../engine/transformations/transformations/VisitableTransformation.js";
import { StyledCSS } from "../../../../../engine/utility-error/styled/StyledCSS.js";
import { StyledString } from "../../../../../engine/utility-error/styled/StyledString.js";
import { Clickable } from "../../../../utility-gui/utility/gui/Clickable.js";

export namespace TableHat
{
    /** What a clickable part of the hat links to. */
    export type Link =
        | { readonly kind: "source", readonly tableId: string, readonly broken: boolean }
        | { readonly kind: "edit", readonly tooltipKey: string | null };

    export interface Segment
    {
        readonly text: string;
        readonly classes: readonly string[];
        readonly link: Link | null;
    }

    export interface Content
    {
        readonly content: readonly Segment[];
        // Java: collapsedContent, shown when the hat is collapsed
        readonly collapsed: string;
    }

    /** A clickable part of the hat (Java: an anonymous Clickable), recording what it links to. */
    export class HatClickable extends Clickable
    {
        public readonly link: Link;

        public constructor(link: Link, tooltipKey: LocalizableKey | null = "click.to.change", ...styleClasses: string[])
        {
            super(tooltipKey, ...styleClasses);
            this.link = link;
        }

        protected onClick(): void
        {
            // (See the PORT-DEFERRED above: the GUI handles clicks)
        }
    }

    // (As a Clickable, the style class it combines with)
    function edit(tooltipKey: LocalizableKey | null = "click.to.change", ...styleClasses: string[]): Clickable
    {
        return new HatClickable({ kind: "edit", tooltipKey }, tooltipKey, ...styleClasses);
    }

    /** Java: the TableHat constructor's visitor, which makes the content and collapsed content. */
    export function content(manager: TableManager, table: VisitableTransformation): Content
    {
        let collapsedContent = StyledString.s("Transformation");
        const content = table.visit<StyledString>({
            filter(filter: Filter): StyledString
            {
                return StyledString.concat(
                    collapsedContent = StyledString.s("Filter"),
                    StyledString.s(" "),
                    editSourceLink(manager, filter.getSrcTableId()),
                    StyledString.s(", keeping rows where: "),
                    editExpressionLink(filter.getFilterExpression().toSimpleStyledString()),
                );
            },
            runR(rTransformation: RTransformation): StyledString
            {
                const rExpression = rTransformation.getRExpression();
                return StyledString.concat(
                    collapsedContent = StyledString.s("Run R"),
                    StyledString.s(" expression "),
                    StyledString.s(rExpression.trim() === "" ? "<blank>" : rExpression).limit(60).withStyle(edit()),
                );
            },
            sort(sort: Sort): StyledString
            {
                let sourceText = sort.getSortBy().length === 0
                    ? StyledString.s("original order")
                    : StyledString.joining(sort.getSortBy().map(c => StyledString.concat(c.getFirst().toStyledString(), c.getSecond().toStyledString())), ", ");
                sourceText = sourceText.withStyle(edit()).withStyle(new StyledCSS("edit-sort-by"));
                return StyledString.concat(
                    collapsedContent = StyledString.s("Sort"),
                    StyledString.s(" "),
                    editSourceLink(manager, sort.getSrcTableId()),
                    StyledString.s(" by "),
                    sourceText,
                );
            },
            aggregate(aggregate: Aggregate): StyledString
            {
                const builder = StyledString.builder();
                builder.append(collapsedContent = StyledString.s("Aggregate"));
                builder.append(" ");
                builder.append(editSourceLink(manager, aggregate.getSrcTableId()));
                // TODO should we add the calculations here if there are only one or two?

                const splitBy = aggregate.getSplitBy();
                const editSplitBy = edit();
                if (splitBy.length > 0)
                {
                    builder.append(" splitting by ");
                    builder.append(StyledString.joining(splitBy.map(c => c.toStyledString()), ", ").withStyle(editSplitBy));
                }
                else
                {
                    builder.append(StyledString.s(" across whole table").withStyle(editSplitBy));
                    builder.append(".");
                }
                return builder.build();
            },
            concatenate(concatenate: Concatenate): StyledString
            {
                let sourceText = StyledString.joining(concatenate.getPrimarySources().map(t => t.toStyledString()), ", ");
                if (sourceText.toPlain() === "")
                    sourceText = StyledString.s("no tables");
                return StyledString.concat(
                    collapsedContent = StyledString.s("Concatenate"),
                    StyledString.s(" "),
                    sourceText.withStyle(edit("click.to.change")),
                    StyledString.s(" - "),
                    StyledString.s(concatenate.isIncludeMarkerColumn() ? "with source column" : "without source column").withStyle(edit("click.to.toggle")),
                );
            },
            check(check: Check): StyledString
            {
                let type = "";
                switch (check.getCheckType())
                {
                    case Check.CheckType.ALL_ROWS:
                        type = "for all rows ";
                        break;
                    case Check.CheckType.ANY_ROW:
                        type = "at least one row ";
                        break;
                    case Check.CheckType.NO_ROWS:
                        type = "no rows ";
                        break;
                }
                return StyledString.concat(
                    collapsedContent = StyledString.s("Check"),
                    StyledString.s(" "),
                    editSourceLink(manager, check.getSrcTableId()),
                    StyledString.s(" that "),
                    StyledString.s(type),
                    editExpressionLink(check.getCheckExpression().toSimpleStyledString()),
                );
            },
            calculate(calc: Calculate): StyledString
            {
                collapsedContent = StyledString.s("Calculate");
                const builder = StyledString.builder();
                builder.append("From ");
                builder.append(editSourceLink(manager, calc.getSrcTableId()));
                builder.append(" calculate ");
                const columns = [...calc.getCalculatedColumns().keys()];
                if (columns.length === 0)
                {
                    builder.append("<none>");
                }
                else
                {
                    // Mention max three columns
                    const threeEditLinks = columns.slice(0, 3).map(c => c.toStyledString().withStyle(edit()).withStyle(new StyledCSS("edit-calculate-column")));
                    if (columns.length > 3)
                        threeEditLinks.push(StyledString.s("..."));
                    builder.append(StyledString.intercalate(StyledString.s(", "), threeEditLinks));
                }
                return builder.build();
            },
            hideColumns(hide: HideColumns): StyledString
            {
                const editHide = edit(null, "edit-hide-columns");
                collapsedContent = StyledString.s("Exclude columns");
                return StyledString.concat(
                    StyledString.s("From "),
                    editSourceLink(manager, hide.getSrcTableId()),
                    StyledString.s(", exclude columns: "),
                    hide.getHiddenColumns().length === 0 ? StyledString.s("<none>") : StyledString.joining(hide.getHiddenColumns().map(c => c.toStyledString()), ", "),
                    StyledString.s(" "),
                    StyledString.s("(edit)").withStyle(editHide),
                );
            },
            manualEdit(manualEdit: ManualEdit): StyledString
            {
                collapsedContent = StyledString.s("Edit");
                // (Java remade this when the edit was modified; the engine sends the tables again then)
                const byColumn = manualEdit.getReplacementIdentifier();
                return StyledString.concat(
                    StyledString.s("Edit "),
                    editSourceLink(manager, manualEdit.getSrcTableId()),
                    StyledString.s(" to change "),
                    StyledString.s(manualEdit.getReplacementCount().toString() + " entries").withStyle(edit()).withStyle(new StyledCSS("manual-edit-entries")),
                    StyledString.s(" identified by "),
                    (byColumn !== null ? byColumn.toStyledString() : StyledString.s("row number")).withStyle(edit()),
                );
            },
            join(join: Join): StyledString
            {
                collapsedContent = StyledString.s("Join");
                const clickToEdit = edit();
                return StyledString.concat(
                    StyledString.s("Join "),
                    join.getPrimarySource().toStyledString().withStyle(clickToEdit),
                    StyledString.s(" with "),
                    join.getSecondarySource().toStyledString().withStyle(clickToEdit),
                    join.getColumnsToMatch().length === 0 ? StyledString.s("")
                        : StyledString.concat(StyledString.s(" on "),
                            StyledString.joining(join.getColumnsToMatch().map(p => p.getFirst().equals(p.getSecond()) ? p.getFirst().toStyledString() : StyledString.concat(p.getFirst().toStyledString(), StyledString.s(" = "), p.getSecond().toStyledString())), " and ").withStyle(clickToEdit)),
                );
            },
        } satisfies TransformationVisitor<StyledString>);
        return { content: segments(content), collapsed: collapsedContent.toPlain() };
    }

    // Java: editSourceLink, whose Clickable picks a new source (PickTableDialog), or with the middle
    // button selects the source table, and highlights it while hovered
    function editSourceLink(manager: TableManager, srcTableId: TableId): StyledString
    {
        // If this becomes broken/unbroken, we should get re-run:
        const srcTable: Table | null = manager.getSingleTableOrNull(srcTableId);
        const styleClasses = srcTable === null ? ["broken-link"] : [];
        return srcTableId.toStyledString().withStyle<Clickable>(new HatClickable({ kind: "source", tableId: srcTableId.getRaw(), broken: srcTable === null }, "source.link.tooltip", ...styleClasses));
    }

    // Java: editExpressionLink and editCheckLink, whose Clickables open the expression's dialog
    function editExpressionLink(expression: StyledString): StyledString
    {
        return expression.limit(60).withStyle(edit()).withStyle(new StyledCSS("edit-expression-link"));
    }

    // (Java: toGUI, which makes a Text per segment)
    function segments(s: StyledString): Segment[]
    {
        const r: Segment[] = [];
        s.forEach((styles, text) =>
        {
            const target = { classes: new Set<string>(["styled-text"]), inlineStyles: new Map<string, string>() };
            let link: Link | null = null;
            for (const style of styles)
            {
                style.applyTo(target);
                if (style instanceof HatClickable)
                    link = style.link;
            }
            r.push({ text, classes: [...target.classes], link });
        });
        return r;
    }
}
