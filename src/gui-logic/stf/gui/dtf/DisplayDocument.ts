// Port of xyz.columnal.gui.dtf.DisplayDocument (stf module).
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import { Document } from "./Document.js";

/**
 * A basic document that tracks positions and can be edited.
 */
export abstract class DisplayDocument extends Document
{
    private content: string;
    // Java: a list of WeakReferences, so positions that are no longer used are dropped
    private readonly trackedPositions: WeakRef<Document.TrackedPosition>[] = [];

    public constructor(content: string)
    {
        super();
        this.content = content;
    }

    public override getStyledSpans(_focused: boolean): Pair<ReadonlySet<string>, string>[]
    {
        return [new Pair<ReadonlySet<string>, string>(new Set<string>(), this.content)];
    }

    public override replaceText(startPosIncl: number, endPosExcl: number, text: string): void
    {
        this.content = this.content.substring(0, startPosIncl) + text + this.content.substring(endPosExcl);
        for (let i = 0; i < this.trackedPositions.length;)
        {
            const trackedPosition = this.trackedPositions[i]!.deref();
            if (trackedPosition === undefined)
                this.trackedPositions.splice(i, 1);
            else
            {
                if (trackedPosition.getPosition() >= startPosIncl)
                {
                    if (trackedPosition.getPosition() <= endPosExcl)
                    {
                        trackedPosition.moveTo(trackedPosition.getBias() === Document.TrackedPosition.Bias.FORWARD ? startPosIncl + text.length : startPosIncl);
                    }
                    else
                    {
                        trackedPosition.moveBy(text.length - (endPosExcl - startPosIncl));
                    }
                }
                i++;
            }

        }

        this.notifyListeners();
    }

    public override trackPosition(pos: number, bias: Document.TrackedPosition.Bias, onChange: (() => void) | null): Document.TrackedPosition
    {
        const trackedPosition = new Document.TrackedPosition(pos, bias, onChange);
        this.trackedPositions.push(new WeakRef(trackedPosition));
        return trackedPosition;
    }

    public override getLength(): number
    {
        return this.content.length;
    }

    public override isEditable(): boolean
    {
        return true;
    }

    public override getText(): string
    {
        return this.content;
    }

    public override hasError(): boolean
    {
        return false;
    }

    public override focusChanged(_focused: boolean): void
    {
    }
}
