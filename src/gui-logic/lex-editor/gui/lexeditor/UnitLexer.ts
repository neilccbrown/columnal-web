// Port of xyz.columnal.gui.lexeditor.UnitLexer (lex-editor module).
import type { CanonicalLocation, LocalizableKey, RawInputLocation, UnitIdentifier } from "../../../../engine/anns/Annotations.js";
import { CanonicalSpan } from "../../../../engine/expressions/transformations/expression/CanonicalSpan.js";
import { Expression } from "../../../../engine/expressions/transformations/expression/Expressions.js";
import type { QuickFix } from "../../../../engine/expressions/transformations/expression/QuickFix.js";
import { InvalidSingleUnitExpression, SingleUnitExpression, UnitExpression, UnitExpressionIntLiteral } from "../../../../engine/expressions/transformations/expression/UnitExpressions.js";
import { BitSet } from "../../../../engine/java/BitSet.js";
import { javaCompareToIgnoreCase, javaParseInt } from "../../../../engine/java/JavaString.js";
import type { TypeManager } from "../../../../engine/types/data/datatype/TypeManager.js";
import type { UnitManager } from "../../../../engine/types/data/unit/UnitManager.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import type { StyledShowable } from "../../../../engine/utility-error/styled/StyledShowable.js";
import { StyledCSS } from "../../../../engine/utility-error/styled/StyledCSS.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";
import { IdentifierUtility } from "../../../../engine/utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../../../engine/utility/utility/TranslationUtility.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { InsertListener } from "../../../lex-editor-completion/gui/lexeditor/completion/InsertListener.js";
import { LexCompletion } from "../../../lex-editor-completion/gui/lexeditor/completion/LexCompletion.js";
import { LexCompletionGroup } from "../../../lex-editor-completion/gui/lexeditor/completion/LexCompletionGroup.js";
import { CodeCompletionContext } from "./CodeCompletionContext.js";
import { ExpressionToken } from "./ExpressionToken.js";
import { Lexer } from "./Lexer.js";
import { TextQuickFix } from "./TextQuickFix.js";
import type { TopLevelEditor } from "./TopLevelEditor.js";
import { UnitSaver } from "./UnitSaver.js";

export class UnitLexer extends Lexer<UnitExpression, CodeCompletionContext>
{
    private readonly typeManager: TypeManager;
    private readonly unitManager: UnitManager;
    private readonly requireConcrete: boolean;

    public constructor(typeManager: TypeManager, requireConcrete: boolean)
    {
        super();
        this.typeManager = typeManager;
        this.unitManager = typeManager.getUnitManager();
        this.requireConcrete = requireConcrete;
    }

