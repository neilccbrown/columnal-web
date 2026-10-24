// Port of xyz.columnal.gui.lexeditor.Lexer (lex-editor module).
//
// PORT-NOTE: LexerResult.infoAndPromptForPosition takes the node that documentation should appear to
// the right of (a JavaFX Node in Java), which is the GUI's (unknown here).
import type { CanonicalLocation, DisplayLocation, RawInputLocation } from "../../../../engine/anns/Annotations.js";
import { CanonicalSpan } from "../../../../engine/expressions/transformations/expression/CanonicalSpan.js";
import { BitSet } from "../../../../engine/java/BitSet.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import type { StyledShowable } from "../../../../engine/utility-error/styled/StyledShowable.js";
import { StyledCSS } from "../../../../engine/utility-error/styled/StyledCSS.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";
import { Log } from "../../../../engine/utility/log/Log.js";
import type { IdentifierUtility } from "../../../../engine/utility/utility/IdentifierUtility.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { InsertListener } from "../../../lex-editor-completion/gui/lexeditor/completion/InsertListener.js";
import type { LexCompletionGroup } from "../../../lex-editor-completion/gui/lexeditor/completion/LexCompletionGroup.js";
import type { CodeCompletionContext } from "./CodeCompletionContext.js";
import { EditorLocationAndErrorRecorder } from "./EditorLocationAndErrorRecorder.js";
import type { ExpressionToken } from "./ExpressionToken.js";
import type { TextQuickFix } from "./TextQuickFix.js";
import type { TopLevelEditor } from "./TopLevelEditor.js";

export abstract class Lexer<EXPRESSION extends StyledShowable, CODE_COMPLETION_CONTEXT extends CodeCompletionContext>
{
    // First is all caret pos, second is word boundary
    protected static calculateCaretPos(chunks: Lexer.ContentChunk[]): Pair<Lexer.LexerResult.CaretPos[], readonly CanonicalLocation[]>
    {
        const caretPos: Lexer.LexerResult.CaretPos[] = [];
        const wordBoundaryCaretPos: CanonicalLocation[] = [];
        let internalLenSoFar: CanonicalLocation = 0;
        let displayLenSoFar: DisplayLocation = 0;
        for (const chunk of chunks)
        {
            for (const caretPosition of chunk.caretPositions)
            {
                Lexer.addCaretPos(caretPos, new Lexer.LexerResult.CaretPos(caretPosition.positionInternal + internalLenSoFar, caretPosition.positionDisplay + displayLenSoFar));
            }
            for (const caretPosition of chunk.wordBoundaryCaretPositions)
            {
                if (!wordBoundaryCaretPos.includes(caretPosition + internalLenSoFar))
                    wordBoundaryCaretPos.push(caretPosition + internalLenSoFar);
            }
            internalLenSoFar += chunk.internalContent.length;
            displayLenSoFar += chunk.displayContent.getLength();
        }
        // Empty strings should still have a caret pos:
        if (chunks.length === 0)
        {
            chunks.push(new Lexer.ContentChunk("", StyledString.s(" "), Lexer.ChunkType.IDENT));
            caretPos.push(new Lexer.LexerResult.CaretPos(0, 0));
            wordBoundaryCaretPos.push(0);
        }
        return new Pair<Lexer.LexerResult.CaretPos[], readonly CanonicalLocation[]>(caretPos, [...wordBoundaryCaretPos]);
    }

    private static addCaretPos(caretPos: Lexer.LexerResult.CaretPos[], newPos: Lexer.LexerResult.CaretPos): void
    {
        if (caretPos.length !== 0)
        {
            const last = caretPos[caretPos.length - 1]!;
            if (newPos.positionInternal === last.positionInternal && newPos.positionDisplay === last.positionDisplay)
            {
                // Complete duplicate, ignore
                return;
            }
            else if (newPos.positionInternal === last.positionInternal || newPos.positionDisplay === last.positionDisplay)
            {
                // Partial duplicate, so gives conflict.  Favour first by ignoring
                return;
            }
        }
        caretPos.push(newPos);
    }

