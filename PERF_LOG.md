# List pane rendering performance log

Working log for list pane rendering experiments (file rows + group headers). All changes are local and unstaged.
Benchmark instrumentation is temporary and listed at the bottom so it can be removed cleanly.

## Environment

- macOS, Obsidian desktop, 120 Hz display (frame budget 8.33 ms)
- Vault: this repo, `PerfBench/` folder with 1,500 generated markdown notes (frontmatter tags/properties, preview text,
  mtimes spread over 20 months so date grouping produces many group headers). Folder is in `.git/info/exclude`.
- Settings during benchmarks: standard list mode, preview 2 rows, feature images on, dates on, file icons on, sticky
  group headers on, tags off.
- Plugin built with `NN_BENCH=1 node esbuild.config.mjs production` which aliases `react-dom` to `react-dom/profiling`
  (production perf semantics, React.Profiler enabled).

## Benchmark harness

`obsidian eval` script (fire-and-poll via `window.__nnBenchResult`) runs four scenarios and reads three instruments: rAF
frame deltas, a `React.Profiler` around `ListPaneVirtualContent`, and per-component render counters (`window.__nnRC`,
active only while benchmarking).

- **stepScroll** – 300 frames of `scrollTop += 18`. Stress test: every discrete step fires `scroll` + `scrollend`, so
  the virtualizer notifies twice and the whole ListPane subtree re-renders twice per frame.
- **flickScroll** – 200 frames of `scrollTop += 140`. Mount-heavy stress test (~1.5 file rows mount per frame).
- **smoothScroll** – native `scrollBy({behavior:'smooth'})` over ~19,000 px. Closest to a real drag: `isScrolling` stays
  true, React commits only happen when the visible range changes.
- **folderSwitch** – navigate docs → PerfBench (9 reps), wall time from API call to second rAF.

## Investigation findings (pre-optimization)

1. **Real drags re-render only on range change.** During native smooth scrolling the virtualizer notifies ~0.26×/frame
   (range changes), not per frame. The 2-renders-per-frame seen with discrete `scrollTop` steps is a `scrollend`
   artifact: each programmatic step completes an "instant scroll", flipping `isScrolling` false→true, and both flips
   notify. Real drags do not pay this; keyboard/programmatic scrolling does.
2. **Every commit re-renders all pane chrome.** `ListPaneVirtualContent`, `ListPaneGroupHeader`, `ListPaneHeader`, and
   `ServiceIcon` are not memoized. One commit re-renders ~2 visible group headers and ~7 ServiceIcons plus the full
   header/breadcrumb area.
3. **FileItem is well memoized** (renders only on mount during scroll), but a single mount runs ~25 `useMemo`s, 11
   `useState`s in `useFileItemContentState` (plus a second full cache snapshot in its layout effect), a tooltip
   build+set effect, and an icon `innerHTML` effect.
4. **Folder switch (1,500 files) is not React-bound**: 35 ms wall, ~2.3 ms React in the virtual content subtree. The
   rest is list data rebuild + `estimateSize` over all items (each file row estimate does DB lookups) + nav pane work.
5. `@tanstack/react-virtual` 3.14.3 (stock npm, verified against registry tarball) supports `directDomUpdates`, but
   during real scrolls renders are already range-gated, so it would mainly help the artifact case.

## Baseline (2026-07-05)

| Scenario             | mean | p50 | p95  | max  | dropped | commits | React ms | FileItem renders | heap Δ   |
| -------------------- | ---- | --- | ---- | ---- | ------- | ------- | -------- | ---------------- | -------- |
| stepScroll (300f)    | 8.32 | 8.3 | 13.3 | 16.6 | 28      | 600     | 110.9    | 55               | −1.8 MB  |
| flickScroll (200f)   | 8.31 | 8.3 | 9.7  | 12.8 | 1       | 400     | 76.1     | 304              | +22.7 MB |
| smoothScroll (1122f) | 8.32 | 8.3 | 10.0 | 14.9 | 3       | 287     | 128.2    | 206              | −24.1 MB |

Render counters per scenario (baseline): stepScroll — ListPane 600, ListPaneHeader 600, GroupHeader 1052, ServiceIcon
4052; smoothScroll — ListPane 294, ListPaneHeader 287, GroupHeader 567, ServiceIcon 2002.

folderSwitch: median 35.0 ms (min 32.9, max 46.0), React median 2.3 ms.

## Experiments

### E1 – Memoize list pane chrome (KEPT)

`React.memo` on `ListPaneGroupHeader`, `ServiceIcon`, `ListPaneHeader`, `ListPaneTitleArea`. All props verified stable
(header models come from a `useMemo`, handlers are `useCallback`).

