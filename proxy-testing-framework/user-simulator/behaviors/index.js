/**
 * Behavior registry — loads and indexes all built-in behaviors.
 */

const webBrowsing = require("./web-browsing");
const videoStreaming = require("./video-streaming");
const socialMedia = require("./social-media");
const eCommerce = require("./e-commerce");
const formInteraction = require("./form-interaction");
const multiPage = require("./multi-page");
const downloadHeavy = require("./download-heavy");
const rapidSwitching = require("./rapid-switching");

const BUILTIN = [
  webBrowsing,
  videoStreaming,
  socialMedia,
  eCommerce,
  formInteraction,
  multiPage,
  downloadHeavy,
  rapidSwitching,
];

const registry = new Map();
for (const b of BUILTIN) {
  registry.set(b.name, b);
}

/**
 * Get a behavior by name.
 * @param {string} name
 * @returns {{name: string, description: string, generateSession: Function}|null}
 */
function get(name) {
  return registry.get(name) || null;
}

/**
 * List all available behaviors.
 * @returns {Array<{name: string, description: string}>}
 */
function list() {
  return BUILTIN.map((b) => ({ name: b.name, description: b.description }));
}

/**
 * Register a custom behavior.
 * @param {{name: string, description: string, generateSession: Function}} behavior
 */
function register(behavior) {
  if (!behavior.name || !behavior.generateSession) {
    throw new Error("Behavior must have name and generateSession");
  }
  registry.set(behavior.name, behavior);
}

module.exports = { get, list, register };
