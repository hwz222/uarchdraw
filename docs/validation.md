# Validation

[Documentation](README.md) · [Contributing](../CONTRIBUTING.md)

## Platform results

The cleaned repository was verified on **2026-10-11** using fresh, separate source
copies and OS-native Node.js installations. Each combination ran `npm ci` and
the complete `npm run verify` workflow:

| Platform | Node.js | Tests | Drawings | Fresh package installation |
| --- | --- | --- | --- | --- |
| Windows x64 | v22.23.3 | 117/117 | 60/60 | Passed |
| Windows x64 | v24.19.0 | 117/117 | 60/60 | Passed |
| Ubuntu 24.04.4 / WSL2 x64 | v22.23.3 | 117/117 | 60/60 | Passed |
| Ubuntu 24.04.4 / WSL2 x64 | v24.21.0 | 117/117 | 60/60 | Passed |

All four runs have identical geometry reports, canvas dimensions and SVG,
color PNG and grayscale PNG hashes for all 60 diagrams. They also match the
pre-cleanup baseline. Regeneration leaves tracked course/gallery previews
unchanged. Branding regeneration was checked on Windows and Ubuntu as well.

Installed-package checks cover CLI execution, the 49-net RV32I diagram, actual
SVG/PNG generation, bundled font, exported API, starters, hierarchy and the
sixteen-input teaching checkpoint. Archives exclude test fixtures, developer
scripts, historical reviews and local output. The production dependency audit
reported zero known vulnerabilities on this date.

Cleanup reduced tracked files from 221 to 185 and Markdown files from 30 to 23;
ten of the retained pages are the nine lessons and course entry point. Obsolete
review snapshots are removed, release guidance is consolidated in Contributing,
and active regression inputs remain with the tests. Application rendering did
not change. The repository guard validates local files and Markdown heading
anchors; a temporary missing-heading probe was rejected correctly.

## Reproduce verification

Install Node.js 22 or 24 and npm separately on each operating system. From a
fresh source checkout:

```sh
npm ci
npm run verify
git diff --exit-code -- docs/images examples/tutorials
```

Use `npm.cmd` in PowerShell if execution policy blocks the script wrapper.
The native PNG renderer is selected during `npm ci`; do not reuse dependencies
from another OS. Rendering uses the bundled font and does not require a GUI.

`verify` covers repository text/links/metadata, model and geometry tests,
CLI/watch behavior, the learning course, parameter/layout probes, and fresh
archive installation. Probe failures must match their expected outcomes.

Reports are regenerated in ignored `output/`:

| File | Contents |
| --- | --- |
| `review-results.json` | Fourteen circuit references and four layout variants |
| `tutorial-results.json` | Twenty-five checkpoints and nine exercise answers |
| `automation-results.json` | Eight parameter/hierarchy variants |
| `diverse-results.json` | Forty-four boundary, mutation and reordering probes |
| `arbiter-usability.json` | Automatic/guided layout and interface mutations |

The three drawing manifests record geometry, canvas dimensions and image hashes.
Generated inspectors also pass English-content and embedded JavaScript syntax
checks. The nine lessons retain complete executable code and actual result images.
Old findings and before/after snapshots are omitted from the initial public
release; current checks can be reproduced from the scripts and test fixtures.

## Scope

Automated geometry acceptance is not a human readability assessment. Published
lesson/gallery images have been visually inspected; arbitrary new graphs may
still need layout hints. The RV32I witness covers selected instruction sequences,
not RTL simulation or full ISA compliance; see the [profile](rv32i.md).

WSL2 x64 results do not establish bare-metal, ARM64 or every Ubuntu-version
compatibility. Browser interaction and remote GitHub Actions are not covered by
the local CLI/rendering checks. The configured CI matrix is Windows/Linux and
Node.js 22/24; no remote run is claimed until the repository is pushed.
