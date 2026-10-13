// Ported from the Java original: embedded actions and predicates translated to TypeScript.
parser grammar TransformationParser;

options { tokenVocab = TransformationLexer; }

item : ATOM | STRING;

expression: EXPRESSION_BEGIN EXPRESSION EXPRESSION_END;
value: VALUE_BEGIN VALUE VALUE_END | INVALID_VALUE_BEGIN VALUE VALUE_END;
type: TYPE_BEGIN TYPE TYPE_END;


/* Hide: */
hideKW : {this.tokenStream.LT(1)?.text === "HIDE"}? ATOM;
hideColumn : hideKW column=item NEWLINE;
hideColumns : hideColumn*;

/* Sort: */
orderKW : {this.tokenStream.LT(1)?.text === "ASCENDING" || this.tokenStream.LT(1)?.text === "DESCENDING"}? ATOM;
orderBy : orderKW column=item NEWLINE;
sort : orderBy*;

splitKW : {this.tokenStream.LT(1)?.text === "SPLIT"}? ATOM;
fromKW : {this.tokenStream.LT(1)?.text === "SUMMARY"}? ATOM;
summaryType : item;
summaryCol : fromKW column=item expression; // No newline because expression consumes it
splitBy : splitKW column=item NEWLINE;
summary : summaryCol* splitBy*;

/* Concat: */
concatIncompleteKW : {this.tokenStream.LT(1)?.text === "@INCOMPLETE"}? ATOM;
concatOmit : {this.tokenStream.LT(1)?.text === "OMIT"}? ATOM;
concatWrapMaybe : {this.tokenStream.LT(1)?.text === "WRAPMAYBE"}? ATOM;
concatDefault : {this.tokenStream.LT(1)?.text === "DEFAULT"}? ATOM;
concatIncludeSource : {this.tokenStream.LT(1)?.text === "SOURCE"}? ATOM;
concatMissing : concatIncompleteKW (concatOmit | concatWrapMaybe | concatDefault) concatIncludeSource?;

/* Transform: */

transformCalculate : {this.tokenStream.LT(1)?.text === "CALCULATE"}? ATOM;
transformItem : transformCalculate column=item expression;
transform : transformItem*;

/* Check: */

checkKW : {this.tokenStream.LT(1)?.text === "CHECK"}? ATOM;
checkStandalone : {this.tokenStream.LT(1)?.text === "STANDALONE"}? ATOM;
checkAllRows : {this.tokenStream.LT(1)?.text === "ALLROWS"}? ATOM;
checkNoRows : {this.tokenStream.LT(1)?.text === "NOROWS"}? ATOM;
checkAnyRows : {this.tokenStream.LT(1)?.text === "ANYROWS"}? ATOM;
checkType : checkStandalone | checkAllRows | checkNoRows | checkAnyRows;
check : checkKW checkType expression;

/* Manual Edit: */
editKW : {this.tokenStream.LT(1)?.text === "EDIT"}? ATOM;
editHeader : editKW (key=item type | NEWLINE);
editColumnKW : {this.tokenStream.LT(1)?.text === "EDITCOLUMN"}? ATOM;
editColumnHeader : editColumnKW column=item type;
editColumnDataKW : {this.tokenStream.LT(1)?.text === "REPLACEMENT"}? ATOM;
editColumnData : editColumnDataKW value value NEWLINE;
editColumn : editColumnHeader editColumnData*;
edit : editHeader editColumn*;

/* Join: */
innerJoinKW : {this.tokenStream.LT(1)?.text === "INNERJOIN"}? ATOM;
leftJoinKW : {this.tokenStream.LT(1)?.text === "LEFTJOIN"}? ATOM;
joinTypeLine : (innerJoinKW | leftJoinKW) NEWLINE;
joinColumnLine : columnA=item {this.tokenStream.LT(1)?.text === "EQUALS"}? ATOM columnB=item NEWLINE;
join : joinTypeLine joinColumnLine*;
