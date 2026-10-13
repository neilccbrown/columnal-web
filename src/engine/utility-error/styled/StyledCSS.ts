// Port of xyz.columnal.styled.StyledCSS (utility-error module).
import { StyledString, type StyleTarget } from "./StyledString.js";

/**
 * A Style for StyledString that applies a set of CSS classes.
 */
export class StyledCSS extends StyledString.Style<StyledCSS>
{
    private readonly styles: ReadonlySet<string>;

    // Java has two constructors: StyledCSS(ImmutableSet<String>) and StyledCSS(String...)
    constructor(...styleClasses: string[] | [ReadonlySet<string>])
    {
        super(StyledCSS);
        this.styles = typeof styleClasses[0] === "object" ? styleClasses[0] : new Set(styleClasses as string[]);
    }

    public override applyTo(target: StyleTarget): void
    {
        for (const s of this.styles)
            target.classes.add(s);
    }

    public override combine(withStyle: StyledCSS): StyledCSS
    {
        return new StyledCSS(new Set([...this.styles, ...withStyle.styles]));
    }

    protected override equalsStyle(item: StyledCSS): boolean
    {
        return this.styles.size === item.styles.size && [...this.styles].every(s => item.styles.has(s));
    }
}
