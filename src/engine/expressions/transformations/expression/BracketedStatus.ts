// Port of xyz.columnal.transformations.expression.BracketedStatus (expressions module).

export enum BracketedStatus
{
    /** Top level in an expression, i.e. you don't need brackets around an operator expression, although you will do around a tuple */
    DONT_NEED_BRACKETS,
    /* Normal state: you do need brackets around expressions */
    NEED_BRACKETS,
}
