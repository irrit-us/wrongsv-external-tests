# Known Limitations

## App patches — compatibility vs behavior

All patches to FlClash and Hiddify are designed to be **additive** (new debug extensions) or
**compilation fixes** (API/dependency updates). No existing UI behavior or capability is removed.

### Hiddify connectProxy — bypasses applyConfigOption

`ext.hiddify.connectProxy` calls `HiddifyCoreService.start()` directly instead of going through
`ConnectionRepository.applyConfigOption()` → `changeHiddifySettings` gRPC. The gRPC call hangs
on desktop because the core is already started during bootstrap.

**Impact:** The debug extension uses a different code path than the UI "Connect" button.
The UI flow is unchanged. The extension achieves the same result (proxy engine running with
the active profile config).

### SimpleIcons 16.x — replaced removed brand icons

`simple_icons` 16.x removed `microsoftazure`, `amazonaws`, and `oracle` icons. These were
replaced with Material `Icons.cloud` + original brand colors in `ip_widget.dart`.

**Why:** Flutter 3.44.1 requires `simple_icons` ≥ 16.x (due to `final class IconData`).
Staying on old `simple_icons` prevents compilation.

**Impact:** Users see generic cloud icons instead of brand-specific ones for Azure/Amazon/Oracle
IP check services. All other icons are unaffected. Restore brand icons if they return in
future `simple_icons` versions.

### Hiddify profile import — app-native in app-manager, raw SQLite in shell helpers

The `ProxyAppManager` / `HiddifyClient` path now imports configs through
`ext.hiddify.importAndActivateConfig`, which routes the content through
Hiddify's own `profileRepository.addLocal(...)` path and returns a structured
`lastImportResult` in the VM-service debug snapshot.

The raw SQLite helper `scripts/import-hiddify-config.py` still exists for the
shell-only launch scripts, so those paths remain fragile if Drift (Hiddify's
ORM) changes its schema.

### FlClash dumpWidgetTree — empty in profile mode

Flutter's profile mode compiles with AOT, which disables the debugger/evaluator. This means
`toStringDeep()` (used by `dumpWidgetTree`) returns minimal output. Full widget tree dumps
require debug mode builds.

### FlClash requires pre-launch profile import

FlClash still expects an active profile in its local database before `connectProxy` can bind
its SOCKS/mixed port. The harness now handles this by running `scripts/import-flclash-config.py`
before launch, which writes the profile file, updates `database.sqlite`, and sets
`currentProfileId` in `shared_preferences.json`.

**Impact:** the app-manager path is now functional, but the imported-profile state lives outside
the Flutter VM extensions. Any alternative launcher must perform the same import step first.

### xray-core TLS mode rejects `allowInsecure`

Recent xray-core builds (tested with 26.5.9 on June 13, 2026) reject legacy TLS configs that use
`tlsSettings.allowInsecure`. The harness therefore validates xray-core against REALITY-based
wrongsv configs by default; plain TLS configs need either pinned certificates or an updated
config translation layer.

## Build & infrastructure

- **Linux only:** Binaries are built for Linux x86-64. macOS and Windows builds require
  their respective platforms (Flutter does not cross-compile desktop targets).
- **Git LFS not configured:** Binary sizes total ~236MB. Consider LFS for frequent updates.
- **Proxy port auto-detection:** Config parsing (YAML/JSON) in scripts handles common
  formats but may fail on complex or non-standard config structures.

## Current client/runtime gaps

### Hiddify packaged AnyTLS core gap

The current packaged Hiddify desktop runtime still rejects the generated AnyTLS
outbound and never exposes its local mixed proxy port. The stored evidence set
here came from Hiddify app version 4.1.2 (build 40102) with a bundled Xray
25.3.6 core inside the packaged runtime.

Evidence:

- [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-anytls-gap-isolated-2/matrix.json)
  records `status = "gap_confirmed"` with
  `gapReason = "packaged Hiddify core rejected the generated AnyTLS outbound and never exposed the local mixed proxy port"`.
- [debug-startup-failure.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-anytls-gap-isolated-2/anytls_tcp/debug-startup-failure.json)
  shows `connectError`, `requestedConfig`, and the packaged-core decode failure.
- [app-native import success](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-app-import-native-1/vless_raw_tcp/debug-initial.json)
  shows `lastImportResult.status = "ok"` together with the app-managed
  `configPath`, proving that the app-manager path now imports through
  Hiddify's own repository layer instead of prewriting the SQLite database.
- [app-native AnyTLS import failure](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-anytls-app-import-native-1/matrix.json)
  now fails earlier with
  `ProfileFailure.unexpected(... [SingboxParser] unmarshal error: outbounds[0]: unknown outbound type: anytls ...)`,
  which shows Hiddify's own profile validation path rejecting AnyTLS before the
  GUI ever reaches connect time.
- `node scripts/inspect-hiddify-core.js` reports that
  `hiddify-next/lib/features/profile/details/json_editor.dart` still lists
  `anytls`, but the current packaged desktop `lib/hiddify-core.so` exposes no
  AnyTLS marker while still exposing scanned `shadowtls`, `hysteria2`,
  `tuic`, gRPC, QUIC, and Xray wrapper paths. The same scan currently reports
  embedded `sing-box` `v1.8.9`.

Impact:

- `wrongsv` keeps direct Hiddify AnyTLS export gated.
- capability-gated generation records Hiddify AnyTLS as a harness gap rather
  than producing a runnable desktop artifact.

### xray/V2Ray WebTransport client shape unavailable

The current harness treats `vless_webtransport` as intentionally untracked
because the tested xray-core / V2Ray binaries do not currently provide a
confirmed client config shape that interoperates with wrongsv's WebTransport
server path. This also matches the current upstream transport docs: Project X
documents RAW, XHTTP, mKCP, gRPC, WebSocket, HTTPUpgrade, and Hysteria
transports, while V2Fly documents TCP, WebSocket, mKCP, gRPC, QUIC, Meek,
Google Docs Viewer, HTTPUpgrade, and Hysteria2 stream transports, with no
documented WebTransport outbound/client shape in either family. The current
stored evidence here comes from xray-core 26.5.9 and V2Ray 5.49.0.

Upstream refs:

- `https://xtls.github.io/en/config/transports/`
- `https://www.v2fly.org/en_US/v5/config/stream.html`

Evidence:

- [xray matrix](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-webtransport-matrix-1/matrix.json)
  records `status = "untracked_confirmed"`; the paired startup artifact shows
  xray-core 26.5.9 rejecting the generated QUIC-shaped outbound before it opens
  the SOCKS port.
- [v2ray matrix](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-webtransport-matrix-2/matrix.json)
  records `status = "untracked_confirmed"`; the paired report shows V2Ray
  starts but still fails compatibility and traffic while wrongsv logs repeated
  WebTransport protocol errors.

Impact:

- `vless_webtransport` remains outside both `runnableScenarios` and
  `harnessGaps`; it is tracked via `INTENTIONALLY_UNTRACKED_SCENARIOS`.
- `wrongsv` keeps direct xray-family WebTransport export gated until a current
  client config shape exists.
