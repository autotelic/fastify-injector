# Fastify Injector

A testing util for injecting plugin dependencies into a [Fastify](https://www.fastify.io/docs/latest/) app.

## Contents

  - [Usage](#usage)
  - [API](#api)
    - [`fastifyInjector`](#fastifyinjector)
      - [Options](#options)
      - [Decorators](#decorators)
        - [`loadFixtures`](#loadFixtures)
      - [Features](#features)
        - [Passthrough Functionality](#passthrough-functionality)
        - [Plugin Properties](#plugin-properties)
        - [Plugin Encapsulation](#plugin-encapsulation)

## Usage

```sh
npm i --save-dev @autotelic/fastify-injector
```

```js
const { test } = require('tap')
const fastifyInjector = require('@autotelic/fastify-injector')

const rootPlugin = require('../index.js')

test('root plugin', async ({ is }) => {
  const injectFoo = () => 'bar'
  const app = fastifyInjector({ requestDecorators: { foo: injectFoo } })
  // If the rootPlugin, or one of its child plugins adds a requestDecorator with the
  // name 'foo', injectFoo will be added in place of the original decorator value.
  app.register(rootPlugin)
  await app.ready()
  const result = await app.inject({
    method: 'GET',
    url: '/'
  })
  is(result.statusCode, 200)
})
```

## API

### `fastifyInjector`

`fastifyInjector` is a function that accepts an options object and a Fastify instance (*optional* - defaults to `require('fastify')()`). It returns a proxied Fastify instance that will inject the specified decorators and plugins if/when their targets are added to the instance.

#### Options

The `fastifyInjector` options object contains the following properties:

 - `decorators`: `{ [decoratorName]: decorator }` - An object containing all decorators to be injected. The keys for each decorator must match the name of the decorator to be replaced.

 - `requestDecorators`: `{ [requestDecoratorName]: requestDecorator }` - An object containing all request decorators to be injected. The keys for each request decorator must match the name of the request decorator to be replaced.

 - `replyDecorators`: `{ [replyDecoratorName]: replyDecorator }` - An object containing all reply decorators to be injected. The keys for each reply decorator must match the name of the reply decorator to be replaced.

 - `plugins`: `{ [pluginName]: plugin }` - An object containing all plugins to be injected. The keys for each plugin must match the name of the plugin to be replaced. For this to work, the original plugin must either have the `Symbol.for('fastify.display-name')` property (ie. use fastify-plugin and provide a `name`) or be a named function (ie. have the `Function.name` property) - if the plugin has both, `Symbol.for('fastify.display-name')` will be used.

#### Decorators

##### `loadFixtures`

The Fastify instance returned by `fastifyInjector` provides access to a `loadFixtures` decorator. This can be used to autoload one or more plugin directories. It accepts a string path or a [fastify-autoload config](https://github.com/fastify/fastify-autoload#global-configuration), or an Array containing either/both.

```js
const app = fastifyInjector({ replyDecorators: { myDecorator: myDecoratorStub } })

app.register(myPlugin)

app.loadFixtures([
  path.join(__dirname, '../fixtures/routes'),
  {
    dir: path.join(__dirname, 'plugins'),
    maxDepth: 2
  }
])

await app.ready()

// Test stuff...
```

#### Features

##### Passthrough Functionality

All injected decorator functions and plugins are provided access to the function they are replacing. The original functions are added to their replacements as the `Symbol.for('call-original')` property.

```js
const { test } = require('tap')
const fastifyInjector = require('@autotelic/fastify-injector')

const rootPlugin = require('../index.js')

test('root plugin', async ({ is }) => {
  const fooCalls = []

  function injectFoo (...args) {
    fooCalls.push(args)
    // Note: if the original decorator uses `this` to access the request/reply/instance
    // you will need to bind it -> `injectFoo[Symbol.for('call-original')].bind(this)`
    const originalFoo = injectFoo[Symbol.for('call-original')]
    return originalFoo(...args)
  }

  const app = fastifyInjector({ requestDecorators: { foo: injectFoo } })
  app.register(rootPlugin)
  await app.ready()
  const result = await app.inject({
    method: 'GET',
    url: '/'
  })
  is(fooCalls.length, 3)
})
```

##### Plugin Properties

When injecting plugins - if the original plugin's `Symbol.for('skip-override')` property is `true`, then that property along with any other property added by [fastify-plugin](https://github.com/fastify/fastify-plugin) will be applied to the injected plugin.

##### Plugin Encapsulation

If an app uses the same plugin or decorator names across multiple encapsulation contexts, then only the first occurrence of that plugin/decorator will be injected. If possible, we recommend testing each context in isolation.
