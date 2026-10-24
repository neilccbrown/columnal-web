// Port of xyz.columnal.transformations.HideColumns (transformations module).
import type { ExpressionIdentifier, TableDataRowIndex } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import { Column } from "../../data/data/Column.js";
import { RecordSet } from "../../data/data/RecordSet.js";
import type { SingleSourceTransformation } from "../../data/data/SingleSourceTransformation.js";
import { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import type { Transformation } from "../../data/data/Transformation.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../identifiers/id/TableId.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { javaEquals, javaHashCode } from "../../java/JavaObject.js";
import { TransformationLexer } from "../../parsers/generated/TransformationLexer.js";
import { TransformationParser } from "../../parsers/generated/TransformationParser.js";
import type { ExpressionVersion } from "../../parsers/grammar/Versions.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import { OutputBuilder } from "../../types/loadsave/OutputBuilder.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import { SingleSourceTransformationInfo } from "./SingleSourceTransformationInfo.js";
import type { TransformationVisitor } from "./TransformationVisitor.js";
import { VisitableTransformation } from "./VisitableTransformation.js";

/**
 * Keeps all data as-is, but hides a given set of columns from the resulting
 * data set.  Hidden is decided by black-list.
 */
export class HideColumns extends VisitableTransformation implements SingleSourceTransformation
{
    public static readonly NAME = "drop.columns";
    private readonly srcTableId: TableId;
    private readonly src: Table | null;
    private readonly result: RecordSet | null;
    private readonly hideIds: readonly ColumnId[];
    // The list of columns from the source table which are not hidden:
    private readonly shownColumns: Column[] = [];
    private error: string;

    public constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, toHide: readonly ColumnId[])
    {
        super(mgr, initialLoadDetails);
        this.srcTableId = srcTableId;
        this.src = mgr.getSingleTableOrNull(srcTableId);
        this.error = "Unknown error with table \"" + this.getId().toString() + "\"";
        this.hideIds = toHide;
        if (this.src === null)
        {
            this.result = null;
            this.error = "Could not find source table: \"" + srcTableId.toString() + "\"";
            return;
        }


        let theResult: RecordSet | null = null;
        try
        {
            const stillToHide: ColumnId[] = [...toHide];
            const srcRecordSet = this.src.getData();
            for (const c of srcRecordSet.getColumns())
            {
                // Java: List.remove(Object), which removes the first equal item
                const index = stillToHide.findIndex(h => h.equals(c.getName()));
                if (index !== -1)
                    stillToHide.splice(index, 1);
                else
                {
                    this.shownColumns.push(c);
                }
            }

            if (stillToHide.length !== 0)
                throw new UserException("Source table does not contain columns " + Utility.listToString(stillToHide));

            if (this.shownColumns.length === 0)
                throw new UserException("Cannot hide all columns");

            // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
            const self = this;
            theResult = new class extends RecordSet
            {
                public indexValid(index: number): boolean
                {
                    return srcRecordSet.indexValid(index);
                }

                public override getLength(): TableDataRowIndex
                {
                    return srcRecordSet.getLength();
                }
            }(Utility.mapList(this.shownColumns, (c): SimulationFunction<RecordSet, Column> => (rs => new class extends Column
            {
                public getType(): DataTypeValue
                {
                    return self.addManualEditSet(this.getName(), c.getType());
                }

                public getAlteredState(): Column.AlteredState
                {
                    return Column.AlteredState.UNALTERED;
                }
            }(rs, c.getName()))));
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            const msg = e.getLocalizedMessage();
            if (msg !== null)
                this.error = msg;
        }

        this.result = theResult;
    }

    public override getPrimarySources(): readonly TableId[]
    {
        return [this.srcTableId];
    }

    protected override getSourcesFromExpressions(): readonly TableId[]
    {
        return [];
    }

    protected override getTransformationName(): string
    {
        return HideColumns.NAME;
    }

    protected override saveDetail(_destination: JavaFile | null, renames: TableAndColumnRenames): readonly string[]
    {
        renames.useColumnsFromTo(this.srcTableId, this.getId());
        const b = new OutputBuilder();
        for (const c of this.hideIds)
            b.kw("HIDE").id(renames.columnId(this.getId(), c, this.srcTableId).getSecond()).nl();
        return b.toLines();
    }

    public override getData(): RecordSet
    {
        if (this.result === null)
            throw new UserException(this.error);
        return this.result;
    }

    public getSrcTableId(): TableId
    {
        return this.srcTableId;
    }

    public withNewSource(newSrcTableId: TableId): Transformation
    {
        return new HideColumns(this.getManager(), this.getDetailsForCopy(this.getId()), newSrcTableId, this.hideIds);
    }

    public getHiddenColumns(): readonly ColumnId[]
    {
        return this.hideIds;
    }

    public override transformationEquals(o: Transformation): boolean
    {
        const that = o as HideColumns;

        if (!this.srcTableId.equals(that.srcTableId)) return false;
        return javaEquals(this.hideIds, that.hideIds);
    }

    public override transformationHashCode(): number
    {
        let result = this.srcTableId.hashCode();
        result = (Math.imul(31, result) + javaHashCode(this.hideIds)) | 0;
        return result;
    }

    public override visit<T>(visitor: TransformationVisitor<T>): T
    {
        return visitor.hideColumns(this);
    }

    public override getSuggestedName(): TableId
    {
        return HideColumns.suggestedName(this.hideIds);
    }

    public static suggestedName(newHidden: readonly ColumnId[]): TableId
    {
        if (newHidden.length === 0)
            return new TableId(IdentifierUtility.spaceSeparated("Hiding none"));
        else if (newHidden.length === 1)
            return new TableId(IdentifierUtility.spaceSeparated("Hiding", newHidden[0]!.getRaw()));
        else
            return new TableId(IdentifierUtility.spaceSeparated("Hiding", newHidden[0]!.getRaw(), "and", newHidden[1]!.getRaw()));
    }
}

export namespace HideColumns
{
    export class Info extends SingleSourceTransformationInfo
    {
        public constructor()
        {
            super(HideColumns.NAME, "transform.hideColumns", "preview-hide.png", "hide.explanation.short", ["collapse"]);
        }

        protected override loadSingle(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, detail: string, _expressionVersion: ExpressionVersion): Transformation
        {
            const loaded = Utility.parseAsOne(detail, s => new TransformationLexer(s), t => new TransformationParser(t), p => p.hideColumns());

            return new HideColumns(mgr, initialLoadDetails, srcTableId, loaded.hideColumn().map(hc => new ColumnId(hc._column!.getText() as ExpressionIdentifier)));
        }

        protected override makeWithSource(mgr: TableManager, destination: CellPosition, srcTable: Table): Transformation
        {
            return new HideColumns(mgr, new Table.InitialLoadDetails(null, null, destination, null), srcTable.getId(), []);
        }
    }
}
