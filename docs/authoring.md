# Automatic authoring with `.uarch` version 2

[Home](../README.md) · [Quick start](quickstart.md) · [Version-1 reference](language.md)

This page is a syntax reference. For guided practice with a picture after every
step, follow the [nine-lesson course](../examples/tutorials/README.md).

Version 2 describes blocks, ports and connections with optional layout hints.
It expands parameters, arrays and templates into the existing typed version-1
model. The same renderer and geometry audit process both source versions.
Existing version-1 sources remain supported.

## Start and edit

After installing or linking the command:

```sh
uarchdraw init design.uarch
uarchdraw watch design.uarch
```

`init` creates a runnable source and refuses to overwrite an existing file.
Choose `--template selector`, `arbiter`, `fifo` or `hierarchy` for larger examples.
In a source checkout, use `node dist/cli.js` in place of `uarchdraw`. In PowerShell,
use `uarchdraw.cmd` if needed.

The watcher regenerates output after a save. Invalid edits report an error and
preserve the last verified output; fixing the source resumes rendering. Stop
with Ctrl+C. Open the generated SVG or offline HTML separately and refresh your
viewer after a rebuild; automatic browser refresh is not implemented.

```text
uarch 2
param W = 32
title "My first datapath"

block compute {
  label "Compute"
  out result: bits(W)
}
block latch: register(W) { label "Result register" }
connect compute.result -> latch.d
```

No port sides, stages, coordinates or alignment are required here. An omitted
stage list creates one DESIGN stage; the engine orders its blocks from the net
graph. Explicit `stages INPUT SELECT OUTPUT` preserves architectural stage order,
and `block compute in SELECT { ... }` assigns a block to a stage.

## Parameters and signal types

```text
param N = 8
param W = 16
param INDEX_W = clog2(N)
```

Declare parameters before expressions that use them. Supported integer
expressions are names, decimal integer literals, parentheses, unary `+`/`-`,
`+`, `-`, `*`, `/`, `%`, and `clog2`, `min`, `max`. Results must be safe integers;
division by zero and fractional widths are rejected. `clog2` has a minimum result
of one, so a one-input selector still has a legal scalar select port. Expressions
are parsed directly and never evaluated as JavaScript.

Use `bit`, `bits(W)`, or a named structural bundle:

```text
type Flags {
  full: 1
  empty: 1
}
block fifo {
  in data: bits(W)
  out status: Flags
}
```

Every bundle field name and width must match between connected ports. Width and
connectivity checks remain strict. Bundles are whole signals; field selection,
slices, concatenation and RTL behavior are not implemented.

## Arrays and templates

```text
template Samples(N, W) {
  label "Samples"
  out data[N]: bits(W) { label "${index}" }
}
block samples: Samples(N, W)
block mux: mux(N, W)
block channel {
  role control
  out index: bits(clog2(N))
}
connect samples.data[*] -> mux.d[*] { label "Ch${index}/${W}" }
connect channel.index -> mux.select
```

Templates reuse port declarations and block presentation. Their parameter
arguments bind locally. `template Word(W): register { ... }` selects a symbol
kind; the default is block. Templates do not instantiate internal subcircuits.
Definitions are local to the source file; external template imports are not supported.

Built-in `mux(N, W)` provides `d[0]` through `d[N-1]`, `select` and `out`.
Built-in `register(W)` provides `d` and `q`. Bare symbol names such as
`block capture: register { ... }` let you declare custom ports. Supported symbol
kinds remain block, register, pipeline, mux, alu and adder.

`data[*]` expands an entire array; `data[3]` selects one element. Array-to-array
connections pair corresponding elements and require equal lengths. A scalar
source can fan out to an entire destination array. Port arrays are limited to
128 elements. Display strings support `${PARAMETER}` and `${index}` substitution;
the latter is the zero-based array element for ports or connections.

