// Port of xyz.columnal.data.datatype.TaggedTypeDefinition (types module).
import type { ExpressionIdentifier } from "../../../anns/Annotations.js";
import { javaEnumName } from "../../../java/JavaEnum.js";
import { javaEquals, javaObjectsHash } from "../../../java/JavaObject.js";
import { vocabularyOf } from "../../../parsers/grammar/Vocabularies.js";
import { FormatLexer } from "../../../parsers/generated/FormatLexer.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import type { TaggedValue } from "../../../utility/utility/TaggedValue.js";
import { Utility } from "../../../utility/utility/Utility.js";
import type { JellyType } from "../../jellytype/JellyTypes.js";
import type { OutputBuilder } from "../../loadsave/OutputBuilder.js";
import type { Unit } from "../unit/Unit.js";
import { DataType, TagType } from "./DataType.js";
import type { TypeId } from "./TypeId.js";
import { TypeManager } from "./TypeManager.js";

export class TaggedTypeDefinition implements TaggedValue.TaggedTypeDefinitionBase
{
    private readonly name: TypeId;
    // Order matters here:
    private readonly typeVariables: readonly Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>[];
    // Version with the type variables unsubstituted:
    // The only free variables should be the ones in the typeVariables list:
    private readonly tags: readonly TagType<JellyType>[];

    public constructor(name: TypeId, typeVariables: readonly Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>[], tags: readonly TagType<JellyType>[])
    {
        this.name = name;
        this.typeVariables = typeVariables;
        this.tags = tags;

        // Caller is responsible for checking name, type variables and tags.  Hence any violations here are InternalException, not UserException
        const uniqueTypeVars = new Set<string>();
        for (const typeVariable of typeVariables)
        {
            if (uniqueTypeVars.has(typeVariable.getSecond()))
            {
                throw new InternalException("Duplicate type variable: \"" + TaggedTypeDefinition.typeVariableToString(typeVariable) + "\"");
            }
            uniqueTypeVars.add(typeVariable.getSecond());
        }
        const uniqueTagNames = new Set<string>();
        for (const tag of tags)
        {
            if (uniqueTagNames.has(tag.getName()))
            {
                throw new InternalException("Duplicate type tag: \"" + tag.getName() + "\"");
            }
            uniqueTagNames.add(tag.getName());
        }
    }

    // Java: Pair.toString of the type variable, which shows the enum's name
    private static typeVariableToString(typeVariable: Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>): string
    {
        return "(" + javaEnumName(TaggedTypeDefinition.TypeVariableKind, typeVariable.getFirst()) + ", " + typeVariable.getSecond() + ")";
    }

    public getTags(): readonly TagType<JellyType>[]
    {
        return this.tags;
    }

    // Instantiates to concrete type.
    public instantiate(typeVariableSubs: readonly Either<Unit, DataType>[], mgr: TypeManager): DataType
    {
        if (typeVariableSubs.length !== this.typeVariables.length)
            throw new TaggedTypeDefinition.TaggedInstantiationException("Attempting to use type with " + this.typeVariables.length + " variables but trying to substitute " + typeVariableSubs.length);

        // Java: ImmutableMap.Builder (which throws on a duplicate key, but the constructor prevents those)
        const substitutions = new Map<string, Either<Unit, DataType>>();
        for (let i = 0; i < this.typeVariables.length; i++)
        {
            if ((this.typeVariables[i]!.getFirst() === TaggedTypeDefinition.TypeVariableKind.TYPE) && typeVariableSubs[i]!.isLeft())
                throw new TaggedTypeDefinition.TaggedInstantiationException("Expected type variable but found unit variable for variable #" + (i + 1));
            if ((this.typeVariables[i]!.getFirst() === TaggedTypeDefinition.TypeVariableKind.UNIT) && typeVariableSubs[i]!.isRight())
                throw new TaggedTypeDefinition.TaggedInstantiationException("Expected unit variable but found type variable for variable #" + (i + 1));
            substitutions.set(this.typeVariables[i]!.getSecond(), typeVariableSubs[i]!);
        }

        const substitutedTags: TagType<DataType>[] = [];
        for (const tag of this.tags)
        {
            const tagInner = tag.getInner();
            if (tagInner === null)
                substitutedTags.push(new TagType<DataType>(tag.getName(), null));
            else
            {
                const inner = tagInner.makeDataType(substitutions, mgr);
                substitutedTags.push(new TagType<DataType>(tag.getName(), inner));
            }
        }

        return DataType.tagged(this.name, typeVariableSubs, substitutedTags);
    }

    public getTaggedTypeName(): TypeId
    {
        return this.name;
    }

    public save(b: OutputBuilder): void
    {
        const vocab = vocabularyOf(FormatLexer);
        b.t(FormatLexer.TAGGED, vocab);
        for (const typeVariable of this.typeVariables)
        {
            b.t(typeVariable.getFirst() === TaggedTypeDefinition.TypeVariableKind.TYPE ? FormatLexer.TYPEVAR : FormatLexer.UNITVAR, vocab)
                .expId(typeVariable.getSecond());
        }
        b.t(FormatLexer.OPEN_BRACKET, vocab);
        let first = true;
        for (const tag of this.tags)
        {
            if (!first)
                b.t(FormatLexer.TAGOR, vocab);
            b.expId(tag.getName());
            const inner = tag.getInner();
            if (inner !== null)
            {
                b.raw("(");
                inner.save(b);
                b.raw(")");
            }
            first = false;
        }
        b.t(FormatLexer.CLOSE_BRACKET, vocab);
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TaggedTypeDefinition) || o.constructor !== this.constructor) return false;
        return javaEquals(this.name, o.name) &&
            javaEquals(this.typeVariables, o.typeVariables) &&
            javaEquals(this.tags, o.tags);
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.name, this.typeVariables, this.tags);
    }

    public getTypeArguments(): readonly Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>[]
    {
        return this.typeVariables;
    }

    public toString(): string
    {
        return this.name.toString() + " " + Utility.listToString(this.typeVariables.map(v => TaggedTypeDefinition.typeVariableToString(v))) + " " + Utility.listToString(this.tags);
    }

    public _test_getTagInfos(): readonly TypeManager.TagInfo[]
    {
        const r: TypeManager.TagInfo[] = [];
        for (let i = 0; i < this.tags.length; i++)
        {
            r.push(new TypeManager.TagInfo(this, i));
        }
        return r;
    }

    public getTagName(tagIndex: number): string
    {
        if (tagIndex >= 0 && tagIndex < this.tags.length)
            return this.tags[tagIndex]!.getName();
        return "InvalidTag" + (tagIndex < 0 ? "Neg" : "") + Math.abs(tagIndex);
    }
}

export namespace TaggedTypeDefinition
{
    export enum TypeVariableKind { TYPE, UNIT }

    export class TaggedInstantiationException extends UserException
    {
        public constructor(message: string)
        {
            super(message);
        }
    }
}