    protected static makeCompletions<CCC extends CodeCompletionContext>(chunks: readonly Lexer.ContentChunk[], makeCompletions: Lexer.MakeCompletions<CCC>): Lexer.AutoCompleteDetails<CCC>[]
    {
        const acd: Lexer.AutoCompleteDetails<CCC>[] = [];

        // An expression can be viewed as a list of chunks of different types:
        //   - Ident
        //   - Keyword (i.e. something beginning with @, or a bracket)
        //   - Operator
        //   - Nested literal
        // There can never be two adjacent ident chunks, because they would be treated as one ident chunk.
        // There can be issues with overlapping or missing completions.  For example, if you have:
        //   abs((1+2)/3)
        // We don't want to suddenly show the completion "sqrt" between abs and the first opening bracket, because it's not
        // a match for the stem abs.  However, we do want to show the sqrt completion between the two opening brackets.
        // Another issue is that we don't want to display operators immediately at the beginning, nor just after
        // an opening bracket.  We do want to show them after the 'a', 'b' and 's' in abs.  But after the +,
        // we only want to show the +- completion, because it's the only one prefixed by the earlier operator.
        // So here's the plan:
        //   - When calculating completions, we need to know if we were preceded by an ident.
        //     - If yes, do not show any completions at all in first spot (ident will handle that).
        //     - If false, do we follow an opening bracket/keyword, operator or closing bracket/keyword?
        //       - If opening or operator, do not show any operators in first spot (we either follow a bracket, or we follow an operator which will sort itself out)
        //       - If closing, do show operators in first spot
        // So, we need to categorise previous chunk into:
        //   - Ident
        //   - Opening keyword/bracket (including partial keywords and operators)
        //   - Closing keyword/bracket
        //   - Nested
        let curPos: CanonicalLocation = 0;
        let prevChunkType = Lexer.ChunkType.OPENING;
        for (const chunk of chunks)
        {
            //Log.debug("Chunk: {" + chunk.internalContent + "} type: " + chunk.chunkType);

            const nextPos: CanonicalLocation = curPos + chunk.internalContent.length;
            if (chunk.chunkType !== Lexer.ChunkType.NESTED)
            {
                const start: CanonicalLocation = curPos;
                const location = new CanonicalSpan(start, chunk.chunkType === Lexer.ChunkType.NESTED_START ? start : nextPos);
                const context = makeCompletions(chunk.internalContent, curPos, chunk.chunkType, prevChunkType);
                acd.push(new Lexer.AutoCompleteDetails(location, context));
            }

            curPos = nextPos;
            prevChunkType = chunk.chunkType;
        }
        if (prevChunkType !== Lexer.ChunkType.IDENT)
        {
            // Add completions beyond last item:
            const location = new CanonicalSpan(curPos, curPos);
            const context = makeCompletions("", curPos, Lexer.ChunkType.IDENT, prevChunkType);
            acd.push(new Lexer.AutoCompleteDetails(location, context));
        }

        return acd;
    }

    protected static rawLength(content: string): RawInputLocation
    {
        return content.length;
    }

    // Takes latest content, lexes it, returns result
    public abstract process(content: string, caretPos: RawInputLocation | null, insertListener: InsertListener): Lexer.LexerResult<EXPRESSION, CODE_COMPLETION_CONTEXT>;

    protected static padZeroWidthErrors(display: StyledString, caretPos: Lexer.LexerResult.CaretPos[], errors: readonly EditorLocationAndErrorRecorder.ErrorDetails[]): StyledString
    {

        // Important to go through in order so that later errors can be
        // adjusted correctly according to earlier errors.

        // (Java's sort is stable)
        for (const error of [...errors].sort((a, b) => a.location.start - b.location.start))
        {
            // If an error only occupies one caret position, add an extra char there:
            if (error.location.start === error.location.end && (error.displayLocation === null || error.displayLocation.start === error.displayLocation.end))
            {
                // Find caret pos:
                let displayOffset: DisplayLocation = 0;
                for (let i = 0; i < caretPos.length; i++)
                {
                    if (displayOffset !== 0)
                    {
                        caretPos[i] = new Lexer.LexerResult.CaretPos(caretPos[i]!.positionInternal, caretPos[i]!.positionDisplay + displayOffset);
                    }
                    else
                    {
                        const p = caretPos[i]!;

                        if (p.positionInternal === error.location.start)
                        {
                            error.displayLocation = new EditorLocationAndErrorRecorder.DisplaySpan(p.positionDisplay, p.positionDisplay + 1);
                            // Add space to display:
                            display = StyledString.concat(display.substring(0, p.positionDisplay), StyledString.s(" "), display.substring(p.positionDisplay, display.getLength()));
                            // And offset future caret pos display by one:
                            displayOffset += 1;
                        }
                    }
                }
            }
        }
        return display;
    }
}

