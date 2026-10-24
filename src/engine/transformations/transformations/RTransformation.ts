// Port of xyz.columnal.transformations.RTransformation (transformations module).
import type { CellPosition } from "../../data/data/CellPosition.js";
import type { RecordSet } from "../../data/data/RecordSet.js";
import { RenameOnEdit } from "../../data/data/RenameOnEdit.js";
import { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import type { Transformation } from "../../data/data/Transformation.js";
import type { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../identifiers/id/TableId.js";
import { HashMap } from "../../java/HashMap.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { javaEquals, javaObjectsHash } from "../../java/JavaObject.js";
import type { ExpressionVersion } from "../../parsers/grammar/Versions.js";
import { ConvertFromR } from "../../r-interop/rinterop/ConvertFromR.js";
import { RExecution } from "../../r-interop/rinterop/RExecution.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import type { FXPlatformSupplier } from "../../utility-functional/utility/function/fx/FXPlatformSupplier.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import type { SimulationSupplier } from "../../utility-functional/utility/function/simulation/SimulationSupplier.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import { TransformationInfo } from "./TransformationInfo.js";
import type { TransformationVisitor } from "./TransformationVisitor.js";
import { VisitableTransformation } from "./VisitableTransformation.js";

export class RTransformation extends VisitableTransformation
{
    public static readonly NAME = "runr";
    // Each table id maps to an R variable by replacing space with dot.
    private readonly srcTableIds: readonly TableId[];
    // The packages to load first.
    private readonly packagesToLoad: readonly string[];
    // This is the expression to calculate in R:
    private readonly rExpression: string;

    private readonly result: Either<StyledString, RecordSet>;

    public constructor(tableManager: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableIds: readonly TableId[], packagesToLoad: readonly string[], rExpression: string)
    {
        super(tableManager, initialLoadDetails);
        this.srcTableIds = srcTableIds;
        this.packagesToLoad = packagesToLoad;
        this.rExpression = rExpression;
        this.result = this.runR();
    }

    protected override getSourcesFromExpressions(): readonly TableId[]
    {
        return [];
    }

    protected override getPrimarySources(): readonly TableId[]
    {
        return this.srcTableIds;
    }

    protected override getTransformationName(): string
    {
        return RTransformation.NAME;
    }

    protected override saveDetail(_destination: JavaFile | null, _renames: TableAndColumnRenames): readonly string[]
    {
        return [
            ...this.packagesToLoad.map(pkg => "@PACKAGE " + pkg),
            ...Utility.splitLines(this.rExpression).map(l => "@R " + l)];
    }

    protected override transformationHashCode(): number
    {
        return javaObjectsHash(this.packagesToLoad, this.srcTableIds, this.rExpression);
    }

    protected override transformationEquals(obj: Transformation | null): boolean
    {
        if (!(obj instanceof RTransformation))
            return false;
        const that = obj;

        return javaEquals(this.srcTableIds, that.srcTableIds) && javaEquals(this.packagesToLoad, that.packagesToLoad) && this.rExpression === that.rExpression;
    }

    public override getData(): RecordSet
    {
        return this.result.eitherEx(err => { throw new UserException(err); }, r => r);
    }

    private runR(): Either<StyledString, RecordSet>
    {
        try
        {
            // Throws an exception if not OK:
            this.getManager().checkROKToRun(this.rExpression);

            // PORT-NOTE: a Java HashMap, whose order decides the order the tables are passed to R.
            const tablesToPass = HashMap.javaOrder<string, RecordSet>();

            for (const srcTableId of this.srcTableIds)
            {
                const t = this.getManager().getSingleTableOrThrow(srcTableId);
                tablesToPass.set(ConvertFromR.usToRTable(t.getId()), t.getData());
            }

            const rResult = RExecution.runRExpression(this.rExpression, this.packagesToLoad, new Map(tablesToPass));

            const tables = ConvertFromR.convertRToTable(this.getManager().getTypeManager(), rResult, false);

            if (tables.length === 0)
                return Either.left(StyledString.s("R result empty"));
            else if (tables.length > 1)
                return Either.left(StyledString.s("R result has multiple tables"));
            else
                return Either.right(tables[0]!.getSecond());
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            return Either.left(e.getStyledMessage());
        }
    }

    public override visit<T>(visitor: TransformationVisitor<T>): T
    {
        return visitor.runR(this);
    }

    public override getReevaluateOperation(): SimulationRunnable | null
    {
        return () => {
            this.getManager().unban(this.rExpression);
            this.getManager().edit(this, id => new RTransformation(this.getManager(), this.getDetailsForCopy(id), this.srcTableIds, this.packagesToLoad, this.rExpression), RenameOnEdit.UNNEEDED /* Name is unchanged so don't need to worry about that */);
        };
    }

    public getRExpression(): string
    {
        return this.rExpression;
    }

    public getPackagesToLoad(): readonly string[]
    {
        return this.packagesToLoad;
    }

    public getInputTables(): readonly TableId[]
    {
        return this.srcTableIds;
    }

    public override getSuggestedName(): TableId
    {
        return RTransformation.suggestedName(this.rExpression);
    }

    public static suggestedName(rExpression: string): TableId
    {
        return new TableId(IdentifierUtility.spaceSeparated("R", IdentifierUtility.shorten(IdentifierUtility.fixExpressionIdentifier(rExpression, "expr"))));
    }
}

export namespace RTransformation
{
    export class Info extends TransformationInfo
    {
        public constructor()
        {
            super(RTransformation.NAME, "transform.runr", "preview-runr.png", "runr.explanation.short", ["R"]);
        }

        public override load(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, source: readonly TableId[], detail: string, _expressionVersion: ExpressionVersion): Transformation
        {
            const lines = Utility.splitLines(detail);
            const pkgs = lines.filter(s => s.startsWith("@PACKAGE ")).map(s => s.substring("@PACKAGE ".length));

            const rExpression = lines.filter(s => s.startsWith("@R ")).map(s => s.substring("@R ".length)).join("\n");

            return new RTransformation(mgr, initialLoadDetails, [...source], pkgs, rExpression);
        }

        public override make(mgr: TableManager, destination: CellPosition, _askForSingleSrcTable: FXPlatformSupplier<Table | null>): SimulationSupplier<Transformation> | null
        {
            return () => new RTransformation(mgr, new Table.InitialLoadDetails(destination), [], [], "1+2");
        }
    }
}
