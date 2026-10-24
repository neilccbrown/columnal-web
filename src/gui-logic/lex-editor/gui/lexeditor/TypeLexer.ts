// Port of xyz.columnal.gui.lexeditor.TypeLexer (lex-editor module).
import { CharStream } from "antlr4ng";
import type { CanonicalLocation, DisplayLocation, ExpressionIdentifier, RawInputLocation } from "../../../../engine/anns/Annotations.js";
import { CanonicalSpan } from "../../../../engine/expressions/transformations/expression/CanonicalSpan.js";
import { Expression } from "../../../../engine/expressions/transformations/expression/Expressions.js";
import type { QuickFix } from "../../../../engine/expressions/transformations/expression/QuickFix.js";
import { IdentTypeExpression, InvalidIdentTypeExpression, NumberTypeExpression, TypeExpression, TypePrimitiveLiteral, UnitLiteralTypeExpression } from "../../../../engine/expressions/transformations/expression/type/TypeExpressions.js";
import type { UnitExpression } from "../../../../engine/expressions/transformations/expression/UnitExpressions.js";
import { TableAndColumnRenames } from "../../../../engine/identifiers/id/TableAndColumnRenames.js";
import { BitSet } from "../../../../engine/java/BitSet.js";
import { javaEnumValues } from "../../../../engine/java/JavaEnum.js";
import { FormatLexer } from "../../../../engine/parsers/generated/FormatLexer.js";
import { DataType } from "../../../../engine/types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../../engine/types/data/datatype/DateTimeInfo.js";
import type { TaggedTypeDefinition } from "../../../../engine/types/data/datatype/TaggedTypeDefinition.js";
import { TypeId } from "../../../../engine/types/data/datatype/TypeId.js";
import type { TypeManager } from "../../../../engine/types/data/datatype/TypeManager.js";
import { UnknownTypeException, type JellyType } from "../../../../engine/types/jellytype/JellyTypes.js";
import { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../../../engine/utility-error/error/UserException.js";
import { CommonStyles } from "../../../../engine/utility-error/styled/CommonStyles.js";
import type { StyledShowable } from "../../../../engine/utility-error/styled/StyledShowable.js";
import { StyledCSS } from "../../../../engine/utility-error/styled/StyledCSS.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";
import { Log } from "../../../../engine/utility/log/Log.js";
import { TranslationUtility } from "../../../../engine/utility/utility/TranslationUtility.js";
import { DescriptiveErrorListener, Utility } from "../../../../engine/utility/utility/Utility.js";
import type { InsertListener } from "../../../lex-editor-completion/gui/lexeditor/completion/InsertListener.js";
import { LexCompletion } from "../../../lex-editor-completion/gui/lexeditor/completion/LexCompletion.js";
import { LexCompletionGroup } from "../../../lex-editor-completion/gui/lexeditor/completion/LexCompletionGroup.js";
import { CodeCompletionContext } from "./CodeCompletionContext.js";
import { EditorLocationAndErrorRecorder } from "./EditorLocationAndErrorRecorder.js";
import { ExpressionToken } from "./ExpressionToken.js";
import { Lexer } from "./Lexer.js";
import { TextQuickFix } from "./TextQuickFix.js";
import type { TopLevelEditor } from "./TopLevelEditor.js";
import { TypeSaver } from "./TypeSaver.js";
import { UnitLexer } from "./UnitLexer.js";

export class TypeLexer extends Lexer<TypeExpression, CodeCompletionContext>
{
    private readonly typeManager: TypeManager;
    // Should we turn to DataType as part of save?
    private readonly requireConcrete: boolean;
    // Is it fine to be empty?  i.e. hide errors when empty
    private readonly emptyAllowed: boolean;

    public constructor(typeManager: TypeManager, requireConcrete: boolean, emptyAllowed: boolean)
    {
        super();
        this.typeManager = typeManager;
        this.requireConcrete = requireConcrete;
        this.emptyAllowed = emptyAllowed;
    }

    public override process(content: string, _curCaretPos: number | null, insertListener: InsertListener): Lexer.LexerResult<TypeExpression, CodeCompletionContext>
    {
        const saver = new TypeSaver(this.typeManager, insertListener);
        let prevWasIdent = false;
        let curIndex: RawInputLocation = 0;
        const chunks: Lexer.ContentChunk[] = [];
        const nestedCompletions: Lexer.AutoCompleteDetails<CodeCompletionContext>[] = [];
        const removedCharacters = new Lexer.RemovedCharacters();
        nextToken: while (curIndex < content.length)
        {
            // Skip any extra spaces at the start of tokens:
            if (content.startsWith(" ", curIndex))
            {
                // Keep single space after ident as it may continue ident:
                if (prevWasIdent)
                {
                    chunks.push(new Lexer.ContentChunk(" ", Lexer.ChunkType.IDENT));
                }
                else
                {
                    removedCharacters.set(curIndex);
                }
                prevWasIdent = false;
                curIndex += 1;
                continue nextToken;
            }
            prevWasIdent = false;

            for (const bracket of TypeLexer.Keyword.values())
            {
                if (content.startsWith(bracket.getContent(), curIndex))
                {
                    saver.saveKeyword(bracket, removedCharacters.map(curIndex, bracket.getContent()));
                    curIndex += TypeLexer.rawLength(bracket.getContent());
                    chunks.push(new Lexer.ContentChunk(bracket.getContent(), bracket.isClosing() ? Lexer.ChunkType.CLOSING : Lexer.ChunkType.OPENING));
                    continue nextToken;
                }
            }
            for (const op of TypeLexer.Operator.values())
            {
                if (content.startsWith(op.getContent(), curIndex))
                {
                    saver.saveOperator(op, removedCharacters.map(curIndex, op.getContent()));
                    curIndex += TypeLexer.rawLength(op.getContent());
                    chunks.push(new Lexer.ContentChunk(op.getContent(), StyledString.s(op.getContent() + " "), Lexer.ChunkType.OPENING));
                    continue nextToken;
                }
            }

            if (content.charAt(curIndex) === "{")
            {
                const end: RawInputLocation = content.indexOf("}", curIndex + 1);
                if (end !== -1)
                {
                    // We don't require concrete as we do that bit so don't want do it twice:
                    const unitLexer = new UnitLexer(this.typeManager, false);
                    const lexerResult: Lexer.LexerResult<UnitExpression, CodeCompletionContext> = unitLexer.process(content.substring(curIndex + 1, end), 0, insertListener);
                    saver.saveOperand(new UnitLiteralTypeExpression(lexerResult.result), removedCharacters.map(curIndex, end + 1));
                    chunks.push(new Lexer.ContentChunk("{", Lexer.ChunkType.NESTED_START));
                    const displayOffset: DisplayLocation = chunks.reduce((sum, c) => sum + c.displayContent.getLength(), 0);
                    const caretPosOffset: CanonicalLocation = removedCharacters.map(curIndex + 1);
                    saver.addNestedLocations(lexerResult.locationRecorder, caretPosOffset);
                    saver.addNestedErrors(lexerResult.errors, caretPosOffset, displayOffset);
                    removedCharacters.orShift(lexerResult.removedChars, curIndex + lexerResult.adjustedContent.length);
                    chunks.push(new Lexer.ContentChunk(lexerResult.adjustedContent, lexerResult.display, Lexer.ChunkType.NESTED));
                    chunks.push(new Lexer.ContentChunk("}", Lexer.ChunkType.NESTED));
                    nestedCompletions.push(...Utility.mapListI(lexerResult.autoCompleteDetails, acd => this.offsetBy(acd, caretPosOffset)));
                    curIndex = end + 1;
                    continue nextToken;
                }
                else
                {
                    saver.locationRecorder.addErrorAndFixes(removedCharacters.map(curIndex, content.substring(curIndex)), StyledString.s("Missing closing }"), []);
                    const unitLexer = new UnitLexer(this.typeManager, false);
                    const lexerResult = unitLexer.process(content.substring(curIndex + 1, content.length), 0, insertListener);
                    saver.addNestedLocations(lexerResult.locationRecorder, removedCharacters.map(curIndex + 1));
                    saver.saveOperand(new UnitLiteralTypeExpression(lexerResult.result), removedCharacters.map(curIndex, content));
                    chunks.push(new Lexer.ContentChunk(content.substring(curIndex), Lexer.ChunkType.NESTED));
                    curIndex = TypeLexer.rawLength(content);
                }
                continue nextToken;
            }

            const parsed = TypeLexer.consumeTypeIdentifier(content, curIndex);
            if (parsed !== null && parsed.getSecond() > curIndex)
            {
                prevWasIdent = true;

                const match = parsed.getFirst().either(dt => dt.toString(), s => s);

                const curIndexFinal: RawInputLocation = curIndex;
                parsed.getFirst().either_(dataType =>
                {
                    saver.saveOperand(dataType.equals(DataType.NUMBER) ? new NumberTypeExpression(null) : new TypePrimitiveLiteral(dataType), removedCharacters.map(curIndexFinal, parsed.getSecond()));

                }, ident =>
                {
                    saver.saveOperand(new IdentTypeExpression(ident), removedCharacters.map(curIndexFinal, parsed.getSecond()));
                });
                curIndex = parsed.getSecond();
                chunks.push(new Lexer.ContentChunk(match, Lexer.ChunkType.IDENT));
                continue nextToken;
            }

            const invalidCharLocation = removedCharacters.map(curIndex, curIndex + 1);
            saver.saveOperand(new InvalidIdentTypeExpression(content.substring(curIndex, curIndex + 1)), invalidCharLocation);
            saver.locationRecorder.addErrorAndFixes(invalidCharLocation, StyledString.concat(TranslationUtility.getStyledString("error.illegalCharacter", Utility.codePointToString(content.charCodeAt(curIndex))), StyledString.s("\n  "), StyledString.s("Character code: \\u" + content.charCodeAt(curIndex).toString(16)).withStyle(new StyledCSS("errorable-sub-explanation"))), [new TextQuickFix("error.illegalCharacter.remove", invalidCharLocation, () => new Pair("", StyledString.s("<remove>")))]);
            chunks.push(new Lexer.ContentChunk("" + content.charAt(curIndex), Lexer.ChunkType.OPENING));

            curIndex += 1;
        }
        const saved = saver.finish(removedCharacters.map(curIndex, curIndex));

        const caretPositions = TypeLexer.calculateCaretPos(chunks);
        let built = StyledString.joining(chunks.map(c => c.displayContent), "");
        if (built.getLength() === 0)
            built = StyledString.s(" ");
        let errors: readonly EditorLocationAndErrorRecorder.ErrorDetails[] = saver.getErrors();
        built = TypeLexer.padZeroWidthErrors(built, caretPositions.getFirst(), errors);

        if (errors.length === 0 && this.requireConcrete)
        {
            // Java: a local class LocalJellyRecorder, with an IdentityHashMap
            const jellyTypeLocations = new Map<JellyType, CanonicalSpan>();
            const jellyRecorder: TypeExpression.JellyRecorder & { locationFor(jellyType: JellyType): CanonicalSpan } = {
                record(jellyType: JellyType, source: TypeExpression): JellyType
                {
                    jellyTypeLocations.set(jellyType, saver.locationRecorder.recorderFor(source));
                    return jellyType;
                },

                locationFor(jellyType: JellyType): CanonicalSpan
                {
                    return jellyTypeLocations.get(jellyType)!;
                },
            };

            try
            {
                // If toJellyType throws, there will usually have been an error
                // in the lexing stage, except for errors such as
                // units in the wrong place.
                saved.toJellyType(this.typeManager, jellyRecorder).makeDataType(new Map(), this.typeManager);
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                if (e instanceof InternalException)
                    Log.log(e);
                let location: CanonicalSpan;
                let fixes: readonly TextQuickFix[];
                if (e instanceof TypeExpression.UnJellyableTypeExpression)
                {
                    const unjelly = e;
                    location = unjelly.getSource().either(u => saver.locationRecorder.recorderFor(u), t => saver.locationRecorder.recorderFor(t));
                    fixes = Utility.mapListI(unjelly.getFixes(), fixed => new TextQuickFix(saver.locationRecorder.recorderFor(fixed.getReplacementTarget()), ((u: StyledShowable) => u.toStyledString().toPlain()) as (e: never) => string, fixed as unknown as QuickFix<StyledShowable>));
                }
                else
                {
                    if (e instanceof UnknownTypeException)
                    {
                        const ute = e;
                        const loc = jellyRecorder.locationFor(ute.getReplacementTarget());
                        location = loc;
                        fixes = Utility.mapListI(ute.getSuggestedFixes(), fixed => new TextQuickFix(StyledString.s("Correct"), [], loc, () =>
                        {
                            try
                            {
                                const fixedExpression = TypeExpression.fromJellyType(fixed, this.typeManager);
                                const str = fixedExpression.save(Expression.SaveDestination.TO_EDITOR_FULL_NAME, new TableAndColumnRenames(new Map()));
                                return new Pair(str, fixedExpression.toStyledString());
                            }
                            catch (ex)
                            {
                                if (!(ex instanceof UserException))
                                    throw ex;
                                // We shouldn't have suggested something which can't be loaded!
                                throw new InternalException("Invalid suggested fix: " + String(fixed), ex);
                            }
                        }));
                    }
                    else
                    {
                        fixes = [];
                        location = new CanonicalSpan(0, removedCharacters.map(curIndex));
                    }
                }
                errors = Utility.appendToList(errors, new EditorLocationAndErrorRecorder.ErrorDetails(location, e.getStyledMessage(), fixes));
            }
        }

        if (saved.isEmpty() && this.emptyAllowed)
            errors = [];

        return new Lexer.LexerResult<TypeExpression, CodeCompletionContext>(saved, chunks.map(c => c.internalContent).join(""), removedCharacters, false, [...caretPositions.getFirst()], [...caretPositions.getSecond()], built, errors, saver.locationRecorder, Utility.concatI(TypeLexer.makeCompletions(chunks, (s, i, c, p) => this.makeCompletionsFor(s, i, c, p)), nestedCompletions), new BitSet(), !saver.hasUnmatchedBrackets(), (_i, _n) => new Map<TopLevelEditor.DisplayType, Pair<StyledString, readonly TextQuickFix[]>>());
    }

    // Java: makeCompletions(String stem, int canonIndex, ChunkType curType, ChunkType preceding), private
    private makeCompletionsFor(stem: string, canonIndex: CanonicalLocation, curType: Lexer.ChunkType, _preceding: Lexer.ChunkType): CodeCompletionContext
    {
        return new CodeCompletionContext(curType !== Lexer.ChunkType.IDENT ? [] : [new LexCompletionGroup(
            [
                ...TypeLexer.streamConcreteDataTypes().map(t =>
                {
                    const len = Utility.longestCommonStartIgnoringCase(t.toString(), 0, stem, 0);
                    return this.typeCompletionConcrete(t, canonIndex, len);
                }),
                this.typeCompletionConcrete(DataType.NUMBER, canonIndex, Utility.longestCommonStartIgnoringCase("Number{}", 0, stem, 0)).withReplacement("Number{}", StyledString.concat(StyledString.s("Number{"), StyledString.styled("unit", CommonStyles.ITALIC), StyledString.s("}"))).withCaretPosAfterCompletion("Number{".length),
                ...[...this.typeManager.getKnownTaggedTypes().values()].filter(ttd => ttd.getTags().length !== 0 && !ttd.getTaggedTypeName().equals(new TypeId("Type")) && !ttd.getTaggedTypeName().equals(new TypeId("Unit"))).map(ttd =>
                {
                    const len = Utility.longestCommonStartIgnoringCase(ttd.getTaggedTypeName().getRaw(), 0, stem, 0);
                    return this.typeCompletionTagged(ttd, canonIndex, len).withCaretPosAfterCompletion(ttd.getTaggedTypeName().getRaw().length + (ttd.getTypeArguments().length === 0 ? 0 : 1));
                }),
            ]
        , null, 2)]);
    }

    protected typeCompletionConcrete(dataType: DataType, start: CanonicalLocation, lengthToShowFor: number): LexCompletion
    {
        return new LexCompletion(start, lengthToShowFor, dataType.toString()).withFurtherDetailsURL("type-" + dataType.toString() + ".html");
    }

    protected typeCompletionTagged(taggedTypeDefinition: TaggedTypeDefinition, start: CanonicalLocation, lengthToShowFor: number): LexCompletion
    {
        return new LexCompletion(start, lengthToShowFor, taggedTypeDefinition.getTaggedTypeName().getRaw() + Utility.replicate(taggedTypeDefinition.getTypeArguments().length, "()").join(""));
    }

    private static streamConcreteDataTypes(): DataType[]
    {
        return [DataType.NUMBER, DataType.TEXT, DataType.BOOLEAN, ...javaEnumValues(DateTimeInfo.DateTimeType).map(t => DataType.date(new DateTimeInfo(t)))];
    }

    private offsetBy(acd: Lexer.AutoCompleteDetails<CodeCompletionContext>, caretPosOffset: CanonicalLocation): Lexer.AutoCompleteDetails<CodeCompletionContext>
    {
        return new Lexer.AutoCompleteDetails(acd.location.offsetBy(caretPosOffset), new CodeCompletionContext(acd.codeCompletionContext, caretPosOffset));
    }

    /**
     * PORT-NOTE: Java adds the error listener to the lexer's default one, which only prints to the
     * console; here the default one is removed.
     */
    public static consumeTypeIdentifier(content: string, startFrom: number): Pair<Either<DataType, ExpressionIdentifier>, RawInputLocation> | null
    {
        const inputStream = CharStream.fromString(content.substring(startFrom));
        const lexer = new FormatLexer(inputStream);
        const errorListener = new DescriptiveErrorListener();
        lexer.removeErrorListeners();
        lexer.addErrorListener(errorListener);
        const token = lexer.nextToken();
        if (errorListener.errors.length !== 0)
            return null;
        let r: Either<DataType, ExpressionIdentifier>;
        switch (token.type)
        {
            case FormatLexer.BOOLEAN:
                r = Either.left(DataType.BOOLEAN);
                break;
            case FormatLexer.DATETIME:
                r = Either.left(DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIME)));
                break;
            case FormatLexer.DATETIMEZONED:
                r = Either.left(DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.DATETIMEZONED)));
                break;
            case FormatLexer.NUMBER:
                r = Either.left(DataType.NUMBER);
                break;
            case FormatLexer.TEXT:
                r = Either.left(DataType.TEXT);
                break;
            case FormatLexer.TIMEOFDAY:
                r = Either.left(DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.TIMEOFDAY)));
                break;
            case FormatLexer.YEARMONTH:
                r = Either.left(DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTH)));
                break;
            case FormatLexer.YEARMONTHDAY:
                r = Either.left(DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY)));
                break;
            case FormatLexer.UNQUOTED_NAME:
                r = Either.right(token.text!);
                break;
            default:
                return null;
        }
        return new Pair(r, startFrom + token.stop + 1);
    }
}

