// Port of xyz.columnal.transformations.expression.Replaceable (expressions module).

export interface Replaceable<EXPRESSION>
{
    // Important: use reference comparison, not .equals().  And check against yourself as well as sub-expressions
    replaceSubExpression(toReplace: EXPRESSION, replaceWith: EXPRESSION): EXPRESSION;
}
