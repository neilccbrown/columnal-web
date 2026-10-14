#!/usr/bin/env python3
"""Extracts named members from a Java source file, with annotations removed, so golden-value
harnesses can run the ORIGINAL code.

Usage: extract-java-methods.py File.java name1 name2 ...
Each name is one of:
  methodName              all static methods with that name (any visibility), all overloads
  "enum Name"             a (possibly nested) enum
  "class Name"            a (possibly nested) class
  "-methodName"           removes all methods with that name from the previously extracted class
"""
import re
import sys


def extract_block(src, start):
    """Returns the end index of the brace block that starts after `start`."""
    depth = 0
    i = src.index("{", start)
    while True:
        c = src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i + 1
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


def find(src, name, static_only=True):
    """Yields (start, end) of each member with the given name."""
    if " " in name:
        kind, n = name.split(" ")
        pattern = re.compile(r"^[ \t]*(?:(?:public|private|protected|static|abstract|final)\s+)*" + kind + r" " + n + r"\b", re.M)
    else:
        modifiers = r"(?:(?:public|private|protected|final|synchronized)\s+)*static\s+" if static_only else r"(?:(?:public|private|protected|static|final|synchronized)\s+)*"
        pattern = re.compile(r"^[ \t]*(?:@\w+(?:\([^)]*\))?\s+)*" + modifiers + r"[^=;(){}]*?\b" + name + r"\s*\(", re.M)
    for m in pattern.finditer(src):
        start = src.rfind("\n", 0, m.start()) + 1
        yield start, extract_block(src, start)


def strip_annotations(text):
    # Remove annotations (but not @ inside strings, which the extracted code doesn't have)
    return re.sub(r"@\w+(?:\.\w+)*(?:\((?:[^()]|\([^()]*\))*\))?\s*", "", text)


def main():
    src = open(sys.argv[1], encoding="utf-8").read()
    out = []
    for name in sys.argv[2:]:
        if name.startswith("-"):
            # Remove methods (any kind) from the last extracted item
            last = out.pop()
            removed = False
            while True:
                spans = list(find(last, name[1:], static_only=False))
                if not spans:
                    break
                start, end = spans[0]
                last = last[:start] + last[end:]
                removed = True
            if not removed:
                sys.exit("Not found to remove: " + name[1:])
            out.append(last)
            continue
        spans = list(find(src, name))
        if not spans:
            sys.exit("Not found: " + name)
        for start, end in spans:
            out.append(src[start:end])
    print(strip_annotations("\n\n".join(out)))


if __name__ == "__main__":
    main()
