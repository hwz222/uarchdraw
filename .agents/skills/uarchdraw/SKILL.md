---
name: uarchdraw
description: Create, edit, and review microarchitecture and RTL block diagrams with UarchDraw's .uarch language and CLI. Use for datapaths, CPU pipelines, forwarding, arbiters, FIFOs, and .uarch sources; this tool does not simulate or synthesize RTL.
---

# UarchDraw

Turn a structural hardware description into a diagram with identifiable blocks,
typed ports and traceable signals. Keep the editable `.uarch` source and generate
SVG, PNG and the signal inspector through the actual CLI. A drawing request does
not require an image-generation service or a hand-written replacement SVG.

## Locate and run the tool

This skill ships with UarchDraw. Resolve the project/package root three directories
above this skill directory; verify that `package.json` has `name: "uarchdraw"`.
Run the following commands from that root, regardless of the agent's starting
directory. Use absolute input/output paths when the user's files are elsewhere.

- A source checkout contains `src/` and `scripts/`. Use Node.js 22+ and npm.
  Run `npm ci` when dependencies are absent and `npm run build` when `dist/cli.js`
  is absent or source files changed. In PowerShell, use `npm.cmd` if needed.
- An installed package already contains `dist/`; use its `uarchdraw` command or
  `node dist/cli.js`. Do not run source-checkout build scripts in that package.
- Install dependencies independently on Windows and Linux. The native PNG
  renderer and font ship with the tool; no Python or desktop GUI is required.

Verify the command with `node dist/cli.js --version`. A new draft can start with:

```sh
node dist/cli.js init output/agent-work/design.uarch
node dist/cli.js check output/agent-work/design.uarch
node dist/cli.js render output/agent-work/design.uarch -o output/agent-work/diagram
```

`init` refuses to overwrite an existing file. Edit an existing source directly
when requested. For a larger starter, add `--template selector`, `arbiter`,
`fifo` or `hierarchy` to `init`. Keep drafts in ignored `output/` unless the user
chooses another location. A diagram task does not require global installation.

## Describe the hardware

Establish block boundaries, stage order, signal widths, drivers/receivers and
feedback paths from the requested design. State material assumptions, especially
pipeline register contents, forwarding priority and handshake behavior. UarchDraw
does not infer a complete architecture from an RTL file or verify that behavior.

Prefer `uarch 2` for new diagrams. Use automatic placement first; choose a small
related example instead of copying the entire CPU for an ordinary circuit.
Preserve an existing version-1 source when an edit does not require migration.

This complete example selects an ALU operand and captures its result:

```text
uarch 2
param W = 32
title "Selectable ALU operand"
stages INPUT EXECUTE OUTPUT

block operands in INPUT {
  out a: bits(W)
  out b: bits(W)
  out immediate: bits(W)
}
block mode in INPUT {
  role control
  out useImm: bit
}
block choice: mux(2, W) in EXECUTE { label "Operand B" }
block execute: alu in EXECUTE {
  label "ALU"
  in a: bits(W) @left
  in b: bits(W) @left
  out result: bits(W) @right
}
block capture: register(W) in OUTPUT { label "Result register" }

connect operands.a -> execute.a { label "A/${W}" }
connect operands.b -> choice.d[0] { label "B/${W}" }
connect operands.immediate -> choice.d[1] { label "Immediate/${W}" }
connect mode.useImm -> choice.select { label "UseImm"; style control }
connect choice.out -> execute.b { label "Selected/${W}" }
connect execute.result -> capture.d { label "Result/${W}" }
```

Replace the draft with that source and run `check`/`render` again. It should
contain five symbols and six named nets. Use its real output as the preview.

## Authoring rules that prevent common failures

- `bit` and `bits(W)` declare scalar widths. `type Flags { full: 1; empty: 1 }`
  declares a bundle. Connected bundle fields and widths must match exactly;
  a scalar of the same total width is a different type.
- `register(W)` exposes `d` and `q`. `mux(N, W)` exposes `d[0]` through `d[N-1]`,
  `select` and `out`; the select width is `clog2(N)`, with a minimum of one bit.
  Other symbol kinds are bare `block`, `register`, `pipeline`, `mux`, `alu` and
  `adder` with explicitly declared ports. Do not invent an `alu(W)` constructor.
