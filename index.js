const CallType = require('@malijs/call-types')
const inject = require('./inject')

/**
 * Mali on error middleware. Calls function with error and context. The called function does not
 * have access to control flow.
 * @module @malijs/onerror
 *
 * @param  {Function} fn The function to call when an error occurs. Function has to have signature
 *                       with signature <code>(err, ctx)</code>
 * @return {Function} the middleware function
 * @example
 * const onError = require('@malijs/onerror')
 *
 * function errorLogger (err, ctx) {
 *   console.log('Error on %s: %s', ctx.name, err.toString())
 * }
 *
 * app.use(onError(errorLogger))
 */
module.exports = function (fn) {
  return function onError (ctx, next) {
    if (ctx.type === CallType.RESPONSE_STREAM || ctx.type === CallType.DUPLEX) {
      inject(ctx.call, err => fn(err, ctx))
      return next()
    } else {
      if (ctx.type === CallType.REQUEST_STREAM) {
        inject(ctx.call, err => fn(err, ctx))
      }
      return next().catch(err => {
        fn(err, ctx)
        return Promise.reject(err)
      })
    }
  }
}
