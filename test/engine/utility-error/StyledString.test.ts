import { describe, expect, test } from "vitest";
import { CommonStyles } from "../../../src/engine/utility-error/styled/CommonStyles.js";
import { StyledCSS } from "../../../src/engine/utility-error/styled/StyledCSS.js";
import { StyledString, type StyleTarget } from "../../../src/engine/utility-error/styled/StyledString.js";

function render(s: StyledString): string[]
{
    const out: string[] = [];
    s.forEach((styles, text) =>
    {
        const target: StyleTarget = { classes: new Set(), inlineStyles: new Map() };
        styles.forEach(st => st.applyTo(target));
        out.push(`${text}|${[...target.classes].join(",")}|${[...target.inlineStyles].map(([k, v]) => k + ":" + v).join(";")}`);
    });
    return out;
}

describe("StyledString", () =>
{
    test("concat, plain text and equality", () =>
    {
        const s = StyledString.concat(StyledString.s("ab"), StyledString.styled("cd", CommonStyles.ITALIC), StyledString.s(""));
        expect(s.toPlain()).toBe("abcd");
        expect(s.getLength()).toBe(4);
        expect(s.equals(StyledString.concat(StyledString.s("ab"), StyledString.styled("cd", CommonStyles.ITALIC)))).toBe(true);
        expect(s.equals(StyledString.s("abcd"))).toBe(false);
        expect(render(s)).toEqual(["ab||", "cd||font-style:italic"]);
    });

    test("withStyle merges styles of the same class", () =>
    {
        const s = StyledString.styled("x", new StyledCSS("a")).withStyle(new StyledCSS("b")).withStyle(CommonStyles.ITALIC);
        expect(render(s)).toEqual(["x|a,b|font-style:italic"]);
    });

    test("substring and limit", () =>
    {
        const s = StyledString.concat(StyledString.s("abc"), StyledString.styled("def", new StyledCSS("k")));
        expect(s.substring(1, 5).toPlain()).toBe("bcde");
        expect(s.limit(4).toPlain()).toBe("abc…");
        expect(s.limit(10)).toBe(s);
    });

    test("joining and builders", () =>
    {
        expect(StyledString.joining([StyledString.s("a"), StyledString.s("b")], ", ").toPlain()).toBe("a, b");
        expect(StyledString.builder().append("a").append(StyledString.s("b")).build().toPlain()).toBe("ab");
        expect(StyledString.fancyQuote(StyledString.s("q")).toPlain()).toBe("“q”");
    });
});
