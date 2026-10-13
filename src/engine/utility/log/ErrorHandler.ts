// Port of xyz.columnal.log.ErrorHandler (utility module).
import type { Localized } from "../../anns/Annotations.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { Log } from "./Log.js";

export abstract class ErrorHandler
{
    private static errorHandler: ErrorHandler = new class extends ErrorHandler
    {
        protected override doShowError(title: Localized, errWrap: (s: Localized) => Localized, e: Error): void
        {
            // Default if new handler not set is just to log
            const localMsg = e.message;
            Log.log(title + errWrap(localMsg), e);
        }
    }();

    public static getErrorHandler(): ErrorHandler
    {
        return ErrorHandler.errorHandler;
    }

    public static setErrorHandler(errorHandler: ErrorHandler): void
    {
        ErrorHandler.errorHandler = errorHandler;
    }

    /** Java: alertOnError_(title, r) and alertOnError_(title, errWrap, r). */
    public alertOnError_(title: Localized, errWrapOrR: ((s: Localized) => Localized) | ErrorHandler.RunOrError, r?: ErrorHandler.RunOrError): void
    {
        const errWrap = r === undefined ? (err: Localized) => err : errWrapOrR as (s: Localized) => Localized;
        const run = r ?? errWrapOrR as ErrorHandler.RunOrError;
        try
        {
            run();
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            this.showError(title, errWrap, e);
        }
    }

    /** Java: showError(title, e) and showError(title, errWrap, e). */
    public showError(title: Localized, e: Error): void;
    public showError(title: Localized, errWrap: (s: Localized) => Localized, e: Error): void;
    public showError(title: Localized, a: Error | ((s: Localized) => Localized), b?: Error): void
    {
        if (b === undefined)
            this.doShowError(title, x => x, a as Error);
        else
            this.doShowError(title, a as (s: Localized) => Localized, b);
    }

    /**
     * Java: the abstract showError(title, errWrap, e), which subclasses implement.
     * Note -- should not block!
     */
    protected abstract doShowError(title: Localized, errWrap: (s: Localized) => Localized, e: Error): void;
}

export namespace ErrorHandler
{
    export type RunOrError = () => void;
}
