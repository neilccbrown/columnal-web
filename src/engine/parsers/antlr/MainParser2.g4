// Ported from the Java original: embedded actions and predicates translated to TypeScript.
parser grammar MainParser2;

options { tokenVocab = MainLexer2; }

@members {
    private currentContent: string | undefined;
}

item : ~NEWLINE;

detailLine : DETAIL_LINE;
detail: DETAIL_BEGIN detailLine* DETAIL_END;
blank : NEWLINE;

content : { this.currentContent = this.getCurrentToken().text; } ATOM detail { this.getCurrentToken().text === this.currentContent }? ATOM NEWLINE; 

file : SOFTWARE NEWLINE VERSION item NEWLINE blank* (content blank*)* EOF;
