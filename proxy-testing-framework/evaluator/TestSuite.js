/**
 * TestSuite — loads and runs a named test suite definition.
 *
 * A suite is a JS file in presets/ that exports:
 *   {
 *     name: string,
 *     description: string,
 *     puppeteer: { enabled: boolean, targets: string[], ... },
 *     traffic: { enabled: boolean, profile: string, duration: number, ... },
 *   }
 */

const path = require("path");
const fs = require("fs");

class TestSuite {
  /**
   * Load a suite definition by name.
   *
   * @param {string} name - suite name (without .js), or absolute path
   * @returns {Object} suite definition
   */
  static load(name) {
    // Try built-in presets first, then absolute path
    let modulePath;
    const presetPath = path.join(__dirname, "presets", `${name}.js`);
    if (fs.existsSync(presetPath)) {
      modulePath = presetPath;
    } else if (fs.existsSync(name)) {
      modulePath = name;
    } else {
      const presetsDir = path.join(__dirname, "presets");
      const available = fs
        .readdirSync(presetsDir)
        .filter((f) => f.endsWith(".js"))
        .map((f) => f.replace(".js", ""));
      throw new Error(
        `Suite not found: ${name}. Available presets: ${available.join(", ")}`
      );
    }

    const suite = require(modulePath);
    return suite;
  }

  /** List available preset suite names. */
  static listPresets() {
    const presetsDir = path.join(__dirname, "presets");
    if (!fs.existsSync(presetsDir)) return [];
    return fs
      .readdirSync(presetsDir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => {
        const suite = require(path.join(presetsDir, f));
        return { name: f.replace(".js", ""), description: suite.description };
      });
  }
}

module.exports = { TestSuite };
