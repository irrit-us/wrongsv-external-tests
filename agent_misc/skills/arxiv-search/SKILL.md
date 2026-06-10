---
name: arxiv-search
description: Query the arXiv academic paper API to search, retrieve, and analyze scientific papers across physics, mathematics, computer science, and related fields. Use when searching for papers on arXiv, looking up papers by arXiv ID, tracking recent publications in a category, performing literature reviews, or fetching paper metadata (title, authors, abstract, categories).
---

# arXiv API

Query the arXiv public API for academic paper search and retrieval. Uses the Atom XML response format. All commands based on the official arXiv API specification.

## Prerequisites

- `curl`

## Base URL

```
https://export.arxiv.org/api/query
```

## Commands

### Look up by arXiv ID

```bash
curl -s 'https://export.arxiv.org/api/query?id_list=1706.03762'
```

Multiple IDs:

```bash
curl -s 'https://export.arxiv.org/api/query?id_list=1706.03762,2302.08447,2402.16786'
```

### Search by title

```bash
curl -s 'https://export.arxiv.org/api/query?search_query=ti:transformer+ti:attention&max_results=5'
```

### Search by author

```bash
curl -s 'https://export.arxiv.org/api/query?search_query=au:lecun&max_results=10'
```

### Search by abstract

```bash
curl -s 'https://export.arxiv.org/api/query?search_query=abs:reinforcement+learning+abs:robotics&max_results=5'
```

### Search all fields

```bash
curl -s 'https://export.arxiv.org/api/query?search_query=all:diffusion+models+image+generation&max_results=5'
```

### Filter by category

```bash
# Computer Science - AI
curl -s 'https://export.arxiv.org/api/query?search_query=cat:cs.AI&max_results=5&sortBy=submittedDate&sortOrder=descending'

# Multiple categories (OR)
curl -s 'https://export.arxiv.org/api/query?search_query=cat:cs.CL+OR+cat:cs.AI&max_results=10&sortBy=submittedDate&sortOrder=descending'
```

### Combined search

```bash
# Title contains "transformer" AND subject is cs.CL
curl -s 'https://export.arxiv.org/api/query?search_query=ti:transformer+AND+cat:cs.CL&max_results=5&sortBy=relevance'
```

### Exclude terms

```bash
curl -s 'https://export.arxiv.org/api/query?search_query=all:quantum+ANDNOT+all:machine+learning&max_results=5'
```

### Parse response with python3

```bash
curl -s 'https://export.arxiv.org/api/query?search_query=ti:transformer&max_results=5' \
  | python3 -c "
import xml.etree.ElementTree as ET
import sys
ns = {'atom': 'http://www.w3.org/2005/Atom', 'arxiv': 'http://arxiv.org/schemas/atom'}
root = ET.parse(sys.stdin).getroot()
for entry in root.findall('atom:entry', ns):
    title = entry.find('atom:title', ns).text.strip().replace('\n', ' ')
    authors = [a.find('atom:name', ns).text for a in entry.findall('atom:author', ns)]
    cats = [c.get('term') for c in entry.findall('atom:category', ns)]
    published = entry.find('atom:published', ns).text[:10]
    arxiv_id = entry.find('atom:id', ns).text.split('/')[-1]
    print(f\"{arxiv_id}\t{published}\t{', '.join(cats[:3])}\t{', '.join(authors[:3])}\t{title[:80]}\")
"
```

### Full metadata extraction

```bash
curl -s 'https://export.arxiv.org/api/query?id_list=1706.03762' \
  | python3 -c "
import xml.etree.ElementTree as ET, sys
ns = {'a': 'http://www.w3.org/2005/Atom', 'x': 'http://arxiv.org/schemas/atom'}
root = ET.parse(sys.stdin).getroot()
entry = root.find('a:entry', ns)
if entry is None:
    print('No results')
    sys.exit(1)
title = entry.find('a:title', ns).text.strip().replace('\n', ' ')
summary = entry.find('a:summary', ns).text.strip().replace('\n', ' ')[:300]
authors = [a.find('a:name', ns).text for a in entry.findall('a:author', ns)]
cats = [c.get('term') for c in entry.findall('a:category', ns)]
pub = entry.find('a:published', ns).text[:10]
updated = entry.find('a:updated', ns).text[:10]
arxiv_id = entry.find('a:id', ns).text.split('/')[-1]
doi = entry.find('x:doi', ns)
journal = entry.find('x:journal_ref', ns)
comment = entry.find('x:comment', ns)
links = [l.get('href') for l in entry.findall('a:link', ns) if l.get('title')]
print(f'ID:       {arxiv_id}')
print(f'Title:    {title}')
print(f'Authors:  {', '.join(authors)}')
print(f'Categories: {', '.join(cats)}')
print(f'Published: {pub}')
print(f'Updated:   {updated}')
if doi is not None: print(f'DOI:      {doi.text}')
if journal is not None: print(f'Journal:  {journal.text}')
if comment is not None: print(f'Comment:  {comment.text}')
print(f'Links:    {', '.join(links)}')
print(f'Abstract: {summary}...')
"
```

