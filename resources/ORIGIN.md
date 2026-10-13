# Resource origins

These files are copied unchanged from the Java original,
[neilccbrown/columnal](https://github.com/neilccbrown/columnal), at commit
`a11c9ff4118b0aaeded0611954b26f4505dcc463` (GPLv3, like this project).

| Here | Original |
|---|---|
| `i18n/*.properties` | `app/src/main/resources/*.properties` |
| `data/builtin_units.txt` | `data/src/main/resources/builtin_units.txt` |
| `funcdoc/*` | `xml/src/main/funcdoc/*` |
| `help/*` | `xml/src/main/help/*` |

The ANTLR grammars come from `parsers/src/main/antlr/`. They live in `src/engine/parsers/antlr/` and have
been modified; see [docs/CONVENTIONS.md](../docs/CONVENTIONS.md#grammars).

The GUI assets (fonts, images, SCSS) will be added in Phase 7. The fonts (Noto, Source Code Pro and
Kalam) are under the SIL Open Font License, which requires the licence text to be distributed with
them. The original repository doesn't include those licence files, so they will need to be added at
the same time.
