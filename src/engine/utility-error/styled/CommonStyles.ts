// Port of xyz.columnal.styled.CommonStyles (utility-error module).
import { StyledString, type StyleTarget } from "./StyledString.js";

abstract class BasicStyle<S extends BasicStyle<S>> extends StyledString.Style<S>
{
    public override combine(withStyle: S): S
    {
        return withStyle;
    }

    protected override equalsStyle(_item: S): boolean
    {
        return true;
    }
}

class Italic extends BasicStyle<Italic>
{
    public constructor()
    {
        super(Italic);
    }

    public override applyTo(target: StyleTarget): void
    {
        target.inlineStyles.set("font-style", "italic");
    }
}

class Monospace extends BasicStyle<Monospace>
{
    public constructor()
    {
        super(Monospace);
    }

    public override applyTo(_target: StyleTarget): void
    {
        // TODO
    }
}

export class CommonStyles
{
    public static readonly ITALIC = new Italic();
    public static readonly MONOSPACE = new Monospace();
}
