// Port of xyz.columnal.data.unit.UnitManager (types module).
//
// PORT-NOTE: the unit maps are Java HashMaps keyed by unit name, and their iteration order
// is observable (getAllDeclared, getAllBuiltIn, getAllUserDeclared and the order of saved
// units), so they iterate in Java's order (HashMap.javaOrder).
import builtinUnitsText from "@resources/data/builtin_units.txt?raw";
import type { UnitIdentifier } from "../../../anns/Annotations.js";
import { HashMap, HashSet } from "../../../java/HashMap.js";
import { Rational } from "../../../java/Rational.js";
import { javaParseInt, javaTrim, NumberFormatException } from "../../../java/JavaString.js";
import { vocabularyOf } from "../../../parsers/grammar/Vocabularies.js";
import { UnitLexer } from "../../../parsers/generated/UnitLexer.js";
import { UnitParser, type ScaleContext, type ScalePowerContext, type SingleContext, type UnbracketedUnitContext, type UnitContext, type UnitDeclarationContext } from "../../../parsers/generated/UnitParser.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { IdentifierUtility } from "../../../utility/utility/IdentifierUtility.js";
import { Utility } from "../../../utility/utility/Utility.js";
import { OutputBuilder } from "../../loadsave/OutputBuilder.js";
import { SingleUnit } from "./SingleUnit.js";
import { Unit } from "./Unit.js";
import { UnitDeclaration } from "./UnitDeclaration.js";

type UnitDef = Either<UnitIdentifier, UnitDeclaration>;

/**
 * Created by neil on 09/12/2016.
 */
export class UnitManager
{
    // Left means it's an alias, Right means full-unit
    private readonly builtInUnits = HashMap.javaOrder<UnitIdentifier, UnitDef>();
    private readonly userUnits = HashMap.javaOrder<UnitIdentifier, UnitDef>();
    // This map is the merger of builtInUnits and userUnits.
    // In case of clashes, builtInUnits is preferred.
    private readonly knownUnits = HashMap.javaOrder<UnitIdentifier, UnitDef>();

    /**
     * Java: UnitManager() loads "builtin_units.txt" and UnitManager(null) loads no built-in units.
     * PORT-NOTE: the only resource name used is "builtin_units.txt", which is bundled.
     */
    public constructor(builtInName: string | null = "builtin_units.txt")
    {
        if (builtInName === null)
            return;
        if (builtInName !== "builtin_units.txt")
            throw new InternalException("Could not find data file");
        const decls = Utility.parseAsOne(builtinUnitsText, s => new UnitLexer(s), t => new UnitParser(t), p => p.file().fileItem());
        let curCategory = "";
        for (const item of decls)
        {
            const declaration = item.declaration();
            const category = item.category();
            if (declaration !== null && declaration.unitDeclaration() !== null)
            {
                const unit = this.loadDeclaration(declaration.unitDeclaration()!, curCategory);
                const name = unit.getDefined().getName();
                this.knownUnits.set(name, Either.right(unit));
                this.builtInUnits.set(name, Either.right(unit));
            }
            else if (declaration !== null && declaration.aliasDeclaration() !== null)
            {
                const aliasDeclaration = declaration.aliasDeclaration()!;
                const newName = IdentifierUtility.fromParsed(aliasDeclaration.singleUnit(0)!);
                const origName = IdentifierUtility.fromParsed(aliasDeclaration.singleUnit(1)!);
                this.knownUnits.set(newName, Either.left(origName));
                this.builtInUnits.set(newName, Either.left(origName));
            }
            else if (category !== null)
            {
                curCategory = category.STRING().getText();
            }
        }
    }

    private getKnownUnit(name: UnitIdentifier): UnitDeclaration | null
    {
        const target = this.knownUnits.get(name);
        if (target === undefined)
            return null;
        else
            return target.either<UnitDeclaration | null>(n => this.getKnownUnit(n), d => d);
    }

