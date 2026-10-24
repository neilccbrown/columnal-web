// Port of xyz.columnal.gui.lexeditor.ExpressionLexer (lex-editor module).
import type { CanonicalLocation, DisplayLocation, RawInputLocation } from "../../../../engine/anns/Annotations.js";
import { BooleanLiteral, DefineExpression, Expression, IdentExpression, IfThenElseExpression, InvalidIdentExpression, MatchAnythingExpression, MatchExpression, NumericLiteral, StringLiteral, TemporalLiteral, TypeLiteralExpression, UnitLiteralExpression } from "../../../../engine/expressions/transformations/expression/Expressions.js";
import type { FunctionLookup } from "../../../../engine/expressions/transformations/expression/function/FunctionLookup.js";
import type { StandardFunctionDefinition } from "../../../../engine/expressions/transformations/expression/function/StandardFunctionDefinition.js";
import type { TypeExpression } from "../../../../engine/expressions/transformations/expression/type/TypeExpressions.js";
import { TypeState } from "../../../../engine/expressions/transformations/expression/TypeState.js";
import type { UnitExpression } from "../../../../engine/expressions/transformations/expression/UnitExpressions.js";
import { ExpressionVisitorStream } from "../../../../engine/expressions/transformations/expression/visitor/ExpressionVisitorStream.js";
import type { ColumnId } from "../../../../engine/identifiers/id/ColumnId.js";
import type { TableId } from "../../../../engine/identifiers/id/TableId.js";
import { BitSet } from "../../../../engine/java/BitSet.js";
import type { ReadonlyMapLike } from "../../../../engine/java/HashMap.js";
import type { ObjectExpression } from "../../../../engine/java/JavaFXBeans.js";
import { javaCompare } from "../../../../engine/java/JavaObject.js";
import { javaCompareToIgnoreCase } from "../../../../engine/java/JavaString.js";
import { TreeMap } from "../../../../engine/java/TreeMap.js";
import { ExpressionLexer as GrammarExpressionLexer } from "../../../../engine/parsers/generated/ExpressionLexer.js";
import { GrammarUtility } from "../../../../engine/parsers/grammar/GrammarUtility.js";
import { vocabularyOf } from "../../../../engine/parsers/grammar/Vocabularies.js";
import type { DataType } from "../../../../engine/types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../../engine/types/data/datatype/DateTimeInfo.js";
import type { TaggedTypeDefinition } from "../../../../engine/types/data/datatype/TaggedTypeDefinition.js";
import { TypeId } from "../../../../engine/types/data/datatype/TypeId.js";
import type { TypeManager } from "../../../../engine/types/data/datatype/TypeManager.js";
import { TypeExp } from "../../../../engine/types/typeExp/TypeExps.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../../../engine/utility-error/error/UserException.js";
import { StyledCSS } from "../../../../engine/utility-error/styled/StyledCSS.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";
import { Log } from "../../../../engine/utility/log/Log.js";
import { IdentifierUtility } from "../../../../engine/utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../../../engine/utility/utility/TranslationUtility.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { InsertListener } from "../../../lex-editor-completion/gui/lexeditor/completion/InsertListener.js";
import { LexAutoComplete } from "../../../lex-editor-completion/gui/lexeditor/completion/LexAutoComplete.js";
import { LexCompletion } from "../../../lex-editor-completion/gui/lexeditor/completion/LexCompletion.js";
import { LexCompletionGroup } from "../../../lex-editor-completion/gui/lexeditor/completion/LexCompletionGroup.js";
import type { CodeCompletionContext } from "./CodeCompletionContext.js";
import type { EditorLocationAndErrorRecorder } from "./EditorLocationAndErrorRecorder.js";
import { ExpressionCompletionContext } from "./ExpressionCompletionContext.js";
import { ExpressionSaver } from "./ExpressionSaver.js";
import { ExpressionToken } from "./ExpressionToken.js";
import { Lexer } from "./Lexer.js";
import { TextQuickFix } from "./TextQuickFix.js";
import { TypeLexer } from "./TypeLexer.js";
import { UnitLexer } from "./UnitLexer.js";

import LexSelectionBehaviour = LexAutoComplete.LexSelectionBehaviour;
import CaretPos = Lexer.LexerResult.CaretPos;
import ChunkType = Lexer.ChunkType;
import ContentChunk = Lexer.ContentChunk;

export class ExpressionLexer extends Lexer<Expression, ExpressionCompletionContext>
{
    /**
     * PORT-NOTE: Java calls FXUtility.getStylesheet (in the GUI) for the stylesheet URLs in the
     * column and table documentation; the GUI sets this to do the same.
     */
    public static getStylesheet: (stylesheetName: string) => string = stylesheetName => stylesheetName;

    private static getAllFunctions(functionLookup: FunctionLookup): readonly StandardFunctionDefinition[]
    {
        try
        {
            return functionLookup.getAllFunctions();
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
            return [];
        }
    }

    private readonly columnLookup: ObjectExpression<Expression.ColumnLookup>;
    private readonly typeManager: TypeManager;
    private readonly functionLookup: FunctionLookup;
    private readonly allFunctions: readonly StandardFunctionDefinition[];
    private readonly makeTypeState: () => TypeState;
    private readonly expectedType: DataType | null;

    public constructor(columnLookup: ObjectExpression<Expression.ColumnLookup>, typeManager: TypeManager, functionLookup: FunctionLookup, makeTypeState: () => TypeState, expectedType: DataType | null)
    {
        super();
        this.columnLookup = columnLookup;
        this.typeManager = typeManager;
        this.functionLookup = functionLookup;
        // Get functions once rather than every time we need them:
        this.allFunctions = ExpressionLexer.getAllFunctions(functionLookup);
        this.makeTypeState = makeTypeState;
        this.expectedType = expectedType;
    }

