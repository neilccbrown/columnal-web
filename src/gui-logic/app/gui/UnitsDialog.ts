// Port of the logic of xyz.columnal.gui.UnitsDialog (app module): what its unit lists show and their
// order (UnitList), and its EditUnitDialog's reading of what was entered (calculateResult).  The dialogs
// are rebuilt in the GUI (src/gui/windows/types/UnitsDialog.vue and EditUnitDialog.vue).
import type { Localized, UnitIdentifier } from "../../../engine/anns/Annotations.js";
import { UnitExpression } from "../../../engine/expressions/transformations/expression/UnitExpressions.js";
import { UnitLexer } from "../../../engine/parsers/generated/UnitLexer.js";
import { UnitParser, type ScaleContext } from "../../../engine/parsers/generated/UnitParser.js";
import { SingleUnit } from "../../../engine/types/data/unit/SingleUnit.js";
import { UnitDeclaration } from "../../../engine/types/data/unit/UnitDeclaration.js";
import { UnitManager } from "../../../engine/types/data/unit/UnitManager.js";
import { javaTrim } from "../../../engine/java/JavaString.js";
import { Either } from "../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../../engine/utility-error/error/UserException.js";
import { Log } from "../../../engine/utility/log/Log.js";
import { IdentifierUtility } from "../../../engine/utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../../engine/utility/utility/TranslationUtility.js";
import { Utility } from "../../../engine/utility/utility/Utility.js";

export namespace UnitsDialog
{
    /** A unit: an alias for another, or a declaration (Java: Either<String, UnitDeclaration>). */
    export type UnitDef = Either<UnitIdentifier, UnitDeclaration>;

    /** Java: UnitList's Definition column. */
    export function definitionText(def: UnitDef): string
    {
        return def.either(u => u, d =>
        {
            const equivalentTo = d.getEquivalentTo();
            if (equivalentTo !== null)
                return equivalentTo.getFirst().toString() + " * " + equivalentTo.getSecond().toString();
            else
                return "";
        });
    }

    /** Java: UnitList's Description column. */
    export function descriptionText(def: UnitDef): string
    {
        return def.either(() => "", d => d.getDefined().getDescription());
    }

    /** Java: UnitList.getCategory. */
    export function category(def: UnitDef): string
    {
        return def.either(() => "", decl => decl.getCategory());
    }

    /**
     * Java: UnitList.setUnits's order: by category, then each canonical unit just ahead of the units
     * defined from it.
     */
    export function sortedUnits(units: ReadonlyMap<UnitIdentifier, UnitDef>, unitManager: UnitManager): Pair<UnitIdentifier, UnitDef>[]
    {
        const key = (p: Pair<UnitIdentifier, UnitDef>): string =>
        {
            const canonicalBaseUnit = unitManager.getCanonicalBaseUnit(p.getFirst());
            if (canonicalBaseUnit === null)
                return category(p.getSecond());
            // Make canonical units be without suffix so they get sorted ahead of their derivatives:
            if (canonicalBaseUnit.has(p.getFirst()) && canonicalBaseUnit.size === 1)
                return category(p.getSecond()) + ":" + p.getFirst();
            return category(p.getSecond()) + ":" + [...canonicalBaseUnit].sort().join(":") + ";";
        };
        // (Java's String comparison, by UTF-16 code unit; the sort is stable, as Java's)
        return [...units].map(([k, v]) => new Pair(k, v)).sort((a, b) =>
        {
            const ka = key(a), kb = key(b);
            return ka < kb ? -1 : ka > kb ? 1 : 0;
        });
    }

    /** What the edit dialog has: its name, which kind, and each kind's fields. */
    export interface Entered
    {
        readonly name: string;
        // Java: the toggle group, null if neither is selected
        readonly kind: "full" | "alias" | null;
        readonly aliasTarget: string;
        readonly description: string;
        readonly equivalent: boolean;
        readonly scale: string;
        // The definition's unit editor's content
        readonly definition: UnitExpression;
    }

    /** Java: EditUnitDialog.calculateResult. */
    export function calculateResult(unitManager: UnitManager, entered: Entered): Either<Localized, Pair<UnitIdentifier, UnitDef>>
    {
        const name = IdentifierUtility.asUnitIdentifier(javaTrim(entered.name));
        if (name === null)
            return Either.left(TranslationUtility.getString("invalid.name"));

        if (entered.kind === null)
        {
            return Either.left(TranslationUtility.getString("invalid.unit.select.toggle"));
        }
        else if (entered.kind === "alias")
        {
            const aliasTarget = IdentifierUtility.asUnitIdentifier(javaTrim(entered.aliasTarget));
            if (aliasTarget === null)
                return Either.left(TranslationUtility.getString("invalid.alias.target.name"));

            return Either.right(new Pair<UnitIdentifier, UnitDef>(name, Either.left(aliasTarget)));
        }
        else
        {
            const singleUnit = new SingleUnit(name, javaTrim(entered.description), "", "");

            if (!entered.equivalent)
            {
                return Either.right(new Pair<UnitIdentifier, UnitDef>(name, Either.right(new UnitDeclaration(singleUnit, null, ""))));
            }

            let scaleContext: ScaleContext;
            try
            {
                scaleContext = Utility.parseAsOne(javaTrim(entered.scale), s => new UnitLexer(s), t => new UnitParser(t), p => p.fullScale().scale());
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                return Either.left(Utility.concatLocal(TranslationUtility.getString("invalid.scale"), e.getLocalizedMessage() ?? ""));
            }

            let jellyUnit;
            try
            {
                jellyUnit = entered.definition.asUnit(unitManager);
            }
            catch (e)
            {
                if (!(e instanceof UnitExpression.UnitLookupException))
                    throw e;
                return Either.left(e.errorMessage === null ? TranslationUtility.getString("invalid.unit") : e.errorMessage.toPlain());
            }
            let concreteUnit;
            try
            {
                concreteUnit = jellyUnit.makeUnit(new Map());
            }
            catch (e)
            {
                if (!(e instanceof InternalException))
                    throw e;
                Log.log(e);
                return Either.left(e.getLocalizedMessage() ?? "");
            }

            const equiv = new Pair(UnitManager.loadScale(scaleContext), concreteUnit);

            return Either.right(new Pair<UnitIdentifier, UnitDef>(name, Either.right(new UnitDeclaration(singleUnit, equiv, ""))));
        }
    }
}
