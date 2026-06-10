---
name: gh-advisory
description: Query GitHub Security Advisories (GHSA) via the gh CLI. Use when checking for known vulnerabilities, looking up CVEs/GHSAs, auditing dependencies for security issues, tracking newly published advisories, or researching vulnerability data for a package or ecosystem.
---

# GitHub Advisory Database

Query the GitHub Advisory Database (GHSA) using `gh api /advisories`. Covers listing, filtering, detail lookup, date-range tracking, CVSS extraction, CWE mapping, and dependency auditing.

## Prerequisites

- [GitHub CLI (`gh`)](https://cli.github.com/) installed and authenticated (`gh auth login`)

## Base endpoint

```
GET /advisories              → list/search
GET /advisories/GHSA-xxxx    → single advisory detail
```

---

## Listing & basic search

### List recent advisories

```bash
gh api /advisories --jq '.[] | "\(.ghsa_id)\t\(.severity)\t\(.summary)"'
```

### Filter by severity

Valid: `low`, `medium`, `high`, `critical`, `unknown`. Single value only.

```bash
gh api '/advisories?severity=critical&per_page=10' \
  --jq '.[] | "\(.ghsa_id)\t\(.severity)\t\(.summary)"'
```

### Filter by ecosystem

```bash
gh api '/advisories?ecosystem=npm&severity=high&per_page=10' \
  --jq '.[] | "\(.ghsa_id)\t\(.vulnerabilities[0].package.name)\t\(.summary)"'
```

### Filter by type (reviewed / unreviewed)

```bash
gh api '/advisories?type=reviewed&severity=critical&per_page=10' \
  --jq '.[] | "\(.ghsa_id)\t\(.type)\t\(.summary)"'
```

### Filter by state

```bash
# Active advisories only
gh api '/advisories?state=published&severity=critical&per_page=10' \
  --jq '.[] | "\(.ghsa_id)\t\(.summary)"'

# Withdrawn advisories
gh api '/advisories?state=withdrawn&per_page=10' \
  --jq '.[] | "\(.ghsa_id)\twithdrawn:\(.withdrawn_at[:10])\t\(.summary)"'
```

### Sort and direction

```bash
# Newest first (by publish date)
gh api '/advisories?severity=critical&per_page=10&sort=published&direction=desc' \
  --jq '.[] | "\(.ghsa_id)\t\(.published_at[:10])\t\(.summary[:80])"'

# Recently updated first
gh api '/advisories?ecosystem=pip&per_page=10&sort=updated&direction=desc' \
  --jq '.[] | "\(.ghsa_id)\tupdated:\(.updated_at[:10])\t\(.summary[:80])"'

# Oldest first
gh api '/advisories?severity=critical&per_page=10&sort=published&direction=asc' \
  --jq '.[] | "\(.ghsa_id)\t\(.published_at[:10])"'
```

---

## Advanced filtering

### Filter by CWE

```bash
gh api '/advisories?cwe_ids=CWE-287,CWE-862&severity=high&per_page=10' \
  --jq '.[] | "\(.ghsa_id)\t\(.severity)\t\(.cwes[0].cwe_id)\t\(.summary[:80])"'
```

### Filter by identifier (CVE or GHSA)

```bash
gh api '/advisories?identifiers=CVE-2024-3094&per_page=5' \
  --jq '.[] | "\(.ghsa_id)\t\(.severity)\t\(.summary)"'
```

### Filter by CVE ID

```bash
gh api '/advisories?cve_id=CVE-2024-3094' \
  --jq '.[0] | "\(.ghsa_id)\t\(.severity)\t\(.summary)"'
```

### Date-range queries

```bash
# Published on a specific date
gh api '/advisories?published_at=2026-05-29&per_page=20' \
  --jq '.[] | "\(.ghsa_id)\t\(.severity)\t\(.summary[:80])"'

# Updated between dates
gh api '/advisories?updated_after=2026-05-27&updated_before=2026-05-30&per_page=20' \
  --jq '.[] | "\(.ghsa_id)\tupdated:\(.updated_at[:10])"'
```

### Combined multi-condition filter

```bash
gh api '/advisories?ecosystem=pip&severity=high&type=reviewed&sort=published&direction=desc&per_page=20' \
  --jq '.[] | "\(.ghsa_id)\t\(.severity)\t\(.published_at[:10])\t\(.summary[:80])"'
```

---

## Single advisory detail

### Full detail with CVSS, CWE, and credits

```bash
gh api /advisories/GHSA-xxxx-xxxx --jq '{
  ghsa_id,
  cve_id,
  severity,
  summary,
  type,
  state: (.withdrawn_at // "active"),
  published_at,
  updated_at,
  github_reviewed_at,
  nvd_published_at,
  cvss_score: .cvss.score,
  cvss_vector: .cvss.vector_string,
  cvss_v3: .cvss_severities.cvss_v3,
  cvss_v4: .cvss_severities.cvss_v4,
  cwes: [.cwes[]? | "\(.cwe_id): \(.name)"],
  credits: [.credits[]? | "\(.user.login) (\(.type))"],
  html_url,
  repository_advisory_url,
  source_code_location,
  vulnerabilities: [.vulnerabilities[] | {
    package: .package.name,
    ecosystem: .package.ecosystem,
    range: .vulnerable_version_range,
    patched: .first_patched_version
  }]
}'
```

### Compact one-liner detail

```bash
gh api /advisories/GHSA-xxxx-xxxx --jq \
  '"\(.ghsa_id) \(.severity) CVSS:\(.cvss.score) \(.cwes[0].cwe_id // "N/A") \(.vulnerabilities[0].package.name)@\(.vulnerabilities[0].first_patched_version // "?") — \(.summary)"'
```

### Full description text

```bash
gh api /advisories/GHSA-xxxx-xxxx --jq '.description'
```

### Look up by CVE → get GHSA

```bash
gh api '/advisories?cve_id=CVE-XXXX-XXXX' \
  --jq '.[0] | "\(.ghsa_id) \(.severity): \(.summary)"'
```

---

## Bulk & pagination

### Cursor-based pagination

The `Link` response header contains a cursor for the next page. Extract and follow:

```bash
# Page 1
response=$(gh api '/advisories?severity=critical&per_page=20' -i 2>&1)
echo "$response" | grep -oP '(?<=<)[^>]+(?=>; rel="next")'  # extract next cursor URL

# Follow cursor
gh api '/advisories?severity=critical&per_page=20&after=Y3Vyc29yOnYyOpK0MjAyNi0wNS0yOVQyMjozNToxM1rOAAV89w%3D%3D' \
  --jq '.[] | "\(.ghsa_id)\t\(.summary[:80])"'
```

### Batch CVE-to-GHSA mapping

```bash
for cve in CVE-2024-3094 CVE-2023-44487 CVE-2023-38545; do
  result=$(gh api "/advisories?cve_id=${cve}" --jq '.[0] | "\(.ghsa_id) \(.severity)"' 2>/dev/null)
  echo "$cve → ${result:-not found in GHSA}"
done
```

### Bulk GHSA detail fetch

```bash
for ghsa in GHSA-c2m8-4gcg-v22g GHSA-3qg8-5g3r-79v5 GHSA-h8q5-cp56-rr65; do
  echo "=== $ghsa ==="
  gh api "/advisories/$ghsa" --jq '"\(.severity) CVSS:\(.cvss.score) [\(.cwes[0].cwe_id // "N/A")] \(.vulnerabilities[0].package.name) — \(.summary)"'
  echo ""
done
```

---

## Tabular & reporting

### Tabular listing (TSV)

```bash
gh api '/advisories?severity=high&per_page=20' \
  --jq '.[] | [.ghsa_id, .severity, (.cvss.score // "?" | tostring), (.vulnerabilities[0].package.ecosystem // "?"), (.vulnerabilities[0].package.name // "?"), .summary[:100]] | @tsv'
```

### Count totals

```bash
# Total matched
gh api '/advisories?severity=critical&per_page=1' --silent -i 2>&1 | grep -i '^x-total-count'

# Count by extracting array length
gh api '/advisories?type=reviewed&severity=critical&per_page=100' --jq 'length'
```

### Severity distribution

```bash
for sev in low medium high critical unknown; do
  count=$(gh api "/advisories?severity=${sev}&type=reviewed&per_page=1" --silent -i 2>&1 | grep -i '^x-total-count' | awk '{print $2}' | tr -d '\r')
  echo "${sev}: ${count}"
done
```

### Date-range delta (what's new since last check)

```bash
last_check="2026-05-29"
gh api "/advisories?updated_after=${last_check}&sort=updated&direction=desc&per_page=50" \
  --jq '.[] | "\(.updated_at[:10])\t\(.severity)\t\(.ghsa_id)\t\(.summary[:80])"'
```

---

## Dependency auditing

### Audit a package for known vulnerabilities

```bash
gh api '/advisories?ecosystem=pip&severity=high&per_page=100' \
  --jq '.[] | select(.vulnerabilities[0].package.name | test("django")) | "\(.ghsa_id)\t\(.severity)\tCVSS:\(.cvss.score)\t\(.summary[:80])"'
```

### Check version range for a specific advisory

```bash
gh api /advisories/GHSA-xxxx-xxxx --jq '.vulnerabilities[] | {
  package: .package.name,
  ecosystem: .package.ecosystem,
  vulnerable: .vulnerable_version_range,
  fixed: .first_patched_version
}'
```

### Multi-package audit loop

```bash
for pkg in django requests flask numpy; do
  echo "=== $pkg ==="
  gh api "/advisories?ecosystem=pip&per_page=100" \
    --jq ".[] | select(.vulnerabilities[0].package.name == \"$pkg\") | \"\(.ghsa_id)\t\(.severity)\tCVSS:\(.cvss.score)\t\(.published_at[:10])\t\(.summary[:80])\""
  echo ""
done
```

---

## Common parameter reference

| Parameter | Description | Example |
|-----------|-------------|---------|
| `severity` | `low`, `medium`, `high`, `critical`, `unknown` (single value) | `critical` |
| `ecosystem` | Package ecosystem | `pip`, `npm`, `go`, `maven`, `nuget`, `rubygems`, `rust`, `composer` |
| `type` | `reviewed`, `unreviewed` | `reviewed` |
| `state` | `published`, `withdrawn` | `published` |
| `cwe_ids` | CWE filter (CSV) | `CWE-287,CWE-862` |
| `identifiers` | CVE or GHSA identifier | `CVE-2024-3094` |
| `cve_id` | Single CVE lookup | `CVE-2024-3094` |
| `published_at` | Published on date (ISO-8601) | `2026-05-29` |
| `updated_at` | Updated on date (ISO-8601) | `2026-05-29` |
| `updated_after` | Updated after date | `2026-05-27` |
| `updated_before` | Updated before date | `2026-05-30` |
| `sort` | `published`, `updated` | `published` |
| `direction` | `asc`, `desc` | `desc` |
| `per_page` | Results per page (max 100) | `50` |
| `after` | Cursor for next page | (from Link header) |

## Response fields (single advisory)

| Field | Description |
|-------|-------------|
| `ghsa_id` | GHSA identifier |
| `cve_id` | CVE identifier (if mapped) |
| `severity` | `low` / `medium` / `high` / `critical` |
| `summary` | Short description |
| `description` | Full advisory text |
| `cvss.score` | CVSS base score |
| `cvss.vector_string` | CVSS vector string |
| `cvss_severities.cvss_v3` | CVSS v3 details |
| `cvss_severities.cvss_v4` | CVSS v4 details |
| `cwes[]` | CWE IDs with names |
| `credits[]` | Reporter/analyst credits |
| `type` | `reviewed` or `unreviewed` |
| `published_at` | Publication timestamp |
| `updated_at` | Last update timestamp |
| `github_reviewed_at` | GitHub review timestamp |
| `nvd_published_at` | NVD publication timestamp |
| `withdrawn_at` | Withdrawal timestamp (null if active) |
| `html_url` | Advisory web page |
| `repository_advisory_url` | Source repo advisory |
| `source_code_location` | Source code repository URL |
| `vulnerabilities[]` | Affected packages (name, ecosystem, version ranges, patches) |
| `references[]` | External reference URLs |

## Common ecosystems

| Ecosystem | Value |
|-----------|-------|
| npm | `npm` |
| PyPI | `pip` |
| Go | `go` |
| Maven | `maven` |
| NuGet | `nuget` |
| RubyGems | `rubygems` |
| Crates.io | `rust` |
| Composer | `composer` |
| Hex | `erlang` |
| Pub | `dart` |
| Swift | `swift` |

## Limitations

- `per_page` max is 100
- No server-side package-name exact filter — use `--jq` with `select()` for client-side filtering
- `state=withdrawn` does not reliably return only withdrawn advisories — verify `withdrawn_at` field
- Repository-specific advisories require admin permissions on the target repo
