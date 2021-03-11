import type { Context } from "mali";

declare function onError(
  fn: (err: Error, ctx: Context<any>) => any
): (ctx: Context<any>, next?: () => Promise<any>) => Promise<void>;

export = onError;
