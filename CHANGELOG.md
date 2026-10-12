# Changelog

## Unreleased

- Add a portable UarchDraw agent skill with Codex/Claude Code discovery entries,
  runnable authoring guidance and visual inspection of actual rendered output.

- Consolidate contributor/release guidance and the circuit gallery; remove dated
  review snapshots and redundant branding exports. Keep active regression inputs
  and CPU witnesses with the tests, outside the installed package.
- Save generated probe reports in ignored `output/`, add one cross-platform
  `npm run verify` command, and clean stale compilation output before builds.
- Require expected probe outcomes and synchronized teaching/gallery previews in CI.

- Replace the beginner example index with nine step-by-step lessons, 25 runnable
  checkpoints, nine complete exercise answers and five deliberate fault cases.
  Render and verify every learning result; keep code listings synchronized with
  their source files and retain the fourteen larger circuits as a reference gallery.

- Add version-2 authoring with parameters, typed port arrays, interface templates,
  built-in MUX/register interfaces, scoped groups and inferred port sides.
- Place automatic data/control lanes using measured symbol sizes; retain fixed
  anchors, align parallel buses and grow symbols to contain their real ports.
- Recover spacing failures through at most four audited attempts; record planning
  metrics and bound the routing-grid budget.
- Add `init`, serialized `watch`, `--overview` and `--focus` workflows; preserve
  verified output across invalid edits and refuse starter-file overwrites.
- Reject malformed runtime models and incorrectly typed options before geometry.
- Add four automatic tutorials, eight parameter/view variants and regressions
  for template binding, fanout, hierarchy boundaries and watch recovery.

- Prepare an English-only public repository, including tutorials, engineering
  reports, signal descriptions and the offline inspector.
- Add a documentation index, release guide, EditorConfig, issue forms and a
  pull-request template; check repository text, links and tracked artifacts in CI.
- Remove machine-specific paths from retained diagnostics and clarify historical
  review results versus current generated metrics.

- Recheck all ten examples and four layout variants with `review:all`; retain
  per-case visual findings, before images, geometry metrics and image hashes.
- Center rectangular pin names on their own ports and audit neighboring label
  lanes, preventing misleading label pairs in dense parallel inputs.
- Trim unused final-row and footer space without changing circuit definitions.

- Add counter, FIFO, register-file and sample-selector examples, 44 diverse-case
  probes and a 16-channel routing regression.
- Fix coincident adder inputs, off-center shaped ports and near-title pin labels.
- Unify default pipeline spans; size the canvas for aligned symbols, document
  text and arbitrary footer-note counts.
- Route zero-width return corridors and avoid falsely blocking extra grid rows
  around signal labels.
- Audit actual visible SVG wire paths, canvas bounds, clipped symbols and
  coincident unused pins; fail fast on non-grid route endpoints.

- Add a five-input round-robin arbiter tutorial and reproducible usability probes,
  including recorded automatic-layout and long-label limitations.
- Reattach signal labels after corridor pruning and audit their distance from
  their own wires; previously a disconnected label could pass the audit.
- Size MUXes for their input count and honor explicit vertical spans.
- Reserve header space according to the number of top return channels.
- Make routing diagnostics suggest supported source edits.

## 0.1.0 — 2026-09-29

- Establish the independent UarchDraw package and `uarchdraw` command.
- Introduce `.uarch` source files with a required `uarch 1` header and version-1 JSON model.
- Provide `render`, `check`, programmatic compilation and diagnostic exports.
- Include explicit ports, typed bundles, six hardware symbol kinds, named alignment,
  orthogonal routing, return channels and complete signal labeling.
- Export SVG, PNG, grayscale previews, an offline inspector and signal index.
- Ship five executable tutorials including the RV32I forwarding datapath.
- Add an original SVG identity, English/Traditional Chinese READMEs and developer documentation.
- Configure CI for Node 22/24 on Windows/Linux; remote runs depend on hosting the repository.