- Render counts during stepScroll: ListPaneHeader 600 → 0, ServiceIcon 4052 → 4, ListPaneGroupHeader 1052 → 4.
  smoothScroll: ServiceIcon 2002 → 7, GroupHeader 567 → 13.
- Wall/React-ms effect was inside run-to-run noise (the components are small), but thousands of avoided renders per
  scroll also means less allocation churn. Kept.

### E2 – Date format cache in DateUtils (KEPT)

`DateUtils.formatWithFallback` now memoizes formatted output in a Map keyed by language + format + timestamp (cap 8192,
clear-on-full). Every FileItem mount previously ran the full moment pipeline (locale resolution + moment instance +
format-string parse).

- smoothScroll `displayDate` time: 13.6 ms → 6.1 ms (remaining is first-touch misses; steady-state browsing is ~all
  hits).
- FileItem body time: 43.6 ms → 34.7 ms (−20%).

### E3 – Per-index row fact cache in the virtual row map (DISCARDED)

Cached `isFileVisuallySelected`/`hasFileCustomBackground` per index in a Map so row + neighbors don't recompute them 3×.
rowMap time was unchanged to slightly worse (39.1 vs 37.3 ms smoothScroll; 60.9 vs 57.5 stepScroll) — those checks
early-out cheaply in the common no-custom-background case, and Map overhead ate the savings. Reverted.

### E4 – FileItem hook-count reduction (implemented, measurement pending)

Rationale: ~31 ms of smoothScroll FileItem body time is outside the content/pills/date sections; suspected hook-mount
overhead (~45 hook slots per row mount) and per-mount service lookups.

- `useFileItemContentState`: 11 `useState` slots consolidated into one state box + separate `featureImageUrl` state;
  subscription updates now do one `setState` with per-field identity preservation instead of up to eight; property clone
  avoided when values are equal.
- FileItem: removed ~12 trivial `useMemo`/`useCallback` slots (className joins, style objects, count display strings,
  external-file check, icon id lookup, hidden description, tooltip settings object → built inside the effect with
  primitive deps, title element JSX).
- `useImageFileResourceVersion`: merged two effects into one (3 → 2 slots).
- Typecheck + all 1587 unit tests pass. Obsidian measurement pending (blocked, see below).

### E5 – Date group boundary + month label caches (KEPT)

`DateUtils.getDateGroupInfo` ran per file per list rebuild (1,500× per folder switch) and (a) rebuilt
today/yesterday/week/month boundary Dates every call, (b) ran a full moment `format('MMMM')` per file for same-year
month groups. Now: boundaries cached per reference time (stable within a rebuild since `dayKey` is fixed), month labels
cached per language + month, numeric comparisons instead of Date-object comparisons.

Node micro-benchmark (`bench-listbuild.mjs`, 1,500 files spread over 20 months, PerfBench-like):

- `getDateGroupInfo` ×1500: 6.98 ms → 0.22 ms (32×)
- `buildListItems` total: 7.48 ms → 0.44 ms (17×)

This is the dominant cost of `data:buildListItems` seen in the Obsidian folder-switch probe (4.3–7.6 ms), so folder
switching should drop by roughly that amount. All 1,587 unit tests pass. In-app verification pending unlock.

### E6 – Decorate-sort-undecorate in sortFiles (DISCARDED)

Precomputed sort keys once per file instead of per comparison (relevant when `useFrontmatterMetadata` is on and getters
do Map lookups). Node A/B with map-backed getters, 1,500 files: modified-desc 0.044 ms → 0.043 ms (V8 inline-caches the
getters; the lookups were never the cost), and title sorts are dominated by the collator either way. Reverted. If
`data:baseFiles` still matters after unlock, the suspect is `extractMetadata` per file per navigation inside
`sortNavigationFiles` (fresh per-call cache, per-file frontmatter date parsing), not the comparator.

### E8 – contain/height on group-header virtual rows (DISCARDED)

Applied `contain: layout style` + `height: var(--item-height)` to `.nn-virtual-list-group-header` (file rows already
have containment). stepScroll p95/dropped unchanged within noise (13.0–14.3 / 20–28 vs 13–14.4 / 24–30), and forcing a
fixed height risks clipping variable-height manual-sort goal headers. Reverted.

The residual stepScroll drops are layout-bound, not React-bound: a 2 px/frame step scroll produces the same 599 commits
and ~114 ms React but only 2 dropped frames, and smoothScroll at the same ~17 px/frame content rate drops 0–3 frames per
1,120. The drops only appear when the `scrollend` double-commit artifact combines with content ingestion — i.e. only
under discrete programmatic scrolling. A possible future fix is `useScrollendEvent: false` on the virtualizer (falls
back to a 150 ms isScrolling debounce); that is a behavior change and needs a product decision.