export namespace Lexer
{
    // Java: an interface with one method, makeCompletions(chunk, canonIndex, curChunk, precedingChunk)
    export type MakeCompletions<CCC extends CodeCompletionContext> = (chunk: string, canonIndex: CanonicalLocation, curChunk: ChunkType, precedingChunk: ChunkType) => CCC;

    /** @internal Java: package-visible */
    export class LexerResult<EXPRESSION extends StyledShowable, CODE_COMPLETION_CONTEXT extends CodeCompletionContext>
    {
        // Save result of parsing the content.  Never null because we save invalid items:
        public readonly result: EXPRESSION;
        // The internal canonical content after parsing:
        public readonly adjustedContent: string;
        // The removed characters (indexes in original string to process):
        public readonly removedChars: RemovedCharacters;
        public readonly reLexOnCaretMove: boolean;
        // Valid caret positions
        public readonly caretPositions: readonly LexerResult.CaretPos[];
        public readonly wordBoundaryCaretPositions: readonly CanonicalLocation[];
        // The content to display in the TextFlow
        public readonly display: StyledString;

        public readonly errors: readonly EditorLocationAndErrorRecorder.ErrorDetails[];
        // For added nested recorded locations to the outer recorder
        public readonly locationRecorder: EditorLocationAndErrorRecorder;
        public readonly autoCompleteDetails: readonly AutoCompleteDetails<CODE_COMPLETION_CONTEXT>[];
        // If a bit is set at a particular caret position, when the user
        // types a ({[ opening bracket then do not insert the closing bracket.
        public readonly suppressBracketMatching: BitSet;
        public readonly bracketsAreBalanced: boolean;
        public readonly infoAndPromptForPosition: (position: CanonicalLocation, toRightOf: unknown) => ReadonlyMap<TopLevelEditor.DisplayType, Pair<StyledString, readonly TextQuickFix[]>>;

        public constructor(result: EXPRESSION, adjustedContent: string, removedChars: RemovedCharacters, reLexOnCaretMove: boolean, caretPositions: readonly LexerResult.CaretPos[], wordBoundaryCaretPositions: readonly CanonicalLocation[], display: StyledString, errors: readonly EditorLocationAndErrorRecorder.ErrorDetails[], locationRecorder: EditorLocationAndErrorRecorder, completeDetails: readonly AutoCompleteDetails<CODE_COMPLETION_CONTEXT>[], suppressBracketMatching: BitSet, bracketsBalanced: boolean, infoAndPromptForPosition: (position: CanonicalLocation, toRightOf: unknown) => ReadonlyMap<TopLevelEditor.DisplayType, Pair<StyledString, readonly TextQuickFix[]>>)
        {
            this.result = result;
            this.adjustedContent = adjustedContent;
            this.reLexOnCaretMove = reLexOnCaretMove;
            this.removedChars = removedChars;
            this.caretPositions = caretPositions;
            this.wordBoundaryCaretPositions = wordBoundaryCaretPositions;
            this.display = display;
            this.errors = errors;
            this.locationRecorder = locationRecorder;
            this.autoCompleteDetails = completeDetails;
            this.suppressBracketMatching = suppressBracketMatching;
            this.bracketsAreBalanced = bracketsBalanced;
            this.infoAndPromptForPosition = infoAndPromptForPosition;
            if (errors.length !== 0)
                Log.debug("Showing errors: " + Utility.listToString(errors));
        }