    private loadDeclaration(decl: UnitDeclarationContext, category: string): UnitDeclaration
    {
        const defined = IdentifierUtility.fromParsed(decl.singleUnit());
        const description = decl.STRING() !== null ? decl.STRING().getText() : "";
        let suffix = "";
        let prefix = "";
        let equiv: Pair<Rational, Unit> | null = null;
        for (const displayContext of decl.display())
        {
            if (displayContext.PREFIX() !== null)
                prefix = displayContext.STRING().getText();
            else
                suffix = displayContext.STRING().getText();
        }
        const unbracketedUnit = decl.unbracketedUnit();
        if (unbracketedUnit !== null)
        {
            const scaleContext = decl.scale();
            const scale = UnitManager.loadScale(scaleContext);
            equiv = new Pair(scale, this.loadUnbracketedUnit(unbracketedUnit));
        }
        return new UnitDeclaration(new SingleUnit(defined, description, prefix, suffix), equiv, category);
    }

    public static loadScale(scaleContext: ScaleContext | null): Rational
    {
        let scale: Rational;
        if (scaleContext === null)
            scale = Rational.ONE;
        else
        {
            const scalePowerContext = scaleContext.scalePower(0)!;
            scale = UnitManager.loadScalePower(scalePowerContext);
            if (scaleContext.scalePower().length > 1)
                scale = scale.divides(UnitManager.loadScalePower(scaleContext.scalePower(1)!));
        }
        return scale;
    }

    public static loadScalePower(scalePowerContext: ScalePowerContext): Rational
    {
        let rational = Utility.parseRational(scalePowerContext.NUMBER(0)!.getText());
        if (scalePowerContext.NUMBER().length > 1)
            rational = Utility.rationalToPower(rational, javaParseInt(scalePowerContext.NUMBER(1)!.getText()));
        return rational;
    }

    // Like loadUse, but any UserException is treated as an InternalException
    // since we expect the unit to be present.
    public loadBuiltIn(text: string): Unit
    {
        try
        {
            return this.loadUse(text);
        }
        catch (e)
        {
            if (!(e instanceof UserException))
                throw e;
            throw new InternalException(e.message);
        }
    }

    public loadUse(text: string): Unit
    {
        if (text.startsWith("{") && text.endsWith("}"))
            text = text.substring(1, text.length - 1);
        if (text === "" || text === "1")
            return Unit.SCALAR;
        const ctx = Utility.parseAsOne(text, s => new UnitLexer(s), t => new UnitParser(t), p => p.unitUse().unbracketedUnit());
        return this.loadUnbracketedUnit(ctx);
    }

    private loadUnbracketedUnit(ctx: UnbracketedUnitContext): Unit
    {
        let u = this.loadUnit(ctx.unit());
        const divideBy = ctx.divideBy();
        if (divideBy !== null)
            u = u.divideBy(this.loadUnit(divideBy.unit()!));
        else
        {
            for (const rhs of ctx.timesBy())
            {
                u = u.times(this.loadUnit(rhs.unit()));
            }
        }
        return u;
    }

    private loadUnit(unit: UnitContext): Unit
    {
        const single = unit.single();
        if (single !== null)
            return this.loadSingle(single);
        else
            return this.loadUnbracketedUnit(unit.unbracketedUnit()!);
    }

    private loadSingle(singleOrScaleContext: SingleContext): Unit
    {
        let base: Unit;
        const singleUnit = singleOrScaleContext.singleUnit();
        const number = singleOrScaleContext.NUMBER();
        if (singleUnit !== null)
        {
            if (singleUnit.UNITVAR() !== null)
            {
                throw new UserException("Unit variables not allowed here");
            }
            else
            {
                const unitName = IdentifierUtility.fromParsed(singleUnit);
                const lookedUp = this.getKnownUnit(unitName);
                if (lookedUp === null)
                    throw new UserException("Unknown unit: \"" + unitName + "\"");
                base = lookedUp.getUnit();
            }
        }
        else if (number !== null && number.getText() === "1")
        {
            return Unit.SCALAR;
        }
        else
            throw new UserException("Error parsing unit: \"" + singleOrScaleContext.getText() + "\"");
        if (number !== null)
        {
            try
            {
                const power = javaParseInt(number.getText());
                return base.raisedTo(power);
            }
            catch (e)
            {
                if (!(e instanceof NumberFormatException))
                    throw e;
                throw new UserException("Problem parsing integer power: \"" + number.getText() + "\"", e);
            }
        }
        else
            return base;
    }

