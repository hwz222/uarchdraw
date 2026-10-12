# Learn UarchDraw by building diagrams

[Project home](../../README.md) · [Examples](../README.md) · [Syntax reference](../../docs/authoring.md)

This course starts with one rectangle and builds up to a parameterized arbiter.
Each step includes a complete `.uarch` source, commands to run, an explanation
of the new syntax and an image of the expected result. There are **nine lessons,
25 runnable checkpoints, nine exercise answers and five deliberate failures**.
The images are rendered from the linked sources; they are not hand-drawn mockups.

## Setup

1. Install Node.js 22 or newer, then open a terminal in the repository root.
   The root contains `package.json`, `src/` and `examples/`.
2. Build the command:

   ```sh
   npm ci
   npm run build
   node dist/cli.js --version
   ```

   In PowerShell, use `npm.cmd` instead of `npm` if script execution policy
   blocks `npm.ps1`. No Python installation or desktop drawing application is needed.
3. Create a plain-text file named `work.uarch` in that root. Start with the code
   in [lesson 01, step 1](01.md#step-1-draw-one-block). Save as UTF-8, keeping the
   `.uarch` extension rather than `.uarch.txt`.
4. At every checkpoint, run `check` followed by `render`, as shown in the lesson.
   Open `output/tutorial-work.svg` or `.png`, and compare it with the expected
   image. The HTML viewer and `.signals.md` index provide more signal detail.
5. Continue by replacing `work.uarch` with the next complete checkpoint, then
   make the described edits yourself. A checkpoint file is always available if
   you get stuck. Keep experimenting in your own file; the course files are references.

`check` prints geometry JSON and writes no files. A successful run has `ok: true`.
`render` prints the symbol/net counts and writes a verified diagram. A failed
command exits with status 1; do not confuse an old preview with its result.
Each lesson explains exactly what should change on screen.

## Follow the lessons in order

| Lesson | Start here | New syntax and visible result |
| --- | --- | --- |
| 01 | [Your first connection](01.md) | `block`, `label`, `out`, `bits`, `register`, `connect`: rectangle → port → connected register |
| 02 | [Types, parameters and fanout](02.md) | `param`, shared drivers: /32 → /16 → one wire tree with two receivers |
| 03 | [Select an ALU operand](03.md) | `stages`, `in STAGE`, `mux`, `bit`, `role`, `style`, `alu`: MUX control and two ALU operands |
| 04 | [Scale with arrays](04.md) | `[N]`, `[*]`, `clog2`, `${index}`: four → eight → sixteen channels |
| 05 | [Reusable interfaces](05.md) | `template`, local arguments, symbol kinds: reusable ports with unchanged wiring |
| 06 | [Bundles, feedback and FIFO](06.md) | `type`, named fields, `corridor`: status → commands → ready/valid storage path |
| 07 | [Hierarchy views](07.md) | `group`, qualified references, `--overview`, `--focus`: expanded → collapsed → contextual detail |
| 08 | [Spacing and layout hints](08.md) | Labels, planning reports, `--no-adaptive`, `layout`: wider gaps and a lower receiver |
| 09 | [Automatic arbiter](09.md) | Combine prior concepts: selector → arbitration/backpressure → six inputs |

Each lesson ends with an exercise. Try it before expanding the answer. Answers
include complete source and a rendered image, so you can compare both wiring and
appearance. Errors teach width compatibility, missing drivers, array pairing,
bundle identity and insufficient spacing.

## Edit continuously after learning the basics

Once you have a valid `work.uarch`, run:

```sh
node dist/cli.js watch work.uarch -o output/tutorial-work
```

Save to rebuild, refresh the viewer, and use Ctrl+C to stop. Invalid edits retain
the last verified diagram; the console reports the failure and the watcher
recovers after a valid save. Learning the explicit `check`/`render` sequence first
makes these failures easier to recognize. Browser refresh is currently manual.

To create a runnable starter outside the course, use
`node dist/cli.js init design.uarch`; it refuses to overwrite an existing file.
Continue editing the original version-2 source. Canonical output expands
parameters and templates and does not preserve their original expressions.

## After the course

Read the [advanced reference gallery](../README.md) for counters, register files,
forwarding and the full five-stage RV32I datapath. These are complete circuit
references rather than additional beginner lessons. The CPU is intentionally
introduced after the smaller diagrams.

The tool checks structural types, connectivity and drawing geometry. Templates
reuse interfaces; they do not contain reusable internal subcircuits. Drawing a
MUX, register, FIFO or ALU does not simulate it or verify its RTL behavior.

## Reproduce the teaching assets

For contributors working in a source checkout:

```sh
npm run tutorials
npm test
npm run check:repo
```

`tutorials` renders all 25 checkpoints and nine answers, verifies the five
expected failures, saves metrics and image hashes in `output/tutorial-results.json`, and synchronizes
the full code listings with the `.uarch` files. `review:all` includes this course.
The maintained expectations live in [the course manifest](course.json).
Actual image inspection remains necessary; an audit pass alone is not a visual
acceptance decision.
