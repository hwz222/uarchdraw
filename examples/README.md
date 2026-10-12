# Advanced reference gallery

[Home](../README.md) · [Quick start](../docs/quickstart.md) · [Automatic authoring](../docs/authoring.md) · [Language reference](../docs/language.md)

These sources are complete, executable circuit references covered by the test suite. For guided learning, follow the [step-by-step course](tutorials/README.md) first. Run
commands from the repository root after `npm ci` and `npm run build`. In
PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

For automatic reference designs, start with examples 11–14. Examples 01–10 explain the
explicit version-1 model, including advanced alignment and routing controls.

Check an edited source before rendering it:

```sh
node dist/cli.js check examples/01-first-diagram.uarch
node dist/cli.js render examples/01-first-diagram.uarch
```

## 01 — Your first connection

[Source](01-first-diagram.uarch) · [Preview](../docs/images/01-first-diagram.png)

Read the file in order: stages, components, ports, then net. `compute.result`
drives `latch.data`. IDs define connectivity; display labels can change without
changing electrical identity.

Exercise: rename the displayed `Compute` to `Execute` and render again. The
source remains `compute.result`. Then change only the receiver to `u16`: `check`
should report incompatible types. Restore `u32` before continuing.

## 02 — Select an operand

[Source](02-mux-and-alu.uarch) · [Preview](../docs/images/02-mux-and-alu.png)

Follow Read1 into ALU A. Read2 and Imm enter the two MUX inputs; ALU_B enters the
lower ALU operand. Dashed ALUSrc is one-bit control, distinct from the data buses.
`rf.a` aligns with `alu.a`; a node-level alignment moves the ALU so its output
aligns with the pipeline's `result_d`. Compare these two uses of `align`.

Exercise: swap the MUX input display labels. Connections do not swap: change
the net destinations to change topology. Selection behavior is documented;
the DSL does not simulate the MUX.

## 03 — Preserve interface meaning

[Source](03-typed-bundles.uarch) · [Preview](../docs/images/03-typed-bundles.png)

`writebus` contains `data[32]` and `mask[4]`. `status` contains `valid[1]`,
`RegWrite[1]` and `rd[5]`. Open the generated `.signals.md` or `.html` to inspect
fields even though a bundle is drawn as one line.

Exercise: declare `type wrongbus {"payload":32,"mask":4}` and assign it to
`memory.write`. Both bundles have 36 bits, but `check` rejects the different
field names. Pipeline outputs form this example's circuit boundary; upstream
inputs are intentionally omitted.

## 04 — Trace a bypass

[Source](04-forwarding.uarch) · [Preview](../docs/images/04-forwarding.png)

Find original input 0, MEM input 1 and WB input 2. MEM and WB use separate bottom
corridors. `forwarded` has one source and two sinks; the branch dot is derived
from the routed tree.

Exercise: add a rectangular receiver with a `u32` input in EX, column 1, row 3.
Add that port to the existing `forwarded` sinks. Extend the same net rather than
declaring another net driven by that output. Check and render the added branch.

This is a connectivity lesson. Example 05 expands the comparisons summarized
inside Forward control.

## 05 — Read a whole pipeline

[Source](05-rv32i-forwarding.uarch) · [Preview](../docs/images/05-rv32i-forwarding.png) · [CPU profile](../docs/rv32i.md)

```sh
node dist/cli.js render examples/05-rv32i-forwarding.uarch -o output/cpu
npm run review
```

Trace these paths in order:

1. `OpA_E` through Fwd A, ALU A, ALU and EX/MEM.
2. `FwdB_E` branching to ALU B, branch comparison and store data. Store data is not the immediate operand.
3. `Bypass_M` returning from Ready to both forwarding MUXes; `Result_W` returning from WB to the MUXes and Register File.
4. `Addr_M` through Data Memory, Load extend, MEM/WB and WB.
5. `PCWrite` holding PC and IF/ID; `IDEXClear` inserting a bubble; redirect clearing IF/ID and ID/EX.

Baseline: **26 symbols, 49 named nets, 81 sinks, 84 crossings**, zero geometry
errors. These describe this example, not arbitrary graphs. Tests compare the
whole model with the electrically tested fixture. Read at a useful zoom level;
the complete pipeline remains too dense for a small screen-width thumbnail.
Clock/reset, exceptions and other omitted behavior follow the documented
teaching profile. Witness checks do not establish ISA compliance.

## 06 — Share one output

[Source](06-round-robin-arbiter.uarch) · [Preview](../docs/images/06-round-robin-arbiter.png)

```sh
npm run review:arbiter
```

Follow five horizontal `Data0..4` paths into the MUX, then Selected, Output buffer
and Consumer. Below, Req drives Round-robin and Any request; Select controls the
MUX and Grant pops the selected FIFO. `CanAccept = !full || OutReady` returns to
the arbiter. Priority advances only when the buffer accepts data.

The source places data above control using `span` and named alignment. It has
6 symbols, 14 nets, 15 sinks and 3 crossings. Geometry checks do not prove fairness.

