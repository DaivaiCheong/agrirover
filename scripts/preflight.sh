#!/usr/bin/env bash
# AI Auto Farm — environment preflight (macOS / Linux / Raspberry Pi)
set -u
ok=1
chk(){ if command -v "$2" >/dev/null 2>&1; then
    printf "  [ OK ]  %-16s %s\n" "$1" "$($2 $3 2>&1 | head -1)"
  else printf "  [MISS]  %-16s need %s — %s\n" "$1" "$4" "$5"; ok=0; fi }

echo; echo "AI AUTO FARM — environment preflight"; echo "------------------------------------"
chk Docker  docker  --version 24+   "https://docs.docker.com/engine/install/"
chk Node.js node    --version 20+   "https://nodejs.org/en/download"
chk npm     npm     --version 10+   "ships with Node.js"
chk Python  python3 --version 3.11+ "https://www.python.org/downloads/"
chk Git     git     --version 2.40+ "https://git-scm.com/downloads"
echo
[ -f .env ] && echo "  [ OK ]  .env present" || echo "  [MISS]  .env missing — run: cp .env.example .env"
echo
if [ "$ok" = 1 ]; then
  echo "All prerequisites present. Next:"
  echo "    docker compose up -d"
  echo "    http://localhost:5173  (app)   http://localhost:8000/docs  (API)"
else
  echo "Install the [MISS] items above and re-run. Docker alone is enough to run everything."
fi
echo