        public getCompletionsFor(pos: CanonicalLocation): LexCompletionGroup[]
        {
            return this.autoCompleteDetails.filter(a => a.location.touches(pos)).flatMap(a => a.codeCompletionContext.getCompletionsFor(pos));
        }

        public mapContentToDisplay(contentPos: CanonicalLocation): DisplayLocation
        {
            // We assume that the position is a caret position when mapping from content
            for (const caretPosition of this.caretPositions)
            {
                if (caretPosition.positionInternal === contentPos)
                    return caretPosition.positionDisplay;
            }
            // Uh-oh!  Inaccurate, but will do as a fallback:
            Log.logStackTrace("Trying to find non-caret content position " + contentPos + " in {{{" + this.adjustedContent + "}}} positions are: " + Utility.listToString(this.caretPositions));
            const fallback: DisplayLocation = contentPos;
            return fallback;
        }

        public mapDisplayToContent(clickedCaret: DisplayLocation, biasEarlier: boolean): CanonicalLocation
        {
            // Shouldn't happen, but try to stay sane:
            if (this.caretPositions.length === 0)
            {
                const zero: CanonicalLocation = 0;
                return zero;
            }
            // We need to find the nearest display caret position
            // If it's a draw, use biasEarlier to pick
            let prevDist = Math.abs(this.caretPositions[0]!.positionDisplay - clickedCaret);
            for (let i = 1; i < this.caretPositions.length; i++)
            {
                const curDist = Math.abs(this.caretPositions[i]!.positionDisplay - clickedCaret);
                if (curDist > prevDist)
                    return this.caretPositions[i - 1]!.positionInternal;
                else if (curDist === prevDist)
                    return this.caretPositions[biasEarlier ? i - 1 : i]!.positionInternal;

                prevDist = curDist;
            }
            // Must be last one then:
            return this.caretPositions[this.caretPositions.length - 1]!.positionInternal;
        }
    }

    export namespace LexerResult
    {
        export class CaretPos
        {
            public readonly positionInternal: CanonicalLocation;
            public readonly positionDisplay: DisplayLocation;

            public constructor(positionInternal: CanonicalLocation, positionDisplay: DisplayLocation)
            {
                this.positionInternal = positionInternal;
                this.positionDisplay = positionDisplay;
            }

            public toString(): string
            {
                return "(internal=" + this.positionInternal +
                        ", display=" + this.positionDisplay +
                        ")";
            }
        }
    }

    export class AutoCompleteDetails<CODE_COMPLETION_CONTEXT extends CodeCompletionContext>
    {
        public readonly location: CanonicalSpan;
        public readonly codeCompletionContext: CODE_COMPLETION_CONTEXT;

        public constructor(location: CanonicalSpan, codeCompletionContext: CODE_COMPLETION_CONTEXT)
        {
            this.location = location;
            this.codeCompletionContext = codeCompletionContext;
        }
    }

    // Helper class for implementations
    /** @internal Java: package-visible */
    export class RemovedCharacters
    {
        // Indexes are in RawInputLocation
        private readonly removedChars = new BitSet();

        // Java: map(location), map(startIncl, endExcl) and map(startIncl, skipString)
        public map(location: RawInputLocation): CanonicalLocation;
        public map(startIncl: RawInputLocation, endExclOrSkipString: RawInputLocation | string): CanonicalSpan;
        public map(location: RawInputLocation, b?: RawInputLocation | string): CanonicalLocation | CanonicalSpan
        {
            if (b === undefined)
            {
                // location - removedChars.get(0, location).cardinality()
                let removedBefore = 0;
                for (let bit = this.removedChars.nextSetBit(0); bit !== -1 && bit < location; bit = this.removedChars.nextSetBit(bit + 1))
                    removedBefore++;
                return location - removedBefore;
            }
            if (typeof b === "string")
            {
                const length: RawInputLocation = b.length;
                return new CanonicalSpan(this.map(location), this.map(location + length));
            }
            return new CanonicalSpan(this.map(location), this.map(b));
        }

        public set(index: RawInputLocation): void
        {
            this.removedChars.set(index);
        }