### Pagination

```bash
for start in 0 10 20 30 40; do
  echo "=== offset $start ==="
  curl -s "https://export.arxiv.org/api/query?search_query=cat:cs.AI&start=$start&max_results=10&sortBy=submittedDate&sortOrder=descending" \
    | python3 -c "
import xml.etree.ElementTree as ET, sys
ns = {'a': 'http://www.w3.org/2005/Atom', 'x': 'http://arxiv.org/schemas/atom'}
root = ET.parse(sys.stdin).getroot()
for entry in root.findall('a:entry', ns):
    title = entry.find('a:title', ns).text.strip().replace('\n', ' ')[:80]
    cats = [c.get('term') for c in entry.findall('a:category', ns)]
    print(f\"  [{', '.join(cats[:2])}] {title}\")
"
done
```

### Get total result count

```bash
curl -s 'https://export.arxiv.org/api/query?search_query=all:transformer&max_results=1' \
  | python3 -c "
import xml.etree.ElementTree as ET, sys
ns = {'a': 'http://www.w3.org/2005/Atom'}
root = ET.parse(sys.stdin).getroot()
total = root.find('{http://a9.com/-/spec/opensearch/1.1/}totalResults')
print(f'Total results: {total.text}')
"
```

---
	
## Full paper access

arXiv provides four access URLs per paper. The API response includes `rel="related"` for PDF and `rel="alternate"` for the abstract page. HTML and source availability must be checked with HEAD requests.

| Format | URL pattern | Availability |
|--------|-------------|--------------|
| Abstract (web) | `https://arxiv.org/abs/{id}` | Always |
| PDF | `https://arxiv.org/pdf/{id}` | Always |
| HTML | `https://arxiv.org/html/{id}` | Many papers (2010+), 404 if unavailable |
| Source (TeX) | `https://arxiv.org/src/{id}` | Almost always (tar.gz) |
| E-print (same as src) | `https://arxiv.org/e-print/{id}` | Almost always (tar.gz) |

### Download PDF

```bash
# Download to current directory
curl -O 'https://arxiv.org/pdf/1706.03762'

# With custom filename
curl -o attention.pdf 'https://arxiv.org/pdf/1706.03762'
```

### Download source (TeX + figures)

```bash
curl -o source.tar.gz 'https://arxiv.org/src/1706.03762'
mkdir attention_source && tar -xzf source.tar.gz -C attention_source
```

### Check and fetch HTML version

```bash
# Check availability (HEAD request)
curl -sI 'https://arxiv.org/html/1706.03762' | head -1
# HTTP/2 200 → available,   HTTP/2 404 → no HTML version

# Fetch HTML if available
curl -o paper.html 'https://arxiv.org/html/1706.03762'
```

### Bulk download: fetch all formats for a paper

```bash
fetch_paper() {
  id=$1
  dir="${id}"
  mkdir -p "$dir"

  echo "=== Fetching $id ==="

  # PDF (always available)
  curl -s -o "$dir/paper.pdf" "https://arxiv.org/pdf/$id"
  echo "  PDF: $(wc -c < "$dir/paper.pdf") bytes"

  # Source TeX (check first)
  if curl -sI "https://arxiv.org/src/$id" | grep -q 'HTTP/2 200'; then
    curl -s -o "$dir/source.tar.gz" "https://arxiv.org/src/$id"
    echo "  Source: $(wc -c < "$dir/source.tar.gz") bytes"
    tar -xzf "$dir/source.tar.gz" -C "$dir" 2>/dev/null
    echo "  Source extracted to $dir/"
  fi

  # HTML version (may not exist)
  if curl -sI "https://arxiv.org/html/$id" | grep -q 'HTTP/2 200'; then
    curl -s -o "$dir/paper.html" "https://arxiv.org/html/$id"
    echo "  HTML: $(wc -c < "$dir/paper.html") bytes"
  else
    echo "  HTML: not available"
  fi
}

fetch_paper 1706.03762
```

### Extract text from PDF

```bash
# Using pdftotext (poppler-utils)
pdftotext -layout paper.pdf paper.txt

# Using python3 (PyPDF2 or pymupdf)
python3 -c "
import sys
try:
    import fitz  # pymupdf
    doc = fitz.open('paper.pdf')
    text = chr(12).join(page.get_text() for page in doc)
    print(text[:2000])
except ImportError:
    print('Install pymupdf: pip install pymupdf')
"
```

### Extract abstract and metadata from HTML version