- An ALU needs exactly two left-side operand inputs. Put any function/control
  inputs on another side. Use the built-in ALU outline rather than drawing one.
- Every required input needs a driver; unused outputs are allowed. Set
  `{ optional true }` only for an intentionally optional input. Fix missing
  drivers or incompatible widths instead of hiding errors with optional ports.
- Use one driver per input. Repeated version-2 connections from the same output
  merge into a fanout net. Version 1 requires all sinks in one `net` declaration.
- `out data[N]: bits(W)` declares an array; `data[*]` connects corresponding
  elements and requires matching lengths. Arrays are limited to 128 elements.
  Templates reuse ports/presentation, not internal circuits. Bundle slicing,
  concatenation, `inout` ports and external template imports are unsupported.
- IDs define connectivity; `label` defines visible text and `description`
  explains the signal in the inspector. Keep wire labels short and put longer
  explanations in descriptions. Use `data`, `control`, `forward` or `writeback`
  styles; `corridor top`/`bottom` prefers a return path, not a mandatory waypoint.

## Render, inspect and improve

Run `check`, then `render`, after meaningful source edits. Exit code 0 means
the structural/geometry checks passed; it does not establish readable layout
or correct RTL behavior. `check` writes no files. `render` produces SVG, color/
grayscale PNG, HTML, `.signals.md`, `.qa.json`, `.planning.json`, `.layout.json`,
expanded JSON and a canonical version-1 `.uarch` copy.

Inspect the actual PNG/SVG using the host's image/file viewer:

- Follow the main data path in stage order, and trace every branch of fanout.
- Confirm that control, bypass and feedback can be followed, every signal name
  belongs to its wire, and crossing gaps differ from connected junction dots.
- Check ALU/MUX outlines and their pin locations, crowded labels, whitespace,
  and both the overall drawing and a useful zoom/detail view.

If unreadable, fix the source and rerender. Start with shorter labels, clearer
stages or explicit `role`/`style`, then port sides (`@left`, `@bottom`, etc.),
named alignment or a block `layout` with `column` and `row` together. The planner
already measures symbols and tries up to four spacing profiles. Read
`.planning.json` before assuming automatic spacing is disabled or unbounded.
Use `--no-adaptive` only to diagnose retries.

For large designs, use `group` boundaries and render with `--overview` or
`--focus core.execute` when that group exists. Inspect both the detailed graph
and the overview: hiding internal wires does not fix a broken detailed graph.

On failure, read the actual diagnostic before changing architecture. Structural
errors can fail before any drawing is written. Routing/audit failures can produce
`.rejected.svg` and `.diagnostic.json`; old successful files may still exist.
Do not show an old preview as the result of a failed command. Prefer source/layout
fixes; change the generic engine only when engine work is within the user's task.

Keep editing the original version-2 input. Canonical output expands templates and
parameters and does not preserve their expressions/comments. `watch` rebuilds on
saves and retains the last verified output across invalid edits; browser refresh
is manual. In an automated run, use `check`/`render` instead of leaving a watcher.

Deliver the source and real diagram files with the key assumptions and any
remaining readability/verification limits. If a viewer is unavailable, report
automated results and the absence of visual inspection rather than claiming it.

## Read additional context only when needed

Paths below are relative to this skill file, not the shell working directory.

| Need | Reference |
| --- | --- |
| CLI flags, installation, artifact formats | [Quick start](../../../docs/quickstart.md) |
| Parameters, arrays, templates, hierarchy, placement | [Version-2 authoring](../../../docs/authoring.md) |
| Explicit version-1 sources or exported API | [Exchange format](../../../docs/language.md) |
| Complete circuit to adapt | [Circuit gallery](../../../examples/README.md) |
| Explain the syntax to a learner | [Progressive course](../../../examples/tutorials/README.md) |
| Five-stage RV32I with forwarding | [Source](../../../examples/05-rv32i-forwarding.uarch) and [teaching profile](../../../docs/rv32i.md) |
| Modify/test the renderer itself | [Architecture](../../../docs/architecture.md) and [Contributing](../../../CONTRIBUTING.md) |

For ordinary diagram creation, check/render the edited source and inspect its
output. For engine or publishing changes, use the relevant regression tests and
`npm run verify` in a source checkout. Do not run the full gallery merely to draw
one small circuit, or imply permission to publish/upload the user's design.
