/**
 * ClientRegistry — Central registry of proxy app client implementations.
 *
 * Register clients here to make them available to ProxyAppManager.
 * To add a new client:
 *   1. Create YourClient.js extending BaseClient
 *   2. Import and register it below
 *
 * Usage:
 *   const { registry } = require('./clients/registry');
 *   const client = registry.get('flclash');
 */

const { FlClashClient } = require("./FlClashClient");
const { HiddifyClient } = require("./HiddifyClient");

class ClientRegistry {
  constructor() {
    /** @type {Map<string, typeof import('../BaseClient').BaseClient>} */
    this._clients = new Map();
  }

  /**
   * Register a client class.
   * @param {typeof import('../BaseClient').BaseClient} ClientClass
   */
  register(ClientClass) {
    this._clients.set(ClientClass.app, ClientClass);
  }

  /**
   * Look up a client class by app name.
   * @param {string} app
   * @returns {typeof import('../BaseClient').BaseClient|undefined}
   */
  get(app) {
    return this._clients.get(app);
  }

  /**
   * Check if a client is registered.
   * @param {string} app
   * @returns {boolean}
   */
  has(app) {
    return this._clients.has(app);
  }

  /**
   * List all registered client metadata.
   * @returns {Array<{app: string, displayName: string}>}
   */
  list() {
    return Array.from(this._clients.values()).map((C) => ({
      app: C.app,
      displayName: C.displayName,
    }));
  }

  /**
   * Get the names of all registered apps.
   * @returns {string[]}
   */
  appNames() {
    return Array.from(this._clients.keys());
  }
}

// ---- Singleton ----
const registry = new ClientRegistry();
registry.register(FlClashClient);
registry.register(HiddifyClient);

module.exports = { ClientRegistry, registry };
