import { Context } from "mali";

declare function onError (
    fn: (err: Error, ctx: Context) => any
): (ctx: Context, next?: () => Promise<any>) => Promise<void>;

export = onError;