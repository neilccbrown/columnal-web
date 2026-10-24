// Port of xyz.columnal.gui.dtf.ReadOnlyDocument (stf module).
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import { Document } from "./Document.js";

export class ReadOnlyDocument extends Document
{
    private readonly error: boolean;
    private readonly content: readonly Pair<ReadonlySet<string>, string>[];

    /*public ReadOnlyDocument(ImmutableList<Pair<Set<String>, String>> content)
    {
        this.content = content;
    }*/

    // Java has two constructors: (content, error) and (content), which has no error.
    public constructor(content: string, error: boolean = false)
    {
        super();
        this.content = [new Pair<ReadonlySet<string>, string>(new Set<string>(), content)];
        this.error = error;
    }

    public override getStyledSpans(_focused: boolean): Pair<ReadonlySet<string>, string>[]
    {
        return [...this.content];
    }

    public override replaceText(_startPosIncl: number, _endPosExcl: number, _text: string): void
    {
        // We're read-only, so do nothing
    }

    public override trackPosition(pos: number, bias: Document.TrackedPosition.Bias, onChange: (() => void) | null): Document.TrackedPosition
    {
        // No need to actually track; if content can't change, neither can positions:
        return new Document.TrackedPosition(pos, bias, onChange);
    }

    public override getLength(): number
    {
        return this.content.reduce((sum, p) => sum + p.getSecond().length, 0);
    }

    public override isEditable(): boolean
    {
        return false;
    }

    public override getText(): string
    {
        return this.content.map(p => p.getSecond()).join("");
    }

    public override hasError(): boolean
    {
        return this.error;
    }

    public override focusChanged(_focused: boolean): void
    {
    }

    public override setAndSave(_content: string): void
    {
        // Not applicable
    }
}
