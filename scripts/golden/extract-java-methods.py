#!/usr/bin/env python3
"""Extracts named static methods (and nested types) from a Java source file, with
annotations removed, so golden-value harnesses can run the ORIGINAL code.

Usage: extract-java-methods.py File.java name1 name2 ...
Each name may be a method name (all overloads are extracted) or "enum Name"/"class Name".
"""
import re
import sys

src = open(sys.argv[1], encoding="utf-8").read()
names = sys.argv[2:]

def extract_block(start):
    """Returns the text from start to the end of the brace block that follows."""
    depth = 0
    i = src.index("{", start)
    while True:
        c = src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return src[start:i + 1]
        elif src.startswith("//", i):
            # Skip line comments (which may contain quotes or braces)
            i = src.index("\n", i)
        elif src.startswith("/*", i):
            i = src.index("*/", i) + 1
        elif c == '"':
            # Skip string literals
            i += 1
            while src[i] != '"':
                if src[i] == "\\":
                    i += 1
                i += 1
        elif c == "'":
            i += 1
            while src[i] != "'":
                if src[i] == "\\":
                    i += 1
                i += 1
        i += 1

out = []
for name in names:
    if " " in name:
        kind, n = name.split(" ")
        pattern = re.compile(r"^\s*public (?:static )?(?:abstract )?(?:final )?" + kind + r" " + n + r"\b", re.M)
    else:
        pattern = re.compile(r"^\s*(?:@\w+(?:\([^)]*\))?\s+)*public static [^=;(]*?\b" + name + r"\s*\(", re.M)
    found = False
    for m in pattern.finditer(src):
        found = True
        # Start at the beginning of the line
        start = src.rfind("\n", 0, m.start()) + 1
        out.append(extract_block(start))
    if not found:
        sys.exit("Not found: " + name)

text = "\n\n".join(out)
# Remove annotations (but not @ inside strings, which these methods don't have)
text = re.sub(r"@\w+(?:\.\w+)*(?:\((?:[^()]|\([^()]*\))*\))?\s*", "", text)
print(text)
