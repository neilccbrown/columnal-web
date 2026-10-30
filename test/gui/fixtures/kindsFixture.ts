// A saved file with a data table K of each kind of value (and an invalid number, typed and stored as
// text), and a Calculate E on it, whose "Div" column is an error in each row.
export const KINDS_FIXTURE = `COLUMNAL
VERSION 3

DATA @BEGIN TAB
TAB "K"
TAB FORMAT @BEGIN
TAB @COLUMN N @TYPE Number @DEFAULT 0
TAB @COLUMN Name @TYPE Text @DEFAULT ""
TAB @COLUMN Flag @TYPE Boolean @DEFAULT false
TAB @COLUMN Day @TYPE Date @DEFAULT 2000-01-01
TAB @END FORMAT
TAB VALUES @BEGIN
TAB   1.5 , "a b" , true , 2021-03-04
TAB   @INVALID "12x" , "c" , false , 1999-12-31
TAB @END VALUES
TAB DISPLAY @BEGIN
TAB POSITION 1 1
TAB SHOWCOLUMNS ALL
TAB @END DISPLAY
@END TAB DATA

TRANSFORMATION @BEGIN CAL
CAL "E"
CAL calculate
CAL SOURCE "K"
CAL @BEGIN
CAL CALCULATE Div @EXPRESSION @call function\\\\list\\element([1], 5)
CAL @END
CAL DISPLAY @BEGIN
CAL POSITION 7 1
CAL SHOWCOLUMNS ALL
CAL @END DISPLAY
@END CAL TRANSFORMATION
`;
