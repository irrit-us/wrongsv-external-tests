/**
 * user-simulator — Puppeteer-based real user behavior simulation through proxy.
 *
 * Usage:
 *   const { UserSimulator, listBehaviors } = require('./user-simulator');
 *
 *   const sim = new UserSimulator({
 *     proxy: 'socks5://127.0.0.1:7890',
 *     behavior: 'web-browsing',
 *     duration: 30000,
 *   });
 *   const report = await sim.run();
 *   await sim.close();
 */

const { UserSimulator } = require("./UserSimulator");
const { BehaviorRunner } = require("./BehaviorRunner");
const behaviors = require("./behaviors");
const { parseProxyUrl, buildLaunchOptions } = require("./utils/proxy");

/**
 * List all available behaviors.
 * @returns {Array<{name: string, description: string}>}
 */
function listBehaviors() {
  return behaviors.list();
}

module.exports = {
  UserSimulator,
  BehaviorRunner,
  behaviors,
  listBehaviors,
  parseProxyUrl,
  buildLaunchOptions,
};
