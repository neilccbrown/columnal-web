// Port of xyz.columnal.data.datatype.TypeManager (types module).
//
// PORT-NOTE: the type maps are Java HashMaps keyed by TypeId, and their iteration order is
// observable (getKnownTaggedTypes, getUserTaggedTypes, lookupTag's errors, suggested fixes
// for unknown types), so they iterate in Java's order (HashMap.javaOrder).
import type { ExpressionIdentifier, UnitIdentifier } from "../../../anns/Annotations.js";
import { HashMap, type ReadonlyMapLike } from "../../../java/HashMap.js";
import { IllegalStateException } from "../../../java/JavaExceptions.js";
import { comparing, javaEquals } from "../../../java/JavaObject.js";
import { vocabularyOf } from "../../../parsers/grammar/Vocabularies.js";
import { FormatLexer } from "../../../parsers/generated/FormatLexer.js";
import { type BracketedTypeContext, FormatParser, TypeContext, type TypeDeclContext, type UnbracketedTypeContext } from "../../../parsers/generated/FormatParser.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { GraphUtility } from "../../../utility/utility/GraphUtility.js";
import { IdentifierUtility } from "../../../utility/utility/IdentifierUtility.js";
import { TaggedValue } from "../../../utility/utility/TaggedValue.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { JellyType } from "../../jellytype/JellyTypes.js";
import { OutputBuilder } from "../../loadsave/OutputBuilder.js";
import { Unit } from "../unit/Unit.js";
import type { UnitDeclaration } from "../unit/UnitDeclaration.js";
import type { UnitManager } from "../unit/UnitManager.js";
import { DataType, TagType } from "./DataType.js";
import { DateTimeInfo } from "./DateTimeInfo.js";
import { NumberInfo } from "./NumberInfo.js";
import { TaggedTypeDefinition } from "./TaggedTypeDefinition.js";
import { TypeId } from "./TypeId.js";

/**
 * Created by neil on 21/12/2016.
 */
export class TypeManager
{
    public static readonly MAYBE_NAME: ExpressionIdentifier = "Optional";
    private readonly unitManager: UnitManager;
    private readonly userTypes = HashMap.javaOrder<TypeId, TaggedTypeDefinition>();
    private readonly builtInTypes = HashMap.javaOrder<TypeId, TaggedTypeDefinition>();
    private readonly allKnownTypes = HashMap.javaOrder<TypeId, TaggedTypeDefinition>();
    private readonly voidType: TaggedTypeDefinition;
    private readonly maybeType: TaggedTypeDefinition;
    // Only need one value for Missing:
    private readonly _maybeMissing: TaggedValue;
    private readonly typeGADT: TaggedTypeDefinition;
    private readonly unitGADT: TaggedTypeDefinition;

    public constructor(unitManager: UnitManager)
    {
        this.unitManager = unitManager;
        // This needs to be built-in because we use it ourselves
        // e.g. when importing data which may be missing.s
        this.maybeType = new TaggedTypeDefinition(new TypeId(TypeManager.MAYBE_NAME), [new Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>(TaggedTypeDefinition.TypeVariableKind.TYPE, "a")], [
            new TagType<JellyType>("None", null),
            new TagType<JellyType>("Is", JellyType.typeVariable("a")),
        ]);
        this._maybeMissing = new TaggedValue(0, null, this.maybeType);
        this.builtInTypes.set(this.maybeType.getTaggedTypeName(), this.maybeType);
        this.voidType = new TaggedTypeDefinition(new TypeId("Void"), [], []);
        this.builtInTypes.set(this.voidType.getTaggedTypeName(), this.voidType);
        // TODO make this into a GADT:
        this.typeGADT = new TaggedTypeDefinition(new TypeId("Type"), [new Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>(TaggedTypeDefinition.TypeVariableKind.TYPE, "t")], [new TagType<JellyType>("Type", null)]);
        this.builtInTypes.set(new TypeId("Type"), this.typeGADT);
        // TODO make this into a GADT:
        this.unitGADT = new TaggedTypeDefinition(new TypeId("Unit"), [new Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>(TaggedTypeDefinition.TypeVariableKind.UNIT, "u")], [new TagType<JellyType>("Unit", null)]);
        this.builtInTypes.set(new TypeId("Unit"), this.unitGADT);
        this.allKnownTypes.setAll(this.builtInTypes);
    }

