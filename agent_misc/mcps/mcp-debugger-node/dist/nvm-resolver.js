import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const NVM_DIR = process.env.NVM_DIR || join(homedir(), ".nvm");
const VERSIONS_DIR = join(NVM_DIR, "versions", "node");
function getNvmDir() {
    if (existsSync(VERSIONS_DIR))
        return VERSIONS_DIR;
    throw new Error(`nvm versions directory not found at ${VERSIONS_DIR}. Is nvm installed?`);
}
function resolveAlias(alias) {
    const aliasPath = join(NVM_DIR, "alias", alias);
    if (existsSync(aliasPath)) {
        return readFileSync(aliasPath, "utf-8").trim().replace(/^v/, "");
    }
    // Handle lts/* and lts/name patterns
    if (alias.startsWith("lts/")) {
        const ltsName = alias.replace("lts/", "");
        const ltsPath = ltsName === "*"
            ? join(NVM_DIR, "alias", "lts")
            : join(NVM_DIR, "alias", `lts_${ltsName}`);
        if (!existsSync(ltsPath)) {
            // Fallback: find latest LTS by scanning versions
            return findLatestLts();
        }
        return readFileSync(ltsPath, "utf-8").trim().replace(/^v/, "");
    }
    return alias.replace(/^v/, "");
}
function findLatestLts() {
    const versions = listInstalledVersions();
    // Heuristic: even major versions are typically LTS
    const ltsVersions = versions
        .map((v) => v.replace(/^v/, ""))
        .filter((v) => {
        const major = parseInt(v.split(".")[0], 10);
        return major % 2 === 0 && major >= 18;
    })
        .sort((a, b) => {
        const [aMaj, aMin, aPatch] = a.split(".").map(Number);
        const [bMaj, bMin, bPatch] = b.split(".").map(Number);
        return bMaj - aMaj || bMin - aMin || bPatch - aPatch;
    });
    return ltsVersions[0] || versions[versions.length - 1]?.replace(/^v/, "") || "";
}
function listInstalledVersions() {
    try {
        return readdirSync(getNvmDir()).filter((d) => d.startsWith("v"));
    }
    catch {
        return [];
    }
}
function findClosestVersion(target) {
    const versions = listInstalledVersions();
    if (versions.length === 0) {
        throw new Error("No Node.js versions installed via nvm");
    }
    // Exact match
    const exact = versions.find((v) => v === `v${target}` || v === target);
    if (exact)
        return exact.replace(/^v/, "");
    // Prefix match (e.g. "22" matches "22.11.0", "22.10.1")
    const prefix = target.replace(/^v/, "");
    const prefixMatches = versions
        .map((v) => v.replace(/^v/, ""))
        .filter((v) => v.startsWith(`${prefix}.`) || v === prefix)
        .sort((a, b) => {
        const [aMaj, aMin, aPatch] = a.split(".").map(Number);
        const [bMaj, bMin, bPatch] = b.split(".").map(Number);
        return bMaj - aMaj || bMin - aMin || bPatch - aPatch;
    });
    if (prefixMatches.length > 0)
        return prefixMatches[0];
    throw new Error(`No Node.js version matching '${target}' found. Installed: ${versions.join(", ")}`);
}
export function resolveNodeVersion(version) {
    const versionsDir = getNvmDir();
    const resolvedAlias = resolveAlias(version);
    const matched = findClosestVersion(resolvedAlias);
    const nodeBin = join(versionsDir, `v${matched}`, "bin", "node");
    if (!existsSync(nodeBin)) {
        throw new Error(`Node binary not found at ${nodeBin}`);
    }
    return {
        raw: version,
        resolvedPath: nodeBin,
        version: matched,
    };
}
export function listNvmVersions() {
    const versionsDir = getNvmDir();
    const versions = listInstalledVersions();
    const defaultVersion = getDefaultVersion();
    return versions.map((v) => {
        const ver = v.replace(/^v/, "");
        return {
            raw: v,
            resolvedPath: join(versionsDir, v, "bin", "node"),
            version: `${ver}${ver === defaultVersion ? " (default)" : ""}`,
        };
    });
}
function getDefaultVersion() {
    try {
        const out = execSync("nvm current", {
            encoding: "utf-8",
            shell: "/bin/bash",
            env: { ...process.env },
        }).trim();
        return out.replace(/^v/, "");
    }
    catch {
        // Try reading the default alias
        try {
            const defaultAlias = join(NVM_DIR, "alias", "default");
            if (existsSync(defaultAlias)) {
                return readFileSync(defaultAlias, "utf-8").trim().replace(/^v/, "");
            }
        }
        catch {
            // ignore
        }
        return "";
    }
}
export function getCurrentNvmVersion() {
    try {
        const out = execSync("nvm current", {
            encoding: "utf-8",
            shell: "/bin/bash",
            env: { ...process.env },
        }).trim();
        return out;
    }
    catch {
        return "unknown";
    }
}
//# sourceMappingURL=nvm-resolver.js.map