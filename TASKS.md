# Proxy Testing Framework — Task List
# Last updated: 2026-06-11

## Completed

- [x] FlClash: Fix SemanticsNode.actions API (Flutter 3.44.1 compat)
- [x] FlClash: Fix utils.copyToClipboard → Clipboard.setData
- [x] FlClash: Add FlClashDebugService with VM extensions (getAppState, dumpSemantics, dumpWidgetTree, runSelfTest, performSemanticsAction)
- [x] FlClash: Add connectProxy/disconnectProxy/getProxyStatus extensions (direct ProviderContainer access for reliable E2E, bypasses UI)
- [x] FlClash: Register debug service in main.dart
- [x] FlClash: Patch tray_manager & hotkey_manager CMake -Werror issues
- [x] FlClash: Build profile mode Linux binary → binaries/flclash/ (131MB)
- [x] FlClash: Verified E2E — launch → connectProxy → proxy responds on port 7890 → disconnectProxy → reconnect
- [x] Hiddify: Fix SemanticsNode.actions API (same as FlClash)
- [x] Hiddify: Fix font_awesome_flutter 11.x FaIcon migration (json_editor, connection_button)
- [x] Hiddify: Fix simple_icons 16.x removed icons (ip_widget: azure/amazon/oracle → Icons.cloud fallback)
- [x] Hiddify: Bump pubspec deps (font_awesome_flutter ^11.0.0, simple_icons ^16.23.0)
- [x] Hiddify: Patch tray_manager CMake -Werror
- [x] Hiddify: Add HiddifyDebugService with VM extensions (getAppState, dumpSemantics, dumpWidgetTree, runSelfTest, importConfig, connectProxy, disconnectProxy, getProxyStatus, performSemanticsAction)
- [x] Hiddify: Register container in bootstrap.dart (setContainer call)
- [x] Hiddify: Build profile mode Linux binary → binaries/hiddify/ (105MB)
- [x] Hiddify: Build hiddify-core (Rust) → hiddify-core.so + HiddifyCli
- [x] start-proxy-app.sh: launch apps with config, headless Xvfb, proxy readiness polling, VM URI detection
- [x] run-proxy-test.sh: 4-phase E2E orchestrator (launch → self-test → evaluate → stop)
- [x] import-hiddify-config.py: pre-populate Hiddify SQLite DB with profile from config file
- [x] flutter_debug_bridge.py: WebSocket JSON-RPC bridge to VM service
- [x] Sample configs: sample-clash-config.yaml + sample-singbox-config.json
- [x] PATCHES.md: document all source modifications
- [x] Git init + push to irrit-us/wrongsv-external-tests
- [x] .gitignore: exclude source repos, build artifacts, results
- [x] Fork FlClash → irrit-us/FlClash, commit patches on debug branch, push
- [x] Fork hiddify-next → irrit-us/hiddify-next, commit patches on debug branch, push
- [x] Add both as git submodules to wrongsv-external-tests (tracking debug branches)
- [x] Remove stale proxy-testing-framework gitlink, add to .gitignore
- [x] Fix Hiddify connectProxy: bypass applyConfigOption (changeHiddifySettings hangs) — directly call HiddifyCoreService.start()
- [x] Fix Hiddify proxy port detection: Hiddify auto-generates config with different port; read from current-config.json
- [x] Rebuild Hiddify binary with connectProxy fix → binaries/hiddify/lib/libapp.so
- [x] Switch wrongsv-external-tests branch from master → main

## In Progress / Verification Needed

- [x] **Update run-proxy-test.sh**: Use ext.flclash.connectProxy instead of semantics-based UI tapping
- [x] **Commit final changes**: Modified debug_service.dart files, updated binaries, bootstrap.dart changes
- [x] **Test Xvfb headless mode**: FlClash verified
- [x] **Test proxy readiness detection**: FlClash verified (curl polling through port 7890)
- [x] **Debug Hiddify connectProxy**: Fixed — bypass applyConfigOption, directly call HiddifyCoreService.start()
- [x] **Hiddify E2E**: connectProxy works — connection succeeds, proxy responds on auto-generated port (12334 in test)
- [ ] **Test FlClash full E2E**: run-proxy-test.sh end-to-end with current binary
- [ ] **Run full Hiddify E2E**: run-proxy-test.sh end-to-end with updated port detection

## Known Limitations / Future Work

- [x] **Hiddify connectProxy hangs**: FIXED — connectProxy now bypasses ConnectionRepository.applyConfigOption() and directly calls HiddifyCoreService.start(). The applyConfigOption step calls changeHiddifySettings gRPC which hangs on desktop (core already started during bootstrap).
- [ ] Hiddify profile import relies on raw SQLite — fragile if Drift schema changes
  - Better: Add `ext.hiddify.importAndActivateConfig` that uses profileRepository from ProviderContainer
- [ ] SimpleIcons 16.x removed microsoftazure, amazonaws, oracle — using generic Icons.cloud fallback
  - Restore if brand icons return in future simple_icons versions
- [ ] Proxy port auto-detection from config (Python yaml/json parsing in start script) — basic, may fail on complex configs
- [ ] No macOS/Windows binary builds (Linux only)
- [ ] Git LFS not configured — 236MB total binary size; consider for frequent updates

## Quick Start Commands

```bash
# FlClash E2E test (config-placement approach, simple)
./scripts/run-proxy-test.sh --app flclash --config configs/sample-clash-config.yaml

# Hiddify E2E test (DB-import approach)
./scripts/run-proxy-test.sh --app hiddify --config configs/sample-singbox-config.json

# Manual app start for debugging
./scripts/start-proxy-app.sh --app flclash --config ./my-config.yaml &
source /tmp/flclash_status.env
echo "Proxy: socks5://127.0.0.1:${PROXY_PORT}"
echo "VM: ${VM_SERVICE_URI}"

# Direct VM bridge calls for FlClash
python3 scripts/flutter_debug_bridge.py --vm-uri "$VM_URI" --call-extension ext.flclash.connectProxy
python3 scripts/flutter_debug_bridge.py --vm-uri "$VM_URI" --call-extension ext.flclash.getProxyStatus
python3 scripts/flutter_debug_bridge.py --vm-uri "$VM_URI" --call-extension ext.flclash.disconnectProxy
```