    public maybeMissing(): TaggedValue
    {
        return this._maybeMissing;
    }

    public maybePresent(content: Value): TaggedValue
    {
        return new TaggedValue(1, content, this.maybeType);
    }

    public unregisterTaggedType(typeName: TypeId): void
    {
        const typeDefinition = this.userTypes.get(typeName);
        this.userTypes.delete(typeName);
        // Only remove from all types if it is the user type.  Don't remove
        // built-in types if they are there under this name:
        // (Java: allKnownTypes.remove(typeName, typeDefinition), which removes only that mapping)
        if (typeDefinition !== undefined && javaEquals(this.allKnownTypes.get(typeName), typeDefinition))
            this.allKnownTypes.delete(typeName);
    }

    // Either makes a new one, or fetches the existing one if it is the same type
    // or renames it to a spare name and returns that.
    public registerTaggedType(typeName: ExpressionIdentifier, typeVariables: readonly Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>[], tagTypes: readonly TagType<JellyType>[]): TaggedTypeDefinition | null
    {
        if (tagTypes.length === 0)
            throw new InternalException("Tagged type cannot have zero tags");

        const idealTypeId = new TypeId(typeName);
        const existingType = this.allKnownTypes.get(idealTypeId);
        if (existingType !== undefined)
        {
            // Check if it's the same:
            if (javaEquals(tagTypes, existingType.getTags()))
            {
                // It is; all is well
                return existingType;
            }
            else
            {
                return null;
            }
        }
        else
        {
            // No need to check for duplicate tag type names as TaggedTypeDefinition constructor does it for us:
            const newType = new TaggedTypeDefinition(idealTypeId, typeVariables, tagTypes);
            this.allKnownTypes.set(idealTypeId, newType);
            this.userTypes.set(idealTypeId, newType);
            return newType;
        }
    }

    public loadTypeDecls(typeContent: string): void
    {
        const typeDecls = Utility.parseAsOne(typeContent, s => new FormatLexer(s), t => new FormatParser(t), p => p.typeDecls());
        for (const typeDeclContext of typeDecls.typeDecl())
        {
            this.loadTypeDecl(typeDeclContext);
        }
    }

    private loadTypeDecl(typeDeclContext: TypeDeclContext): void
    {
        const typeName = new TypeId(IdentifierUtility.fromParsed(typeDeclContext.typeName().ident()));
        const typeParams: Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>[] = Utility.mapListExI(typeDeclContext.taggedDecl().tagDeclParam(), v => {
            return new Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>(v.TYPEVAR() !== null ? TaggedTypeDefinition.TypeVariableKind.TYPE : TaggedTypeDefinition.TypeVariableKind.UNIT, IdentifierUtility.fromParsed(v.ident()));
        });

        const tags: TagType<JellyType>[] = [];
        for (const item of typeDeclContext.taggedDecl().tagItem())
        {
            const tagName = IdentifierUtility.fromParsed(item.ident());

            if (tags.some(t => t.getName() === tagName))
                throw new UserException("Duplicate tag names in format: \"" + tagName + "\"");

            const bracketedType = item.bracketedType();
            if (bracketedType !== null)
            {
                tags.push(new TagType<JellyType>(tagName, JellyType.load(bracketedType, this)));
            }
            else
                tags.push(new TagType<JellyType>(tagName, null));
        }
        const typeDefinition = new TaggedTypeDefinition(typeName, typeParams, [...tags]);
        this.userTypes.set(typeName, typeDefinition);
        this.allKnownTypes.set(typeName, typeDefinition);
    }

