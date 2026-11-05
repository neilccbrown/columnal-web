// Ported from the Java original: embedded actions and predicates translated to TypeScript.
parser grammar UnitParser;

options { tokenVocab = UnitLexer; }

singleUnit : IDENT | UNITVAR WS IDENT;
single : singleUnit (WS? POWER WS? NUMBER)? | ({this.tokenStream.LT(1)?.text === "1"}? NUMBER);
divideBy : (WS? DIVIDE WS? unit);
timesBy : WS? TIMES WS? unit;
unbracketedUnit : unit (divideBy | timesBy+)?;
unit : single | OPEN_BRACKET WS? unbracketedUnit WS? CLOSE_BRACKET;

unitUse : WS? unbracketedUnit WS? EOF;

// Port addition: a unit as UnitExpression saves it, including the forms the expression editor saves
// invalid units in (unfinished parts, invalid operators, whole numbers other than 1 and any powers),
// which Java's grammar lacked, so a unit saved with them couldn't be loaded.  (Separate from unit, so
// that the units of types and files are read as before.)
editUnitUse : WS? editUnbracketed WS? EOF;
editUnbracketed : editRaised ((WS? DIVIDE WS? editRaised) | (WS? TIMES WS? editRaised)+)?;
editRaised : editBase (WS? POWER WS? editRaised)?;
editBase : singleUnit | NUMBER | OPEN_BRACKET WS? editUnbracketed WS? CLOSE_BRACKET | invalidOps | unfinished;
invalidOps : INVALIDOPS WS? OPEN_BRACKET WS? (editUnbracketed WS? (COMMA WS? editUnbracketed WS?)*)? CLOSE_BRACKET;
unfinished : UNFINISHED WS? STRING;

aliasDeclaration : ALIAS WS singleUnit WS? EQUALS WS? singleUnit NEWLINE;

display : (PREFIX | SUFFIX) WS? STRING;

// n ^ m
scalePower : NUMBER (WS? POWER WS? NUMBER)?;
// scalePower with optional divide by scalePower 
scale : scalePower (WS? DIVIDE WS? scalePower)?;

fullScale: WS? scale WS? EOF;

unitDeclaration : UNIT WS singleUnit WS STRING WS? display* (EQUALS WS? (scale WS? TIMES WS?)? unbracketedUnit WS?)? NEWLINE;

declaration : aliasDeclaration | unitDeclaration;

category : CATEGORY WS STRING NEWLINE;
blankLine : WS? NEWLINE;
fileItem : declaration | category;
file : blankLine* (fileItem blankLine*)* EOF;