    public override process(content: string, _curCaretPos: number | null, insertListener: InsertListener): Lexer.LexerResult<UnitExpression, CodeCompletionContext>
    {
        const saver = new UnitSaver(this.typeManager, insertListener);
        const removedCharacters = new Lexer.RemovedCharacters();
        const chunks: Lexer.ContentChunk[] = [];
        let curIndex: RawInputLocation = 0;
        nextToken: while (curIndex < content.length)
        {
            for (const bracket of UnitLexer.UnitBracket.values())
            {
                if (content.startsWith(bracket.getContent(), curIndex))
                {
                    saver.saveBracket(bracket, removedCharacters.map(curIndex, bracket.getContent()));
                    chunks.push(new Lexer.ContentChunk(bracket.getContent(), bracket.isClosing() ? Lexer.ChunkType.CLOSING : Lexer.ChunkType.OPENING));
                    curIndex += UnitLexer.rawLength(bracket.getContent());
                    continue nextToken;
                }
            }
            for (const op of UnitLexer.UnitOp.values())
            {
                if (content.startsWith(op.getContent(), curIndex))
                {
                    saver.saveOperator(op, removedCharacters.map(curIndex, op.getContent()));
                    chunks.push(new Lexer.ContentChunk(op.getContent(), Lexer.ChunkType.OPENING));
                    curIndex += UnitLexer.rawLength(op.getContent());
                    continue nextToken;
                }
            }

            if ((content.charAt(curIndex) >= "0" && content.charAt(curIndex) <= "9") ||
                (content.charAt(curIndex) === "-" && curIndex + 1 < content.length && (content.charAt(curIndex + 1) >= "0" && content.charAt(curIndex + 1) <= "9")))
            {
                const startIndex: RawInputLocation = curIndex;
                // Minus only allowed at start:
                if (content.charAt(curIndex) === "-")
                {
                    curIndex += 1;
                }
                while (curIndex < content.length && content.charAt(curIndex) >= "0" && content.charAt(curIndex) <= "9")
                    curIndex += 1;
                const numContent = content.substring(startIndex, curIndex);
                saver.saveOperand(new UnitExpressionIntLiteral(javaParseInt(numContent)), removedCharacters.map(startIndex, curIndex));
                chunks.push(new Lexer.ContentChunk(numContent, Lexer.ChunkType.IDENT));
                continue nextToken;
            }

            const parsed: Pair<UnitIdentifier, RawInputLocation> | null = IdentifierUtility.consumeUnitIdentifier(content, curIndex);
            if (parsed !== null && parsed.getSecond() > curIndex)
            {
                saver.saveOperand(new SingleUnitExpression(parsed.getFirst()), removedCharacters.map(curIndex, parsed.getSecond()));
                chunks.push(new Lexer.ContentChunk(parsed.getFirst(), Lexer.ChunkType.IDENT));
                curIndex = parsed.getSecond();
                continue nextToken;
            }

            const invalidCharLocation = removedCharacters.map(curIndex, curIndex + 1);
            const badChar = content.substring(curIndex, curIndex + 1);
            saver.saveOperand(new InvalidSingleUnitExpression(badChar), invalidCharLocation);
            chunks.push(new Lexer.ContentChunk(badChar, Lexer.ChunkType.OPENING));
            saver.locationRecorder.addErrorAndFixes(invalidCharLocation, StyledString.concat(TranslationUtility.getStyledString("error.illegalCharacter", Utility.codePointToString(content.charCodeAt(curIndex))), StyledString.s("\n  "), StyledString.s("Character code: \\u" + content.charCodeAt(curIndex).toString(16)).withStyle(new StyledCSS("errorable-sub-explanation"))), [new TextQuickFix("error.illegalCharacter.remove", invalidCharLocation, () => new Pair("", StyledString.s("<remove>")))]);

            curIndex += 1;
        }
        const saved = saver.finish(removedCharacters.map(curIndex, curIndex));
        const caretPositions = UnitLexer.calculateCaretPos(chunks);

        if (this.requireConcrete)
        {
            const lastIndex: RawInputLocation = curIndex;
            try
            {
                saved.asUnit(this.unitManager);
            }
            catch (e)
            {
                if (!(e instanceof UnitExpression.UnitLookupException))
                    throw e;
                if (e.errorMessage !== null || e.quickFixes.length !== 0)
                {
                    saver.locationRecorder.addErrorAndFixes(new CanonicalSpan(0, removedCharacters.map(lastIndex)), e.errorMessage === null ? StyledString.s("") : e.errorMessage, Utility.mapListI(e.quickFixes, f => new TextQuickFix(saver.locationRecorder.recorderFor(f.getReplacementTarget()), ((u: UnitExpression) => u.save(Expression.SaveDestination.TO_EDITOR_FULL_NAME, true)) as (e: never) => string, f as unknown as QuickFix<StyledShowable>)));
                }
            }
        }

        return new Lexer.LexerResult<UnitExpression, CodeCompletionContext>(saved, content, removedCharacters, false, [...caretPositions.getFirst()], [...caretPositions.getSecond()], StyledString.s(content), saver.getErrors(), saver.locationRecorder, UnitLexer.makeCompletions(chunks, (s, i, c, p) => this.makeCompletionsFor(s, i, c, p)), new BitSet(), !saver.hasUnmatchedBrackets(), (_i, _n) => new Map<TopLevelEditor.DisplayType, Pair<StyledString, readonly TextQuickFix[]>>());
    }

