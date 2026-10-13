// Ported from the Java original: embedded actions and predicates translated to TypeScript. Unicode property \p{Alpha} renamed to \p{Alphabetic} and \p{Digit} to \p{Nd} (same sets in Java ANTLR; antlr-ng lacks those aliases).
lexer grammar ExpressionLexer;

RAW_STRING : ('"' (~[\n\r"])*? '"')
    { const orig = this.text; this.text = orig.substring(1, orig.length - 1); };
WS : ( ' ' | '\t' )+ -> skip ;

OPEN_BRACKET : '(';
CLOSE_BRACKET : ')';
OPEN_SQUARE : '[';
CLOSE_SQUARE : ']';

// From https://stackoverflow.com/a/29247186
CUSTOM_LITERAL : [a-zA-Z]+ CURLIED;
CURLIED : '{' (CURLIED|.)*? '}';

PLUS_MINUS: '\u00B1';
ADD_OR_SUBTRACT: [+\-];
TIMES: '*';
DIVIDE: '/';
AND: '&';
OR: '|';
EQUALITY : '=';
EQUALITY_PATTERN : '=~';
NON_EQUALITY : '<>';
LESS_THAN: '<=' | '<';
GREATER_THAN: '>=' | '>';
COLUMN : '@column';
WHOLECOLUMN: '@entire';
MATCH : '@match';
ENDMATCH : '@endmatch';
CASE : '@case';
SCOPE : '\\';
COLON: ':';
ORCASE : '@orcase';
IF : '@if';
THEN : '@then';
ELSE : '@else';
ENDIF : '@endif';
CASEGUARD: '@given';
FUNCTION : '@function';
ENDFUNCTION : '@endfunction';
ANYTHING : '_';
UNFINISHED : '@unfinished';
INVALIDOPS : '@invalidops';
INVALIDEXP : '@invalidexp';
CONSTRUCTOR : '@tag';
CALL: '@call'; 
RAISEDTO : '^';
COMMA: ',';
STRING_CONCAT : ';';
IMPLICIT_LAMBDA_PARAM : '?';
DEFINE: '@define';
ENDDEFINE: '@enddefine';
HAS_TYPE: '::';
FIELD_ACCESS : '#';

NUMBER : [0-9]+ ('.' [0-9]+)?;

TRUE: 'true';
FALSE: 'false';
  
IDENT : [\p{Alphabetic}\p{General_Category=Other_Letter}] (('_' | ' ')? [\p{Alphabetic}\p{Nd}\p{General_Category=Other_Letter}])*;

