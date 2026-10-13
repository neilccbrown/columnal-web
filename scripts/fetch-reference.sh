#!/usr/bin/env bash
# Fetches the original Java Columnal source into reference/columnal (gitignored),
# pinned to the commit this port is based on.  Used by scripts/port-status.ts,
# for copying resources, and for side-by-side comparison while porting.
set -euo pipefail

COMMIT=a11c9ff4118b0aaeded0611954b26f4505dcc463
DIR="$(cd "$(dirname "$0")/.." && pwd)/reference/columnal"

if [ ! -d "$DIR/.git" ]; then
  git clone --quiet https://github.com/neilccbrown/columnal.git "$DIR"
fi
if ! git -C "$DIR" cat-file -e "$COMMIT^{commit}" 2>/dev/null; then
  git -C "$DIR" fetch --quiet origin
fi
git -C "$DIR" -c advice.detachedHead=false checkout --quiet "$COMMIT"
echo "reference/columnal is at $(git -C "$DIR" rev-parse --short HEAD)"
