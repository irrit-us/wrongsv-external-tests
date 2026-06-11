#!/usr/bin/env node
/**
 * Debug: compare VmBridge vs Python bridge behavior.
 */
const { VmBridge } = require("./src/VmBridge");

async function main() {
  const vmUri = "http://127.0.0.1:33043/veQIVXuJaL4=";

  const bridge = new VmBridge(vmUri);
  console.log("WS URI:", bridge.wsUri);

  await bridge.connect();
  console.log("Connected, isolate:", bridge._isolateId);

  // Test getVM
  const vm = await bridge.call("getVM");
  console.log("getVM result keys:", Object.keys(vm));

  // Test list extensions
  const extList = await bridge.call("_flutter.listServiceExtensions");
  console.log("Extensions:", JSON.stringify(extList).slice(0, 500));

  await bridge.disconnect();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
