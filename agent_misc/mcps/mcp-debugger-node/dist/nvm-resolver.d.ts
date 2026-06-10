import type { NvmVersion } from "./types.js";
export declare function resolveNodeVersion(version: string): NvmVersion;
export declare function listNvmVersions(): NvmVersion[];
export declare function getCurrentNvmVersion(): string;
