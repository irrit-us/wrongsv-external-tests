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

### FlClash connectProxy — proxy port not bound without subscription

`ext.flclash.connectProxy` calls `SetupAction.updateStatus(true)` which reports `"connected"`
and `isStart: true`, but the Clash core may not actually bind a proxy port. Root cause:
FlClash generates its Clash core config from profiles/subscriptions stored in its internal
database. Without a profile imported (there is no `ext.flclash.importConfig` extension), the
`currentProfileProvider` is null and `_setupConfig` can't produce a valid core configuration.

**Impact:** `connectProxy` returns success but no TCP port opens. Hiddify does not have this
issue — its `importConfig` extension + auto-generated sing-box config provides a working proxy.

**Better approach (future):** Add `ext.flclash.importConfig` that creates a profile from a
config file and activates it, mirroring Hiddify's flow.

## Build & infrastructure

- **Linux only:** Binaries are built for Linux x86-64. macOS and Windows builds require
  their respective platforms (Flutter does not cross-compile desktop targets).
- **Git LFS not configured:** Binary sizes total ~236MB. Consider LFS for frequent updates.
- **Proxy port auto-detection:** Config parsing (YAML/JSON) in scripts handles common
  formats but may fail on complex or non-standard config structures.
