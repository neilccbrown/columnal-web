// Port of xyz.columnal.transformations.expression.SingleUnitExpression (expressions module).
import type { UnitIdentifier } from "../../../anns/Annotations.js";
import { javaStringHashCode } from "../../../java/JavaObject.js";
import { SingleUnit } from "../../../types/data/unit/SingleUnit.js";
import { UnitDeclaration } from "../../../types/data/unit/UnitDeclaration.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { JellyUnit } from "../../../types/jellytype/JellyUnit.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Expression } from "./Expressions.js";
import { QuickFix } from "./QuickFix.js";
import { UnitExpression } from "./UnitExpressions.js";

// Same distinction as IdentExpression/InvalidIdentExpression
export class SingleUnitExpression extends UnitExpression
{
    private readonly name: UnitIdentifier;

    public constructor(text: UnitIdentifier)
    {
        super();
        this.name = text;
    }

    public override asUnit(unitManager: UnitManager): JellyUnit
    {
        try
        {
            return JellyUnit.fromConcrete(unitManager.loadUse(this.name));
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            const similarNames = Utility.findAlternatives(this.name, unitManager.getAllDeclared(), su => [su.getName(), su.getDescription()])
                .map(su => new QuickFix<UnitExpression>(StyledString.s("Correct"), [], this, () => new SingleUnitExpression(su.getName())));
            const name = this.name;
            const makeNew = new QuickFix<UnitExpression>(StyledString.s("Create unit \"" + this.name + "\""), [], this, {
                doAction(typeManager): null
                {
                    typeManager.getUnitManager().addUserUnit(new Pair(name, Either.right<UnitIdentifier, UnitDeclaration>(new UnitDeclaration(new SingleUnit(name, "", "", ""), null, ""))));
                    return null;
                },
            });
            const fixes = [...similarNames, makeNew];
            throw new UnitExpression.UnitLookupException(StyledString.s(e.getLocalizedMessage()), this, fixes);
        }
    }

    public override save(_saveDestination: Expression.SaveDestination, _topLevel: boolean): string
    {
        return this.name;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof SingleUnitExpression) || o.constructor !== this.constructor) return false;

        const that = o;

        return this.name === that.name;
    }

    public override isEmpty(): boolean
    {
        return false;
    }

    public override isScalar(): boolean
    {
        return false;
    }

    public override hashCode(): number
    {
        return javaStringHashCode(this.name);
    }

    public override replaceSubExpression(toReplace: UnitExpression, replaceWith: UnitExpression): UnitExpression
    {
        return this === toReplace ? replaceWith : this;
    }
}
