// Ported from the Java original: embedded actions and predicates translated to TypeScript.
lexer grammar MainLexer;

@header {
import { javaTrim } from "../../java/JavaString.js";
}

import BasicLexer;

@members {
    private currentPrefix = "";
}

DATA : 'DATA';
TEXTFILE : 'TEXTFILE';
LINKED : 'LINKED';
END : '@END';
BEGIN : '@BEGIN' ' '* ([A-Z][A-Z]+)? '\r'? '\n' {this.currentPrefix = javaTrim(this.text.substring("@BEGIN".length)); } -> pushMode(DETAIL);
TRANSFORMATION: 'TRANSFORMATION';
SOURCE: 'SOURCE';
FORMAT : 'FORMAT';
VALUES : 'VALUES';
SKIPROWS : 'SKIP';
TYPES : 'TYPES';
VERSION : 'VERSION';
UNITS : 'UNITS';
DISPLAY : 'DISPLAY';
SOFTWARE : 'COLUMNAL';
COMMENT : 'COMMENT';
CONTENT : 'CONTENT';



mode DETAIL;
DETAIL_END: ([A-Z][A-Z]+)? ' '* '@END' {this.text.startsWith(this.currentPrefix) && javaTrim(this.text.substring(this.currentPrefix.length)) === "@END"}? -> popMode;
DETAIL_LINE: (~[\n\r])* '\r'? '\n' {this.text.startsWith(this.currentPrefix) && !javaTrim(this.text.substring(this.currentPrefix.length)).startsWith("@END")}? {this.text = this.text.substring(this.currentPrefix.length);};
