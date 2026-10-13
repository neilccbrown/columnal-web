#!/usr/bin/env bash
# Golden values for the Java standard library behaviour reproduced in src/engine/java:
# String.split, Double.toString, Double.parseDouble, Long.parseLong, Integer.parseInt,
# String.trim, regionMatches, Character classification and .properties parsing.
# Writes test/engine/java/golden/java-lang.txt.  Usage: scripts/golden/java-lang.sh (Java 17+)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
java "$ROOT/scripts/golden/java/JavaLangHarness.java" "$ROOT"/resources/i18n/*.properties "$ROOT/test/engine/java/golden/tricky.properties" > "$ROOT/test/engine/java/golden/java-lang.txt"
wc -l "$ROOT/test/engine/java/golden/java-lang.txt"
