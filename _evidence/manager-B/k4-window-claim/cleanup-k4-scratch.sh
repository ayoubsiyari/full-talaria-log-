#!/usr/bin/env bash
# My K4 investigation left four scratch containers running on the canary host, two of them on the
# b118 image that carries the defect. Two problems with leaving them:
#
#   1. If any is published on a host port, another manager can probe it and measure b118 while
#      believing they measured the canary. That is the same failure class as trusting a marker.
#   2. They were up during my freeze measurements. Healthchecks against the shared DB are
#      background load I did not account for, so it goes in the finding as a stated limit.
#
# Report ports first, then remove. Nothing here touches the four production containers.
set -uo pipefail
SCRATCH="k4-tiny-fixed k4-tiny-unfixed k4-fixed-api k4-scratch-api"

echo "== published ports (does anything answer from outside?) =="
for c in $SCRATCH; do
  p=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Ports}}{{$k}}->{{$v}} {{end}}' "$c" 2>/dev/null)
  img=$(docker inspect -f '{{.Config.Image}}' "$c" 2>/dev/null)
  echo "  $c  [$img]  ports: ${p:-none}"
done

echo
echo "== cpu right now, to judge whether they loaded my measurements =="
docker stats --no-stream --format '  {{.Name}}  cpu={{.CPUPerc}}  mem={{.MemUsage}}' $SCRATCH 2>/dev/null

echo
echo "== removing =="
for c in $SCRATCH; do
  docker rm -f "$c" && echo "  removed $c" || echo "  FAILED to remove $c"
done

echo
echo "== production containers must be untouched =="
docker ps --format '  {{.Names}}  {{.Image}}  {{.Status}}' | grep -E 'talaria-(trading-chart|homepage|db|redis)'
