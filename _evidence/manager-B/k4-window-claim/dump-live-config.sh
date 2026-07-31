#!/usr/bin/env bash
set -uo pipefail
C=talaria-trading-chart-1
echo "=== image ==="
docker inspect --format '{{.Config.Image}}' $C
echo "=== cmd / entrypoint ==="
docker inspect --format 'ENTRYPOINT={{json .Config.Entrypoint}}' $C
docker inspect --format 'CMD={{json .Config.Cmd}}' $C
echo "=== networks ==="
docker inspect --format '{{json .NetworkSettings.Networks}}' $C | tr ',' '\n' | grep -o '"[a-z0-9_-]*":{' | head
echo "=== env (secrets masked) ==="
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $C \
  | sed -E 's/(PASSWORD|SECRET|KEY|TOKEN)=.*/\1=***/I' \
  | sed -E 's#://[^@]*@#://***@#'
echo "=== mounts ==="
docker inspect --format '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}} {{if .RW}}rw{{else}}ro{{end}}
{{end}}' $C
