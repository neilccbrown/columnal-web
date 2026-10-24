// Port of xyz.columnal.transformations.TransformationManager (transformations module).
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import type { Transformation } from "../../data/data/Transformation.js";
import type { SaveTag } from "../../identifiers/id/SaveTag.js";
import { TableId } from "../../identifiers/id/TableId.js";
import { DisplayLexer } from "../../parsers/generated/DisplayLexer.js";
import { DisplayParser } from "../../parsers/generated/DisplayParser.js";
import type { TableContext } from "../../parsers/generated/MainParser.js";
import type { TableTransformationContext } from "../../parsers/generated/TableParser2.js";
import type { ExpressionVersion } from "../../parsers/grammar/Versions.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { Utility } from "../../utility/utility/Utility.js";
import { Aggregate } from "./Aggregate.js";
import { Calculate } from "./Calculate.js";
import { Check } from "./Check.js";
import { Concatenate } from "./Concatenate.js";
import { Filter } from "./Filter.js";
import { HideColumns } from "./HideColumns.js";
import { Join } from "./Join.js";
import { ManualEdit } from "./ManualEdit.js";
import { RTransformation } from "./RTransformation.js";
import { Sort } from "./Sort.js";
import type { TransformationInfo } from "./TransformationInfo.js";

/**
 * Created by neil on 02/11/2016.
 */
export class TransformationManager implements TableManager.TransformationLoader
{
    private static instance: TransformationManager | null = null;

    public static getInstance(): TransformationManager
    {
        if (TransformationManager.instance === null)
            TransformationManager.instance = new TransformationManager();
        return TransformationManager.instance;
    }

    public getTransformations(): TransformationInfo[]
    {
        // Note: the order here is the order they are shown in the transformation edit dialog,
        // but is otherwise unimportant.
        return [
            new Calculate.Info(),
            new Aggregate.Info(),
            new Filter.Info(),
            new Sort.Info(),
            new Join.Info(),
            new Concatenate.Info(),
            new HideColumns.Info(),
            new ManualEdit.Info(),
            new RTransformation.Info(),

            // Not shown in dialog, as shown separately:
            new Check.Info(),
        ];
    }

    /**
     * Java has two overloads: loadOne(TableManager, MainParser.TableContext, ExpressionVersion) for the
     * old file format, and loadOne(TableManager, SaveTag, TableParser2.TableTransformationContext, ExpressionVersion).
     *
     * PORT-NOTE: Java turns a NullPointerException (from a missing part of the parse tree) into a
     * UserException; here that is the TypeError from using null.
     */
    public loadOne(mgr: TableManager, table: TableContext, expressionVersion: ExpressionVersion): Transformation;
    public loadOne(mgr: TableManager, saveTag: SaveTag, table: TableTransformationContext, expressionVersion: ExpressionVersion): Transformation;
    public loadOne(mgr: TableManager, b: TableContext | SaveTag, c: ExpressionVersion | TableTransformationContext, d?: ExpressionVersion): Transformation
    {
        try
        {
            if (d !== undefined)
                return this.loadOne2(mgr, b as SaveTag, c as TableTransformationContext, d);
            const table = b as TableContext;
            const expressionVersion = c as ExpressionVersion;
            const transformationContext = table.transformation()!;
            const transformationName = transformationContext.transformationName();
            const t = this.getTransformation(transformationName.getText());
            const detailContext = transformationContext.detailPrefixed();
            const detail = Utility.getDetail(detailContext);
            const source = Utility.mapList(transformationContext.sourceName(), s => new TableId(s.item().getText() as ExpressionIdentifier));
            const tableIdContext = transformationContext.tableId();
            const transformation = t.load(mgr, Table.loadDetails(new TableId(tableIdContext.getText() as ExpressionIdentifier), detailContext, table.display()), source, detail, expressionVersion);
            mgr.record(transformation);
            return transformation;
        }
        catch (e)
        {
            if (!(e instanceof TypeError))
                throw e;
            throw new UserException("Could not read transformation: failed to read data", e);
        }
    }

    private loadOne2(mgr: TableManager, saveTag: SaveTag, table: TableTransformationContext, expressionVersion: ExpressionVersion): Transformation
    {
        const transformationContext = table.transformation();
        const transformationName = transformationContext.transformationName();
        const t = this.getTransformation(transformationName.getText());
        const detailContext = transformationContext.detail();
        const detail = Utility.getDetail(detailContext);
        const source = Utility.mapList(transformationContext.sourceName(), s => new TableId(s.item().getText() as ExpressionIdentifier));
        const tableIdContext = transformationContext.tableId();
        const transformation = Utility.parseAsOne(Utility.getDetail(table.display()!.detail()), s => new DisplayLexer(s), t => new DisplayParser(t), p =>
            t.load(mgr, Table.loadDetails(new TableId(tableIdContext.getText() as ExpressionIdentifier), saveTag, p.tableDisplayDetails()), source, detail, expressionVersion)
        );
        mgr.record(transformation);
        return transformation;
    }

    private getTransformation(text: string): TransformationInfo
    {
        for (const t of this.getTransformations())
        {
            if (t.getCanonicalName() === text)
                return t;
        }
        throw new UserException("Transformation not found: \"" + text + "\"");
    }
}