        // Effectively does: this = this | (src << shiftBy)
        public orShift(src: RemovedCharacters, shiftBy: number): void
        {
            for (let srcBit = src.removedChars.nextSetBit(0); srcBit !== -1; srcBit = src.removedChars.nextSetBit(srcBit + 1))
            {
                this.removedChars.set(srcBit + shiftBy);
            }
        }

        public setAll(consumed: IdentifierUtility.Consumed<unknown>): void
        {
            consumed.removedCharacters.forEach(c => this.set(c));
        }
    }

    export enum ChunkType
    {
        IDENT, OPENING, CLOSING, NESTED, NESTED_START,
    }

    export class ContentChunk
    {
        /** @internal Java: protected, used by the lexers */ public readonly internalContent: string;
        // Positions are relative to this chunk:
        /** @internal */ public readonly caretPositions: readonly LexerResult.CaretPos[];
        /** @internal */ public readonly wordBoundaryCaretPositions: readonly CanonicalLocation[];
        /** @internal */ public readonly displayContent: StyledString;
        /** @internal */ public readonly chunkType: ChunkType;

        /**
         * Java has four constructors:
         *  - (simpleContent, chunkType, String... styleClasses)
         *  - (simpleContent, StyledString styledString, chunkType)
         *  - (boolean addLeadingSpace, ExpressionToken specialContent, chunkType, boolean addTrailingSpace):
         *    a special keyword/operator that has no valid caret positions except at ends, and optionally pads with spaces
         *  - (internalContent, displayContent, caretPositions, wordBoundaryCaretPositions, chunkType)
         */
        public constructor(simpleContent: string, chunkType: ChunkType, ...styleClasses: string[]);
        public constructor(simpleContent: string, styledString: StyledString, chunkType: ChunkType);
        public constructor(addLeadingSpace: boolean, specialContent: ExpressionToken, chunkType: ChunkType, addTrailingSpace: boolean);
        public constructor(internalContent: string, displayContent: StyledString, caretPositions: readonly LexerResult.CaretPos[], wordBoundaryCaretPositions: readonly CanonicalLocation[], chunkType: ChunkType);
        public constructor(...args: unknown[])
        {
            if (typeof args[0] === "boolean")
            {
                const [addLeadingSpace, specialContent, chunkType, addTrailingSpace] = args as [boolean, ExpressionToken, ChunkType, boolean];
                this.internalContent = specialContent.getContent();
                this.displayContent = StyledString.concat(StyledString.s(addLeadingSpace ? " " : ""), specialContent.toStyledString(), StyledString.s(addTrailingSpace ? " " : ""));
                this.caretPositions = [new LexerResult.CaretPos(0, 0), new LexerResult.CaretPos(specialContent.getContent().length, this.displayContent.getLength())];
                this.wordBoundaryCaretPositions = Utility.mapListI(this.caretPositions, p => p.positionInternal);
                this.chunkType = chunkType;
            }
            else if (args.length === 5)
            {
                const [internalContent, displayContent, caretPositions, wordBoundaryCaretPositions, chunkType] = args as [string, StyledString, readonly LexerResult.CaretPos[], readonly CanonicalLocation[], ChunkType];
                this.internalContent = internalContent;
                this.caretPositions = caretPositions;
                this.wordBoundaryCaretPositions = wordBoundaryCaretPositions;
                this.displayContent = displayContent;
                this.chunkType = chunkType;
            }
            else
            {
                const simpleContent = args[0] as string;
                let styledString: StyledString;
                let chunkType: ChunkType;
                if (args[1] instanceof StyledString)
                {
                    styledString = args[1];
                    chunkType = args[2] as ChunkType;
                }
                else
                {
                    chunkType = args[1] as ChunkType;
                    styledString = StyledString.s(simpleContent).withStyle(new StyledCSS(...(args.slice(2) as string[])));
                }
                this.internalContent = simpleContent;
                this.displayContent = styledString;
                this.caretPositions = Array.from({ length: simpleContent.length + 1 }, (_x, i) => new LexerResult.CaretPos(i, i));
                this.wordBoundaryCaretPositions = [0, simpleContent.length];
                this.chunkType = chunkType;
            }
        }
    }
}
