import test from 'ava'
import path from 'path'
import Mali from 'mali'
import grpc from 'grpc'
import hl from 'highland'
import _ from 'lodash'
import async from 'async'

import mw from '../'

function getRandomInt (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function getHost (port) {
  return '0.0.0.0:'.concat(port || getRandomInt(1000, 60000))
}

const ARRAY_DATA = [
  { message: '1 foo' },
  { message: '2 bar' },
  { message: '3 asd' },
  { message: '4 qwe' },
  { message: '5 rty' },
  { message: '6 zxc' }
]

function getArrayData () {
  return _.cloneDeep(ARRAY_DATA)
}

function crashMapper (d) {
  if (d.message.indexOf(3) >= 0) {
    // cause a crash
    let str = JSON.stringify(d)
    str = str.concat('asdf')
    let no = JSON.parse(str)
    return no
  } else {
    d.message = d.message.toUpperCase()
    return d
  }
}

test.cb('should not be called when no error in req/res app', t => {
  t.plan(4)
  const APP_HOST = getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/reqres.proto')

  function doSomething (ctx) {
    ctx.res = { message: 'Hello world' }
  }

  let mwCalled = false
  function mwFn () {
    mwCalled = true
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  app.use(mw(mwFn))
  app.use({ doSomething })
  app.start(APP_HOST)

  const helloproto = grpc.load(PROTO_PATH).argservice
  const client = new helloproto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  client.doSomething({ message: 'foo' }, (err, response) => {
    t.ifError(err)
    t.truthy(response)
    t.is(response.message, 'Hello world')
    t.false(mwCalled)
    app.close().then(() => t.end())
  })
})

test.cb('should call middleware function on error in req/res app', t => {
  t.plan(6)
  const APP_HOST = getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/reqres.proto')

  function doSomething (ctx) {
    throw new Error('boom')
  }

  let mwCalled = false
  function mwFn (err, ctx) {
    t.truthy(err)
    t.truthy(ctx)
    mwCalled = true
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  app.use(mw(mwFn))
  app.use({ doSomething })
  app.start(APP_HOST)

  const helloproto = grpc.load(PROTO_PATH).argservice
  const client = new helloproto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  client.doSomething({ message: 'foo' }, (err, response) => {
    t.truthy(err)
    t.is(err.message, 'boom')
    t.falsy(response)
    t.true(mwCalled)
    app.close().then(() => t.end())
  })
})

test.cb('should call middleware function on error in res stream app', t => {
  t.plan(7)
  const APP_HOST = getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/resstream.proto')

  function listStuff (ctx) {
    const s = hl(getArrayData())
      .map(crashMapper)

    ctx.res = s
  }

  let mwCalled = false
  function mwFn (err, ctx) {
    t.truthy(err)
    t.truthy(ctx)
    mwCalled = true
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  app.use(mw(mwFn))
  app.use({ listStuff })
  app.start(APP_HOST)

  const proto = grpc.load(PROTO_PATH).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  const call = client.listStuff({ message: 'Hello' })

  let dataCounter = 0
  call.on('data', msg => {
    dataCounter++
  })

  let errMsg2
  call.on('error', err => {
    errMsg2 = err ? err.message : ''
  })

  let endCalled = false
  call.on('end', () => {
    endCalled = true
    _.delay(() => {
      endTest()
    }, 200)
  })

  function endTest () {
    t.true(dataCounter >= 1)
    t.truthy(errMsg2)
    t.true(endCalled)
    t.true(errMsg2.indexOf('Unexpected token') >= 0)
    t.true(mwCalled)
    app.close().then(() => t.end())
  }
})

test.cb('should call middleware function on error in req stream app', t => {
  t.plan(7)
  const APP_HOST = getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/reqstream.proto')

  async function writeStuff (ctx) {
    return new Promise((resolve, reject) => {
      hl(ctx.req)
        .map(crashMapper)
        .collect()
        .toCallback((err, r) => {
          if (err) {
            return reject(err)
          }

          ctx.res = {
            message: r.length.toString()
          }
          resolve()
        })
    })
  }

  let mwCalled = false
  function mwFn (err, ctx) {
    t.truthy(err)
    t.truthy(ctx)
    mwCalled = true
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  app.use(mw(mwFn))
  app.use({ writeStuff })
  app.start(APP_HOST)

  const proto = grpc.load(PROTO_PATH).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  const call = client.writeStuff((err, res) => {
    t.truthy(err)
    t.truthy(err.message)
    t.true(err.message.indexOf('Unexpected token') >= 0)
    t.falsy(res)
    t.true(mwCalled)
    app.close().then(() => t.end())
  })

  async.eachSeries(getArrayData(), (d, asfn) => {
    call.write(d)
    _.delay(asfn, _.random(10, 50))
  }, () => {
    call.end()
  })
})

test.cb('should call middleware function on error in stream in req stream app', t => {
  t.plan(7)
  const APP_HOST = getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/reqstream.proto')

  async function writeStuff (ctx) {
    return new Promise((resolve, reject) => {
      const data = []
      let counter = 0
      ctx.req.on('data', function (d) {
        counter++
        if (counter === 3) {
          ctx.req.emit('error', new Error('boom'))
        } else {
          data.push(d.message.toUpperCase())
        }
      })

      ctx.req.on('end', function () {
        ctx.res = { message: data.join(':') }
        resolve()
      })
    })
  }

  let mwCalled = false
  function mwFn (err, ctx) {
    t.truthy(err)
    t.truthy(ctx)
    mwCalled = true
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  app.use('writeStuff',
    function (ctx, next) {
      ctx.call.removeAllListeners('error')
      return next()
    },
    mw(mwFn),
    writeStuff
  )
  app.start(APP_HOST)

  const proto = grpc.load(PROTO_PATH).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  const call = client.writeStuff((err, res) => {
    t.ifError(err)
    t.truthy(res)
    t.truthy(res.message)
    t.is(res.message, '1 FOO:2 BAR:4 QWE:5 RTY:6 ZXC')
    t.true(mwCalled)
    app.close().then(() => t.end())
  })

  call.on('error', err => {
    console.log('client error', err)
  })

  async.eachSeries(getArrayData(), (d, asfn) => {
    call.write(d)
    _.delay(asfn, _.random(10, 50))
  }, () => {
    call.end()
  })
})

test.cb('should call middleware function on error in duplex call', t => {
  t.plan(6)
  const APP_HOST = getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/duplex.proto')
  async function processStuff (ctx) {
    ctx.req.on('data', d => {
      ctx.req.pause()
      _.delay(() => {
        let ret = {}
        try {
          ret = crashMapper(d)
        } catch (e) {
          ctx.res.emit('error', e)
          return
        }
        ctx.res.write(ret)
        ctx.req.resume()
      }, _.random(50, 150))
    })

    ctx.req.on('end', () => {
      _.delay(() => {
        ctx.res.end()
      }, 200)
    })
  }

  let mwCalled = false
  function mwFn (err, ctx) {
    t.truthy(err)
    t.truthy(ctx)
    mwCalled = true
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  app.use(mw(mwFn))
  app.use({ processStuff })
  app.start(APP_HOST)

  const proto = grpc.load(PROTO_PATH).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  const call = client.processStuff()

  let dataCounter = 0
  call.on('data', d => {
    dataCounter++
  })

  let errMsg2 = ''
  call.on('error', err2 => {
    errMsg2 = err2 ? err2.message : ''
  })

  call.on('end', () => {
    _.delay(() => {
      endTest()
    }, 200)
  })

  async.eachSeries(getArrayData(), (d, asfn) => {
    call.write(d)
    _.delay(asfn, _.random(10, 50))
  }, () => {
    call.end()
  })

  function endTest () {
    t.is(dataCounter, 2)
    t.truthy(errMsg2)
    t.true(errMsg2.indexOf('Unexpected token') >= 0)
    t.true(mwCalled)
    app.close().then(() => t.end())
  }
})
