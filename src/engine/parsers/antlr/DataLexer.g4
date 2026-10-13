// Ported from the Java original: embedded actions and predicates translated to TypeScript. GrammarUtility is imported by the @header inherited from StringLexerShared.
lexer grammar DataLexer;

import StringLexerShared;

WS : ( ' ' | '\t' )+ ;

COMMA: ',';

POSITIVE_INTEGER : [0-9]+;
DOT: '.';

NEWLINE : '\r'? '\n' ;

TRUE: 'true';
FALSE: 'false';
OPEN_ROUND : '(';
CLOSE_ROUND : ')';
OPEN_SQUARE : '[';
CLOSE_SQUARE : ']';
SLASH : '/';
PLUS : '+';
MINUS : '-';
COLON: ':';

INVALID: '@INVALID';

UNQUOTED_IDENT : ~[ \t\n\r"()@+\-/*&|=?:;~$!<>\\,[\]0-9] ~[ \t\n\r"()@+\-/*&|=?:;~$!<>\\,[\]]* {GrammarUtility.validUnquoted(this.text)}?;



