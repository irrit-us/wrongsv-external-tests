# Client Capability Matrix — Hiddify

## Scenario Results

### VLESS raw TCP

- Status: `passed`
- Compatibility: `true`
- Traffic local-quick: p50 182ms / p95 245ms / 10.39 req/s / error 0

## Server Defects


## Harness Gaps

- anytls_tcp — packaged Hiddify core rejected the generated AnyTLS outbound and never exposed the local mixed proxy port

## Intentionally Untracked

- vless_webtransport — scenario is intentionally untracked until a current xray/v2ray-compatible WebTransport client config shape exists and external capability metadata can be added
