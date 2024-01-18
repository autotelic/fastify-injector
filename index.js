'use strict'

const autoload = require('@fastify/autoload')
const fp = require('fastify-plugin')

const CALL_ORIGINAL = Symbol.for('call-original')

function fastifyInjector (injectorOpts = {}, fastify = require('fastify')()) {
  const injectors = {
    decorate: injectorOpts.decorators || {},
    decorateReply: injectorOpts.replyDecorators || {},
    decorateRequest: injectorOpts.requestDecorators || {},
    plugins: injectorOpts.plugins || {}
  }

  function wrapDecorateMethod (target, prop) {
    return function wrappedDecorate (name, value) {
      const injectDecorator = injectors[prop][name]
      if (injectDecorator) {
        if (typeof injectDecorator === 'function') {
          // Provide access to the original decorator method.
          injectDecorator[CALL_ORIGINAL] = value
        }
        delete injectors[prop][name]
        return target[prop](name, injectDecorator)
      }
      target[prop](name, value)

      // Return the fastify instance to support method chaining.
      return this
    }
  }

  function wrapRegisterMethod (register) {
    return function wrappedRegister (originalPlugin, opts) {
      // In case plugin has been autoloaded, preserve autoConfig options.
      originalPlugin.autoConfig = opts

      const copyPluginEncapsulation = (targetPlugin) => {
        if (originalPlugin[Symbol.for('skip-override')] === true) {
          return fp(targetPlugin, originalPlugin[Symbol.for('plugin-meta')] || {})
        }
        return targetPlugin
      }

      const wrapPlugin = (plugin) => copyPluginEncapsulation(
        (instance, opts, done) => {
          // Proxy encapsulated instance.
          const proxy = fastifyInjector(injectorOpts, instance)
          return plugin(proxy, opts, done)
        }
      )

      const pluginName = originalPlugin[Symbol.for('fastify.display-name')] || originalPlugin.name
      const injectPlugin = injectors.plugins[pluginName]

      if (injectPlugin) {
        // Provide access to the original plugin.
        injectPlugin[CALL_ORIGINAL] = originalPlugin
        delete injectors.plugins[pluginName]
        register(wrapPlugin(copyPluginEncapsulation(injectPlugin)), opts)
      } else {
        register(wrapPlugin(originalPlugin), opts)
      }

      // Return the fastify instance to support method chaining.
      return this
    }
  }

  const {
    proxy,
    revoke
  } = Proxy.revocable(
    fastify, {
      get (target, prop, receiver) {
        if (prop === 'decorate' || prop === 'decorateReply' || prop === 'decorateRequest') {
          return wrapDecorateMethod(target, prop)
        }
        if (prop === 'register') {
          return wrapRegisterMethod(target[prop])
        }
        return Reflect.get(...arguments)
      }
    }
  )

  if (!proxy.loadFixtures) {
    proxy.decorate('loadFixtures', (fixtures) => Promise.all((Array.isArray(fixtures) ? fixtures : [fixtures]).map((fixture) => {
      const opts = typeof fixture !== 'string' ? fixture : { dir: fixture, dirNameRoutePrefix: false, maxDepth: 1 }
      return proxy.register(autoload, opts)
    })))
  }

  proxy.addHook('onClose', () => {
    revoke()
  })

  return proxy
}

module.exports = fastifyInjector