    public guessUnit(commonPrefix: string | null): Unit
    {
        if (commonPrefix === null)
            return Unit.SCALAR;
        const possName = IdentifierUtility.asUnitIdentifier(javaTrim(commonPrefix));
        if (possName === null)
            return Unit.SCALAR;
        const possUnit = this.getKnownUnit(possName);
        if (possUnit === null)
            return Unit.SCALAR;
        else
            return possUnit.getUnit();
    }

    /**
     * Takes a unit U, and gets the canonical unit C, and what number you have to multiply U by to get C.
     * (Java also has private overloads taking a SingleUnit and a Pair<Rational, Unit>.)
     */
    public canonicalise(original: Unit): Pair<Rational, Unit>
    {
        return this.canonicalisePair(new Pair(Rational.ONE, original));
    }

    private canonicaliseSingle(original: SingleUnit): Pair<Rational, Unit>
    {
        const decl = this.getKnownUnit(original.getName());
        if (decl === null)
            throw new UserException("Unknown unit: {" + original.getName() + "}");
        const equiv = decl.getEquivalentTo();
        if (equiv === null)
            return new Pair(Rational.ONE, decl.getUnit());
        else
            return this.canonicalisePair(equiv);
    }

    private canonicalisePair(original: Pair<Rational, Unit>): Pair<Rational, Unit>
    {
        let accumScale = original.getFirst();
        let accumUnit = Unit.SCALAR;
        const details = original.getSecond().getDetails();
        for (const [key, value] of details)
        {
            const canonicalised = this.canonicaliseSingle(key);
            accumScale = accumScale.times(Utility.rationalToPower(canonicalised.getFirst(), value));
            accumUnit = accumUnit.times(canonicalised.getSecond().raisedTo(value));
        }
        return new Pair(accumScale, accumUnit);
    }

    public getDeclared(m: UnitIdentifier): SingleUnit
    {
        const unitDeclaration = this.getKnownUnit(m);
        if (unitDeclaration === null)
            throw new InternalException("Unknown unit: " + m);
        return unitDeclaration.getDefined();
    }

    public getAllDeclared(): SingleUnit[]
    {
        return [...this.knownUnits.values()].flatMap(e => e.either<SingleUnit[]>(_a => [], d => [d.getDefined()]));
    }

    public loadUserUnits(unitsSrc: string): void
    {
        const unitDecls = Utility.parseAsOne(unitsSrc, s => new UnitLexer(s), t => new UnitParser(t), p => p.file().fileItem());
        for (const decl of unitDecls)
        {
            // Java would throw a NullPointerException for a category line, as here:
            const declaration = decl.declaration()!;
            const unitDeclaration = declaration.unitDeclaration();
            const aliasDeclaration = declaration.aliasDeclaration();
            if (unitDeclaration !== null)
            {
                const unit = this.loadDeclaration(unitDeclaration, "");
                const name = unit.getDefined().getName();
                UnitManager.putIfAbsent(this.userUnits, name, Either.right(unit));
                // Don't overwrite existing binding:
                UnitManager.putIfAbsent(this.knownUnits, name, Either.right(unit));
            }
            else if (aliasDeclaration !== null)
            {
                const newName = IdentifierUtility.fromParsed(aliasDeclaration.singleUnit(0)!);
                const origName = IdentifierUtility.fromParsed(aliasDeclaration.singleUnit(1)!);
                UnitManager.putIfAbsent(this.knownUnits, newName, Either.left(origName));
                UnitManager.putIfAbsent(this.userUnits, newName, Either.left(origName));
            }
        }
    }

    private static putIfAbsent(map: HashMap<UnitIdentifier, UnitDef>, key: UnitIdentifier, value: UnitDef): void
    {
        if (!map.has(key))
            map.set(key, value);
    }

    // Java: ImmutableMap.copyOf, which keeps the HashMap's iteration order
    public getAllBuiltIn(): ReadonlyMap<UnitIdentifier, UnitDef>
    {
        return new Map(this.builtInUnits);
    }

    // Java: ImmutableMap.copyOf, which keeps the HashMap's iteration order
    public getAllUserDeclared(): ReadonlyMap<UnitIdentifier, UnitDef>
    {
        return new Map(this.userUnits);
    }

