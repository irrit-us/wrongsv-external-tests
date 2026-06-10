# Complex Box-Align Test Fixtures

Edge cases: arrow branching, nested boxes, hierarchical headings, corner arrows.

## Test C1: Arrow branching (split flow)

```text
     SOURCE
       │
       ▼
┌──────┴──────┐
│  Split Box  │
└──┬──────┬───┘
   │      │
   ▼      ▼
┌─────┐ ┌─────┐
│  A  │ │  B  │
└─────┘ └─────┘
```

## Test C2: Nested boxes (inner + outer)

```text
┌─────────────────────────┐
│  Outer Box              │
│                         │
│  ┌─────────────────┐    │
│  │  Inner Box      │    │
│  │  Content Here   │    │
│  └─────────────────┘    │
│                         │
└─────────────────────────┘
```

## Test C3: Hierarchical headings (3 levels)

```text
               MAIN TITLE
               ══════════

       SUB A              SUB B
       ─────              ─────

  ┌──────────┐      ┌──────────┐
  │  Alpha   │      │  Beta    │
  └──────────┘      └──────────┘
```

## Test C4: Arrow turning/corner (horizontal connector)

```text
  ┌──────────┐
  │  Source  │
  └────┬─────┘
       │
       │    ┌──────────┐
       └────│  Target  │
            └──────────┘
```

## Test C5: Multi-arrow fork (3-way split)

```text
              INPUT
                │
                ▼
       ┌────────┴────────┐
       │  Dispatcher     │
       └──┬──────┬────┬──┘
          │      │    │
          ▼      ▼    ▼
       ┌────┐ ┌────┐ ┌────┐
       │ R1 │ │ R2 │ │ R3 │
       └────┘ └────┘ └────┘
```

## Test C6: Asymmetric nested boxes (offset inner)

```text
┌──────────────────────────────┐
│  Parent Container            │
│                              │
│       ┌──────────────┐       │
│       │  Child       │       │
│       │  (offset)    │       │
│       └──────────────┘       │
│                              │
└──────────────────────────────┘
```

## Test C7: Title with subtitle (hierarchical headers with boxes)

```text
              SYSTEM OVERVIEW
              ═══════════════

    INPUT LAYER                OUTPUT LAYER
    ═══════════                ════════════

  ┌──────────────┐         ┌──────────────┐
  │   Parser     │         │  Formatter   │
  └──────────────┘         └──────────────┘
```

## Test C8: Arrow from text that splits

```text
         Data Source
              │
              ▼
    ┌─────────┴─────────┐
    │    Router         │
    └────┬──────────┬───┘
         │          │
         ▼          ▼
    ┌────────┐ ┌────────┐
    │Store A │ │Store B │
    └────────┘ └────────┘
```

## Test C9: 4-way fork

```text
               SOURCE
                 │
                 ▼
    ┌────────────┴────────────┐
    │     Demultiplexer       │
    └──┬──────┬──────┬─────┬──┘
       │      │      │     │
       ▼      ▼      ▼     ▼
    ┌────┐ ┌────┐ ┌────┐ ┌────┐
    │ W1 │ │ W2 │ │ W3 │ │ W4 │
    └────┘ └────┘ └────┘ └────┘
```

## Test C10: Arrow turning right (down then right)

```text
    ┌──────────┐
    │  Source  │
    └────┬─────┘
         │
         └─────────────────┐
                           │
                      ┌────┴─────┐
                      │  Target  │
                      └──────────┘
```

## Test C11: Arrow turning left (down then left via horizontal)

```text
                   ┌──────────┐
                   │  Source  │
                   └────┬─────┘
                        │
              ┌─────────┘
              │
         ┌────┴─────┐
         │  Target  │
         └──────────┘
```

## Test C12: Arrow from left turning down

```text
    ┌──────────┐
    │  Source  │──────────┐
    └──────────┘          │
                     ┌────┴─────┐
                     │  Target  │
                     └──────────┘
```

## Test C13: Double corner (down → right → down)

```text
    ┌──────────┐
    │  Source  │
    └────┬─────┘
         │
         └──────────┐
                    │
                    ├──────────────────┐
                                       │
                                  ┌────┴─────┐
                                  │  Target  │
                                  └──────────┘
```

## Test C14: 3-way fork with mixed corner arrows

```text
               HUB
                │
                ▼
    ┌───────────┴───────────┐
    │      Distributor      │
    └──┬────────┬────────┬──┘
       │        │        │
       │        │        └─────────────────────┐
       │        │                              │
       ▼        ▼                              ▼
    ┌────┐  ┌────┐  ┌──────────────────────────┐
    │ A  │  │ B  │  │ C (far right)            │
    └────┘  └────┘  └──────────────────────────┘
```

## Test C15: Two-stage cascading fork (split then split again)

```text
                MAIN
                 │
                 ▼
    ┌────────────┴────────────┐
    │     Stage 1 Router      │
    └────┬──────────────┬─────┘
         │              │
         ▼              ▼
    ┌─────────┐    ┌────┴──────────────────┐
    │ Direct  │    │    Stage 2 Router     │
    └─────────┘    └──┬───────┬───────┬────┘
                      │       │       │
                      ▼       ▼       ▼
                   ┌────┐  ┌────┐  ┌────────┐
                   │ X  │  │ Y  │  │   Z    │
                   └────┘  └────┘  └────────┘
```

## Test C16: T-junction corner patterns (multiple corners sharing a line)

```text
    ┌──────────┐     ┌──────────┐     ┌──────────┐
    │  Box A   │     │  Box B   │     │  Box C   │
    └────┬─────┘     └────┬─────┘     └────┬─────┘
         │                │                │
         └───────┬────────┴──────┬─────────┘
                 │                │
                 ▼               ▼
            ┌────────┐      ┌────────┐
            │ Merge1 │      │ Merge2 │
            └────────┘      └────────┘
```