export namespace TypeLexer
{
    // Java: an enum implementing ExpressionToken
    export class Keyword implements ExpressionToken
    {
        public static readonly OPEN_ROUND = new Keyword("OPEN_ROUND", "(");
        public static readonly CLOSE_ROUND = new Keyword("CLOSE_ROUND", ")");
        public static readonly OPEN_SQUARE = new Keyword("OPEN_SQUARE", "[");
        public static readonly CLOSE_SQUARE = new Keyword("CLOSE_SQUARE", "]");

        private constructor(private readonly enumName: string, private readonly keyword: string)
        {
        }

        public static values(): readonly Keyword[]
        {
            return [Keyword.OPEN_ROUND, Keyword.CLOSE_ROUND, Keyword.OPEN_SQUARE, Keyword.CLOSE_SQUARE];
        }

        public getContent(): string
        {
            return this.keyword;
        }

        public toStyledString(): StyledString
        {
            return ExpressionToken.defaultStyledString(this);
        }

        public isClosing(): boolean
        {
            return this === Keyword.CLOSE_ROUND || this === Keyword.CLOSE_SQUARE;
        }

        public toString(): string
        {
            return this.enumName;
        }
    }

    // Java: an enum implementing ExpressionToken
    export class Operator implements ExpressionToken
    {
        public static readonly COMMA = new Operator("COMMA", ",");
        public static readonly COLON = new Operator("COLON", ":");

        private constructor(private readonly enumName: string, private readonly op: string)
        {
        }

        public static values(): readonly Operator[]
        {
            return [Operator.COMMA, Operator.COLON];
        }

        public getContent(): string
        {
            return this.op;
        }

        public toStyledString(): StyledString
        {
            return ExpressionToken.defaultStyledString(this);
        }

        public toString(): string
        {
            return this.enumName;
        }
    }
}