    // Gets the name of the canonical unit at the end of the conversion chain
    // for the given unit name.  In case of problems (broken links etc), null is returned
    // (Java: ImmutableSet.copyOf a HashSet, which keeps the HashSet's iteration order)
    public getCanonicalBaseUnit(unitName: UnitIdentifier): ReadonlySet<string> | null
    {
        const declaration = this.getKnownUnit(unitName);
        if (declaration === null)
            return null;
        const equivalentTo = declaration.getEquivalentTo();
        if (equivalentTo !== null)
        {
            const baseUnits = HashSet.javaOrder<string>();
            for (const singleUnit of equivalentTo.getSecond().getDetails().keys())
            {
                const canonBase = this.getCanonicalBaseUnit(singleUnit.getName());
                if (canonBase === null)
                    return null;
                for (const b of canonBase)
                    baseUnits.add(b);
            }
            return new Set(baseUnits);
        }
        return new Set([unitName]);
    }

    public removeUserUnit(name: string): void
    {
        // We only remove from knownUnits if it's the same;
        // it's possible that we did not successfully override the built-in unit:
        const removed = this.userUnits.get(name) ?? null;
        this.userUnits.delete(name);
        // Deliberate use of ==
        if ((this.knownUnits.get(name) ?? null) === removed)
        {
            this.knownUnits.delete(name);
        }
    }

    public addUserUnit(unit: Pair<UnitIdentifier, UnitDef>): void
    {
        UnitManager.putIfAbsent(this.userUnits, unit.getFirst(), unit.getSecond());
        UnitManager.putIfAbsent(this.knownUnits, unit.getFirst(), unit.getSecond());
    }

    /**
     * Java has three overloads: save(), save(Predicate<String>) and save(Stream<String>).
     * Here the argument is either a predicate (default: all), or the unit names to save.
     */
    public save(saveUnit: ((u: UnitIdentifier) => boolean) | readonly UnitIdentifier[] = _u => true): string[]
    {
        const toProcess: UnitIdentifier[] = typeof saveUnit === "function" ? [...this.userUnits.keys()].filter(saveUnit) : [...saveUnit];
        const unitsToSave = HashSet.javaOrder<UnitIdentifier>();
        // Now save any units aliased or used in definition of those units:
        // Note: toProcess may grow while we execute!
        for (let i = 0; i < toProcess.length; i++)
        {
            const u = toProcess[i]!;
            unitsToSave.add(u);
            const def = this.knownUnits.get(u);
            if (def !== undefined)
            {
                def.either_(t => {
                    if (!unitsToSave.has(t))
                        toProcess.push(t);
                }, decl => {
                    const equivalentTo = decl.getEquivalentTo();
                    if (equivalentTo !== null)
                    {
                        for (const v of equivalentTo.getSecond().getDetails().keys())
                        {
                            if (!unitsToSave.has(v.getName()))
                                toProcess.push(v.getName());
                        }
                    }
                });
            }
        }
        const vocab = vocabularyOf(UnitParser);
        return [...unitsToSave].flatMap(u => {
            const v = this.userUnits.get(u);
            return v === undefined ? [] : [new Pair(u, v)];
        }).map(e => e.getSecond().either(alias => {
            const b = new OutputBuilder();
            b.t(UnitParser.ALIAS, vocab);
            b.raw(e.getFirst());
            b.t(UnitParser.EQUALS, vocab);
            b.raw(alias);
            return b.toString();
        }, decl => {
            const b = new OutputBuilder();
            b.t(UnitParser.UNIT, vocab);
            b.raw(e.getFirst());
            b.s(decl.getDefined().getDescription());
            const equiv = decl.getEquivalentTo();
            if (equiv !== null)
            {
                b.t(UnitParser.EQUALS, vocab);
                if (!equiv.getFirst().equals(Rational.of(1)))
                {
                    // TODO save string source, not just canonical rational:
                    b.raw(equiv.getFirst().toString());
                    b.t(UnitParser.TIMES, vocab);
                }
                b.raw(equiv.getSecond().toString());
            }
            return b.toString();
        }));
    }

    public clearAllUser(): void
    {
        this.userUnits.clear();
        this.knownUnits.clear();
        this.knownUnits.setAll(this.builtInUnits);
    }
}
