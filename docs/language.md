# The `.uarch` language

[Home](../README.md) · [Examples](../examples/README.md)

For new diagrams, start with [version-2 automatic authoring](authoring.md).
Version 1 remains the explicit model/exchange format and supports existing sources.
It describes architecture topology and layout intent. Declarations are
case-sensitive, one per line; options are standard JSON objects on the same line.
Blank lines and lines beginning with `#` are ignored. Inline comments, semicolons,
multi-line JSON and single-quoted strings are not supported. Use `\n` in a JSON
string for a displayed line break.

## Complete declaration set

```text
uarch 1
title "Diagram title"
subtitle "Optional subtitle"
stages IF ID EX MEM WB
type status {"valid":1,"RegWrite":1,"rd":5}
node ID KIND STAGE {OPTIONS}
pin NODE.PIN in|out TYPE left|right|top|bottom {OPTIONS}
net ID NODE.PIN -> NODE.PIN, NODE.PIN {OPTIONS}
note "A footer note"
layout {"gap":180,"rowSpacing":240,"adaptive":true}
group core {"label":"Core","members":["alu","latch"]}
```

`uarch 1` must be the first effective declaration. A design needs at least one
stage and one node. Specify `stages` once. A `node` must exist before its `pin`
declarations, and a named `type` before the pins that use it. Nets and alignment
references can point to nodes declared later; they are checked after parsing.
IDs contain ASCII letters, digits, `_` or `-`; the dot separates node and pin IDs.
Node IDs and net IDs must each be unique; pin IDs are unique within their node.

## Nodes

```text
node alu alu EX {"label":"ALU","column":1,"row":2}
```

The first `alu` is an instance ID; the second is its symbol kind. Renaming IDs
does not change what the renderer considers an ALU. `label` is independent of ID.

| Kind | Symbol |
| --- | --- |
| `block` | General rectangular component |
| `register` | Rectangular register, e.g. PC |
| `pipeline` | Tall pipeline register with paired field labels |
| `mux` | Trapezoid with input labels |
| `alu` | Notched ALU with two left operand pins |
| `adder` | Small adder symbol |

| Node option | Meaning |
| --- | --- |
| `label` | Display text; defaults to ID |
| `column`, `row` | Nonnegative integers, specified together |
| `span` | Positive integer controlling vertical span for rectangular symbols and MUXes |
| `notes` | Array of short notes inside the symbol |
| `align` | `{"pin":"out","with":"latch.data"}` shifts the entire node vertically |
| `operation` | Descriptive model metadata; does not define executable logic |
| `placement` | `auto` replans this node; `fixed` retains column/row |
| `role` | `data` or `control` overrides inferred lane classification |

`column` is local to a stage. `row` is a shared vertical grid index across the
diagram. The stage order is fixed by `stages`. Omitting both column and row asks
measured automatic placement inside that stage. Fixed and automatic nodes can
coexist; fixed nodes reserve their cells and anchor forward data connections.
Constraints are not pixel coordinates or a guarantee of a legal route.

For fixed nodes, an omitted `span` means six rows for `pipeline` and one row for
other rectangular symbols. Automatic rectangles use intrinsic measured height;
automatic pipelines do too when no explicit pin field rows are declared.
Pipeline pin-row validation, symbol height and canvas bounds use the
same default. Choose a smaller explicit pipeline span for a compact field list.

## Pins

```text
pin alu.a in u32 left
pin rf.a out u32 right {"label":"read 1","align":"alu.a"}
pin mux.select in u2 bottom
```

| Pin option | Meaning |
| --- | --- |
| `label` | Short display label; presentation depends on symbol kind and side |
| `offset` | Relative position from 0 to 1 along the usable edge |
| `row` | Absolute shared grid row for a field, within the node's row/span |
| `align` | Named pin whose height should be matched; rectangular left/right sides only |
| `optional` | `true` allows an input to remain unconnected |

`uN` is an N-bit signal, where N is a positive integer. The `u` notation does not
define signed arithmetic behavior. Inputs require drivers unless optional;
unused outputs are allowed. MUX/ALU pins meet the actual polygon, not its bounding
box. The ALU requires exactly two left-side operand pins.

Adder left inputs occupy its upper and lower lobes (at most two inputs); ALU
operand pins likewise use fixed lobe positions. On sloped MUX/ALU/adder edges,
`offset` is snapped to the nearest point on both the outline and the routing grid.
Small sloped edges have fewer possible anchors, so different offsets can resolve
to the same point; coincident pins are rejected rather than silently joined.

Rectangular side-port labels are centered on their own pins where possible.
Alternate placements stay between the midpoints to neighboring pins, avoiding
titles and other labels. This changes text placement, not the port location.
Document title, subtitle and footer notes expand the canvas;
long wire labels still depend on available routing space.

Named alignment takes precedence over the initial row/offset placement. Cyclic or
unknown references fail; a pin displaced beyond its symbol fails geometry audit.

## Typed bundles

```text
type writebus {"data":32,"mask":4}
pin lanes.out out writebus right
pin memory.write in writebus left
```

Bundle fields and widths form the type. Field order and alias names do not change
compatibility. A scalar `u36` is not compatible with `{data:32, mask:4}`.
Bundles are transmitted as whole interfaces. Field extraction, concatenation,
bit slicing and arithmetic expressions are not supported in version 1.

## Nets

```text
net bypass ready.out -> fa.mem, fb.mem {"label":"MEM/32","style":"forward","corridor":"bottom"}
```

One net has exactly one output source and one or more input destinations. A
source with fanout must use one net containing all its destinations. Splitting
the same source into separate net declarations is rejected, as are multiple
drivers for one input. Different nets cannot share a wire segment.

| Net option | Meaning |
| --- | --- |
| `label` | Visible name; defaults to net ID plus width |
| `description` | Full meaning in the tooltip, signal index and HTML inspector |
| `style` | `data` (default), `control` (dashed), `forward` or `writeback` |
| `corridor` | Prefer a `top` or `bottom` return channel |

The RV32I convention uses `Name/N` for an N-bit scalar and `Name{N}` for a typed
bundle; its F/D/E/M/W suffixes denote pipeline stages. Explicit labels are ordinary
strings; the type is always read from the ports, not inferred from label text.

Branch dots come from the routed net's actual degree. White gaps distinguish
crossings. Arrowheads mark destination pins. Labels cannot be silently dropped
to make a drawing pass the audit.

Unused corridor tails are pruned after routing. If branches join before reaching
the preferred channel, that channel can disappear; its label is relocated to the
surviving wire. A corridor is not a mandatory geometric waypoint. Long visible
names can exceed the available space; use a short `label` and put full wording in
`description`. The compiler now retries with bounded wider/taller spacing profiles;
`layout {"adaptive":false}` disables this for diagnostics.

## Serialization and API

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { parseUarch, compile } from 'uarchdraw';

const design = await parseUarch(readFileSync('cpu.uarch', 'utf8'), 'cpu.uarch');
const { drawing, audit } = compile(design);
writeFileSync('cpu.svg', drawing);
console.log(audit.metrics);
```

The package API requires an installed/built package. In a source checkout, import
from `./dist/index.js`. `compile` returns a verified SVG or throws `DiagramError`
with draft layout/diagnostics. It performs no file writes and does not modify the
input model. `formatUarch` serializes the model, normalizing bundle aliases and
formatting; it does not preserve comments. The JSON design uses `"version":1`.

Version 1 group metadata records labels, member instance IDs and optional parent
IDs for overview/focus views. Parameter expressions and templates are authored
in version 2 and expand into this model. Neither version simulates RTL behavior.
