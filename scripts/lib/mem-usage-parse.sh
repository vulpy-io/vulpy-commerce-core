#!/bin/bash
# mem-usage-parse.sh — shared memory-usage parsing for the swap headroom
# checks. Source this file from scripts that must interpret docker stats
# MemUsage output; it only defines a function, it never executes anything.
#
# docker stats --no-stream --format '{{.MemUsage}}' emits one line per
# container: "1.2GiB / 3.8GiB" (used / limit). The naive awk -F/ '$1'
# treats "1.2GiB" as non-numeric → 0, silently underestimating current
# usage and making headroom checks permanently conservative.

# parse_mem_usage_mb — parse MemUsage lines from stdin into a total MiB
# integer on stdout. Handles GiB/MiB/KiB suffixes ("1.2GiB / 4GiB",
# "512MiB / 4GiB", …) and tolerates the trailing space docker emits before
# the slash. Unitless values are treated as MiB so a malformed line still
# contributes a sane number instead of silently contributing 0.
parse_mem_usage_mb() {
  awk -F'/' '
    {
      v = $1
      gsub(/^[ \t]+|[ \t]+$/, "", v)
      unit = ""
      if (v ~ /GiB$/) { unit = "GiB"; sub(/GiB$/, "", v) }
      else if (v ~ /MiB$/) { unit = "MiB"; sub(/MiB$/, "", v) }
      else if (v ~ /KiB$/) { unit = "KiB"; sub(/KiB$/, "", v) }
      n = v + 0
      if (unit == "GiB") n *= 1024
      else if (unit == "KiB") n /= 1024
      sum += n
    }
    END { print int(sum) }
  '
}
