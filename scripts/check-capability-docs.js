#!/usr/bin/env node

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  CLIENT_CAPABILITIES,
  INTENTIONALLY_UNTRACKED_SCENARIOS,
} = require("../e2e-harness/capabilities");
const {
  EXTRA_SCENARIO_COVERAGE,
  PROTOCOL_CATALOG_COVERAGE,
  catalogScenarioIds,
} = require("../e2e-harness/protocol-catalog");
const { buildScenarios } = require("../e2e-harness/scenarios");

const root = path.resolve(__dirname, "..");
const wrongsvRepo = path.resolve(root, "..", "wrongsv");
const protocolsMdPath = path.resolve(root, "..", "protocols.md");
const scenarioCatalog = buildScenarios(wrongsvRepo);
const readmePath = path.join(root, "README.md");
const auditPath = path.join(root, "docs", "client-capability-audit.md");
const knownLimitationsPath = path.join(root, "docs", "known-limitations.md");
const hiddifyImportMatrixPath = path.join(
  root,
  "results",
  "hiddify-app-import-native-1",
  "matrix.json"
);
const hiddifyImportDebugPath = path.join(
  root,
  "results",
  "hiddify-app-import-native-1",
  "vless_raw_tcp",
  "debug-initial.json"
);
const hiddifyAnytlsMatrixPath = path.join(
  root,
  "results",
  "hiddify-anytls-gap-isolated-2",
  "matrix.json"
);
const hiddifyAnytlsImportMatrixPath = path.join(
  root,
  "results",
  "hiddify-anytls-app-import-native-1",
  "matrix.json"
);
const xrayWebtransportMatrixPath = path.join(
  root,
  "results",
  "xray-webtransport-matrix-1",
  "matrix.json"
);
const v2rayWebtransportMatrixPath = path.join(
  root,
  "results",
  "v2ray-webtransport-matrix-2",
  "matrix.json"
);
const clashVergeDebugPath = path.join(root, "docs", "client-debugging", "clash-verge-rev.md");
const flclashDebugPath = path.join(root, "docs", "client-debugging", "flclash.md");
const hiddifyDebugPath = path.join(root, "docs", "client-debugging", "hiddify.md");
const xrayDebugPath = path.join(root, "docs", "client-debugging", "xray-core.md");
const v2rayDebugPath = path.join(root, "docs", "client-debugging", "v2ray.md");

