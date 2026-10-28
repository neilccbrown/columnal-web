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
| `gui/fonts/*.ttf` | `app/src/main/resources/*.ttf` |
| `gui/images/*.png` | `app/src/main/resources/*.png` |
| `gui/scss/**` | `app/src/main/scss/**` |

The ANTLR grammars come from `parsers/src/main/antlr/`. They live in `src/engine/parsers/antlr/` and have
been modified; see [docs/CONVENTIONS.md](../docs/CONVENTIONS.md#grammars).

The SCSS is JavaFX CSS, kept only as a reference for the rebuilt GUI's styles (its colours, fonts
and spacing); it is not built.

The fonts (Noto Sans, Noto Sans Symbols, Noto Sans Symbols2, Noto Mono, Source Code Pro and Kalam)
are under the SIL Open Font License 1.1, which requires the copyright notice and licence text to be
distributed with them. The original repository doesn't include them, so `gui/fonts/OFL-*.txt` were
written for this project: each has the copyright notices from its fonts' `name` tables, and the
licence text that Source Code Pro's `name` table contains.

The images (the logo and the transformation previews) are copyright Neil Brown, as in the original.