    public override process(content: string, curCaretPos: RawInputLocation | null, insertListener: InsertListener): Lexer.LexerResult<Expression, ExpressionCompletionContext>
    {
        const Keyword = ExpressionLexer.Keyword;
        const Op = ExpressionLexer.Op;
        const saver = new ExpressionSaver(this.typeManager, this.functionLookup, insertListener);
        let curIndex: RawInputLocation = 0;
        // Index is in original parameter "content":
        const removedChars = new Lexer.RemovedCharacters();
        const suppressBracketMatching = new BitSet();
        const chunks: ContentChunk[] = [];
        const nestedCompletions: Lexer.AutoCompleteDetails<ExpressionCompletionContext>[] = [];
        let prevWasIdent = false;
        let preserveNextSpace = false;
        let lexOnMove = false;
        nextToken: while (curIndex < content.length)
        {
            // Skip any extra spaces at the start of tokens:
            if (content.startsWith(" ", curIndex))
            {
                // Keep single space after ident as it may continue ident:
                const spaceThenCaret = prevWasIdent && curCaretPos !== null && curIndex + 1 === curCaretPos;
                if (spaceThenCaret || preserveNextSpace)
                {
                    chunks.push(new ContentChunk(" ", ChunkType.IDENT));
                    lexOnMove = spaceThenCaret;
                }
                else
                {
                    removedChars.set(curIndex);
                }
                prevWasIdent = false;
                preserveNextSpace = false;
                curIndex += 1;
                continue nextToken;
            }
            prevWasIdent = false;
            preserveNextSpace = false;

            for (const keyword of Keyword.values())
            {
                if (content.startsWith(keyword.getContent(), curIndex))
                {
                    saver.saveKeyword(keyword, removedChars.map(curIndex, keyword.getContent()));
                    if (keyword.getContent().startsWith("@"))
                    {
                        const addLeadingSpace = chunks.reduce((sum, c) => sum + c.internalContent.length, 0) > 0;
                        chunks.push(new ContentChunk(addLeadingSpace, keyword, keyword.isClosing() ? ChunkType.CLOSING : ChunkType.OPENING, true));
                    }
                    else
                        chunks.push(new ContentChunk(keyword.getContent(), keyword.isClosing() ? ChunkType.CLOSING : ChunkType.OPENING));
                    curIndex += ExpressionLexer.rawLength(keyword.getContent());
                    continue nextToken;
                }
            }
            // Need to go through longest first:
            for (const op of [...Op.values()].sort((a, b) => b.getContent().length - a.getContent().length))
            {
                if (content.startsWith(op.getContent(), curIndex))
                {
                    saver.saveOperator(op, removedChars.map(curIndex, op.getContent()));
                    const addLeadingSpace = op.getContent() !== ",";
                    chunks.push(new ContentChunk(addLeadingSpace, op, ChunkType.OPENING, true));
                    curIndex += ExpressionLexer.rawLength(op.getContent());
                    continue nextToken;
                }
            }

            if (content.startsWith("\"", curIndex))
            {
                // Consume string until next quote:
                const endQuote: RawInputLocation = content.indexOf("\"", curIndex + 1);
                if (endQuote !== -1)
                {
                    saver.saveOperand(new StringLiteral(content.substring(curIndex + 1, endQuote)), removedChars.map(curIndex, endQuote + 1));
                    const stringLit = content.substring(curIndex, endQuote + 1);
                    const caretPositions: CaretPos[] = [];
                    for (let i = 0; i < stringLit.length + 1; i++)
                        caretPositions.push(new CaretPos(i, i));
                    const wordCaretPos: CanonicalLocation[] = [...new Set<number>([0, 1, stringLit.length - 1, stringLit.length])];
                    chunks.push(new ContentChunk(stringLit, StyledString.s(stringLit).withStyle(new StyledCSS("expression-string-literal")), caretPositions, wordCaretPos, ChunkType.CLOSING));
                    suppressBracketMatching.set(curIndex + 1, endQuote);
                    curIndex = endQuote + 1;
                    continue nextToken;
                }
                else
                {
                    // Unterminated string:
                    saver.locationRecorder.addErrorAndFixes(removedChars.map(curIndex, content), StyledString.s("Missing closing quote around text"), []);
                    saver.saveOperand(new StringLiteral(GrammarUtility.processEscapes(content.substring(curIndex + 1, content.length), false)), removedChars.map(curIndex, content));
                    chunks.push(new ContentChunk(content.substring(curIndex), ChunkType.NESTED_START));
                    suppressBracketMatching.set(curIndex + 1, content.length + 1);
                    curIndex = ExpressionLexer.rawLength(content);
                    continue nextToken;
                }
            }

            if (content.charAt(curIndex) >= "0" && content.charAt(curIndex) <= "9")
            {
                const numberStart: RawInputLocation = curIndex;
                // Before dot:
                do
                {
                    curIndex += 1;
                }
                while (curIndex < content.length && content.charAt(curIndex) >= "0" && content.charAt(curIndex) <= "9");

                if (curIndex < content.length && content.charAt(curIndex) === ".")
                {
                    do
                    {
                        curIndex += 1;
                    }
                    while (curIndex < content.length && content.charAt(curIndex) >= "0" && content.charAt(curIndex) <= "9");
                }
                const number = Utility.parseNumberOpt(content.substring(numberStart, curIndex));
                if (number !== null)
                {
                    saver.saveOperand(new NumericLiteral(number, null), removedChars.map(numberStart, curIndex));
                    chunks.push(new ContentChunk(content.substring(numberStart, curIndex), ChunkType.IDENT));
                    continue nextToken;
                }
            }

            for (const nestedLiteral of this.getNestedLiterals(saver.lastWasNumber(), insertListener))
            {
                const nestedOutcome = this.tryNestedLiteral(nestedLiteral.getFirst(), content, curIndex, removedChars, saver.locationRecorder);
                if (nestedOutcome !== null)
                {
                    const outcome = nestedLiteral.getSecond()(nestedOutcome);
                    saver.saveOperand(outcome.expression, removedChars.map(curIndex, nestedOutcome.positionAfter));
                    const displayOffset: DisplayLocation = nestedLiteral.getFirst().length + chunks.reduce((sum, c) => sum + c.displayContent.getLength(), 0);
                    const caretPosOffset: CanonicalLocation = removedChars.map(curIndex + ExpressionLexer.rawLength(nestedLiteral.getFirst()));
                    if (outcome.locationRecorder !== null)
                        saver.addNestedLocations(outcome.locationRecorder, caretPosOffset);
                    saver.addNestedErrors(outcome.nestedErrors, caretPosOffset, displayOffset);
                    chunks.push(outcome.chunk);
                    nestedCompletions.push(...outcome.completions.map(acd => this.offsetBy(acd, caretPosOffset)));
                    removedChars.orShift(outcome.removedChars, curIndex + nestedLiteral.getFirst().length);
                    curIndex = nestedOutcome.positionAfter;
                    continue nextToken;
                }
            }

            if (content.startsWith("_", curIndex))
            {
                saver.saveOperand(new MatchAnythingExpression(), removedChars.map(curIndex, curIndex + 1));
                chunks.push(new ContentChunk("_", ChunkType.IDENT));
                curIndex += 1;
                continue nextToken;
            }

            const parsed = IdentifierUtility.consumePossiblyScopedExpressionIdentifier(content, curIndex, curCaretPos !== null ? curCaretPos : -1);
            if (parsed !== null && parsed.positionAfter > curIndex)
            {
                prevWasIdent = true;
                removedChars.setAll(parsed);
                const location = removedChars.map(curIndex, ((parsed.positionAfter < content.length && content.charAt(parsed.positionAfter) === " ") ? parsed.positionAfter + 1 : parsed.positionAfter));
                saver.saveOperand(IdentExpression.load(parsed.item.getFirst(), parsed.item.getSecond()), location);
                chunks.push(new ContentChunk((parsed.item.getFirst() === null ? "" : parsed.item.getFirst() + "\\\\") + parsed.item.getSecond().join("\\"), ChunkType.IDENT));
                curIndex = parsed.positionAfter;
                continue nextToken;
            }

            if (content.startsWith("@", curIndex))
            {
                let nonLetter: RawInputLocation = ExpressionLexer.indexOfNonLetter(content, curIndex + 1);
                if (nonLetter === -1)
                    nonLetter = ExpressionLexer.rawLength(content);

                // We skip to next non-letter to prevent trying to complete the keyword as a function:
                const attemptedKeyword = content.substring(curIndex, nonLetter);
                saver.saveOperand(new InvalidIdentExpression(attemptedKeyword), removedChars.map(curIndex, nonLetter));
                saver.locationRecorder.addErrorAndFixes(removedChars.map(curIndex, nonLetter), StyledString.s("Unknown keyword: " + attemptedKeyword), []);
                chunks.push(new ContentChunk(attemptedKeyword, ChunkType.OPENING));
                curIndex = nonLetter;
                preserveNextSpace = true;
                continue nextToken;
            }

            const nextTrue = content.startsWith("true", curIndex);
            const nextFalse = content.startsWith("false", curIndex);
            if (nextTrue || nextFalse)
            {
                saver.saveOperand(new BooleanLiteral(nextTrue), removedChars.map(curIndex, nextTrue ? "true" : "false"));
                chunks.push(new ContentChunk(nextTrue ? "true" : "false", ChunkType.IDENT));
                curIndex += ExpressionLexer.rawLength(nextTrue ? "true" : "false");
                continue nextToken;
            }

            const invalidCharLocation = removedChars.map(curIndex, curIndex + 1);
            saver.saveOperand(new InvalidIdentExpression(content.substring(curIndex, curIndex + 1)), invalidCharLocation);
            saver.locationRecorder.addErrorAndFixes(invalidCharLocation, StyledString.concat(TranslationUtility.getStyledString("error.illegalCharacter", Utility.codePointToString(content.charCodeAt(curIndex))), StyledString.s("\n  "), StyledString.s("Character code: \\u" + content.charCodeAt(curIndex).toString(16)).withStyle(new StyledCSS("errorable-sub-explanation"))), [new TextQuickFix("error.illegalCharacter.remove", invalidCharLocation, () => new Pair("", StyledString.s("<remove>")))]);
            chunks.push(new ContentChunk(content.substring(curIndex, curIndex + 1), ChunkType.IDENT));
            curIndex += 1;
        }
        const saved = saver.finish(removedChars.map(curIndex, curIndex));
        try
        {
            const typeExp = saved.checkExpression(this.columnLookup.get(), this.makeTypeState(), saver.locationRecorder.getRecorder());

            if (typeExp !== null)
            {
                // Must be concrete:
                if (this.expectedType !== null)
                    TypeExp.unifyTypes(typeExp, TypeExp.fromDataType(null, this.expectedType)).ifLeft(err => saver.locationRecorder.addErrorAndFixes(saver.recorderFor(saved), err.getMessage(), []));
                saver.locationRecorder.getRecorder().recordLeftError(this.typeManager, this.functionLookup, saved, typeExp.toConcreteType(this.typeManager, false));
            }
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            if (e instanceof InternalException)
                Log.log(e);
            saver.locationRecorder.addErrorAndFixes(removedChars.map(0, curIndex), e.getStyledMessage(), []);
        }

        if (chunks.length === 0)
        {
            chunks.push(new ContentChunk("", ChunkType.IDENT));
        }

        const internalContent = chunks.map(c => c.internalContent).join("");
        let display = StyledString.joining(chunks.map(c => c.displayContent).filter(d => d.getLength() > 0), "");
        const caretPos = ExpressionLexer.calculateCaretPos(chunks);

        const errors = saver.getErrors();
        try
        {
            display = this.addIndents(display, caretPos.getFirst(), saved, saver.locationRecorder);
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            // Just abandon adding the indents, user will live without
            Log.log(e);
        }
        display = Lexer.padZeroWidthErrors(display, caretPos.getFirst(), errors);


        return new Lexer.LexerResult<Expression, ExpressionCompletionContext>(saved, internalContent, removedChars, lexOnMove, [...caretPos.getFirst()], [...caretPos.getSecond()], display, errors, saver.locationRecorder, Utility.concatI(Lexer.makeCompletions<ExpressionCompletionContext>(chunks, (chunk, canonIndex, curChunk, precedingChunk) => this.makeCompletionsFor(chunk, canonIndex, curChunk, precedingChunk, insertListener)), nestedCompletions), suppressBracketMatching, !saver.hasUnmatchedBrackets(), (i, toRightOf) => saver.getDisplayFor(i, toRightOf));
    }

