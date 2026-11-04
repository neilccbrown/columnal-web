// Port of the logic of xyz.columnal.gui.TypesDialog (app module): how the list shows a type, and its
// EditTypeDialog's reading of what was entered (calculateResult, getPlainTags, parseTagName, and
// TagValueEdit.updateCurrentValue), and its keeping the two tabs in step (innerValueChanged).  The
// dialogs are rebuilt in the GUI (src/gui/windows/TypesDialog.vue and EditTypeDialog.vue).
import type { ExpressionIdentifier, Localized } from "../../../engine/anns/Annotations.js";
import type { TypeExpression } from "../../../engine/expressions/transformations/expression/type/TypeExpressions.js";
import { javaSplit } from "../../../engine/java/JavaString.js";
import { TagType } from "../../../engine/types/data/datatype/DataType.js";
import type { JellyType } from "../../../engine/types/jellytype/JellyType.js";
import { TaggedTypeDefinition } from "../../../engine/types/data/datatype/TaggedTypeDefinition.js";
import { TypeId } from "../../../engine/types/data/datatype/TypeId.js";
import type { TypeManager } from "../../../engine/types/data/datatype/TypeManager.js";
import { javaTrim } from "../../../engine/java/JavaString.js";
import { Either } from "../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../../engine/utility-error/error/UserException.js";
import { Log } from "../../../engine/utility/log/Log.js";
import { IdentifierUtility } from "../../../engine/utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../../engine/utility/utility/TranslationUtility.js";
import { Utility } from "../../../engine/utility/utility/Utility.js";

export namespace TypesDialog
{
    /** Java: the list cell's text, the name then each type argument in brackets. */
    export function listText(item: TaggedTypeDefinition): string
    {
        return item.getTaggedTypeName().getRaw() + item.getTypeArguments().map(t => "(" + t.getSecond() + ")").join("");
    }

    /** Java: the type arguments field's text for an existing type (unit variables in braces). */
    export function typeArgsText(existing: TaggedTypeDefinition): string
    {
        return existing.getTypeArguments().map(p => p.getFirst() === TaggedTypeDefinition.TypeVariableKind.UNIT ? "{" + p.getSecond() + "}" : p.getSecond()).join(", ");
    }

    /** Java: an existing type opens on the plain tab if it has no type arguments and no inner types. */
    export function startsOnPlain(existing: TaggedTypeDefinition): boolean
    {
        return existing.getTypeArguments().length === 0 && existing.getTags().every(t => t.getInner() === null);
    }

    /** Java: getPlainTags: the names, separated by commas or lines (blanks ignored), each valid or an error. */
    export function getPlainTags(plainTagList: string): Either<Localized, ExpressionIdentifier>[]
    {
        return javaSplit(plainTagList, / *[,\n\r] */)
            .map(s => javaTrim(s))
            .filter(s => s !== "")
            .map(s =>
            {
                const ident = IdentifierUtility.asExpressionIdentifier(s);
                if (ident === null)
                {
                    return Either.left<Localized, ExpressionIdentifier>(
                        Utility.concatLocal([TranslationUtility.getString("type.invalid.tag.name"),
                            Utility.universal("\""),
                            Utility.userInput(s),
                            Utility.universal("\"")]));
                }
                else
                {
                    return Either.right<Localized, ExpressionIdentifier>(ident);
                }
            });
    }

    // Variables surrounded by {} are unit variables.
    function parseTagName(errorPrefix: Localized, src: string): Either<Localized, Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>>
    {
        let typeVariableKind = TaggedTypeDefinition.TypeVariableKind.TYPE;

        if (src.startsWith("{") && src.endsWith("}"))
        {
            typeVariableKind = TaggedTypeDefinition.TypeVariableKind.UNIT;
            src = src.substring(1, src.length - 1);
        }

        const identifier = IdentifierUtility.asExpressionIdentifier(javaTrim(src));
        if (identifier === null)
            return Either.left(Utility.concatLocal(errorPrefix, Utility.userInput("\"" + javaTrim(src) + "\"")));
        else
            return Either.right(new Pair(typeVariableKind, identifier));
    }

    /** Java: TagValueEdit.updateCurrentValue: a tag from its name, and its inner type (empty for none). */
    export function tagValue(typeManager: TypeManager, tagName: string, latest: TypeExpression): Either<Localized, TagType<JellyType>>
    {
        try
        {
            const jellyType = latest.isEmpty() ? null : latest.toJellyType(typeManager, { record: jellyType => jellyType });
            const ident = IdentifierUtility.asExpressionIdentifier(tagName);
            if (ident !== null)
                return Either.right(new TagType<JellyType>(ident, jellyType));
            else
                return Either.left(Utility.concatLocal([
                    TranslationUtility.getString("type.invalid.tag.name"),
                    Utility.universal("\""),
                    Utility.userInput(tagName),
                    Utility.universal("\""),
                ]));
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            if (e instanceof InternalException)
                Log.log(e);
            return Either.left(e.getLocalizedMessage() ?? "");
        }
    }

    /**
     * Java: innerValueChanged: whether the plain tab can be used (no type arguments, and no tag with an
     * inner type or an error), and if so, the plain tags' text.
     */
    export function plainFromInner(innerValueTypeArgs: string, tags: readonly Either<Localized, TagType<JellyType>>[]): string | null
    {
        const hasTypeArgs = javaTrim(innerValueTypeArgs) !== "";
        const plainTagNames = Either.mapM(tags, t => t.flatMap(v => v.getInner() === null ? Either.right<Localized, string>(v.getName()) : Either.left<Localized, string>(Utility.universal("err"))));
        return !hasTypeArgs && plainTagNames.isRight() ? plainTagNames.getRight("plain").join("\n") : null;
    }

    /** Java: calculateResult: the type defined on the tab selected, or an error. */
    export function calculateResult(typeName: string, tab: "plain" | "inner", plainTagList: string, innerValueTypeArgs: string, innerTags: readonly Either<Localized, TagType<JellyType>>[]): Either<Localized, TaggedTypeDefinition>
    {
        try
        {
            const typeIdentifier = IdentifierUtility.asExpressionIdentifier(javaTrim(typeName));

            if (typeIdentifier === null)
                return Either.left(Utility.concatLocal(TranslationUtility.getString("type.invalid.identifier"), Utility.userInput(javaTrim(typeName))));
            const typeIdentifierFinal = new TypeId(typeIdentifier);

            if (tab === "plain")
            {
                const tagsFlipped = Either.mapM(getPlainTags(plainTagList), x => x);
                return tagsFlipped.map(ts => new TaggedTypeDefinition(typeIdentifierFinal, [], ts.map(t => new TagType<JellyType>(t, null))));
            }
            else
            {
                // (Java's \s, ASCII whitespace only)
                // eslint-disable-next-line no-control-regex
                const typeArgs = javaSplit(javaTrim(innerValueTypeArgs), /[ \t\n\x0B\f\r]*,[ \t\n\x0B\f\r]*/);
                let typeArgsOrErr: Either<Localized, Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>[]> = Either.right([]);
                if (!(typeArgs.length === 1 && typeArgs[0] === ""))
                    typeArgsOrErr = Either.mapM(typeArgs, t => parseTagName(TranslationUtility.getString("type.invalid.argument"), t));

                return typeArgsOrErr.flatMap(args => Either.mapM(innerTags, e => e).map(ts => new TaggedTypeDefinition(typeIdentifierFinal, args, ts)));
            }
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
            return Either.left(e.getLocalizedMessage() ?? "");
        }
    }
}
