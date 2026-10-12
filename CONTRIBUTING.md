# Contributing

## Build and verify

Use Node.js 22 or 24 and npm on Windows or Linux. Install dependencies separately
on each operating system; do not copy `node_modules` between them.

```sh
npm ci
npm run verify
```

In PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.
`verify` checks repository content and links, runs the tests, regenerates every
example and review variant, and installs a fresh package to exercise its CLI/API.
CI runs the same command on Windows/Linux with Node 22/24. Record the environments
actually tested in [validation](docs/validation.md).

Keep project content in English, UTF-8 and LF. The repository guard rejects CJK
text, broken local links, inconsistent package metadata and tracked build output.
It does not replace review of writing or behavior.

## Files to maintain

- `src/`: the diagram engine and CLI; regression tests and CPU witnesses live in `src/test/`.
- `examples/`: runnable circuit sources and the nine-lesson course.
- `docs/`: current user/architecture references and intentional gallery images.
- `assets/`: the bundled font and its license.
- `scripts/`: generation, probes and release verification.

Keep `dist/`, `node_modules/`, `output/`, coverage and local package archives
untracked. Probe reports and variant images are regenerated in `output/`;
do not add dated snapshots or duplicate review documents. Git preserves history.

For teaching changes, edit `examples/tutorials/course.json` and its checkpoint/
solution sources, then run `npm run tutorials`. Lesson pages are generated from
those explanations and complete files. Inspect the result images; keep every
step runnable and explain the visible change, practice answer and relevant errors.

The original identity uses [logo.svg](docs/images/logo.svg); regenerate the README
banner with `npm run branding`. The banner motif is decorative, not a verified CPU.

Agent guidance lives in `.agents/skills/uarchdraw/SKILL.md`. The Claude entry in
`.claude/skills/uarchdraw/SKILL.md` points to it. Keep the shared workflow current
with the CLI and syntax references; execute its example when changing it.

## Review drawing changes

1. Inspect color and grayscale previews at a useful scale.
2. Trace the changed data, control, fanout and feedback paths. For RV32I, trace
   ALU results, loads, store data, both bypass paths and stall/flush controls.
3. Confirm crossings are distinguishable from connected branches and that
   each name identifies the correct pin or signal.
4. Run the relevant tests and retain deliberate fault-detection cases.
5. Update previews when sources or visible rendering change.

Use generic routing/symbol rules. Architecture-specific constraints belong in
the source or fixture. Geometry acceptance does not establish human readability;
the CPU witness is not RTL or ISA-compliance verification.

Individual probes remain available as `review:arbiter`, `review:cases` and
`review:automation`. `review:all` includes them and saves manifests/probe results
under `output/`. Canonical version-1 serialization must remain compatible with
the model even when version-2 authoring changes.

## Prepare a remote push or release

Run `npm ci` and `npm run verify`, inspect changed previews, then check:

```sh
git diff --check
git status --short
git remote -v
```

Stage only intended source, documentation and preview changes. Update the
changelog and validation record. For an empty remote, use its actual clone URL:

```sh
git remote add origin YOUR_REMOTE_URL
git fetch origin
git push -u origin main
```

If a remote is already configured, use that remote. If it contains commits,
inspect and reconcile history before pushing; do not force-push over it.
Local validation does not claim the remote workflow has run.

An npm publication is a separate release. Set real repository/issue URLs once
the hosting location is known. Choose a version, update package and lockfile
metadata, date the changelog, repeat verification and inspect `npm pack --dry-run`.
Publish and tag only the intended release; preserve all license notices.
