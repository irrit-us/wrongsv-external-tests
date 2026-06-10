---
name: nvd-cve
description: Query the NIST National Vulnerability Database (NVD) REST API for CVE data, CVSS scores, KEV catalog entries, CWEs, and vulnerability intelligence. Use when researching CVEs, checking vulnerability severity, tracking exploit catalog changes, auditing CPE products, or performing security intelligence on published vulnerabilities.
---

# NVD CVE API

Query the NIST National Vulnerability Database (NVD) REST API v2.0 for CVE records, CVSS metrics, KEV catalog entries, CWE mappings, and CPE product data.

## Prerequisites

- `curl` and `python3` (for JSON formatting)
- Optional: [NVD API key](https://nvd.nist.gov/developers/request-an-api-key) for higher rate limits (5 req/30s without key, 50 req/30s with key)

## Base URL

```
https://services.nvd.nist.gov/rest/json/cves/2.0
```

## Commands

All commands verified against the live NVD API.

### Look up a single CVE

```bash
curl -s 'https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2024-3094' \
  | python3 -m json.tool
```

### Look up multiple CVEs (up to 100)

```bash
curl -s 'https://services.nvd.nist.gov/rest/json/cves/2.0?cveIds=CVE-2024-3094,CVE-2023-44487' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for v in d['vulnerabilities']:
    c = v['cve']
    sev = 'N/A'
    m = c.get('metrics', {})
    for k in ('cvssMetricV40', 'cvssMetricV31', 'cvssMetricV30', 'cvssMetricV2'):
        if k in m:
            sev = m[k][0]['cvssData']['baseSeverity']
            break
    print(f\"{c['id']}\t{sev}\t{c['descriptions'][0]['value'][:100]}\")
"
```

### Filter by CVSS severity

```bash
curl -s 'https://services.nvd.nist.gov/rest/json/cves/2.0?cvssV3Severity=CRITICAL&resultsPerPage=10&noRejected' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for v in d['vulnerabilities']:
    c = v['cve']
    print(f\"{c['id']}\t{c['published'][:10]}\t{c['descriptions'][0]['value'][:80]}\")
"
```

### Keyword search (exact phrase)

```bash
curl -s 'https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=remote+code+execution&keywordExactMatch&resultsPerPage=10&noRejected' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f\"Total: {d['totalResults']}\")
for v in d['vulnerabilities']:
    c = v['cve']
    print(f\"{c['id']}\t{c['published'][:10]}\")
"
```

### Filter by CWE

```bash
curl -s 'https://services.nvd.nist.gov/rest/json/cves/2.0?cweId=CWE-287&resultsPerPage=10&noRejected' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for v in d['vulnerabilities']:
    c = v['cve']
    print(f\"{c['id']}\t{c['published'][:10]}\t{c['descriptions'][0]['value'][:80]}\")
"
```

### CISA KEV catalog

```bash
curl -s 'https://services.nvd.nist.gov/rest/json/cves/2.0?hasKev&resultsPerPage=10&noRejected' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for v in d['vulnerabilities']:
    c = v['cve']
    kev_date = c.get('cisaExploitAdd', 'N/A')
    due_date = c.get('cisaActionDue', 'N/A')
    action = c.get('cisaRequiredAction', 'N/A')
    print(f\"{c['id']}\tKEV:{kev_date}\tDue:{due_date}\t{action[:60]}\")
"
```

### Filter by publication date range (120-day max)

```bash
curl -s 'https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=2026-05-01T00:00:00.000&pubEndDate=2026-05-30T00:00:00.000&resultsPerPage=20' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f\"Total published in range: {d['totalResults']}\")
for v in d['vulnerabilities'][:10]:
    c = v['cve']
    print(f\"{c['id']}\t{c['vulnStatus']}\t{c['descriptions'][0]['value'][:80]}\")
"
```

### Filter by last-modified date range

```bash
curl -s 'https://services.nvd.nist.gov/rest/json/cves/2.0?lastModStartDate=2026-05-29T00:00:00.000&lastModEndDate=2026-05-30T23:59:59.000&resultsPerPage=20&noRejected' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for v in d['vulnerabilities']:
    c = v['cve']
    print(f\"{c['id']}\tmodified:{c['lastModified'][:10]}\t{c['vulnStatus']}\")
"
```

### Filter by CPE product

```bash
curl -s 'https://services.nvd.nist.gov/rest/json/cves/2.0?cpeName=cpe:2.3:a:apache:log4j:2.0:*:*:*:*:*:*:*&resultsPerPage=20' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for v in d['vulnerabilities']:
    c = v['cve']
    print(f\"{c['id']}\t{c['published'][:10]}\")
"
```

### Virtual CPE match with version range

```bash
curl -s 'https://services.nvd.nist.gov/rest/json/cves/2.0?virtualMatchString=cpe:2.3:a:apache:log4j&versionStart=2.0&versionStartType=including&versionEnd=2.17.1&versionEndType=including&resultsPerPage=20' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for v in d['vulnerabilities']:
    c = v['cve']
    print(f\"{c['id']}\t{c['published'][:10]}\")
"
```

### Full CVE detail extraction

```bash
curl -s 'https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2024-3094' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
v = d['vulnerabilities'][0]['cve']
print(f\"ID: {v['id']}\")
print(f\"Status: {v['vulnStatus']}\")
print(f\"Published: {v['published']}\")
print(f\"Modified: {v['lastModified']}\")
print(f\"Source: {v['sourceIdentifier']}\")
print()
print('Description:')
for desc in v['descriptions']:
    if desc['lang'] == 'en':
        print(f\"  {desc['value'][:300]}\")
print()
metrics = v.get('metrics', {})
for key in ('cvssMetricV40', 'cvssMetricV31', 'cvssMetricV30', 'cvssMetricV2'):
    if key in metrics:
        m = metrics[key][0]['cvssData']
        print(f\"{key}: score={m['baseScore']} severity={m['baseSeverity']} vector={m['vectorString']}\")
        break
cwes = [w['description'][0]['value'] for w in v.get('weaknesses', []) if w.get('description')]
if cwes:
    print(f\"CWEs: {', '.join(cwes)}\")
refs = v.get('references', [])
print(f\"References: {len(refs)}\")
for r in refs[:5]:
    print(f\"  [{r.get('tags', ['?'])[0]}] {r['url']}\")
if v.get('cisaExploitAdd'):
    print(f\"KEV: added={v['cisaExploitAdd']} due={v['cisaActionDue']}\")
    print(f\"Action: {v['cisaRequiredAction']}\")
"
```

### Paginated bulk query

```bash
# Fetch pages of results
for start in 0 20 40; do
  curl -s "https://services.nvd.nist.gov/rest/json/cves/2.0?cvssV3Severity=CRITICAL&noRejected&resultsPerPage=20&startIndex=$start" \
    | python3 -c "
import json, sys
d = json.load(sys.stdin)
for v in d['vulnerabilities']:
    c = v['cve']
    print(f\"{c['id']}\t{c['published'][:10]}\")
"
done
```

### API key usage

```bash
curl -s -H 'apiKey: YOUR_API_KEY' \
  'https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2024-3094'
```

## Query parameters reference

| Parameter | Description | Example |
|-----------|-------------|---------|
| `cveId` | Single CVE (deprecated, prefer `cveIds`) | `CVE-2024-3094` |
| `cveIds` | Up to 100 CVE IDs, CSV | `CVE-2024-3094,CVE-2023-44487` |
| `keywordSearch` | Keyword AND search with wildcard | `remote+code` |
| `keywordExactMatch` | Exact phrase flag | (flag) |
| `cvssV3Severity` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` | `CRITICAL` |
| `cweId` | Filter by CWE | `CWE-287` |
| `cpeName` | Exact CPE match | `cpe:2.3:a:apache:log4j:2.0:*...` |
| `virtualMatchString` | Partial CPE match | `cpe:2.3:a:apache:log4j` |
| `hasKev` | CISA KEV catalog only | (flag) |
| `pubStartDate` / `pubEndDate` | Publication range (max 120 days) | `2026-05-01T00:00:00.000` |
| `lastModStartDate` / `lastModEndDate` | Modification range (max 120 days) | `2026-05-29T00:00:00.000` |
| `vulnStatuses` | Status filter (CSV) | `Modified,Analyzed` |
| `noRejected` | Exclude rejected CVEs | (flag) |
| `resultsPerPage` | Page size (max 2000) | `20` |
| `startIndex` | Zero-based offset | `0` |

## Rate limits

- Without API key: ~5 requests per 30 seconds
- With API key: ~50 requests per 30 seconds
- Request a key at: https://nvd.nist.gov/developers/request-an-api-key

## Limitations

- Date ranges capped at 120 consecutive days
- `resultsPerPage` max is 2000 for CVEs, 5000 for change history
- No new CVSS v2 data since July 2022
- CVSS v3/v4 with `NONE` severity are intentionally excluded from the database