    // Java has loadTypeUse(String) and loadTypeUse(TypeContext) public, and private overloads
    // for BracketedTypeContext and UnbracketedTypeContext (here loadUnbracketedTypeUse).
    public loadTypeUse(type: string | TypeContext | BracketedTypeContext): DataType
    {
        if (typeof type === "string")
            return Utility.parseAsOne(type, s => new FormatLexer(s), t => new FormatParser(t), p => this.loadTypeUse(p.completeType().type()));
        if (type instanceof TypeContext)
        {
            const bracketedType = type.bracketedType();
            const unbracketedType = type.unbracketedType();
            if (bracketedType !== null)
                return this.loadTypeUse(bracketedType);
            else if (unbracketedType !== null)
                return this.loadUnbracketedTypeUse(unbracketedType);
            else
                throw new InternalException("Unrecognised case: \"" + type.getText() + "\"");
        }
        const rec = type.record();
        const inner = type.type();
        if (rec !== null)
        {
            // PORT-NOTE: a Java HashMap, whose order becomes the record type's field order:
            const fields = HashMap.javaOrder<ExpressionIdentifier, DataType>();
            for (let i = 0; i < rec.columnName().length; i++)
            {
                const name = IdentifierUtility.fromParsed(rec.columnName(i)!);
                const dataType = this.loadTypeUse(rec.type_(i)!);
                const existed = fields.has(name);
                fields.set(name, dataType);
                if (existed)
                    throw new UserException("Duplicated field: \"" + name + "\"");
            }
            return DataType.record(fields);
        }
        else if (inner !== null)
        {
            return this.loadTypeUse(inner);
        }
        else
            throw new InternalException("Unrecognised case: \"" + type.getText() + "\"");
    }

