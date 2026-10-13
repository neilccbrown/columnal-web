// Ported from the Java original: embedded actions and predicates translated to TypeScript.
lexer grammar MainLexer2;

@header {
import { javaTrim } from "../../java/JavaString.js";
}

import BasicLexer;

@members {
    private currentPrefix = "";
}

DETAIL_BEGIN : '@BEGIN' ' '* ([A-Z][A-Z]+) ' '* '\r'? '\n' {this.currentPrefix = javaTrim(this.text.substring("@BEGIN".length)); } -> pushMode(DETAIL);
VERSION : 'VERSION';
SOFTWARE : 'COLUMNAL';

mode DETAIL;
DETAIL_LINE: (~[\n\r])* '\r'? '\n' {javaTrim(this.text).startsWith(this.currentPrefix)}? {this.text = javaTrim(javaTrim(this.text).substring(this.currentPrefix.length));};
DETAIL_END: '@END' ' '* ([A-Z][A-Z]+) {this.text.endsWith(this.currentPrefix)}? -> popMode;
