# Quick start

[Home](../README.md) · [Documentation](README.md) · [Tutorials](../examples/README.md)

New to the syntax? Follow [lesson 01](../examples/tutorials/01.md), which starts
with one block and shows the result of every edit. The
[course](../examples/tutorials/README.md) provides complete sources, images and
practice answers across nine lessons.

For the easiest editing workflow, build once, then use:

```sh
node dist/cli.js init design.uarch --template selector
node dist/cli.js watch design.uarch
```

Save the source to regenerate; refresh the generated SVG/HTML viewer. See
[automatic authoring](authoring.md) for parameters, templates and hierarchy.

## Build once

Use Node.js 22+ with npm. From the repository root:

```sh
npm ci
npm run build
node dist/cli.js --version
node dist/cli.js render examples/01-first-diagram.uarch
```

Use `npm.cmd` in PowerShell if its execution policy blocks `npm.ps1`.
Relative paths are resolved from the current working directory. Rendering needs
no Python installation, desktop GUI or externally installed font.

Open `output/01-first-diagram.svg` to inspect the vector drawing, or `.png` for
a raster preview. Open `.html` in a browser for signal search and locked selection.
When testing in an environment that disallows local browser files, SVG and PNG
remain usable without the interactive page.

## Ubuntu and WSL

Ubuntu 24.04 on WSL2 x64 has been [verified](validation.md#platform-results)
with Linux Node.js 22 and 24, including tests, all examples and fresh package
installation. Install Node.js 22 or newer and npm inside Ubuntu, then run the
same build commands above. No desktop environment is required for rendering.

Install dependencies separately on each operating system. Transfer the source
files, then run `npm ci` in Ubuntu; do not reuse Windows `node_modules`.
The PNG renderer includes a native Linux dependency selected during installation.
In WSL, a checkout in the Linux filesystem avoids extra filesystem overhead.

To verify your own installation from the repository root:

```sh
node -p "process.platform" # should print linux
npm test
node dist/cli.js render examples/05-rv32i-forwarding.uarch -o output/rv32i
```

## Register the local command

```sh
npm link
uarchdraw --help
uarchdraw render examples/05-rv32i-forwarding.uarch -o output/cpu
```

The PowerShell command wrapper is `uarchdraw.cmd`. You can also keep using
`node dist/cli.js` directly. Remove the local link with `npm unlink --global uarchdraw`.

## CLI

```text
uarchdraw render INPUT.uarch [-o OUTPUT_PREFIX] [--svg-only | --png-only]
uarchdraw check INPUT.uarch
uarchdraw init FILE.uarch [--template starter|selector|arbiter|fifo|hierarchy]
uarchdraw watch INPUT.uarch [-o OUTPUT_PREFIX]
uarchdraw render INPUT.uarch --overview
uarchdraw render INPUT.uarch --focus core.execute
uarchdraw --version
uarchdraw --help
```

- Input accepts version-1/2 `.uarch` or version-1 design `.json`.
- `init` refuses to overwrite files. `watch` rebuilds on saves and recovers after
  invalid edits; refresh the generated viewer manually.
- `--overview` and `--focus GROUP` derive hierarchy views. They also work with
  `check` and `watch`. `--no-adaptive` disables spacing retries for diagnostics.
- The default prefix is `output/<input-name>`. `-o` selects a path prefix.
- `--svg-only` suppresses PNG files. `--png-only` suppresses standalone SVG files.
- Both modes still produce HTML, source/model copies, the signal index and audit data.
- `check` validates the model, performs routing and audits the rendered SVG, then prints JSON. It writes no files and rejects output flags.
- Success exits with status 0. Input, routing or audit errors exit with status 1.
- If the output source path equals the input path, the original source is preserved, including comments.

## Output files

| Suffix | Contents |
| --- | --- |
| `.svg`, `.png` | Main editable drawing and 2400px preview |
| `-gray.svg`, `-gray.png` | Same geometry in grayscale |
| `.html` | Standalone signal inspector |
| `.signals.md` | Every signal's meaning, type, source and destinations |
| `.qa.json` | Actual geometry checks and counts |
| `.planning.json` | Attempt count and effective column/row spacing |
| `.layout.json` | Placed symbols, pin coordinates and routed edges |
| `.json` | Electrical model and layout constraints; no cached coordinates |
| `.uarch` | Expanded version-1 source; parameters/templates/comments are not retained |

For routing/audit failures, `render` writes `.rejected.svg` and `.diagnostic.json`
instead of replacing the verified diagram. Validation failures before layout are
reported directly. Previously generated successful files are not removed; inspect
the exit status so an old image is not mistaken for the failed run's output.

## Learn and verify

```sh
npm run examples
npm test
npm run review
npm run review:all
```

`examples` regenerates all fourteen diagrams and the preview images in `docs/images/`.
`npm run tutorials` regenerates the course's 25 checkpoints and nine answer images.
`review` also crops forwarding and hazard details from the exact RV32I SVG.
`review:all` includes the course and adds four legacy layout variants, eight automation variants,
usability probes and recorded image hashes.
The full-size diagram has 49 named nets; the signal index explains `/N` for bit
width and `{N}` for typed bundles.

## Troubleshooting

| Message / symptom | Action |
| --- | --- |
| Unsupported source version | Start with `uarch 1` or `uarch 2`; see the corresponding language guide. |
| Unknown signal type | Declare the bundle before its ports; use `bits(W)` in version 2 or `u32` in version 1. |
| Undriven input | Connect it from an output, or mark a deliberately unused input `optional`. |
| Incompatible types | Match the width and every bundle field; equal total widths are not enough. |
| No readable label space / no legal route | After bounded retries are exhausted, shorten labels, split into views or revise physical hints. The engine will not omit the wire. |
| Large diagram looks tiny | Open SVG and zoom, use HTML zoom, or inspect the generated crops. |
| Text glyphs are missing | Use the tested English/Latin font profile for diagram labels. |
