# Third-party notices

UarchDraw is distributed under GPL-3.0-or-later; see [LICENSE](LICENSE).

The bundled DejaVu Sans font retains its own license in
[assets/LICENSE_DEJAVU](assets/LICENSE_DEJAVU). The font is embedded in exported SVG
files and used for text measurement and PNG rendering. Keep its license with
redistributed font assets.

Runtime dependencies are pinned in `package-lock.json`:

| Component | Purpose | Upstream license |
| --- | --- | --- |
| @resvg/resvg-js | SVG rasterization | MPL-2.0 |
| elkjs | Local graph ordering | EPL-2.0 OR GPL-3.0-or-later |
| opentype.js | Font measurement | MIT |

The installed packages include their respective licenses. UarchDraw's mark and
banner are original SVG assets maintained in this repository.