function parseArgs(argv) {
  const opts = {
    json: false,
  };

  for (const arg of argv) {
    if (arg === "--json") {
      opts.json = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return opts;
}

function printHelp() {
  console.log(`check-capability-docs.js

Usage:
  node scripts/check-capability-docs.js [--json]
`);
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(read(filePath));
}

function runNode(args) {
  return JSON.parse(
    execFileSync(process.execPath, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  );
}

function markdownSection(markdown, heading) {
  const marker = `### ${heading}`;
  const start = markdown.indexOf(marker);
  if (start === -1) {
    throw new Error(`missing audit section: ${heading}`);
  }
  const rest = markdown.slice(start);
  const next = rest.slice(marker.length).search(/\n### /);
  return next === -1 ? rest : rest.slice(0, marker.length + next);
}

function bulletBlock(section, label) {
  const marker = `- ${label}:`;
  const start = section.indexOf(marker);
  if (start === -1) {
    return "";
  }
  const rest = section.slice(start + marker.length);
  const next = rest.search(/\n- [A-Z][^:\n]*:/);
  return next === -1 ? rest : rest.slice(0, next);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasRunnable(client, scenario) {
  return CLIENT_CAPABILITIES[client]?.runnableScenarios?.includes(scenario) === true;
}

function hasGap(client, scenario) {
  return CLIENT_CAPABILITIES[client]?.harnessGaps?.includes(scenario) === true;
}

function gapReason(client, scenario) {
  return CLIENT_CAPABILITIES[client]?.harnessGapReasons?.[scenario] || "";
}

function scenarioResult(matrix, scenarioId) {
  return matrix.scenarios.find((item) => item.id === scenarioId) || null;
}

function protocolNamesFromProtocolsMd(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0]);
}

function sameStringSet(left, right) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function scenarioTrackedByCapability(scenarioId) {
  if (INTENTIONALLY_UNTRACKED_SCENARIOS[scenarioId]) {
    return true;
  }
  return Object.values(CLIENT_CAPABILITIES).some((capability) => {
    return (
      capability.runnableScenarios?.includes(scenarioId) ||
      capability.harnessGaps?.includes(scenarioId)
    );
  });
}

function validateProtocolCatalogCoverage(protocolsMd) {
  const protocolNames = protocolNamesFromProtocolsMd(protocolsMd);
  const protocolNameSet = new Set(protocolNames);
  const coverageNameSet = new Set(Object.keys(PROTOCOL_CATALOG_COVERAGE));
  assert(
    protocolNames.length === protocolNameSet.size,
    "protocols.md must not contain duplicate protocol names"
  );
  assert(
    sameStringSet(protocolNameSet, coverageNameSet),
    `protocol catalog coverage must exactly match protocols.md; missing=${[...protocolNameSet]
      .filter((name) => !coverageNameSet.has(name))
      .join(",")}; extra=${[...coverageNameSet]
      .filter((name) => !protocolNameSet.has(name))
      .join(",")}`
  );

  const allowedWrongsv = new Set([
    "implemented",
    "covered-by-overlap",
    "tracked-out-of-scope",
  ]);
  const allowedWrongcl = new Set([
    "supported",
    "partial",
    "unsupported",
    "covered-by-overlap",
    "tracked-out-of-scope",
  ]);
  const allowedExternal = new Set(["covered", "harness-gap", "local", "documented"]);

  for (const [protocol, entry] of Object.entries(PROTOCOL_CATALOG_COVERAGE)) {
    assert(allowedWrongsv.has(entry.wrongsv), `${protocol}: invalid wrongsv status`);
    assert(allowedWrongcl.has(entry.wrongcl), `${protocol}: invalid wrongcl status`);
    assert(allowedExternal.has(entry.external), `${protocol}: invalid external status`);
    assert(entry.reason && entry.reason.length >= 24, `${protocol}: coverage reason is too thin`);

    for (const scenarioId of entry.scenarios || []) {
      assert(
        scenarioCatalog[scenarioId]?.id === scenarioId,
        `${protocol}: scenario ${scenarioId} is missing from the scenario catalog`
      );
      assert(
        scenarioTrackedByCapability(scenarioId),
        `${protocol}: scenario ${scenarioId} is not runnable, a harness gap, or intentionally untracked`
      );
    }

    if (entry.external === "covered" || entry.external === "harness-gap") {
      assert(
        entry.scenarios?.length > 0,
        `${protocol}: ${entry.external} status must name at least one scenario`
      );
    }

    for (const configFile of entry.configFiles || []) {
      assert(
        fs.existsSync(path.join(wrongsvRepo, "configs", configFile)),
        `${protocol}: referenced wrongsv config fixture is missing: ${configFile}`
      );
    }
  }

  const catalogScenarioSet = catalogScenarioIds();
  for (const scenarioId of Object.keys(scenarioCatalog)) {
    assert(
      catalogScenarioSet.has(scenarioId),
      `scenario catalog entry is not mapped back to protocols.md coverage: ${scenarioId}`
    );
  }
  for (const [scenarioId, reason] of Object.entries(EXTRA_SCENARIO_COVERAGE)) {
    assert(
      scenarioCatalog[scenarioId]?.id === scenarioId,
      `extra scenario coverage entry is missing from the scenario catalog: ${scenarioId}`
    );
    assert(
      reason && reason.includes("not listed in protocols.md"),
      `extra scenario coverage entry must explain why it is outside protocols.md: ${scenarioId}`
    );
  }

  for (const [client, capability] of Object.entries(CLIENT_CAPABILITIES)) {
    for (const scenarioId of capability.runnableScenarios || []) {
      assert(
        scenarioCatalog[scenarioId]?.id === scenarioId,
        `${client}: runnable scenario is missing from the scenario catalog: ${scenarioId}`
      );
    }
    for (const scenarioId of capability.harnessGaps || []) {
      assert(
        scenarioCatalog[scenarioId]?.id === scenarioId,
        `${client}: harness-gap scenario is missing from the scenario catalog: ${scenarioId}`
      );
    }
  }
}

const opts = parseArgs(process.argv.slice(2));
const protocolsMd = read(protocolsMdPath);
const readme = read(readmePath);
const audit = read(auditPath);
const knownLimitations = read(knownLimitationsPath);
const hiddifyImportMatrix = readJson(hiddifyImportMatrixPath);
const hiddifyImportDebug = readJson(hiddifyImportDebugPath);
const hiddifyAnytlsMatrix = readJson(hiddifyAnytlsMatrixPath);
const hiddifyAnytlsImportMatrix = readJson(hiddifyAnytlsImportMatrixPath);
const xrayWebtransportMatrix = readJson(xrayWebtransportMatrixPath);
const v2rayWebtransportMatrix = readJson(v2rayWebtransportMatrixPath);
const hiddifyCoreScan = runNode(["scripts/inspect-hiddify-core.js", "--json"]);
const clashVergeDebug = read(clashVergeDebugPath);
const flclashDebug = read(flclashDebugPath);
const hiddifyDebug = read(hiddifyDebugPath);
const xrayDebug = read(xrayDebugPath);
const v2rayDebug = read(v2rayDebugPath);
const clashVergeSection = markdownSection(audit, "clash-verge-rev (Mihomo core path)");
const flclashSection = markdownSection(audit, "FlClash");
const singBoxSection = markdownSection(audit, "sing-box");
const hiddifySection = markdownSection(audit, "Hiddify");
const xraySection = markdownSection(audit, "xray-core");
const v2raySection = markdownSection(audit, "V2Ray / V2Fly");
const clashVergeCovered = bulletBlock(clashVergeSection, "Covered");
const flclashCovered = bulletBlock(flclashSection, "Covered through the actual GUI client");
const singBoxCovered = bulletBlock(singBoxSection, "Covered");
const singBoxGaps = bulletBlock(singBoxSection, "Harness gaps");
const hiddifyCovered = bulletBlock(hiddifySection, "Covered");
const hiddifyGaps = bulletBlock(hiddifySection, "Harness gaps");

validateProtocolCatalogCoverage(protocolsMd);

assert(
  /`intentionally untracked`/.test(audit),
  "client capability audit must define the intentionally untracked classification"
);
for (const status of [
  "passed",
  "failed",
  "defect_confirmed",
  "gap_confirmed",
  "untracked_confirmed",
  "unexpected_pass",
  "unexpected_gap_pass",
  "unexpected_untracked_pass",
]) {
  assert(
    audit.includes(`\`${status}\``),
    `client capability audit must document matrix status value: ${status}`
  );
}
assert(
  /docs\/known-limitations\.md/.test(readme),
  "README must point readers at docs/known-limitations.md"
);
assert(
  /inspect-hiddify-core\.js/.test(readme),
  "README must document scripts/inspect-hiddify-core.js"
);
assert(
  /ext\.hiddify\.importAndActivateConfig/.test(readme),
  "README must document ext.hiddify.importAndActivateConfig"
);
assert(
  /### Hiddify packaged AnyTLS core gap/.test(knownLimitations),
  "known limitations must keep the Hiddify packaged AnyTLS core gap section"
);
assert(
  /gap_confirmed/.test(knownLimitations) &&
    /generated AnyTLS outbound/.test(knownLimitations),
  "known limitations must mention the current Hiddify AnyTLS gap-confirmed evidence"
);
assert(
  /importAndActivateConfig/.test(knownLimitations) &&
    /profileRepository\.addLocal/.test(knownLimitations),
  "known limitations must mention the app-native Hiddify import path"
);
assert(
  /inspect-hiddify-core\.js/.test(knownLimitations) &&
    /json_editor\.dart/.test(knownLimitations) &&
    /no\s+AnyTLS marker/i.test(knownLimitations),
  "known limitations must mention the source-vs-packaged-core AnyTLS scan result"
);
assert(
  /4\.1\.2/.test(knownLimitations) &&
    /40102/.test(knownLimitations) &&
    /25\.3\.6/.test(knownLimitations),
  "known limitations must mention the tested Hiddify 4.1.2 (40102) app bundle and bundled Xray 25.3.6 core"
);
assert(
  /### xray\/V2Ray WebTransport client shape unavailable/.test(knownLimitations),
  "known limitations must keep the xray/V2Ray WebTransport client shape section"
);
assert(
  /untracked_confirmed/.test(knownLimitations) &&
    /INTENTIONALLY_UNTRACKED_SCENARIOS/.test(knownLimitations),
  "known limitations must mention the untracked_confirmed WebTransport evidence and metadata source"
);
assert(
  /xtls\.github\.io\/en\/config\/transports/.test(knownLimitations) &&
    /v2fly\.org\/en_US\/v5\/config\/stream\.html/.test(knownLimitations),
  "known limitations must cite the current upstream Xray and V2Fly transport docs for the WebTransport client-shape gap"
);
assert(
  /26\.5\.9/.test(knownLimitations) &&
    /5\.49\.0/.test(knownLimitations),
  "known limitations must mention the tested xray-core 26.5.9 and V2Ray 5.49.0 versions for the WebTransport gap"
);
assert(
  hiddifyCoreScan.sourceSignals?.editorListsAnytls === true,
  "Hiddify source scan must confirm the editor still lists AnyTLS"
);
assert(
  hiddifyCoreScan.inferences?.packagedCoreMissingAnytlsMarkers === true,
  "Hiddify core scan must confirm the packaged core currently lacks AnyTLS markers"
);
assert(
  hiddifyCoreScan.inferences?.packagedCoreHasReusableShadowTlsPath === true &&
    hiddifyCoreScan.inferences?.packagedCoreHasReusableHysteria2Path === true &&
    hiddifyCoreScan.inferences?.packagedCoreHasReusableTuicPath === true,
  "Hiddify core scan must confirm the packaged core still exposes ShadowTLS, Hysteria2, and TUIC paths"
);
assert(
  hiddifyCoreScan.inferences?.packagedCoreHasXrayWrapperPath === true,
  "Hiddify core scan must confirm the packaged core still exposes the Xray wrapper path"
);

const hiddifyAnytlsScenario = scenarioResult(hiddifyAnytlsMatrix, "anytls_tcp");
assert(hiddifyAnytlsScenario, "stored Hiddify AnyTLS matrix must contain anytls_tcp");
assert(
  hiddifyAnytlsScenario.status === "gap_confirmed",
  "stored Hiddify AnyTLS matrix must keep status=gap_confirmed"
);
assert(
  hiddifyAnytlsScenario.expectedGap === true,
  "stored Hiddify AnyTLS matrix must keep expectedGap=true"
);
assert(
  hiddifyAnytlsScenario.gapReason === gapReason("hiddify", "anytls_tcp"),
  "stored Hiddify AnyTLS matrix must keep the machine-readable Hiddify gap reason"
);
const hiddifyImportScenario = scenarioResult(hiddifyImportMatrix, "vless_raw_tcp");
assert(
  hiddifyImportScenario,
  "stored Hiddify app-native import matrix must contain vless_raw_tcp"
);
assert(
  hiddifyImportScenario.status === "passed",
  "stored Hiddify app-native import matrix must keep vless_raw_tcp passed"
);
assert(
  hiddifyImportDebug.lastImportResult?.status === "ok" &&
    /\/\.runtime\/app\.hiddify\.com\/configs\//.test(
      hiddifyImportDebug.lastImportResult?.configPath || ""
    ),
  "stored Hiddify app-native import debug snapshot must record a successful app-managed import"
);
const hiddifyAnytlsImportScenario = scenarioResult(hiddifyAnytlsImportMatrix, "anytls_tcp");
assert(
  hiddifyAnytlsImportScenario,
  "stored Hiddify app-native AnyTLS matrix must contain anytls_tcp"
);
assert(
  hiddifyAnytlsImportScenario.status === "gap_confirmed" &&
    /profileRepository/.test(hiddifyAnytlsImportScenario.error || "") &&
    /unknown outbound type: anytls/.test(hiddifyAnytlsImportScenario.error || ""),
  "stored Hiddify app-native AnyTLS matrix must preserve the parser-level AnyTLS rejection"
);

const expectedWebtransportReason =
  INTENTIONALLY_UNTRACKED_SCENARIOS.vless_webtransport?.reason || "";
for (const [client, matrix] of [
  ["xray-core", xrayWebtransportMatrix],
  ["v2ray", v2rayWebtransportMatrix],
]) {
  const scenario = scenarioResult(matrix, "vless_webtransport");
  assert(
    scenario,
    `stored ${client} WebTransport matrix must contain vless_webtransport`
  );
  assert(
    scenario.status === "untracked_confirmed",
    `stored ${client} WebTransport matrix must keep status=untracked_confirmed`
  );
  assert(
    scenario.expectedUntracked === true,
    `stored ${client} WebTransport matrix must keep expectedUntracked=true`
  );
  assert(
    scenario.untrackedReason === expectedWebtransportReason,
    `stored ${client} WebTransport matrix must keep the shared intentionally untracked reason`
  );
}

const staleAnyTlsPatterns = [
  /anytls[\s\S]{0,80}still blocked/i,
  /packaged core[\s\S]{0,120}rejects[\s\S]{0,80}anytls/i,
];

for (const text of [audit, clashVergeDebug, flclashDebug, hiddifyDebug]) {
  for (const pattern of staleAnyTlsPatterns) {
    assert(!pattern.test(text), `stale AnyTLS capability wording remains: ${pattern}`);
  }
}

assert(hasRunnable("flclash", "anytls_tcp"), "FlClash must keep anytls_tcp runnable");
assert(
  hasRunnable("flclash", "vless_reality_vision"),
  "FlClash must keep vless_reality_vision runnable"
);
assert(!hasGap("flclash", "anytls_tcp"), "FlClash anytls_tcp must not be a harness gap");

assert(
  hasRunnable("clash-verge-rev", "anytls_tcp"),
  "clash-verge-rev/Mihomo must keep anytls_tcp runnable"
);
assert(hasRunnable("sing-box", "anytls_tcp"), "sing-box must keep anytls_tcp runnable");
assert(hasRunnable("sing-box", "naive_tcp"), "sing-box must keep naive_tcp runnable");
assert(!hasGap("sing-box", "naive_tcp"), "sing-box naive_tcp must not be a harness gap");
assert(/`naive_tcp`/.test(singBoxCovered), "sing-box audit must list naive_tcp as covered");
assert(!/`naive_tcp`/.test(singBoxGaps), "sing-box audit must not list naive_tcp as a gap");
assert(
  /`anytls_tcp`/.test(clashVergeCovered),
  "clash-verge-rev audit must list anytls_tcp as covered"
);
assert(/`anytls_tcp`/.test(flclashCovered), "FlClash audit must list anytls_tcp as covered");
assert(
  /`anytls_tcp`/.test(clashVergeDebug),
  "clash-verge-rev debug notes must mention anytls_tcp coverage"
);
assert(/`anytls_tcp`/.test(flclashDebug), "FlClash debug notes must mention anytls_tcp coverage");

assert(!hasRunnable("xray-core", "anytls_tcp"), "xray-core must not advertise AnyTLS");
assert(!hasRunnable("v2ray", "anytls_tcp"), "V2Ray/V2Fly must not advertise AnyTLS");
assert(
  /current xray\/v2ray-compatible WebTransport client config shape exists/i.test(
    INTENTIONALLY_UNTRACKED_SCENARIOS.vless_webtransport?.reason || ""
  ),
  "WebTransport must remain explicitly marked as intentionally untracked in capability metadata"
);
for (const scenarioId of Object.keys(INTENTIONALLY_UNTRACKED_SCENARIOS)) {
  assert(
    scenarioCatalog[scenarioId]?.id === scenarioId,
    `intentionally untracked scenario must still exist in the scenario catalog: ${scenarioId}`
  );
  for (const client of Object.keys(CLIENT_CAPABILITIES)) {
    assert(
      !hasRunnable(client, scenarioId),
      `${client} must not advertise intentionally untracked scenario ${scenarioId} as runnable`
    );
    assert(
      !hasGap(client, scenarioId),
      `${client} must not advertise intentionally untracked scenario ${scenarioId} as a harness gap`
    );
  }
}

if (hasRunnable("hiddify", "anytls_tcp")) {
  assert(
    !/`anytls_tcp`/.test(hiddifyGaps),
    "Hiddify audit still lists anytls_tcp as a gap while capability says runnable"
  );
} else {
  assert(
    hasGap("hiddify", "anytls_tcp"),
    "Hiddify anytls_tcp must be listed as a gap when not runnable"
  );
  assert(
    /generated AnyTLS outbound/.test(gapReason("hiddify", "anytls_tcp")),
    "Hiddify anytls_tcp must keep a machine-readable gap reason about the generated AnyTLS outbound"
  );
  assert(
    /`anytls_tcp`/.test(hiddifyGaps),
    "Hiddify audit must document anytls_tcp as a gap"
  );
  assert(
    !/`anytls_tcp`/.test(hiddifyCovered),
    "Hiddify audit must not list anytls_tcp as covered while not runnable"
  );
  assert(
    /connectError/.test(hiddifyDebug) && /generated AnyTLS outbound/.test(hiddifyDebug),
    "Hiddify debug notes must mention the connectError and generated AnyTLS outbound reason"
  );
  assert(
    /lastImportResult/.test(hiddifyDebug) &&
      /importAndActivateConfig/.test(hiddifyDebug) &&
      /profileRepository\.addLocal/.test(hiddifyDebug),
    "Hiddify debug notes must mention the app-native import path and lastImportResult evidence"
  );
  assert(
    /requestedConfig/.test(hiddifyDebug) && /currentConfig/.test(hiddifySection),
    "Hiddify docs must mention the isolated requestedConfig/currentConfig evidence"
  );
  assert(
    /unknown outbound type: anytls/.test(hiddifyDebug) &&
      /SingboxParser/.test(hiddifySection),
    "Hiddify docs must mention the parser-level AnyTLS rejection from the app-native import path"
  );
  assert(
    /inspect-hiddify-core\.js/.test(hiddifyDebug) &&
      /json_editor\.dart/.test(hiddifyDebug) &&
      /no\s+AnyTLS marker/i.test(hiddifyDebug),
    "Hiddify debug notes must mention the editor-vs-packaged-core AnyTLS scan result"
  );
  if (hiddifyCoreScan.dependencyVersions?.singBox) {
    assert(
      hiddifyDebug.includes(hiddifyCoreScan.dependencyVersions.singBox) &&
        hiddifySection.includes(hiddifyCoreScan.dependencyVersions.singBox),
      `Hiddify docs must mention the scanned packaged sing-box version ${hiddifyCoreScan.dependencyVersions.singBox}`
    );
  }
  assert(
    /4\.1\.2/.test(hiddifyDebug) &&
      /40102/.test(hiddifyDebug) &&
      /25\.3\.6/.test(hiddifySection),
    "Hiddify docs must mention the tested 4.1.2 (40102) app bundle and bundled Xray 25.3.6 core"
  );
}

for (const [client, section, debugText] of [
  ["xray-core", xraySection, xrayDebug],
  ["v2ray", v2raySection, v2rayDebug],
]) {
  if (
    !hasRunnable(client, "vless_webtransport") &&
    !hasGap(client, "vless_webtransport")
  ) {
    assert(
      /`vless_webtransport`/.test(section),
      `${client} audit must mention intentionally untracked vless_webtransport status`
    );
    assert(
      /(intentionally absent|intentionally not tracked|intentionally untracked|not tracked)/i.test(section),
      `${client} audit must explain that vless_webtransport is intentionally untracked`
    );
    assert(
      /`vless_webtransport`/.test(debugText),
      `${client} debug notes must mention vless_webtransport`
    );
    assert(
      /untracked_confirmed/.test(section) || /untracked_confirmed/.test(debugText),
      `${client} docs must mention the untracked_confirmed WebTransport result status`
    );
  }
}

if (opts.json) {
  console.log(
    JSON.stringify(
      {
        status: "ok",
        checkedClients: ["flclash", "clash-verge-rev", "hiddify", "xray-core", "v2ray"],
        intentionallyUntrackedScenarios: Object.keys(INTENTIONALLY_UNTRACKED_SCENARIOS),
        protocolsMdCoverage: Object.keys(PROTOCOL_CATALOG_COVERAGE).length,
        hiddifyCoreScan: {
          bundleRoot: hiddifyCoreScan.bundleRoot,
          singBoxVersion: hiddifyCoreScan.dependencyVersions?.singBox || null,
          xrayCoreVersion: hiddifyCoreScan.dependencyVersions?.xrayCore || null,
          editorListsAnytls: hiddifyCoreScan.sourceSignals?.editorListsAnytls === true,
          packagedCoreMissingAnytlsMarkers:
            hiddifyCoreScan.inferences?.packagedCoreMissingAnytlsMarkers === true,
        },
      },
      null,
      2
    )
  );
} else {
  console.log("capability docs OK");
}
