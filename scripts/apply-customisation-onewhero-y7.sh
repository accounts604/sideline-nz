#!/usr/bin/env bash
# Wrapper so the long NODE_OPTIONS doesn't get line-wrapped when copy-pasted.
# Default is dry-run; pass --apply to write.
#
# Usage:
#   bash scripts/apply-customisation-onewhero-y7.sh           # dry-run
#   bash scripts/apply-customisation-onewhero-y7.sh --apply   # write
set -euo pipefail

export NODE_OPTIONS='--dns-result-order=ipv4first --network-family-autoselection=false'

npx tsx scripts/apply-customisation-onewhero-y7.ts "$@"
