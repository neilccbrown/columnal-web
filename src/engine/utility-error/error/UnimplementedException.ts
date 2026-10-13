// Port of xyz.columnal.error.UnimplementedException (utility-error module).

/**
 * Created by neil on 04/11/2016.
 */
export class UnimplementedException extends Error
{
    constructor()
    {
        super("Unimplemented");
        this.name = "UnimplementedException";
    }
}
