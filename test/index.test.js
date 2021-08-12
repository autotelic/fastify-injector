'use strict '

const { test } = require('tap')
const fp = require('fastify-plugin')
const { join } = require('path')

const fastifyInjector = require('..')

test('fastifyInjector: injecting decorators', async ({ is, teardown }) => {
  teardown(async () => app.close())

  const injectOpts = {
    decorators: { foo: 'decorate injected' },
    replyDecorators: { foo: () => 'decorateReply injected' },
    requestDecorators: { foo: () => 'decorateRequest injected' }
  }
  const foo = () => 'bar'

  const app = fastifyInjector(injectOpts)

  app.decorate('foo', 'bar')
  app.decorateReply('foo', foo)
  app.decorateRequest('foo', foo)
  app.get('/', async function handler (request, reply) {
    return { payload: `${app.foo}, ${request.foo()}, ${reply.foo()}` }
  })
  await app.ready()

  const result = await app.inject({
    method: 'GET',
    url: '/'
  })

  is(result.json().payload, 'decorate injected, decorateRequest injected, decorateReply injected')
})

test('fastifyInjector: injecting decorators with passthrough', async ({ is, teardown }) => {
  teardown(async () => app.close())

  function injectFoo () {
    const originalFn = injectFoo[Symbol.for('call-original')]
    return `${originalFn()} -> passthrough`
  }

  const injectOpts = {
    replyDecorators: {
      foo: injectFoo
    }
  }
  const foo = () => 'bar'

  const app = fastifyInjector(injectOpts)
  app
    .decorate('foo', foo)
    .decorateReply('foo', foo)
    .decorateRequest('foo', foo)
    .register(async function nestedRoute (instance) {
      app.get('/', async function handler (request, reply) {
        return { payload: `${instance.foo()}, ${request.foo()}, ${reply.foo()}` }
      })
    })
  await app.ready()

  const result = await app.inject({
    method: 'GET',
    url: '/'
  })

  is(result.json().payload, 'bar, bar, bar -> passthrough')
})

test('fastifyInjector: plugins and encapsulation', async ({ is, same, teardown }) => {
  teardown(async () => app.close())

  async function fooRoute (instance, opts) {
    instance.decorateReply('getData', async function () {
      const reply = this
      return reply.bar()
    })
    instance.get('/foo', async function handler (request, reply) {
      return { payload: await reply.getData() }
    })
  }

  async function injectFooRoute (instance, opts) {
    instance.decorate('fooOpts', opts)
    const originalPlugin = injectFooRoute[Symbol.for('call-original')]
    return originalPlugin(instance, opts)
  }

  const barPlugin = fp(function barPlugin (instance, opts, done) {
    instance.decorateReply('bar', () => 'foobar')
    done()
  }, { name: 'bar' })

  function injectBarPlugin (instance, opts, done) {
    instance.decorate('barOpts', opts)
    const originalPlugin = injectBarPlugin[Symbol.for('call-original')]
    return originalPlugin(instance, opts, done)
  }

  const injectOpts = {
    plugins: {
      // Match with function name.
      fooRoute: injectFooRoute,
      // Match with fastify.display-name.
      bar: injectBarPlugin
    },
    replyDecorators: {
      // Inject decorator applied by encapsulated plugin.
      getData: async function injectGetData () {
        const reply = this
        const originalFn = injectGetData[Symbol.for('call-original')].bind(reply)
        return `${await originalFn()} -> passthrough`
      }
    }
  }

  const app = fastifyInjector(injectOpts)

  app
    .register(barPlugin, { bar: 'foo' })
    .register(fooRoute, { foo: 'bar' })

  await app.ready()

  same(app.barOpts, { bar: 'foo' })
  is(app.fooOpts, undefined, 'Should maintain original plugin\'s encapsulation')

  const result = await app.inject({
    method: 'GET',
    url: '/foo'
  })

  is(result.json().payload, 'foobar -> passthrough', 'should inject decorators applied by encapsulated plugin.')
})

const fixtureDir = {
  foo: {
    'index.js': `
    module.exports = async function (instance) {
      instance.get('/foo', async () => ({ payload: 'bar' }))
    }`
  },
  ping: {
    'index.js': `
    module.exports = async function (instance) {
      instance.get('/ping', async () => ({ payload: 'pong' }))
    }`
  }
}

test('fastifyInjector: loadFixtures - single dir', async ({ error, is, testdir, teardown }) => {
  teardown(async () => app.close())

  const fixtures = testdir(fixtureDir)

  const app = fastifyInjector()

  app.loadFixtures(fixtures)
  app.after((err) => {
    error(err)
  })

  await app.ready()

  const resultFoo = await app.inject({
    method: 'GET',
    url: '/foo'
  })
  const resultPing = await app.inject({
    method: 'GET',
    url: '/ping'
  })

  is(resultFoo.json().payload, 'bar')
  is(resultPing.json().payload, 'pong')
})

test('fastifyInjector: loadFixtures - multi dir with custom autoload config.', async ({ error, is, testdir, teardown }) => {
  teardown(async () => app.close())

  const fixtures = testdir(fixtureDir)

  const fixtureFoo = join(fixtures, '/foo')
  const fixturePing = join(fixtures, '/ping')

  const app = fastifyInjector()

  app.loadFixtures([fixtureFoo, { dir: fixturePing, options: { prefix: '/test' } }])
  app.after((err) => {
    error(err)
  })

  await app.ready()

  const resultFoo = await app.inject({
    method: 'GET',
    url: '/foo'
  })
  const resultPing = await app.inject({
    method: 'GET',
    url: '/test/ping'
  })

  is(resultFoo.json().payload, 'bar')
  is(resultPing.json().payload, 'pong')
})