### E7 – Memoized ListPaneRow + pane-props bundle (KEPT)

Extracted each virtual row into a memoized `ListPaneRow` component (primitive props + stable references), and bundled
the ~20 pane-level FileItem inputs into one `FileItemPaneProps` object (built once per surface with `useMemo`, so row
elements carry one stable reference). Rows now bail out entirely on commits that don't change their inputs — offset-only
updates and hover moves on other rows. FileItem prop count dropped from ~40 to 16.

- stepScroll React ms: 114.5 → 93.8 (−18%)
- smoothScroll React ms: 126.8 → 115.0 (−9%)
- folderSwitch rt: buildListItems 4.6 → 3.0 ms, wall 46.3 → 36.6 ms (occluded-window run; frame stats not comparable,
  CPU metrics are)
- Functional probe after the change: row click selects the right file, sticky header renders, group collapse/expand
  works. All 1,587 tests pass.

In-app E4+E5 validation (visible window, same suite): FileItem body flick 23.5 → 17.1 ms (−27%), step 15.6 → 12.6 ms
(−19%); content-state hook halved; `data:buildListItems` 7.3 → 4.6 ms (−37%).

## Session notes / pitfalls

- **Benchmarks require the screen to be unlocked.** With the console locked (`ioreg -n Root` →
  `IOConsoleLocked = true`), Chromium suspends rAF and rendering for Obsidian; the harness hangs on its first
  `requestAnimationFrame`. `caffeinate -i -s` keeps the system (and the Obsidian process + CLI) responsive; in-app
  measurements resume after unlock.
- Folder-switch wall times drift ±15 ms between suite runs (thermals / background work). Compare folder-switch numbers
  only from the dedicated switch-only probe, and rely on the `__nnRT` section timers for attribution.
- Headless (locked-screen) in-app probes are unreliable: React commits still run, but `navigateToFolder` promises can
  await rAF-dependent steps and hang. A first cold switch after plugin reload showed much higher one-off costs
  (baseFiles 21 ms, buildListItems 15 ms — cold caches + cold JIT) before hanging; treat cold-start numbers separately
  from steady-state.

## Final state

Kept changes (all unstaged, nothing committed):

- `src/utils/dateUtils.ts` — format cache (E2) + date-group boundary/month-label caches (E5)
- `src/components/ServiceIcon.tsx`, `src/components/ListPaneHeader.tsx`, `src/components/ListPaneTitleArea.tsx` —
  `React.memo` (E1)
- `src/components/fileItem/useFileItemContentState.ts` — single state box instead of 11 `useState`s (E4)
- `src/components/FileItem.tsx` — trivial-memo removal (E4) + `FileItemPaneProps` bundle (E7)
- `src/components/listPane/ListPaneVirtualContent.tsx` — memoized `ListPaneGroupHeader` (E1) + memoized `ListPaneRow` +
  pane-props/inline-rename bundles (E7)
- `src/components/listPane/ManualSortListContent.tsx` — adapted to the FileItem pane-props bundle (E7)
- `src/components/ListPane.tsx` — passes through unchanged apart from experiment plumbing removal

All temporary instrumentation (react-dom profiling alias, render counters, section timers, React.Profiler wrapper) has
been removed. `./scripts/build.sh` passes with zero errors and zero warnings; all 1,587 unit tests pass. Production
build smoke test in Obsidian: rows render, click selection works, flick scrolling drops 0 frames, folder switch ~39 ms
median.

Net effect vs baseline (comparable CPU metrics): React work per scroll pass down ~15–25% (stepScroll 110.9 → 93.8 ms,
smoothScroll ~128 → 115 ms), FileItem mount cost down ~25%, list rebuild on folder switch down ~60% (`buildListItems`
7.3 → 3.0 ms plus estimate/data savings). Real-drag scrolling was already mostly smooth; the remaining stress-case frame
drops are layout-bound (see E8).

The `PerfBench/` folder (1,500 generated notes) is still in the vault and excluded from git via `.git/info/exclude`;
delete the folder and the exclude line when no longer useful.

Follow-up candidates not pursued: `useScrollendEvent: false` (product decision, see E8); skipping the `useFileItemPills`
hook stack when no pills can render (~29 hook slots per row mount, ~3% of scroll React time — needs a `FileItemPills`
child component gated by the pure pill-count logic the height estimator already uses); `data:baseFiles` (~3 ms per
folder switch) is vault traversal + metadata-cache lookups with no obvious cheap win.
