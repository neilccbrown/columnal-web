#!/usr/bin/env python3
"""Copies Java sources with all annotations (and imports of annotation-only packages) removed,
so the ORIGINAL Columnal engine code compiles without the Checker Framework and its own
annotation modules.  String/char literals, text blocks and comments are left untouched.

Usage: strip-annotations.py SRC_DIR DEST_DIR
"""
import os
import re
import sys

# Packages that only contain annotations (removed imports), except RawInputLocation, whose
# constants are used (build-columnal-jvm.sh provides a stand-in class):
ANNOTATION_IMPORT = re.compile(r"^import\s+(static\s+)?(annotation|threadchecker|org\.checkerframework)\.(?!units\.RawInputLocation;)[^;]*;\s*$", re.M)


def skip_literal(src, i):
    """Given src[i] is the start of a literal or comment, returns the index just after it."""
    if src.startswith('"""', i):
        end = src.index('"""', i + 3)
        while src[end - 1] == "\\":
            end = src.index('"""', end + 1)
        return end + 3
    if src.startswith("//", i):
        end = src.find("\n", i)
        return len(src) if end == -1 else end
    if src.startswith("/*", i):
        return src.index("*/", i + 2) + 2
    quote = src[i]
    j = i + 1
    while src[j] != quote:
        if src[j] == "\\":
            j += 1
        j += 1
    return j + 1


def skip_balanced_parens(src, i):
    """Given src[i] == '(', returns the index after the matching ')'."""
    depth = 0
    while True:
        c = src[i]
        if c in "\"'" or src.startswith("//", i) or src.startswith("/*", i):
            i = skip_literal(src, i)
            continue
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1


def strip(src):
    out = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        if c in "\"'" or src.startswith("//", i) or src.startswith("/*", i):
            j = skip_literal(src, i)
            out.append(src[i:j])
            i = j
        elif c == "@" and not src.startswith("@interface", i):
            m = re.compile(r"@\s*[A-Za-z_][\w]*(\s*\.\s*[A-Za-z_]\w*)*").match(src, i)
            j = m.end()
            k = j
            while k < n and src[k] in " \t\r\n":
                k += 1
            if k < n and src[k] == "(":
                j = skip_balanced_parens(src, k)
            # Keep one space so that tokens on either side stay separate:
            out.append(" ")
            i = j
        else:
            out.append(c)
            i += 1
    return ANNOTATION_IMPORT.sub("", "".join(out))


def main():
    src_dir, dest_dir = sys.argv[1:]
    for root, _dirs, files in os.walk(src_dir):
        for f in files:
            if not f.endswith(".java") or f in ("module-info.java", "package-info.java"):
                continue
            path = os.path.join(root, f)
            dest = os.path.join(dest_dir, os.path.relpath(path, src_dir))
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
            with open(dest, "w", encoding="utf-8") as fh:
                fh.write(strip(text))


if __name__ == "__main__":
    main()
