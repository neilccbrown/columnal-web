// Ported from the Java original: rules "match", "terminal" and "constructor" renamed to "matchExpression", "terminalExpression" and "constructorExpression" (TypeScript cannot overload Parser.match or ParseTreeVisitor.visitTerminal, and antlr-ng does not escape the "constructor" child accessor).
parser grammar ExpressionParser;

options { tokenVocab = ExpressionLexer; }

ident : IDENT;

tableId : ident;
columnId : ident;
columnRefType : COLUMN | WHOLECOLUMN;
columnRef : columnRefType (tableId SCOPE)? columnId;

numericLiteral : ADD_OR_SUBTRACT? NUMBER CURLIED?;
stringLiteral : RAW_STRING;
booleanLiteral : TRUE | FALSE;
unfinished : UNFINISHED RAW_STRING;

varRef  : ident;

any : ANYTHING;

implicitLambdaParam : IMPLICIT_LAMBDA_PARAM;
customLiteralExpression : CUSTOM_LITERAL;


// newVariable only valid in pattern matches, but that's done in semantic check, not syntactic:
// Similar,y constructor may need an argument, but that's sorted out in type checking.
terminalExpression : columnRef | numericLiteral | stringLiteral | booleanLiteral | varRef | any | implicitLambdaParam | constructorExpression | standardFunction | customLiteralExpression | unfinished;

// Could have units in ops:
//plusMinusExpression :  expression PLUS_MINUS UNIT? expression (PLUS_MINUS expression)*;
//timesExpression :  expression TIMES UNIT? expression (TIMES expression)*;
//divideExpression :  expression DIVIDE UNIT? expression;

addSubtractExpression :  expression (ADD_OR_SUBTRACT expression)+;
timesExpression :  expression (TIMES expression)+;
divideExpression :  expression DIVIDE expression;
raisedExpression : expression RAISEDTO expression;
equalExpression :  expression ((EQUALITY expression)+ | (EQUALITY_PATTERN expression));
notEqualExpression :  expression NON_EQUALITY expression;
lessThanExpression :  expression (LESS_THAN expression)+;
greaterThanExpression :  expression (GREATER_THAN expression)+;
andExpression :  expression (AND expression)+;
orExpression :  expression (OR expression)+;
ifThenElseExpression : IF topLevelExpression THEN topLevelExpression ELSE topLevelExpression ENDIF;
plusMinusPattern : expression PLUS_MINUS expression;
anyOperator : ADD_OR_SUBTRACT | TIMES | DIVIDE | RAISEDTO | EQUALITY | NON_EQUALITY | LESS_THAN | GREATER_THAN | AND | OR | PLUS_MINUS | COMMA;
stringConcatExpression : expression (STRING_CONCAT expression)+;
fieldAccessExpression : expression FIELD_ACCESS ident;
compoundExpression : addSubtractExpression | timesExpression | divideExpression | raisedExpression | equalExpression | notEqualExpression | lessThanExpression | greaterThanExpression | andExpression | orExpression | plusMinusPattern | stringConcatExpression | fieldAccessExpression;

invalidOpItem : expression;
invalidOpExpression : INVALIDOPS OPEN_BRACKET (invalidOpItem (COMMA invalidOpItem)*)? CLOSE_BRACKET;

constructorExpression : CONSTRUCTOR typeName SCOPE constructorName;

standardFunction : FUNCTION ident;
callTarget : varRef | standardFunction | constructorExpression | unfinished;
callExpression : CALL callTarget OPEN_BRACKET (topLevelExpression (COMMA topLevelExpression)*) CLOSE_BRACKET;

recordExpression : OPEN_BRACKET ident COLON topLevelExpression (COMMA ident COLON topLevelExpression)* CLOSE_BRACKET;
arrayExpression : OPEN_SQUARE (topLevelExpression (COMMA topLevelExpression)*)? CLOSE_SQUARE;

typeName : ident;
constructorName : ident;
pattern : topLevelExpression (CASEGUARD topLevelExpression)?;

/* Single argument, matched once as variable name or tuple pattern */
// functionArg : (newVariable | patternTuple) COLON expression;
/* Single argument, matched by multiple cases (equivalent to FUNCTION x : @match x) */
// functionCase : matchClause+;
//function: FUNCTION (functionArg | functionCase);

matchClause : CASE pattern (ORCASE pattern)* THEN topLevelExpression;
matchExpression : MATCH topLevelExpression matchClause+ ENDMATCH;

lambdaExpression : FUNCTION OPEN_BRACKET topLevelExpression (COMMA topLevelExpression)* CLOSE_BRACKET THEN topLevelExpression ENDFUNCTION;

hasTypeExpression : varRef HAS_TYPE customLiteralExpression;
definition : (expression EQUALITY expression) | hasTypeExpression;
defineExpression: DEFINE definition (COMMA definition)* THEN topLevelExpression ENDDEFINE;

bracketedExpression : OPEN_BRACKET topLevelExpression CLOSE_BRACKET;
// callExpression doesn't need brackets because the constructor means it's identifiable from its left token.  Same for fixTypeExpression and constructor
expression : bracketedExpression | terminalExpression | callExpression | recordExpression | arrayExpression | ifThenElseExpression | matchExpression | defineExpression | lambdaExpression | invalidOpExpression;
topLevelExpression : compoundExpression | expression /* includes terminalExpression */;

completeExpression: topLevelExpression EOF;

completeBooleanLiteral : booleanLiteral EOF;
completeNumber : NUMBER EOF;
