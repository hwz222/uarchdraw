# RV32I teaching profile

[Source](../examples/05-rv32i-forwarding.uarch) · [Preview](images/05-rv32i-forwarding.png) · [Tutorial](../examples/README.md)

The example is a five-stage, single-issue, in-order datapath with separate,
zero-wait instruction and data memories. IF/ID, ID/EX, EX/MEM and MEM/WB store
the fields used by downstream stages. Clock/reset are implicit in the figure.

## Timing choices

| Topic | Choice |
| --- | --- |
| Branches / jumps | Resolve in EX; normally fetch PC+4 |
| Redirect | Clear IF/ID and ID/EX; redirect wins over stall |
| Register file | x0 stays zero; WB writes are visible to ID reads in the same cycle |
| Forward A/B | 0 = saved register operand, 1 = MEM ready result, 2 = selected WB result |
| Priority | Newest MEM result wins; valid, RegWrite and rd != 0 are required |
| Load-use | Freeze PC + IF/ID and bubble ID/EX for one cycle |
| Load → store | Conservatively stalls once; no separate MEM-stage store bypass |
| Store data | Branches from forwarded rs2 before the ALU immediate selection |
| JALR | Uses forwarded rs1 and clears target bit 0 |
| Link forwarding | Ready MUX selects ALU or PC+4 so JAL/JALR values can forward |

The MEM load address is not a ready load result. A newer load dependency must not
select stale data from an older WB write to the same register.

## What the tests prove

Fourteen witness tests cover both operand muxes, newest-producer priority, WB
forwarding, load-use, store data, load-to-store, dependent branch/JALR, x0, unused
rs2, same-cycle WB→ID, redirect priority, LUI/AUIPC/JAL and a mutation that removes
the store-data connection. A separate test compares the complete example source
to the tested fixture.

The witness executes the cases needed by add/addi/sub/lui/auipc/lw/sw/beq/jal/jalr.
The drawing includes byte/halfword lane and extension blocks, but their complete
behavior and all remaining RV32I opcodes are not executed by the witness.
FENCE, ECALL, EBREAK, traps, misalignment and memory wait states are outside this
profile. This is not RTL validation or an ISA-compliance claim.

## Read the names

F/D/E/M/W suffixes identify IF/ID/EX/MEM/WB stage values. `/32` denotes a scalar
width; `{21}` denotes a typed bundle whose full field list appears in the signal
index. `PCWrite` is an enable (`!stall OR redirect`), not an active-high stall.

Run `npm run review` to generate full color/grayscale views and forwarding/hazard
crops from one SVG. Current baseline: 49/49 labeled nets, 81 receiving ports,
84 crossings, 137 bends and no geometry errors. A passing audit does not replace
visually tracing ALU, load, store, bypass and flush paths.
