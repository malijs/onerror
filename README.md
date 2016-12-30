# mali-onerror

Mali on error middleware. Calls function with error and context.
The called function does not have access to control flow.

[![npm version](https://img.shields.io/npm/v/mali-onerror.svg?style=flat-square)](https://www.npmjs.com/package/mali-onerror)
[![build status](https://img.shields.io/travis/malijs/onerror/master.svg?style=flat-square)](https://travis-ci.org/malijs/onerror)

## API

<a name="module_mali-onerror"></a>

### mali-onerror ⇒ <code>function</code>
Mali on error middleware. Calls function with error and context. The called function does not
have access to control flow.

**Returns**: <code>function</code> - the middleware function  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>function</code> | The function to call when an error occurs. Function has to have signature                       with signature <code>(err, ctx)</code> |

**Example**  

```js
const onError = require('mali-onerror')

function errorLogger (err, ctx) {
  console.log('Error on %s: %s', ctx.name, err.toString())
}

app.use(onError(errorLogger))
```

## License

  Apache-2.0
