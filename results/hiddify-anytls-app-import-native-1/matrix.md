# Client Capability Matrix — Hiddify

## Scenario Results

### AnyTLS TCP

- Status: `gap_confirmed`
- Error: `[HiddifyClient] failed to import config via app extension: "Failed to import config through profileRepository: ProfileFailure.unexpected(error: gRPC Error (code: 2, codeName: UNKNOWN, message: [SingboxParser] unmarshal error: outbounds[0]: unknown outbound type: anytls, details: [], rawResponse: null, trailers: {}), stackTrace: )"`
- Expected gap: `true`
- Startup debug: `/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-anytls-app-import-native-1/anytls_tcp/debug-startup-failure.json`
- Gap reason: `packaged Hiddify core rejected the generated AnyTLS outbound and never exposed the local mixed proxy port`

## Server Defects


## Harness Gaps

- anytls_tcp — packaged Hiddify core rejected the generated AnyTLS outbound and never exposed the local mixed proxy port

## Intentionally Untracked

- vless_webtransport — scenario is intentionally untracked until a current xray/v2ray-compatible WebTransport client config shape exists and external capability metadata can be added