    private loadUnbracketedTypeUse(type: UnbracketedTypeContext): DataType
    {
        const date = type.date();
        const number = type.number();
        const applyRef = type.applyRef();
        const array = type.array();
        const functionType = type.functionType();
        const ident = type.ident();
        if (type.BOOLEAN() !== null)
            return DataType.BOOLEAN;
        else if (type.TEXT() !== null)
            return DataType.TEXT;
        else if (date !== null)
        {
            const d = date;
            if (d.YEARMONTHDAY() !== null)
                return DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY));
            else if (d.YEARMONTH() !== null)
                return DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTH));
            else if (d.DATETIME() !== null)
                return DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIME));
            else if (d.DATETIMEZONED() !== null)
                return DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIMEZONED));
            else if (d.TIMEOFDAY() !== null)
                return DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.TIMEOFDAY));
            //else if (d.TIMEOFDAYZONED() != null)
                //return DataType.date(new DateTimeInfo(DateTimeType.TIMEOFDAYZONED));
            throw new UserException("Unrecognised date/time type: " + d.getText());
        }
        else if (number !== null)
        {
            const n = number;
            const unitNode = n.UNIT();
            const unit = unitNode === null ? Unit.SCALAR : this.unitManager.loadUse(unitNode.getText());
            return DataType.number(new NumberInfo(unit));
        }
        else if (applyRef !== null)
        {
            // Java checks applyRef().ident() == null, which the grammar never produces:
            const applyIdent = applyRef.ident();
            const typeParams: Either<Unit, DataType>[] = Utility.mapListExI(applyRef.tagRefParam(), t => {
                const unit = t.UNIT();
                if (unit !== null)
                    return Either.left<Unit, DataType>(this.unitManager.loadUse(unit.getText()));
                // TODO UNITVAR
                else if (t.UNITVAR() !== null)
                    return Either.right<Unit, DataType>(DataType.BOOLEAN);
                else
                    return Either.right<Unit, DataType>(this.loadTypeUse(t.bracketedType()!));
            });
            const taggedType = this.lookupType(new TypeId(IdentifierUtility.fromParsed(applyIdent)), typeParams);
            if (taggedType === null)
                throw new UserException("Undeclared tagged type: \"" + applyIdent.getText() + "\"");
            return taggedType;
        }
        else if (array !== null)
        {
            return DataType.array(this.loadTypeUse(array.type()!));
        }
        else if (functionType !== null)
        {
            return DataType.function(Utility.mapListExI(functionType.functionArgs().type_(), t => this.loadTypeUse(t)), this.loadTypeUse(functionType.type()));
        }
        else if (ident !== null && type.TYPEVAR() === null)
        {
            const taggedType = this.lookupType(new TypeId(IdentifierUtility.fromParsed(ident)), []);
            if (taggedType === null)
                throw new UserException("Undeclared tagged type: \"" + ident.getText() + "\"");
            return taggedType;
        }
        else
            throw new InternalException("Unrecognised case: \"" + type.getText() + "\"");
    }

    public lookupType(typeId: TypeId, typeVariableSubs: readonly Either<Unit, DataType>[]): DataType | null
    {
        const taggedTypeDefinition = this.allKnownTypes.get(typeId);
        if (taggedTypeDefinition === undefined)
            return null;
        else
            return taggedTypeDefinition.instantiate(typeVariableSubs, this);
    }

    public lookupDefinition(typeId: TypeId): TaggedTypeDefinition | null
    {
        return this.getKnownTaggedTypes().get(typeId) ?? null;
    }

    /**
     * Gets all the known (tagged) types, including built-in.
     */
    public getKnownTaggedTypes(): ReadonlyMapLike<TypeId, TaggedTypeDefinition>
    {
        return this.allKnownTypes;
    }

    /**
     * Gets all the user-defined tagged types for this file (excl built-in).
     */
    public getUserTaggedTypes(): ReadonlyMapLike<TypeId, TaggedTypeDefinition>
    {
        return this.userTypes;
    }

    // Java has save() and save(Predicate<TypeId>)
    public save(saveType: (typeId: TypeId) => boolean = _t => true): string[]
    {
        const ignoreTypes: readonly TaggedTypeDefinition[] = [this.voidType, this.maybeType, this.unitGADT, this.typeGADT];
        const typesToSave: TaggedTypeDefinition[] = [...this.userTypes.values()].filter(t => !Utility.containsRef(ignoreTypes, t) && saveType(t.getTaggedTypeName()));
        // Java: a HashMap keyed by TaggedTypeDefinition, whose hash code includes enum identity
        // hashes, so its order varies between Java runs; here insertion order.
        const incomingRefs = new HashMap<TaggedTypeDefinition, TaggedTypeDefinition[]>();
        for (const taggedTypeDefinition of typesToSave)
        {
            for (const tagType of taggedTypeDefinition.getTags())
            {
                const inner = tagType.getInner();
                if (inner === null)
                    continue;
                inner.forNestedTagged(typeName => {
                    const referencedType = this.userTypes.get(typeName);
                    if (referencedType !== undefined && !Utility.containsRef(ignoreTypes, referencedType))
                        incomingRefs.computeIfAbsent(referencedType, _t => []).push(taggedTypeDefinition);
                });
            }
        }

        const typeDefinitions: TaggedTypeDefinition[] = [...typesToSave];
        // Sort by name by default:
        typeDefinitions.sort(comparing<TaggedTypeDefinition>(t => t.getTaggedTypeName().getRaw()));
        const orderedDataTypes = GraphUtility.lineariseDAG<TaggedTypeDefinition>(typeDefinitions, incomingRefs, []);
        // lineariseDAG makes all edges point forwards, but we want them pointing backwards
        // so reverse:
        orderedDataTypes.reverse();

        const savedTypes: string[] = [];
        const vocab = vocabularyOf(FormatLexer);
        for (const taggedTypeDefinition of orderedDataTypes)
        {
            const b = new OutputBuilder();
            b.t(FormatLexer.TYPE, vocab);
            b.unquoted(taggedTypeDefinition.getTaggedTypeName());
            taggedTypeDefinition.save(b);
            savedTypes.push(b.toString());
        }
        return savedTypes;
    }

    public getUnitManager(): UnitManager
    {
        return this.unitManager;
    }

    // Also copies units from the unit manager
    public _test_copyTaggedTypesFrom(typeManager: TypeManager): void
    {
        for (const taggedTypeDefinition of typeManager.userTypes.values())
        {
            if (!this.userTypes.has(taggedTypeDefinition.getTaggedTypeName()))
            {
                this.userTypes.set(taggedTypeDefinition.getTaggedTypeName(), taggedTypeDefinition);
                this.allKnownTypes.set(taggedTypeDefinition.getTaggedTypeName(), taggedTypeDefinition);
            }
            else
            {
                if (!taggedTypeDefinition.equals(this.userTypes.get(taggedTypeDefinition.getTaggedTypeName())))
                {
                    throw new IllegalStateException("Two user types have same name but different definitions; abort!");
                }
            }
        }

        for (const [key, value] of typeManager.getUnitManager().getAllUserDeclared())
        {
            if (!this.unitManager.getAllUserDeclared().has(key))
            {
                this.unitManager.addUserUnit(new Pair<UnitIdentifier, Either<UnitIdentifier, UnitDeclaration>>(key, value));
            }
        }
    }

    // Either error message or tag
    public lookupTag(typeName: ExpressionIdentifier | null, constructorName: ExpressionIdentifier): Either<string, TypeManager.TagInfo>
    {
        let type: TaggedTypeDefinition | null;
        if (typeName !== null)
        {
            type = this.allKnownTypes.get(new TypeId(typeName)) ?? null;
        }
        else
        {
            const possibles: Pair<TaggedTypeDefinition, TagType<JellyType>>[] = [...this.allKnownTypes.values()].flatMap(ttd => ttd.getTags().map(tt => new Pair(ttd, tt))).filter(tt => tt.getSecond().getName() === constructorName);
            if (possibles.length === 0)
                return Either.left("No such tag found: " + constructorName);
            else if (possibles.length >= 2)
                return Either.left("Multiple tags found: " + possibles.map(p => p.getFirst().getTaggedTypeName().getRaw()).join(", "));
            type = possibles[0]!.getFirst();
        }
        if (type === null)
            return Either.left("No such type found: " + String(typeName));

        const typeFinal = type;
        const matchingTag = Utility.streamIndexed(type.getTags()).find(tt => tt.getSecond().getName() === constructorName);
        if (matchingTag !== undefined)
            return Either.right<string, TypeManager.TagInfo>(new TypeManager.TagInfo(typeFinal, matchingTag.getFirst()));
        else
            return Either.left<string, TypeManager.TagInfo>("No such tag: " + constructorName);
    }

    public getMaybeType(): TaggedTypeDefinition
    {
        return this.maybeType;
    }

    public makeMaybeType(inner: DataType): DataType
    {
        return this.maybeType.instantiate([Either.right<Unit, DataType>(inner)], this);
    }

    public getVoidType(): TaggedTypeDefinition
    {
        return this.voidType;
    }

    // Basically, t -> Type t
    public typeGADTFor(type: DataType): DataType
    {
        return this.typeGADT.instantiate([Either.right<Unit, DataType>(type)], this);
    }

    // Basically, u -> Unit u
    public unitGADTFor(unit: Unit): DataType
    {
        return this.unitGADT.instantiate([Either.left<Unit, DataType>(unit)], this);
    }

    public clearAllUser(): void
    {
        this.userTypes.clear();
        this.allKnownTypes.clear();
        this.allKnownTypes.setAll(this.builtInTypes);
    }

    public ambiguousTagName(tagName: string): boolean
    {
        return [...this.getKnownTaggedTypes().values()].flatMap(t => t.getTags().map(tt => tt.getName()))
            .filter(n => n === tagName).length > 1;
    }
}

export namespace TypeManager
{
    export class TagInfo
    {
        public readonly wholeType: TaggedTypeDefinition;
        public readonly tagIndex: number;

        public constructor(wholeType: TaggedTypeDefinition, tagIndex: number)
        {
            this.wholeType = wholeType;
            this.tagIndex = tagIndex;
        }

        public equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof TagInfo) || o.constructor !== this.constructor) return false;
            if (this.tagIndex !== o.tagIndex) return false;
            return this.wholeType.equals(o.wholeType);
        }

        public hashCode(): number
        {
            let result = this.wholeType.hashCode();
            result = (Math.imul(31, result) + this.tagIndex) | 0;
            return result;
        }

        public getTypeName(): TypeId
        {
            return this.wholeType.getTaggedTypeName();
        }

        public getTagInfo(): TagType<JellyType>
        {
            return this.wholeType.getTags()[this.tagIndex]!;
        }

        public makeTag(inner: Value | null): TaggedValue
        {
            return new TaggedValue(this.tagIndex, inner, this.wholeType);
        }
    }
}
