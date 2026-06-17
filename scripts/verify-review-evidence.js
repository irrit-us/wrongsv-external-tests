#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function parseArgs(argv) {
  const opts = {
    outputRoot: null,
    outputFile: null,
    standingOnly: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--output-root":
        opts.outputRoot = path.resolve(next);
        i++;
        break;
      case "--output-file":
        opts.outputFile = path.resolve(next);
        i++;
        break;
      case "--standing-only":
        opts.standingOnly = next;
        i++;
        break;
      case "--dry-run":
        opts.dryRun = true;
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
  console.log(`verify-review-evidence.js

Usage:
  node scripts/verify-review-evidence.js [options]

Options:
  --output-root <path>    parent directory for standing-limitations results
  --output-file <path>    write the combined JSON summary to this file
  --standing-only <csv>   pass through to recheck-standing-limitations --only
  --dry-run               print the commands without executing them
`);
}

function runNode(repoRoot, args) {
  const stdout = execFileSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return stdout.trim();
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..");
  const standingArgs = ["scripts/recheck-standing-limitations.js"];
  if (opts.outputRoot) {
    standingArgs.push("--output-root", opts.outputRoot);
  }
  if (opts.standingOnly) {
    standingArgs.push("--only", opts.standingOnly);
  }
  if (opts.dryRun) {
    console.log(
      JSON.stringify(
        {
          outputFile:
            opts.outputFile ||
            (opts.outputRoot
              ? path.join(opts.outputRoot, "review-evidence-summary.json")
              : null),
          commands: [
            `node scripts/inspect-client-cores.js`,
            `node scripts/inspect-hiddify-core.js`,
            `node scripts/check-capability-docs.js`,
            `node ${standingArgs.join(" ")}`,
          ],
        },
        null,
        2
      )
    );
    return;
  }

  const coreClientScans = JSON.parse(
    runNode(repoRoot, ["scripts/inspect-client-cores.js", "--json"])
  );
  const hiddifyCoreScan = JSON.parse(
    runNode(repoRoot, ["scripts/inspect-hiddify-core.js", "--json"])
  );
  const docsCheck = JSON.parse(runNode(repoRoot, ["scripts/check-capability-docs.js", "--json"]));
  const standing = JSON.parse(runNode(repoRoot, standingArgs));

  const summary = {
    coreClientScans,
    hiddifyCoreScan,
    docsCheck,
    standingLimitations: standing,
  };

  const outputFile =
    opts.outputFile ||
    (opts.outputRoot ? path.join(opts.outputRoot, "review-evidence-summary.json") : null);
  if (outputFile) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }

  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
