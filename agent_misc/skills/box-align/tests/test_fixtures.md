# Box-Align Test Fixtures

Each fenced code block exercises specific checks. Run with:
```bash
python3 box_align.py tests/test_fixtures.md
python3 box_align.py --fix tests/test_fixtures.md
```

## Test 1: header-underline single block short

```text
                    SHORT TITLE
                    ══════════
```

## Test 2: header-underline multi-block

```text
                     LEFT PART               RIGHT SECTION
                     ════════                ══════════
```

## Test 3: header-center off-center (box with embedded title)

```text
┌────── TITLE ───────────────────────┐
│                                    │
└────────────────────────────────────┘
```

## Test 4: text-arrow fixable (no chain above)

```text
                         Security Audit Target
                               ▼
```

## Test 5: text-arrow chain-connected (non-fixable)

```text
                         Project Content Here
                               │
                               ▼
```

## Test 6: text-arrow at T-junction (excluded)

```text
┌──────────────────┬──────────────────┐
│                  │                   │
└──────────────────┴──────────────────┘
         ▼
```

## Test 7: corner-wall orphan corners

```text
┌──────────────────┐
│                  │
└──────────────────┘
                     └──────────────────┐
                     │                  │
                     └──────────────────┘
```

## Test 8: arrow-center off-center

```text
                      ▼
┌──────────────────────────────┐
│                              │
└──────────────────────────────┘
```

## Test 9: width-consistency stacked boxes

```text
┌──────────────────────────────────────┐
│                                      │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────┐
│                  │
└──────────────────┘
```

## Test 10: clean diagram (no issues)

```text
┌──────────────────────────────┐
│                              │
│        No issues here        │
│                              │
└──────────────────────────────┘
```
