/**
 * proxy-app-manager — Unified Node.js lifecycle manager for proxy apps.
 *
 * Provides a clean programmatic API for the complete proxy app lifecycle:
 * launch → connectProxy → [test/evaluate] → disconnectProxy → shutdown.
 *
 * Extensible client registry — add new proxy apps by subclassing BaseClient
 * and calling registry.register().
 *
 * Usage:
 *   const { ProxyAppManager, registry } = require('proxy-app-manager');
 *
 *   // List supported clients
 *   console.log(registry.list()); // [{app:'flclash',...}, {app:'hiddify',...}]
 *
 *   // Step-by-step
 *   const mgr = new ProxyAppManager({
 *     app: 'flclash',
 *     config: './configs/sample-clash-config.yaml',
 *   });
 *   await mgr.launch();
 *   await mgr.connectProxy();
 *   const status = await mgr.getStatus();
 *   await mgr.shutdown();
 *
 *   // Full test
 *   const report = await mgr.fullTest({ suite: 'latency' });
 *
 * Adding a new client:
 *   const { BaseClient, registry } = require('proxy-app-manager');
 *   class MyClient extends BaseClient { ... }
 *   registry.register(MyClient);
 *   // Now usable: new ProxyAppManager({ app: 'myclient', config: '...' })
 */

const { ProxyAppManager } = require("./src/ProxyAppManager");
const { BaseClient } = require("./src/BaseClient");
const { VmBridge } = require("./src/VmBridge");
const { AppProcess } = require("./src/AppProcess");
const { registry } = require("./src/clients/registry");

/**
 * Convenience: list all registered clients.
 * @returns {Array<{app: string, displayName: string}>}
 */
function listClients() {
  return registry.list();
}

/**
 * Convenience: create a manager for the given app.
 *
 * @param {string} app - client name
 * @param {Object} options - passed to ProxyAppManager constructor
 * @returns {ProxyAppManager}
 */
function createManager(app, options = {}) {
  return new ProxyAppManager({ app, ...options });
}

module.exports = {
  ProxyAppManager,
  BaseClient,
  VmBridge,
  AppProcess,
  registry,
  listClients,
  createManager,
};