    // Java: CharMatcher.inRange('a', 'z').or(CharMatcher.inRange('A', 'Z')).negate().indexIn(content, start)
    private static indexOfNonLetter(content: string, start: number): number
    {
        for (let i = start; i < content.length; i++)
        {
            const c = content.charAt(i);
            if (!((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")))
                return i;
        }
        return -1;
    }

    private addIndents(display: StyledString, caretPos: CaretPos[], expression: Expression, locations: EditorLocationAndErrorRecorder): StyledString
    {
        const addedSpaces = [...expression.visit(new AddedSpaceCalculator(locations))].sort((a, b) => a.addedAtInternalPos - b.addedAtInternalPos);

        for (const addedSpace of addedSpaces)
        {
            display = this.addDisplayAfter(display, caretPos, addedSpace.addedAtInternalPos, StyledString.s(addedSpace.added).withStyle(new StyledCSS("expression-indent")));
        }

        return display;
    }

    private addDisplayAfter(display: StyledString, caretPos: CaretPos[], after: CanonicalLocation, displayContentToAdd: StyledString): StyledString
    {
        // We find the caret pos at the end of the span:
        const posAfter = caretPos.find(p => p.positionInternal === after) ?? null;
        if (posAfter === null)
            throw new InternalException("Could not find caret pos: " + after);
        const removingExistingSpace = display.toPlain().startsWith(" ", posAfter.positionDisplay);
        const displayBefore = display.substring(0, posAfter.positionDisplay);
        const displayAfter = display.substring(posAfter.positionDisplay + (removingExistingSpace ? 1 : 0), display.getLength());

        for (let i = 0; i < caretPos.length; i++)
        {
            const p = caretPos[i]!;
            if (p.positionInternal > posAfter.positionInternal)
            {
                // Don't change internal position, only display position:
                const adjusted = new CaretPos(p.positionInternal, p.positionDisplay + displayContentToAdd.toPlain().length - (removingExistingSpace ? 1 : 0));
                caretPos[i] = adjusted;
            }
        }

        return StyledString.concat(displayBefore, displayContentToAdd, displayAfter);
    }

    private offsetBy(acd: Lexer.AutoCompleteDetails<CodeCompletionContext>, caretPosOffset: CanonicalLocation): Lexer.AutoCompleteDetails<ExpressionCompletionContext>
    {
        return new Lexer.AutoCompleteDetails(acd.location.offsetBy(caretPosOffset), new ExpressionCompletionContext(acd.codeCompletionContext, caretPosOffset));
    }

    // Java: makeCompletions(String stem, int canonIndex, ChunkType curChunk, ChunkType precedingChunk, InsertListener), private
    private makeCompletionsFor(stem: string, canonIndex: CanonicalLocation, curChunk: ChunkType, precedingChunk: ChunkType, insertListener: InsertListener): ExpressionCompletionContext
    {
        const completions: Pair<CompletionStatus, ExpressionCompletion>[] = [];

        // Add completions even if one is already spotted:
        this.addFunctionCompletions(completions, stem, canonIndex);
        this.addColumnAndTableCompletions(completions, stem, canonIndex);
        this.addTagCompletions(completions, stem, canonIndex);
        this.addVariableCompletions(completions, stem, canonIndex);
        this.addNestedLiteralCompletions(completions, stem, canonIndex, insertListener);

        this.addKeywordCompletions(completions, stem, canonIndex);

        const directAndRelated = precedingChunk === ChunkType.IDENT ? Utility.mapListI(completions, c => this.excludeFirstPos(c)) : completions;
        const guides: LexCompletion[] = [];
        ExpressionLexer.matchWordStart(stem, canonIndex, "conversion", null, WordPosition.FIRST_WORD_NON_EMPTY).forEach(v =>
        {
            guides.push(this.guideCompletion("Conversion", "conversion", v.startPos, v.lastShowPosIncl).withSideText("≈ conversion"));
        });
        ExpressionLexer.matchWordStart(stem, canonIndex, "units", null, WordPosition.FIRST_WORD_NON_EMPTY).forEach(v =>
        {
            guides.push(this.guideCompletion("Units", "units", v.startPos, v.lastShowPosIncl).withSideText("≈ units"));
        });
        ExpressionLexer.matchWordStart(stem, canonIndex, "optional", null, WordPosition.FIRST_WORD_NON_EMPTY).forEach(v =>
        {
            guides.push(this.guideCompletion("Optional Type", "optional", v.startPos, v.lastShowPosIncl).withSideText("≈ optional"));
        });

        // Only add expression guide at positions where there are already completions:
        if (directAndRelated.length !== 0)
        {
            const start: CanonicalLocation = Math.min(...directAndRelated.map(p => p.getSecond().completion.startPos));
            const end: CanonicalLocation = Math.max(...directAndRelated.map(p => p.getSecond().completion.lastShowPosIncl));

            if (guides.length === 0)
            {
                guides.push(this.guideCompletion("Expressions", "expressions", start, end));
                guides.push(this.guideCompletion("Conversion", "conversion", start, end));
                guides.push(this.guideCompletion("Units", "units", start, end));
                guides.push(this.guideCompletion("Optional Type", "optional", start, end));
            }
        }

        const operators = this.getOperatorCompletions(canonIndex, stem, curChunk, precedingChunk);

        return new ExpressionCompletionContext(ExpressionLexer.sortGroups(directAndRelated, operators, [...guides]));
    }

    private excludeFirstPos(original: Pair<CompletionStatus, ExpressionCompletion>): Pair<CompletionStatus, ExpressionCompletion>
    {
        return original.mapSecond(c => new ExpressionCompletion(c.completion.copyNoShowAtFirstPos(), c.completionType));
    }

    private getOperatorCompletions(canonIndex: CanonicalLocation, stem: string, curChunk: ChunkType, precedingChunkType: ChunkType): readonly LexCompletion[]
    {
        // We need to get the operator completions.  Consider an expression like:
        // ab<cd
        // There are three chunks there: "ab", "<", "cd", and 6 positions (0-5 inclusive)
        // In terms of operator completions, we want to see all operators at 5 because the user may want
        // to add any operator after the ident.  Ditto for 4 because they may want an operator between c and d
        // But at position 3 we only want to show those which can complete the "<" operator (so "<", "<=", "<>")
        // and not the rest.  At 1 and 2 we show all, but at 0 we show none because it makes no sense to have an operator at the very beginning.
        // So, the rules are:
        //  - In a non-operator chunk we show operators in the first position if not preceded by an operator, and always in all later positions
        //  - In an operator chunk (only the first and last position will be caret-visitable anyway) we show further operators in the last position

        const showOpsAtStart = precedingChunkType === ChunkType.CLOSING || precedingChunkType === ChunkType.NESTED;
        const anyIsOp = ExpressionLexer.Op.values().some(op => this.getOpCommon(stem, op) > 0);
        const furtherDetailsURL = (op: ExpressionLexer.Op): string => "operator-" + Array.from(op.getContent(), ch => ch.codePointAt(0)!.toString()).join("-") + ".html";
        return ExpressionLexer.Op.values().flatMap(op =>
        {
            const common = this.getOpCommon(stem, op);
            //Log.debug("Showing " + op.getContent() + " at " + canonIndex + "+" + common + " stem: {" + stem + "} " + " prev: " + precedingChunkType);
            if (anyIsOp)
            {
                return [new class extends LexCompletion
                {
                    public override showFor(caretPos: CanonicalLocation): boolean
                    {
                        if (caretPos === canonIndex)
                            return showOpsAtStart;
                        else
                            return super.showFor(caretPos);
                    }
                }(canonIndex, common, op.getContent()).withSideText(TranslationUtility.getString(op.localNameKey))
                    .withFurtherDetailsURL(furtherDetailsURL(op))];
            }
            else
            {
                const maxLength = curChunk === ChunkType.IDENT ? stem.length : 0;
                const r: LexCompletion[] = [];
                for (let offset = 0; offset < maxLength + 1; offset++)
                {
                    const offsetFinal = offset;
                    r.push(new class extends LexCompletion
                    {
                        public override showFor(caretPos: CanonicalLocation): boolean
                        {
                            if (caretPos === canonIndex && offsetFinal === 0)
                                return showOpsAtStart;
                            else
                                return super.showFor(caretPos);
                        }
                    }(canonIndex + offset, 0, op.getContent()).withSideText(TranslationUtility.getString(op.localNameKey))
                        .withFurtherDetailsURL(furtherDetailsURL(op)));
                }
                return r;
            }
        });
    }

    private getOpCommon(stem: string, op: ExpressionLexer.Op): number
    {
        return Math.max(
            Utility.longestCommonStart(stem, 0, op.getContent(), 0),
            Utility.longestCommonStart(stem, 0, op.getASCIIContent(), 0));
    }

    private guideCompletion(name: string, guideFileName: string, start: CanonicalLocation, end: CanonicalLocation): LexCompletion
    {
        return new LexCompletion(start, end, StyledString.s(name), "guide-" + guideFileName + ".html");
    }

    private addKeywordCompletions(completions: Pair<CompletionStatus, ExpressionCompletion>[], stem: string, canonIndex: CanonicalLocation): void
    {
        if (Utility.startsWithIgnoreCase("@i", stem) || Utility.startsWithIgnoreCase("if", stem))
        {
            completions.push(new Pair(CompletionStatus.DIRECT, new ExpressionCompletion(new LexCompletion(canonIndex, stem.length, "@if@then@else@endif").withDisplay(StyledString.s("@if … @then … @else … @endif")).withFurtherDetailsURL("syntax-if.html").withCaretPosAfterCompletion(3).withSelectionBehaviour(LexSelectionBehaviour.SELECT_IF_TOP), CompletionType.KEYWORD_CHAIN)));
        }

        if (Utility.startsWithIgnoreCase("@matc", stem))
        {
            completions.push(new Pair(CompletionStatus.DIRECT, new ExpressionCompletion(new LexCompletion(canonIndex, stem.length, "@match@case@then@case@then@endmatch").withDisplay(StyledString.s("@match … @case … @then … @case … @then … @endmatch")).withFurtherDetailsURL("syntax-match.html").withCaretPosAfterCompletion(6).withSelectionBehaviour(LexSelectionBehaviour.SELECT_IF_TOP), CompletionType.KEYWORD_CHAIN)));
        }

        if (Utility.startsWithIgnoreCase("@defin", stem))
        {
            completions.push(new Pair(CompletionStatus.DIRECT, new ExpressionCompletion(new LexCompletion(canonIndex, stem.length, "@define@then@enddefine").withDisplay(StyledString.s("@define … @then … @enddefine")).withFurtherDetailsURL("syntax-define.html").withCaretPosAfterCompletion(7).withSelectionBehaviour(LexSelectionBehaviour.SELECT_IF_TOP), CompletionType.KEYWORD_CHAIN)));
        }

        for (const keyword of ExpressionLexer.Keyword.values())
        {
            let added = false;
            // Add keywords without @
            if (keyword.getContent().startsWith("@") && !stem.startsWith("@"))
            {
                const common: RawInputLocation = Utility.longestCommonStart(keyword.getContent(), 1, stem, 0);
                // We only show as related if we actually match at least one character:
                if (common > 0)
                {
                    completions.push(new Pair(CompletionStatus.RELATED, new ExpressionCompletion(new LexCompletion(canonIndex, common, keyword.getContent()).withFurtherDetailsURL(this.getDocURLFor(keyword)), CompletionType.KEYWORD)));
                    added = true;
                }
            }

            if (!added)
            {
                // Add keywords as-is:
                const rawMatchLen = Utility.longestCommonStartIgnoringCase(keyword.getContent(), 0, stem, 0);
                // Once complete, don't show:
                const len = Math.min(rawMatchLen, keyword.getContent().length - 1);
                completions.push(new Pair(CompletionStatus.DIRECT, new ExpressionCompletion(new LexCompletion(canonIndex, len, keyword.getContent()).withFurtherDetailsURL(this.getDocURLFor(keyword)).withSelectionBehaviour(LexSelectionBehaviour.SELECT_IF_ONLY), CompletionType.KEYWORD)));
            }
        }
    }

    /**
     * Adds all the available variable completions to the given builder
     * @param identCompletions The builder to add to
     * @param stem The stem to narrow down the options, if non-null.  If null, add all functions
     * @param canonIndex The position to pass to the completion
     */
    private addNestedLiteralCompletions(identCompletions: Pair<CompletionStatus, ExpressionCompletion>[], stem: string | null, canonIndex: CanonicalLocation, insertListener: InsertListener): void
    {
        for (const nestedLiteral of this.getNestedLiterals(false, insertListener))
        {
            ExpressionLexer.map(ExpressionLexer.matchWordStart(stem, canonIndex, nestedLiteral.getFirst(), "Value", WordPosition.FIRST_WORD), c => c.withReplacement(nestedLiteral.getFirst() + "}", StyledString.s(nestedLiteral.getFirst() + "…}"))
                    .withCaretPosAfterCompletion(nestedLiteral.getFirst().length)
                    .withFurtherDetailsURL("literal-" + nestedLiteral.getFirst().replaceAll("{", "") + ".html")).forEach(v =>
            {
                identCompletions.push(new Pair(CompletionStatus.DIRECT, new ExpressionCompletion(v, nestedLiteral.getFirst() === "{" ? CompletionType.UNIT_LITERAL : CompletionType.NESTED_LITERAL)));
            });
        }
    }

    private static map(items: ReadonlyMap<WordPosition, LexCompletion>, withEach: (c: LexCompletion) => LexCompletion): ReadonlyMap<WordPosition, LexCompletion>
    {
        const r = new Map<WordPosition, LexCompletion>();
        items.forEach((v, k) => r.set(k, withEach(v)));
        return r;
    }

    /**
     * Adds all the available variable completions to the given builder
     * @param identCompletions The builder to add to
     * @param stem The stem to narrow down the options, if non-null.  If null, add all functions
     * @param canonIndex The position to pass to the completion
     */
    private addVariableCompletions(identCompletions: Pair<CompletionStatus, ExpressionCompletion>[], stem: string | null, canonIndex: CanonicalLocation): void
    {
        for (const bool of ["true", "false"])
        {
            ExpressionLexer.matchWordStart(stem, canonIndex, bool, "Value", WordPosition.FIRST_WORD).forEach(v =>
            {
                identCompletions.push(new Pair(CompletionStatus.DIRECT, new ExpressionCompletion(v, CompletionType.CONSTANT)));
            });
        }

        try
        {
            for (const availableVariable of this.makeTypeState().getAvailableVariables())
            {
                ExpressionLexer.map(ExpressionLexer.matchWordStart(stem, canonIndex, availableVariable, "Variable", WordPosition.FIRST_WORD, WordPosition.LATER_WORD), c =>
                {
                    // Special cases for in-built variables with attached documentation:
                    if (availableVariable === TypeState.GROUP_COUNT)
                    {
                        return c.withFurtherDetailsURL("variable-" + TypeState.GROUP_COUNT.replaceAll(" ", "-") + ".html");
                    }
                    else if (availableVariable === TypeState.ROW_NUMBER)
                    {
                        return c.withFurtherDetailsURL("variable-" + TypeState.ROW_NUMBER.replaceAll(" ", "-") + ".html");
                    }
                    else
                        return c;
                }).forEach((v, k) => identCompletions.push(new Pair(k === WordPosition.FIRST_WORD ? CompletionStatus.DIRECT : CompletionStatus.RELATED, new ExpressionCompletion(v, CompletionType.VARIABLE))));
            }
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
        }
    }

    /**
     * Adds all the available column completions to the given builder
     * @param identCompletions The builder to add to
     * @param stem The stem to narrow down the options, if non-null.  If null, add all functions
     * @param canonIndex The position to pass to the completion
     */
    private addColumnAndTableCompletions(identCompletions: Pair<CompletionStatus, ExpressionCompletion>[], stem: string | null, canonIndex: CanonicalLocation): void
    {
        for (const availableColumn of this.columnLookup.get().getAvailableColumnReferences())
        {
            if (availableColumn.getFirst() === null)
            {
                ExpressionLexer.matchWordStart(stem, canonIndex, availableColumn.getSecond().getRaw(), "Column", WordPosition.FIRST_WORD, WordPosition.LATER_WORD).forEach((v, k) => identCompletions.push(new Pair(k === WordPosition.FIRST_WORD ? CompletionStatus.DIRECT : CompletionStatus.RELATED, new ExpressionCompletion(v.withFurtherDetailsHTMLContent(this.htmlForColumn(availableColumn.getFirst(), availableColumn.getSecond())), CompletionType.COLUMN))));
            }
        }

        for (const tableReference of this.columnLookup.get().getAvailableTableReferences())
        {
            const tableCompletions: Pair<CompletionStatus, LexCompletion>[] = [];
            ExpressionLexer.matchWordStart(stem, canonIndex, "table\\\\" + tableReference.getRaw(), "Table", WordPosition.FIRST_WORD).forEach(c => tableCompletions.push(new Pair(CompletionStatus.DIRECT, c)));

            // Add a related item if matches without the entire
            ExpressionLexer.matchWordStart(stem, canonIndex, tableReference.getRaw(), "Table", WordPosition.FIRST_WORD_NON_EMPTY, WordPosition.LATER_WORD).forEach(v => tableCompletions.push(new Pair(CompletionStatus.RELATED, v.withReplacement("table\\" + tableReference.getRaw()))));

            for (const p of tableCompletions)
            {
                identCompletions.push(p.mapSecond(c => new ExpressionCompletion(c.withFurtherDetailsHTMLContent(this.htmlForTable(tableReference)), CompletionType.TABLE)));
            }
        }
    }

    private htmlForColumn(t: TableId | null, c: ColumnId): string
    {
        const funcdocURL = ExpressionLexer.getStylesheet("funcdoc.css");
        const webURL = ExpressionLexer.getStylesheet("web.css");

        return "<html>\n" +
                "   <head>\n" +
                "      <meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\">\n" +
                "      <link rel=\"stylesheet\" href=\"" + funcdocURL + "\">\n" +
                "      <link rel=\"stylesheet\" href=\"" + webURL + "\">\n" +
                "   </head>\n" +
                "   <body class=\"indiv\">\n" +
                "      <div class=\"column-item\"><span class=\"column-header\"/>" + (t !== null ? t.getRaw() + ":<wbr>" : "") + c.getRaw() + "</span>" +
                "<p>This uses the value of the column in the current row.</p>" +
                "</div></body></html>";
    }

    private htmlForTable(t: TableId): string
    {
        const funcdocURL = ExpressionLexer.getStylesheet("funcdoc.css");
        const webURL = ExpressionLexer.getStylesheet("web.css");

        return "<html>\n" +
            "   <head>\n" +
            "      <meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\">\n" +
            "      <link rel=\"stylesheet\" href=\"" + funcdocURL + "\">\n" +
            "      <link rel=\"stylesheet\" href=\"" + webURL + "\">\n" +
            "   </head>\n" +
            "   <body class=\"indiv\">\n" +
            "      <div class=\"table-item\"><span class=\"table-header\"/>" + t.getRaw() + "</span>" +
            "<p>This uses the table.  You can access individual columns by appending # followed by the column name.</p>" +
            "</div></body></html>";
    }

    /**
     * Adds all the available function completions to the given builder
     * @param identCompletions The builder to add to
     * @param stem The stem to narrow down the options, if non-null.  If null, add all functions
     * @param canonIndex The position to pass to the completion
     */
    private addFunctionCompletions(identCompletions: Pair<CompletionStatus, ExpressionCompletion>[], stem: string | null, canonIndex: CanonicalLocation): void
    {
        for (const func of this.allFunctions)
        {
            const lexCompletions: Pair<CompletionStatus, LexCompletion>[] = [];

            ExpressionLexer.matchWordStart(stem, canonIndex, func.getName(), "Function", WordPosition.FIRST_WORD, WordPosition.LATER_WORD).forEach((v, k) => lexCompletions.push(new Pair(k === WordPosition.FIRST_WORD ? CompletionStatus.DIRECT : CompletionStatus.RELATED, v)));


            if (stem !== null && stem.length >= 2)
            {
                for (const synonym of func.getSynonyms())
                {
                    let added = false;
                    ExpressionLexer.matchWordStart(stem, canonIndex, synonym, "Function", WordPosition.FIRST_WORD_NON_EMPTY).forEach(c =>
                    {
                        lexCompletions.push(new Pair(CompletionStatus.RELATED, c.withReplacement(func.getName()).withSideText("≈ " + synonym)));
                        added = true;
                    });
                    if (added)
                        break;
                }
            }

            for (const c of lexCompletions)
            {
                identCompletions.push(new Pair(c.getFirst(), new ExpressionCompletion(c.getSecond().withReplacement(func.getName() + "()", StyledString.s(func.getName() + "(…)")).withFurtherDetailsURL(ExpressionLexer.makeFuncDocURL(func)).withCaretPosAfterCompletion(func.getName().length + 1), CompletionType.FUNCTION)));
            }
        }
    }

    public static makeFuncDocURL(func: StandardFunctionDefinition): string
    {
        return "function-" + func.getDocKey().replaceAll(":", "-") + ".html";
    }

    /**
     * Adds all the available tag completions to the given builder
     * @param identCompletions The builder to add to
     * @param stem The stem to narrow down the options, if non-null.  If null, add all functions
     * @param canonIndex The position to pass to the completion
     */
    private addTagCompletions(identCompletions: Pair<CompletionStatus, ExpressionCompletion>[], stem: string | null, canonIndex: CanonicalLocation): void
    {
        for (const tag of this.getTagCompletions(this.typeManager.getKnownTaggedTypes()))
        {
            const fullName = (tag.typeName !== null ? (tag.typeName.getRaw() + "\\") : "") + tag.tagName;
            if (stem === null || Utility.startsWithIgnoreCase(tag.tagName, stem) || (tag.typeName !== null && Utility.startsWithIgnoreCase(fullName, stem)))
            {
                identCompletions.push(new Pair(CompletionStatus.DIRECT, new ExpressionCompletion(new LexCompletion(canonIndex, stem === null ? 0 : stem.length, fullName + (tag.hasInner ? "()" : "")).withSideText("Tag").withCaretPosAfterCompletion(fullName.length + (tag.hasInner ? 1 : 0)), CompletionType.CONSTRUCTOR)));
            }
        }
    }

    private getDocURLFor(keyword: ExpressionLexer.Keyword): string | null
    {
        const Keyword = ExpressionLexer.Keyword;
        switch (keyword)
        {
            case Keyword.IF: // Java: "//case THEN:  // Overloaded!" here
            case Keyword.ELSE:
            case Keyword.ENDIF:
                return "syntax-if.html";
            case Keyword.MATCH:
            case Keyword.CASE:
            case Keyword.ORCASE:
            case Keyword.GIVEN:
            case Keyword.ENDMATCH:
                return "syntax-match.html";
            case Keyword.DEFINE:
            case Keyword.ENDDEFINE:
                return "syntax-define.html";
            case Keyword.FUNCTION:
            case Keyword.ENDFUNCTION:
                return "syntax-function.html";
            case Keyword.QUEST:
                return "syntax-quest.html";

        }
        return null;
    }

    // PORT-NOTE: Java has a private insertBit(BitSet, int) here, which nothing calls; not ported.

    /**
     * PORT-NOTE: the map's values (whether a tag name clashes between types) are never read, so a tag
     * name shared by two types is still offered unqualified (where it is ambiguous), and one shared
     * by three types is not.  Kept as in Java.
     */
    private getTagCompletions(knownTaggedTypes: ReadonlyMapLike<TypeId, TaggedTypeDefinition>): readonly TagCompletion[]
    {
        // Optional.empty (here null) indicates a name clash for a simple key
        const completions = new TreeMap<TagCompletion, TaggedTypeDefinition | null>(undefined, (a, b) => a.compareTo(b));

        for (const value of knownTaggedTypes.values())
        {
            // Bit of a hack to hide internal types;
            if (value.getTaggedTypeName().equals(new TypeId("Type")) || value.getTaggedTypeName().equals(new TypeId("Unit")))
                continue;

            for (const tag of value.getTags())
            {
                // Try first without type:
                const simpleKey = new TagCompletion(null, tag.getName(), tag.getInner() !== null);
                const fullKey = new TagCompletion(value.getTaggedTypeName(), tag.getName(), tag.getInner() !== null);
                completions.set(fullKey, value);
                const prevSimple = completions.get(simpleKey);
                completions.delete(simpleKey);
                if (prevSimple === undefined)
                {
                    completions.set(simpleKey, value);
                }
                else
                {
                    if (prevSimple !== null)
                    {
                        // Note clash
                        completions.set(simpleKey, null);
                    }
                }
            }

        }
        return [...completions.keys()];
    }

    private getNestedLiterals(lastWasNumber: boolean, insertListener: InsertListener): readonly Pair<string, (source: NestedLiteralSource) => LiteralOutcome>[]
    {
        const unitLit = (c: NestedLiteralSource): LiteralOutcome =>
        {
            const unitLexer = new UnitLexer(this.typeManager, false);
            const processed: Lexer.LexerResult<UnitExpression, CodeCompletionContext> = unitLexer.process(c.innerContent, 0, insertListener);
            return LiteralOutcome.fromLexed(c.prefix, processed.adjustedContent, processed.display, new UnitLiteralExpression(processed.result), c.terminatedProperly ? "}" : "", processed.removedChars, processed.caretPositions, processed.wordBoundaryCaretPositions, processed.errors, processed.autoCompleteDetails, processed.locationRecorder);
        };
        const DateTimeType = DateTimeInfo.DateTimeType;
        const anywhere: readonly Pair<string, (source: NestedLiteralSource) => LiteralOutcome>[] = [
            new Pair("date{", c => LiteralOutcome.fromSource(c, new TemporalLiteral(DateTimeType.YEARMONTHDAY, c.innerContent))),
            new Pair("datetime{", c => LiteralOutcome.fromSource(c, new TemporalLiteral(DateTimeType.DATETIME, c.innerContent))),
            new Pair("datetimezoned{", c => LiteralOutcome.fromSource(c, new TemporalLiteral(DateTimeType.DATETIMEZONED, c.innerContent))),
            new Pair("dateym{", c => LiteralOutcome.fromSource(c, new TemporalLiteral(DateTimeType.YEARMONTH, c.innerContent))),
            new Pair("time{", c => LiteralOutcome.fromSource(c, new TemporalLiteral(DateTimeType.TIMEOFDAY, c.innerContent))),
            new Pair("type{", c =>
            {
                const typeLexer = new TypeLexer(this.typeManager, true, false);
                const processed: Lexer.LexerResult<TypeExpression, CodeCompletionContext> = typeLexer.process(c.innerContent, 0, insertListener);
                return LiteralOutcome.fromLexed(c.prefix, processed.adjustedContent, processed.display, new TypeLiteralExpression(processed.result), c.terminatedProperly ? "}" : "", processed.removedChars, processed.caretPositions, processed.wordBoundaryCaretPositions, processed.errors, processed.autoCompleteDetails, processed.locationRecorder);
            }),
            new Pair("unit{", unitLit),
        ];
        if (lastWasNumber)
            return Utility.appendToList(anywhere, new Pair("{", unitLit));
        else
            return anywhere;
    }

    private tryNestedLiteral(prefixInclCurly: string, content: string, curIndex: RawInputLocation, removedChars: Lexer.RemovedCharacters, locationRecorder: EditorLocationAndErrorRecorder): NestedLiteralSource | null
    {
        if (content.startsWith(prefixInclCurly, curIndex))
        {
            curIndex += prefixInclCurly.length;
            const startIndex: RawInputLocation = curIndex;
            let openCount = 1;
            while (curIndex < content.length && openCount > 0)
            {
                if (content.charAt(curIndex) === "{")
                    openCount += 1;
                else if (content.charAt(curIndex) === "}")
                    openCount -= 1;
                curIndex += 1;
            }
            if (openCount === 0)
                return new NestedLiteralSource(prefixInclCurly, content.substring(startIndex, curIndex - 1), curIndex, true);
            else
            {
                locationRecorder.addErrorAndFixes(removedChars.map(startIndex, content.length), StyledString.s("Started " + prefixInclCurly + " but no matching closing }"), []);
                return new NestedLiteralSource(prefixInclCurly, content.substring(startIndex), content.length, false);
            }
        }
        return null;
    }

    // Java: sort(ImmutableList<Pair<CompletionStatus, ExpressionCompletion>>, operators, guides)
    private static sortGroups(completions: readonly Pair<CompletionStatus, ExpressionCompletion>[], operators: readonly LexCompletion[], guides: readonly LexCompletion[]): readonly LexCompletionGroup[]
    {
        const groups: LexCompletionGroup[] = [];

        const direct = ExpressionLexer.sort(completions.filter(p => p.getFirst() === CompletionStatus.DIRECT).map(p => p.getSecond()));
        if (direct.length !== 0)
        {
            groups.push(new LexCompletionGroup(direct, null, 2));
        }
        const related = ExpressionLexer.sort(completions.filter(p => p.getFirst() === CompletionStatus.RELATED).map(p => p.getSecond()));
        if (related.length !== 0)
        {
            groups.push(new LexCompletionGroup(related, StyledString.s("Related"), 2));
        }
        if (operators.length !== 0)
        {
            groups.push(new LexCompletionGroup(operators, StyledString.s("Operators"), 1));
        }
        if (guides.length !== 0)
        {
            groups.push(new LexCompletionGroup(guides, StyledString.s("Help"), 1));
        }

        return groups;
    }

    private static sort(completions: readonly ExpressionCompletion[]): readonly LexCompletion[]
    {
        return [...completions].sort((c1, c2) =>
        {
            const byType = c1.completionType - c2.completionType;
            if (byType !== 0)
                return byType;
            if (c1.completion.content === null)
                return -1;
            else if (c2.completion.content === null)
                return 1;
            else
                return javaCompareToIgnoreCase(c1.completion.content, c2.completion.content);
        }).map(c => c.completion);
    }

    /**
     * Check if the source snippet is a stem of any (space-separated) word in the completion text.  If so, return a
     * corresponding completion, else return empty.
     *
     * e.g. matchWordStart(new Pair("te", 0), 34, "from text to", FIRST_WORD, LATER_WORD)
     * would return Optional.of(new Pair(LATER_WORD, new LexCompletion(34, 2, "from text to")))
     * because te matches text.
     *
     * e.g. matchWordStart(new Pair("deepfreeze", 4), 67, "from text to", FIRST_WORD)
     * would return Optional.of(new Pair(FIRST_WORD, new LexCompletion(67, 2, "from text to")))
     * because fr ("deepfreeze".substring(4)) matches from for the first two characters.
     *
     * PORT-NOTE: Java also has an overload taking the source as a String (using zero as its start
     * position); this one takes either.  Java returns an ImmutableMap copied from a HashMap keyed
     * by an enum, whose order is arbitrary; here it is the order the positions were found in.  The
     * callers only use the order to add completions, which are then sorted into groups by position.
     *
     * @param src The source content from the user and position to start the search at.  If null, automatically match as FIRST_WORD (a convenience to avoid null checks for each caller).
     * @param startPos the start position to feed to the completion constructor
     * @param completionText The completion text to search for.
     * @return True, completion if at very start; False, completion if it maps a later word.
     */
    private static matchWordStart(src: Pair<string, number> | string | null, startPos: CanonicalLocation, completionText: string, sideText: string | null, ...possiblePositions: WordPosition[]): ReadonlyMap<WordPosition, LexCompletion>
    {
        if (typeof src === "string")
            src = new Pair(src, 0);
        if (src === null)
            return new Map([[WordPosition.FIRST_WORD, ExpressionLexer.addSideText(new LexCompletion(startPos, 0, completionText), sideText)]]);

        const firstWord = possiblePositions.includes(WordPosition.FIRST_WORD);
        const firstWordNonEmpty = possiblePositions.includes(WordPosition.FIRST_WORD_NON_EMPTY);
        const laterWord = possiblePositions.includes(WordPosition.LATER_WORD);
        let prevCompletionLength = 0;
        let curCompletionStart = 0;
        // Need HashMap not builder because we may overwrite if multiple later words match:
        const r = new Map<WordPosition, LexCompletion>();
        // We loop, looking at the start of each word in the completionText ident for a match against src
        // If we find a match and it's valid given the WordPosition items, we store it.  Because of
        do
        {
            const len = Utility.longestCommonStartIgnoringCase(completionText, curCompletionStart, src.getFirst(), src.getSecond());
            if ((firstWord && len === 0 && curCompletionStart === 0) || (len > 0 && len > prevCompletionLength))
            {
                const adjStartPos: CanonicalLocation = startPos + prevCompletionLength;
                r.set(curCompletionStart === 0 ? WordPosition.FIRST_WORD : WordPosition.LATER_WORD, ExpressionLexer.addSideText(new class extends LexCompletion
                {
                    public override showFor(caretPos: CanonicalLocation): boolean
                    {
                        if (firstWordNonEmpty)
                            return adjStartPos < caretPos && caretPos <= adjStartPos + len;
                        else
                            return adjStartPos <= caretPos && caretPos <= adjStartPos + len;
                    }
                }(startPos, len, completionText), sideText));
                // No need to add related word again later:
                if (curCompletionStart !== 0)
                    break;
                else
                    prevCompletionLength = len + 1;
            }
            curCompletionStart = completionText.indexOf(" ", curCompletionStart);
            // If not -1, it's one char past the space, otherwise leave as -1:
            if (curCompletionStart >= 0)
                curCompletionStart += 1;
        }
        while (laterWord && curCompletionStart >= 0);

        return r;
    }

    private static addSideText(completion: LexCompletion, sideText: string | null): LexCompletion
    {
        if (sideText !== null)
            return completion.withSideText(sideText);
        else
            return completion;
    }
}

export namespace ExpressionLexer
{
    // Java: Utility.literal(xyz.columnal.grammar.ExpressionLexer.VOCABULARY, token)
    function literal(token: number): string
    {
        return Utility.literal(vocabularyOf(GrammarExpressionLexer), token);
    }

    /**
     * The difference between a Keyword and Op is that a Keyword is never a prefix of a longer
     * item, and thus always completes immediately when directly matched.
     *
     * Java: an enum implementing ExpressionToken
     */
    export class Keyword implements ExpressionToken
    {
        public static readonly OPEN_SQUARE = new Keyword("OPEN_SQUARE", "[");
        public static readonly CLOSE_SQUARE = new Keyword("CLOSE_SQUARE", "]");
        public static readonly OPEN_ROUND = new Keyword("OPEN_ROUND", "(");
        public static readonly CLOSE_ROUND = new Keyword("CLOSE_ROUND", ")");
        public static readonly QUEST = new Keyword("QUEST", "?");
        public static readonly IF = new Keyword("IF", literal(GrammarExpressionLexer.IF));
        public static readonly THEN = new Keyword("THEN", literal(GrammarExpressionLexer.THEN));
        public static readonly ELSE = new Keyword("ELSE", literal(GrammarExpressionLexer.ELSE));
        public static readonly ENDIF = new Keyword("ENDIF", literal(GrammarExpressionLexer.ENDIF));
        public static readonly MATCH = new Keyword("MATCH", literal(GrammarExpressionLexer.MATCH));
        public static readonly CASE = new Keyword("CASE", literal(GrammarExpressionLexer.CASE));
        public static readonly ORCASE = new Keyword("ORCASE", literal(GrammarExpressionLexer.ORCASE));
        public static readonly GIVEN = new Keyword("GIVEN", literal(GrammarExpressionLexer.CASEGUARD));
        public static readonly ENDMATCH = new Keyword("ENDMATCH", literal(GrammarExpressionLexer.ENDMATCH));
        public static readonly DEFINE = new Keyword("DEFINE", literal(GrammarExpressionLexer.DEFINE));
        public static readonly ENDDEFINE = new Keyword("ENDDEFINE", literal(GrammarExpressionLexer.ENDDEFINE));
        public static readonly FUNCTION = new Keyword("FUNCTION", literal(GrammarExpressionLexer.FUNCTION));
        public static readonly ENDFUNCTION = new Keyword("ENDFUNCTION", literal(GrammarExpressionLexer.ENDFUNCTION));

        private constructor(private readonly enumName: string, private readonly keyword: string)
        {
        }

        public static values(): readonly Keyword[]
        {
            return [Keyword.OPEN_SQUARE, Keyword.CLOSE_SQUARE, Keyword.OPEN_ROUND, Keyword.CLOSE_ROUND, Keyword.QUEST,
                Keyword.IF, Keyword.THEN, Keyword.ELSE, Keyword.ENDIF,
                Keyword.MATCH, Keyword.CASE, Keyword.ORCASE, Keyword.GIVEN, Keyword.ENDMATCH,
                Keyword.DEFINE, Keyword.ENDDEFINE, Keyword.FUNCTION, Keyword.ENDFUNCTION];
        }

        public name(): string
        {
            return this.enumName;
        }

        public getContent(): string
        {
            return this.keyword;
        }

        public toStyledString(): StyledString
        {
            const content = this.getContent();
            if (content.startsWith("@"))
            {
                return StyledString.concat(StyledString.s("@").withStyle(new StyledCSS("expression-" + this.enumName.toLowerCase(), "expression-at")), StyledString.s(content.substring(1)).withStyle(new StyledCSS("expression-" + this.enumName.toLowerCase())));
            }
            else
                return StyledString.s(content).withStyle(new StyledCSS("expression-" + this.enumName.toLowerCase()));
        }


        public isClosing(): boolean
        {
            switch (this)
            {
                case Keyword.CLOSE_ROUND:
                case Keyword.CLOSE_SQUARE:
                case Keyword.ENDIF:
                case Keyword.ENDDEFINE:
                case Keyword.ENDMATCH:
                case Keyword.ENDFUNCTION:
                    return true;
            }
            return false;
        }

        public toString(): string
        {
            return this.enumName;
        }
    }

    /**
     * An Op, unlike a Keyword, may have a longer alternative available, so should not
     * complete on direct match (unless it is the only possible direct match).
     *
     * Java: an enum implementing ExpressionToken
     */
    export class Op implements ExpressionToken
    {
        public static readonly MULTIPLY = new Op("MULTIPLY", "*", "op.times");
        public static readonly DIVIDE = new Op("DIVIDE", "/", "op.divide");
        public static readonly ADD = new Op("ADD", "+", "op.plus");
        public static readonly SUBTRACT = new Op("SUBTRACT", "-", "op.minus");
        public static readonly STRING_CONCAT = new Op("STRING_CONCAT", ";", "op.stringConcat");
        public static readonly EQUALS = new Op("EQUALS", "=", "op.equal");
        public static readonly EQUALS_PATTERN = new Op("EQUALS_PATTERN", "=~", "op.equalPattern");
        public static readonly NOT_EQUAL = new Op("NOT_EQUAL", "<>", "op.notEqual");
        public static readonly LESS_THAN = new Op("LESS_THAN", "<", "op.lessThan");
        public static readonly LESS_THAN_OR_EQUAL = new Op("LESS_THAN_OR_EQUAL", "<=", "op.lessThanOrEqual");
        public static readonly GREATER_THAN = new Op("GREATER_THAN", ">", "op.greaterThan");
        public static readonly GREATER_THAN_OR_EQUAL = new Op("GREATER_THAN_OR_EQUAL", ">=", "op.greaterThanOrEqual");
        public static readonly AND = new Op("AND", "&", "op.and");
        public static readonly OR = new Op("OR", "|", "op.or");
        public static readonly PLUS_MINUS = new Op("PLUS_MINUS", "±", "op.plusminus", "+-");
        public static readonly RAISE = new Op("RAISE", "^", "op.raise");
        public static readonly HAS_TYPE = new Op("HAS_TYPE", "::", "op.hasType");
        public static readonly COLON = new Op("COLON", ":", "op.colon");
        public static readonly FIELD_ACCESS = new Op("FIELD_ACCESS", "#", "op.fieldAccess");
        public static readonly COMMA = new Op("COMMA", ",", "op.separator");

        /** @internal Java: private, read by ExpressionLexer */
        public readonly localNameKey: string;

        // asciiContent: Java's PLUS_MINUS overrides getASCIIContent
        private constructor(private readonly enumName: string, private readonly op: string, localNameKey: string, private readonly asciiContent: string = op)
        {
            this.localNameKey = localNameKey;
        }

        public static values(): readonly Op[]
        {
            return [Op.MULTIPLY, Op.DIVIDE, Op.ADD, Op.SUBTRACT, Op.STRING_CONCAT,
                Op.EQUALS, Op.EQUALS_PATTERN, Op.NOT_EQUAL,
                Op.LESS_THAN, Op.LESS_THAN_OR_EQUAL, Op.GREATER_THAN, Op.GREATER_THAN_OR_EQUAL,
                Op.AND, Op.OR, Op.PLUS_MINUS, Op.RAISE, Op.HAS_TYPE, Op.COLON, Op.FIELD_ACCESS, Op.COMMA];
        }

        public name(): string
        {
            return this.enumName;
        }

        public getContent(): string
        {
            return this.op;
        }

        public getASCIIContent(): string
        {
            return this.asciiContent;
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

class AddedSpace
{
    public readonly addedAtInternalPos: CanonicalLocation;
    public readonly added: string;

    public constructor(addedAtInternalPos: CanonicalLocation, added: string)
    {
        this.addedAtInternalPos = addedAtInternalPos;
        this.added = added;
    }
}

class TagCompletion
{
    // Non-null if needed to disambiguate, null if type name is unique
    public readonly typeName: TypeId | null;
    public readonly tagName: string;
    public readonly hasInner: boolean;

    public constructor(typeName: TypeId | null, tagName: string, hasInner: boolean)
    {
        this.typeName = typeName;
        this.tagName = tagName;
        this.hasInner = hasInner;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TagCompletion)) return false;
        const that = o;
        return (this.typeName === null ? that.typeName === null : this.typeName.equals(that.typeName)) &&
                this.tagName === that.tagName;
    }

    public compareTo(o: TagCompletion): number
    {
        if (this.typeName === null && o.typeName !== null)
            return -1;
        else if (this.typeName !== null && o.typeName === null)
            return 1;
        else if (this.typeName !== null && o.typeName !== null)
        {
            const c = this.typeName.compareTo(o.typeName);
            if (c !== 0)
                return c;
        }
        return javaCompare(this.tagName, o.tagName);
    }
}

class LiteralOutcome
{
    public constructor(
        public readonly expression: Expression,
        public readonly removedChars: Lexer.RemovedCharacters,
        public readonly chunk: ContentChunk,
        public readonly nestedErrors: readonly EditorLocationAndErrorRecorder.ErrorDetails[],
        public readonly completions: readonly Lexer.AutoCompleteDetails<CodeCompletionContext>[],
        public readonly locationRecorder: EditorLocationAndErrorRecorder | null)
    {
    }

    // Java: the constructor LiteralOutcome(NestedLiteralSource source, Expression expression)
    public static fromSource(source: NestedLiteralSource, expression: Expression): LiteralOutcome
    {
        const content = source.prefix + source.innerContent + (source.terminatedProperly ? "}" : "");
        const positions: number[] = [0];
        for (let n = 0; n < source.innerContent.length + 1; n++)
            positions.push(n + source.prefix.length);
        for (let n = source.terminatedProperly ? content.length - 1 : content.length; n < content.length + 1; n++)
            positions.push(n);
        const chunk = new ContentChunk(content, StyledString.s(content), positions.map(i => new CaretPos(i, i)),
                [...new Set<number>([0, source.prefix.length, source.terminatedProperly ? content.length - 1 : content.length, content.length])],
                ChunkType.NESTED_START);
        return new LiteralOutcome(expression, new Lexer.RemovedCharacters(), chunk, [], [], null);
    }

    // Java: the constructor LiteralOutcome(prefix, internalContent, displayContent, expression, suffix, removedChars, caretPos, wordBoundaryCaretPos, errors, completions, locationRecorder)
    public static fromLexed(prefix: string, internalContent: string, displayContent: StyledString, expression: Expression, suffix: string, removedChars: Lexer.RemovedCharacters, caretPos: readonly CaretPos[], wordBoundaryCaretPos: readonly CanonicalLocation[], errors: readonly EditorLocationAndErrorRecorder.ErrorDetails[], completions: readonly Lexer.AutoCompleteDetails<CodeCompletionContext>[], locationRecorder: EditorLocationAndErrorRecorder): LiteralOutcome
    {
        const caretPosIncludingPrefixSuffix: CaretPos[] = [];
        const initialPos = new CaretPos(0, 0);
        caretPosIncludingPrefixSuffix.push(initialPos);
        for (const p of caretPos)
        {
            caretPosIncludingPrefixSuffix.push(new CaretPos(p.positionInternal + prefix.length, p.positionDisplay + prefix.length));
        }
        caretPosIncludingPrefixSuffix.push(new CaretPos(prefix.length + internalContent.length + suffix.length, prefix.length + displayContent.getLength() + suffix.length));
        const wordPosIncludingPrefixSuffix: CanonicalLocation[] = [];
        wordPosIncludingPrefixSuffix.push(initialPos.positionInternal);
        for (const p of wordBoundaryCaretPos)
        {
            wordPosIncludingPrefixSuffix.push(p + prefix.length);
        }
        wordPosIncludingPrefixSuffix.push(prefix.length + internalContent.length + suffix.length);
        const chunk = new ContentChunk(
            prefix + internalContent + suffix,
            StyledString.concat(StyledString.s(prefix), displayContent, StyledString.s(suffix)),
            caretPosIncludingPrefixSuffix, wordPosIncludingPrefixSuffix, ChunkType.NESTED_START);
        return new LiteralOutcome(expression, removedChars, chunk, errors, completions, locationRecorder);
    }
}

class NestedLiteralSource
{
    public constructor(
        public readonly prefix: string,
        public readonly innerContent: string,
        public readonly positionAfter: RawInputLocation,
        public readonly terminatedProperly: boolean)
    {
    }
}

// Used for ordering, so the order here is significant
enum CompletionType
{
    COLUMN, VARIABLE, NESTED_LITERAL, FUNCTION, CONSTRUCTOR, UNIT_LITERAL, CONSTANT, TABLE, KEYWORD_CHAIN, KEYWORD
}

enum CompletionStatus
{
    DIRECT, RELATED
}

// LexCompletion plus extra info for sorting
class ExpressionCompletion
{
    public constructor(public readonly completion: LexCompletion, public readonly completionType: CompletionType)
    {
    }
}

enum WordPosition
{
    FIRST_WORD,
    // Match first word, but only if there is a non-empty match:
    FIRST_WORD_NON_EMPTY,
    LATER_WORD,
}

class AddedSpaceCalculator extends ExpressionVisitorStream<AddedSpace>
{
    private readonly locations: EditorLocationAndErrorRecorder;
    private readonly INDENT = "  ";

    public constructor(locations: EditorLocationAndErrorRecorder)
    {
        super();
        this.locations = locations;
    }

    public override ifThenElse(self: IfThenElseExpression, condition: Expression, thenExpression: Expression, elseExpression: Expression): AddedSpace[]
    {
        return [
            new AddedSpace(self.getThenLocation().start, "\n" + this.INDENT),
            new AddedSpace(self.getElseLocation().start, "\n" + this.INDENT),
            new AddedSpace(self.getEndIfLocation().start, "\n"),
            ...this.increaseIndent(super.ifThenElse(self, condition, thenExpression, elseExpression)),
        ];
    }

    public override match(self: MatchExpression, expression: Expression, clauses: readonly MatchExpression.MatchClause[]): AddedSpace[]
    {
        const r: AddedSpace[] = [];

        for (let i = 0; i < clauses.length; i++)
        {
            r.push(new AddedSpace(clauses[i]!.getCaseLocation().start, "\n" + this.INDENT));
        }
        r.push(new AddedSpace(self.getEndLocation().start, "\n"));
        return [...r, ...this.increaseIndent(super.match(self, expression, clauses))];
    }

    public override define(self: DefineExpression, defines: readonly DefineExpression.DefineItem[], body: Expression): AddedSpace[]
    {
        const r: AddedSpace[] = [];

        for (let i = 0; i < defines.length; i++)
        {
            const followedByComma = defines.length > 1 && i < defines.length - 1;
            r.push(new AddedSpace(defines[i]!.trailingCommaOrThenLocation.start + (followedByComma ? 1 : 0), followedByComma ? "\n       " : "\n  "));
        }
        r.push(new AddedSpace(self.getEndLocation().start, "\n"));

        return [...r, ...this.increaseIndent(super.define(self, defines, body))];
    }

    private increaseIndent(indents: readonly AddedSpace[]): AddedSpace[]
    {
        return indents.map(a => new AddedSpace(a.addedAtInternalPos, a.added + this.INDENT));
    }

    /** @internal Java: the field is unused there too */
    public _getLocations(): EditorLocationAndErrorRecorder
    {
        return this.locations;
    }
}
