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

### Hiddify profile import — raw SQLite

Profile import for Hiddify is handled by `scripts/import-hiddify-config.py`, which writes
directly to Hiddify's SQLite database. This is fragile if Drift (Hiddify's ORM) changes
its schema.

**Better approach (future):** Add `ext.hiddify.importAndActivateConfig` that uses
`profileRepository` from ProviderContainer for DB-safe imports.

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
