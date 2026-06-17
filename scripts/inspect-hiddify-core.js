#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const opts = {
    outputFile: null,
    bundleRoot: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--output-file":
        opts.outputFile = path.resolve(next);
        i++;
        break;
      case "--bundle-root":
        opts.bundleRoot = path.resolve(next);
        i++;
        break;
      case "--json":
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`inspect-hiddify-core.js

Usage:
  node scripts/inspect-hiddify-core.js [options]

Options:
  --bundle-root <path>    inspect this Hiddify bundle root instead of auto-detecting
  --output-file <path>    also write the JSON summary to this file
  --json                  accepted for symmetry; JSON is always emitted
`);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function readText(filePath) {
  return fs.readFileSync(filePath).toString("latin1");
}

function fileInfo(filePath) {
  const buffer = fs.readFileSync(filePath);
  return {
    path: filePath,
    size: buffer.length,
    sha256: sha256(buffer),
  };
}

function firstExisting(paths) {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveBundleRoot(repoRoot, explicitRoot) {
  if (explicitRoot) {
    return explicitRoot;
  }
  const builtBundle = path.join(
    repoRoot,
    "hiddify-next",
    "build",
    "linux",
    "x64",
    "profile",
    "bundle"
  );
  if (fs.existsSync(path.join(builtBundle, "hiddify"))) {
    return builtBundle;
  }
  return path.join(repoRoot, "binaries", "hiddify");
}

function extractDepVersion(text, moduleName) {
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`dep\\t${escaped}\\t(v[^\\u0000\\r\\n\\t ]+)`));
  return match ? match[1] : null;
}

function extractBuildTags(text) {
  const match = text.match(/build\t-tags=([^\u0000\r\n]+)/);
  if (!match) {
    return [];
  }
  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function has(text, marker) {
  return text.includes(marker);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..");
  const bundleRoot = resolveBundleRoot(repoRoot, opts.bundleRoot);
  const coreLibrary = path.join(bundleRoot, "lib", "hiddify-core.so");
  const cliBinary = path.join(bundleRoot, "HiddifyCli");
  const editorFile = path.join(
    repoRoot,
    "hiddify-next",
    "lib",
    "features",
    "profile",
    "details",
    "json_editor.dart"
  );

  for (const requiredFile of [coreLibrary, cliBinary, editorFile]) {
    if (!fs.existsSync(requiredFile)) {
      throw new Error(`required Hiddify inspection input not found: ${requiredFile}`);
    }
  }

  const coreText = readText(coreLibrary);
  const cliText = readText(cliBinary);
  const editorText = fs.readFileSync(editorFile, "utf8");

  const buildTags = extractBuildTags(cliText);
  const sourceSignals = {
    editorListsAnytls: has(editorText, '"anytls"'),
    editorListsShadowtls: has(editorText, '"shadowtls"'),
    editorListsHysteria2: has(editorText, '"hysteria2"'),
    editorListsTuic: has(editorText, '"tuic"'),
    editorListsXrayWrapper: has(editorText, '"xray"'),
  };
  const moduleMarkers = {
    anytlsAsciiMarkerPresent: has(coreText, "anytls"),
    singBoxAnytlsModulePresent: has(coreText, "/outbound/anytls.go"),
    singBoxShadowTlsModulePresent: has(coreText, "/outbound/shadowtls.go"),
    singBoxHysteria2ModulePresent: has(coreText, "/outbound/hysteria2.go"),
    singBoxTuicModulePresent: has(coreText, "/outbound/tuic.go"),
    singBoxGrpcTransportPresent: has(coreText, "/transport/v2raygrpc/"),
    singBoxQuicTransportPresent: has(coreText, "/transport/v2rayquic/"),
    xrayCoreEmbedded: has(coreText, "github.com/xtls/xray-core"),
    xraySplitHttpTransportPresent: has(
      coreText,
      "/transport/internet/splithttp/"
    ),
    xrayHttpUpgradeTransportPresent: has(
      coreText,
      "/transport/internet/httpupgrade/"
    ),
    xrayGrpcTransportPresent: has(coreText, "/transport/internet/grpc/"),
  };
  const dependencyVersions = {
    singBox: extractDepVersion(coreText, "github.com/sagernet/sing-box"),
    xrayCore: extractDepVersion(coreText, "github.com/xtls/xray-core"),
    singShadowTls: extractDepVersion(
      coreText,
      "github.com/sagernet/sing-shadowtls"
    ),
    singQuic: extractDepVersion(coreText, "github.com/sagernet/sing-quic"),
  };

  const summary = {
    status: "ok",
    inspectedAt: new Date().toISOString(),
    bundleRoot,
    files: {
      coreLibrary: fileInfo(coreLibrary),
      cliBinary: fileInfo(cliBinary),
      editorFile: {
        path: editorFile,
      },
    },
    buildTags,
    dependencyVersions,
    sourceSignals,
    moduleMarkers,
    inferences: {
      packagedCoreMissingAnytlsMarkers:
        !moduleMarkers.anytlsAsciiMarkerPresent &&
        !moduleMarkers.singBoxAnytlsModulePresent,
      packagedCoreHasReusableShadowTlsPath:
        moduleMarkers.singBoxShadowTlsModulePresent,
      packagedCoreHasReusableHysteria2Path:
        moduleMarkers.singBoxHysteria2ModulePresent,
      packagedCoreHasReusableTuicPath: moduleMarkers.singBoxTuicModulePresent,
      packagedCoreHasXrayWrapperPath:
        moduleMarkers.xrayCoreEmbedded &&
        (moduleMarkers.xraySplitHttpTransportPresent ||
          moduleMarkers.xrayHttpUpgradeTransportPresent ||
          moduleMarkers.xrayGrpcTransportPresent),
    },
  };

  if (opts.outputFile) {
    fs.mkdirSync(path.dirname(opts.outputFile), { recursive: true });
    fs.writeFileSync(opts.outputFile, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }

  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