    // Java: makeCompletions(String stem, int canonIndex, ChunkType curType, ChunkType preceding), private
    private makeCompletionsFor(stem: string, canonIndex: CanonicalLocation, _curType: Lexer.ChunkType, _preceding: Lexer.ChunkType): CodeCompletionContext
    {
        // (Java's sortedCopyOf is a stable sort)
        const allDeclared = [...this.unitManager.getAllDeclared()].sort((u, v) => javaCompareToIgnoreCase(u.getName(), v.getName()));

        return new CodeCompletionContext([
            new LexCompletionGroup(Utility.mapListI(allDeclared, u =>
            {
                const len = Utility.longestCommonStartIgnoringCase(u.getName(), 0, stem, 0);
                return new LexCompletion(canonIndex, len, u.getName()).withSideText(this.limit(u.getDescription()));
            }), null, 2),

            new LexCompletionGroup(Utility.mapListI(allDeclared, u =>
            {
                const len = Utility.longestCommonStartIgnoringCase(u.getDescription(), 0, stem, 0);
                return new class extends LexCompletion
                {
                    public override showFor(caretPos: CanonicalLocation): boolean
                    {
                        return caretPos > canonIndex + Utility.longestCommonStartIgnoringCase(u.getName(), 0, stem, 0) && super.showFor(caretPos);
                    }
                }(canonIndex, len, u.getName()).withSideText(this.limit(u.getDescription()));
            }), StyledString.s("Related"), 2),

        ]);
    }

    private limit(description: string): string
    {
        if (description.length < 20)
            return description;
        else
            return description.substring(0, 19) + "…";
    }
}

export namespace UnitLexer
{
    // Java: an enum implementing ExpressionToken
    export class UnitOp implements ExpressionToken
    {
        public static readonly MULTIPLY = new UnitOp("MULTIPLY", 0, "*", "op.times");
        public static readonly DIVIDE = new UnitOp("DIVIDE", 1, "/", "op.divide");
        public static readonly RAISE = new UnitOp("RAISE", 2, "^", "op.raise");

        private constructor(private readonly enumName: string, private readonly enumOrdinal: number, private readonly op: string, private readonly localNameKey: LocalizableKey)
        {
        }

        public static values(): readonly UnitOp[]
        {
            return [UnitOp.MULTIPLY, UnitOp.DIVIDE, UnitOp.RAISE];
        }

        public getContent(): string
        {
            return this.op;
        }

        public toStyledString(): StyledString
        {
            return ExpressionToken.defaultStyledString(this);
        }

        public name(): string
        {
            return this.enumName;
        }

        public ordinal(): number
        {
            return this.enumOrdinal;
        }

        /** @internal Java: the unused localNameKey field */
        public _getLocalNameKey(): LocalizableKey
        {
            return this.localNameKey;
        }

        public toString(): string
        {
            return this.enumName;
        }
    }

    export class UnitBracket implements ExpressionToken
    {
        public static readonly OPEN_ROUND = new UnitBracket("OPEN_ROUND", "(");
        public static readonly CLOSE_ROUND = new UnitBracket("CLOSE_ROUND", ")");

        private constructor(private readonly enumName: string, private readonly bracket: string)
        {
        }

        public static values(): readonly UnitBracket[]
        {
            return [UnitBracket.OPEN_ROUND, UnitBracket.CLOSE_ROUND];
        }

        public getContent(): string
        {
            return this.bracket;
        }

        public toStyledString(): StyledString
        {
            return ExpressionToken.defaultStyledString(this);
        }

        public isClosing(): boolean
        {
            return this === UnitBracket.CLOSE_ROUND;
        }

        public toString(): string
        {
            return this.enumName;
        }
    }
}
