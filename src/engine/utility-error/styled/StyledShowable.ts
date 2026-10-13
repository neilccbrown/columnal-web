// Port of xyz.columnal.styled.StyledShowable (utility-error module).
import type { StyledString } from "./StyledString.js";

export interface StyledShowable
{
    toStyledString(): StyledString;
}