Separate `connect` statements from one source merge into one net, allowing fanout
to be extended near the new receiver. Conflicting explicit options or duplicate
destination drivers are rejected. Use `label`, `description`, `style` and
`corridor` inside an optional connection block.

## Automatic placement and optional overrides

The planner measures symbols, separates data/control lanes, aligns parallel
data buses and keeps fixed nodes as anchors. Control-facing port sides are
inferred from neighboring stages. Names such as ready, valid, request, grant,
index, status and commands default to control styling; these are heuristics,
not inferred hardware behavior. Override them with `style data` or `role data`.

```text
block decoder {
  role control
  in instruction: bits(32) @left
  out enable: bit @right
}
```

`@left`, `@right`, `@top`, `@bottom` override a port side. Optional port options
include `label`, `optional`, `offset`, `row` and `align`. Options use plain values,
for example `{ optional true }`; strings require double quotes. Fractional offsets
from 0 to 1 are supported. Unknown keys and incorrect value types are rejected.

Advanced block constraints live in a separate section:

```text
block decoder {
  role control
  out enable: bit
  layout {
    column 0
    row 2
  }
}
```

Specify column and row together to fix a block; other blocks remain automatic.
Block layout options also accept span and node presentation options from the
version-1 model. Use a top-level layout section for `gap`, `rowSpacing` or
`adaptive false`. Numerical options should occupy separate lines or use commas.

If initial routing or label placement fails, compilation tries up to four
deterministic spacing profiles. It returns the first audited result and records
the chosen gap, row spacing and attempt count in `.planning.json`. The input
model is not mutated. `--no-adaptive` disables retries for diagnostics.
Retries are bounded; complex port orderings can still need explicit hints.

## Hierarchy and views

```text
group core {
  label "Processing core"
  group execute {
    block compute { out result: bits(32) }
    block latch: register(32)
    connect compute.result -> latch.d
  }
}
```

Inside a group, references are relative to its scope. Outside, use a qualified
path such as `core.execute.compute.result`. Groups can nest up to sixteen levels.
Block and group names use letters, digits and underscores, starting with a letter
or underscore. Double underscores are reserved for expanded paths.

```sh
uarchdraw render examples/14-hierarchical-datapath.uarch -o output/full
uarchdraw render examples/14-hierarchical-datapath.uarch --overview -o output/overview
uarchdraw render examples/14-hierarchical-datapath.uarch --focus core.execute -o output/detail
```

The default diagram shows the expanded graph. Overview collapses top-level
groups while retaining boundary net identity, types and fanout. Focus displays
the selected group's internals with blocks for its real external drivers and
receivers. These are logical diagram views, not RTL elaboration or verification.

## Formatting and compatibility

Version 2 supports multiline block/options sections, `#` or `//` comments and
optional semicolon separators. Strings use JSON escaping. Individual expressions,
connections and strings remain on one line; multiline connection options belong
inside braces. Declaration keywords are case-sensitive.

Canonical `.uarch` and JSON exports use the expanded version-1 model, including
group metadata and resolved placement. They preserve connectivity and types,
but do not reconstruct templates, parameter expressions or comments. Continue
editing the original version-2 source. The CLI preserves it when output uses
the same filename stem.

## Library integration

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { parseUarch, createView, compile } from 'uarchdraw';

const design = await parseUarch(readFileSync('design.uarch', 'utf8'), 'design.uarch');
const overview = await createView(design, { overview: true });
const { drawing, audit, planning } = compile(overview, { maxAttempts: 4 });
writeFileSync('overview.svg', drawing);
console.log(audit.metrics, planning);
```

Use `createView(design, { focus: 'core.execute' })` for a detail view. Both view
creation and compilation leave the input model unchanged. `compile` accepts
`adaptive: false` to disable retries. In a source checkout, import from
`./dist/index.js` after building. Parsing source includes automatic placement;
raw JSON callers supply a complete expanded model with resolved column/row values.