Exercise: change every data port to `u64` and update labels. Changing only one
receiver to `u16` must fail. A sixth input requires matching request/grant widths,
ports and nets. The original six-input layout now passes after pin-label fixes.
Compare `output/arbiter-six-compact.png` with the taller
`output/arbiter-six-input.png` to see the effect of extra layout constraints.

## 07 — Feedback counter

[Source](07-feedback-counter.uarch) · [Preview](../docs/images/07-feedback-counter.png)

Count feeds both the adder and MUX input 0. Constant One feeds the other adder
input. Enable selects Sum or Count; Next returns to the register above the circuit.
The diagram documents structure and behavior; the tool does not execute arithmetic.

Exercise: change the constant to 4, updating its label and description. The two
adder inputs must remain distinct ports.

## 08 — FIFO handshake

[Source](08-fifo-handshake.uarch) · [Preview](../docs/images/08-fifo-handshake.png)

Above, follow InData, FIFO storage and Head. Below, Handshake turns a full/empty
bundle into ready/valid and sends push/pop back to storage. Here `InReady=!full`:
a full FIFO cannot accept on the same cycle as a pop.

Exercise: remove InReady. `check` should report the undriven `producer.ready`.
Restore it, then change all data ports and labels to 64 bits. Pointer behavior
and capacity are outside the geometry validator's scope.

## 09 — Two reads, one write

[Source](09-register-file.uarch) · [Preview](../docs/images/09-register-file.png)

Write{38} contains enable[1], address[5] and data[32]. Two read addresses produce
A and B for the ALU, whose Result is captured. Rectangular pin names are centered
on their ports where possible; fallback positions stay in their own pin lanes.

Exercise: rename Register file to Integer register bank and observe the wider
block. Read-during-write policy belongs to the implementation contract.

## 10 — Sample selection

[Source](10-sample-selector.uarch) · [Preview](../docs/images/10-sample-selector.png)

Eight `u16` data paths remain horizontal. Channel/3 drives both the MUX and
Capture's tag field; sample and tag are captured together. Capture uses explicit
`span=4` to avoid excess space from the default six rows.

Exercise: run `npm run review:cases` and compare eight inputs, sixteen inputs at
the original spacing, and sixteen with more vertical room. Bounded spacing
retries now recover the original sixteen-input source without manual edits. The obstacle-grid fix prevents legal horizontal paths from
being blocked by an extra grid row.

Probe metrics and deliberate rejections are saved in `output/diverse-results.json`.

## 11 — Automatic sample selection

[Source](11-automatic-selector.uarch) · [Preview](../docs/images/11-automatic-selector.png)

Version 2 groups ports inside blocks. Samples is a reusable template;
`mux(N, W)` supplies data inputs and the correct select width. One wildcard
connection expands every data path. No manual sides, rows, spans or alignment
are required.

Exercise: change only `N` from 8 to 16 or 32 and render again. Then change `W`
from 16 to 64. Array sizes, types, labels, select width and spacing follow the
parameters. The data wires remain horizontal with zero crossings.

## 12 — Automatic arbitration

[Source](12-automatic-arbiter.uarch) · [Preview](../docs/images/12-automatic-arbiter.png)

Compare with example 06: it represents the same conceptual six units, using a
Queues template, a MUX constructor and inferred data/control lanes. Explicit
`role control` describes architectural intent, not physical coordinates.
The five-input version has fourteen nets and three crossings.

Exercise: change only `N` to 6 or 16. No new port, net or placement declarations
are necessary. Observe `.planning.json` when the compiler widens spacing.

## 13 — Automatic FIFO

[Source](13-automatic-fifo.uarch) · [Preview](../docs/images/13-automatic-fifo.png)

Producer and Consumer reuse parameterized port templates. Flags and Commands
remain structural bundles. Data runs above Handshake; neighboring stages guide
default control-port sides. There are eight nets and one crossing.

Exercise: change `W` to 64, then remove the ready connection. Width changes should
render; the missing required input must still fail. Automatic authoring does not
relax electrical validation or simulate FIFO behavior.

## 14 — Hierarchy overview and detail

[Source](14-hierarchical-datapath.uarch) · [Preview](../docs/images/14-hierarchical-datapath.png)

```sh
node dist/cli.js render examples/14-hierarchical-datapath.uarch --overview -o output/overview
node dist/cli.js render examples/14-hierarchical-datapath.uarch --focus core.execute -o output/detail
```

The source declares nested groups and qualified connections. Overview collapses
Processing core; focus shows Execute stage and its real external source and
consumer. Both views retain boundary net identity and types.

Exercise: rename a display label or change `W`; regenerate both views from the
same source. Keep the original version-2 file as the editable source: canonical
exports expand templates and do not preserve parameter expressions.

Run `npm run review:automation` to generate parameter and hierarchy variants in
`output/`. To begin your own file, use `node dist/cli.js init design.uarch`; use
`watch` to rebuild after saving. Existing files are never overwritten by init.

## Rebuild every preview

```sh
npm run examples
npm run review:all
```

Generated drafts live in ignored `output/`. PNGs in `docs/images/` are tracked
so documentation works on a fresh checkout. Change the source or renderer to
fix a drawing, then regenerate and inspect the actual output.