```bash
curl -s 'https://arxiv.org/html/1706.03762' \
  | python3 -c "
import sys, re
html = sys.stdin.read()
# Extract abstract
m = re.search(r'<div[^>]*class=\"ltx_abstract\"[^>]*>(.*?)</div>', html, re.S)
if m:
    abstract = re.sub(r'<[^>]+>', '', m.group(1)).strip()
    print('Abstract:', abstract[:500])
# Extract sections
for h in re.findall(r'<h[12][^>]*class=\"ltx_title[^>]*>(.*?)</h[12]>', html):
    print('##', re.sub(r'<[^>]+>', '', h).strip())
" 2>&1 | head -20
```

### Find papers with HTML versions via abstract pages

```bash
# The /abs/ page links to HTML if available. Check via HEAD.
for id in 1706.03762 2302.08447 2402.16786; do
  if curl -sI "https://arxiv.org/html/$id" | grep -q 'HTTP/2 200'; then
    echo "$id → HTML available"
  else
    echo "$id → PDF only"
  fi
done
```

### One-shot: search, find HTML-enabled papers, download all formats

```bash
# Search for recent papers, check which have HTML versions
curl -s 'https://export.arxiv.org/api/query?search_query=cat:cs.AI&max_results=5&sortBy=submittedDate&sortOrder=descending' \
  | python3 -c "
import xml.etree.ElementTree as ET, sys, subprocess
ns = {'a': 'http://www.w3.org/2005/Atom'}
root = ET.parse(sys.stdin).getroot()
for entry in root.findall('a:entry', ns):
    arxiv_id = entry.find('a:id', ns).text.split('/')[-1]
    title = entry.find('a:title', ns).text.strip().replace('\n', ' ')[:80]
    has_html = subprocess.run(
        ['curl', '-sI', f'https://arxiv.org/html/{arxiv_id}'],
        capture_output=True, text=True
    )
    html_ok = 'HTTP/2 200' in has_html.stdout
    print(f\"{arxiv_id}\t{'[HTML]' if html_ok else '[PDF ]'}\t{title}\")
"
```

---
	
## Query syntax reference

### Search field prefixes

| Prefix | Field | Example |
|--------|-------|---------|
| `ti` | Title | `ti:transformer` |
| `au` | Author | `au:bengio` |
| `abs` | Abstract | `abs:reinforcement+learning` |
| `cat` | Category | `cat:cs.AI` |
| `all` | All fields | `all:diffusion+models` |
| `jr` | Journal reference | `jr:nature` |
| `rn` | Report number | `rn:SU-HEP-2024` |
| `id` | arXiv ID | `id:1706.03762` |

### Boolean operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `+AND+` | Both terms required | `ti:attention+AND+cat:cs.CL` |
| `+OR+` | Either term | `cat:cs.AI+OR+cat:cs.LG` |
| `+ANDNOT+` | Exclude term | `all:quantum+ANDNOT+all:ML` |
| `+` (space) | Implicit AND (default) | `ti:graph+ti:neural+ti:network` |

### Grouping

Use parentheses for complex expressions:

```
(cat:cs.AI+OR+cat:cs.LG)+AND+ti:reinforcement+learning
```

## Parameters

| Parameter | Description | Default | Max |
|-----------|-------------|---------|-----|
| `search_query` | Query string with field prefixes and operators | — | — |
| `id_list` | Comma-separated arXiv IDs | — | ~100 IDs |
| `start` | Zero-based result offset | 0 | — |
| `max_results` | Results per page | 10 | ~2000 per query |
| `sortBy` | `relevance`, `lastUpdatedDate`, `submittedDate` | `relevance` | — |
| `sortOrder` | `ascending`, `descending` | depends | — |

## Common arXiv categories

| ID | Field |
|----|-------|
| `cs.AI` | Artificial Intelligence |
| `cs.CL` | Computation and Language (NLP) |
| `cs.CV` | Computer Vision |
| `cs.LG` | Machine Learning |
| `cs.CR` | Cryptography and Security |
| `cs.SE` | Software Engineering |
| `cs.DC` | Distributed, Parallel, and Cluster Computing |
| `cs.RO` | Robotics |
| `cs.DB` | Databases |
| `cs.NE` | Neural and Evolutionary Computing |
| `stat.ML` | Machine Learning (Statistics) |
| `math.OC` | Optimization and Control |
| `physics.comp-ph` | Computational Physics |
| `q-bio.NC` | Neurons and Cognition |
| `q-fin.CP` | Computational Finance |

Full list: https://arxiv.org/category_taxonomy

## Rate limits

- No more than 1 request every 3 seconds during peak hours
- Bulk downloads: use `start` parameter for offset pagination rather than sequential requests
- For large-scale harvesting, use the OAI-PMH interface or bulk data on S3 instead

**Note:** All commands verified against the live arXiv API (2026-05-30). Use HTTPS to avoid a 301 redirect. API docs: `https://info.arxiv.org/help/api/basics.html`
