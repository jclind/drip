#!/bin/sh
# Screenshots every store frame from frames.html into store/images/, at the sizes the Chrome Web Store asks for.
# Runs headless Chrome on air against a local server of this checkout. Usage: store/art/capture.sh [port]
set -eu
cd "$(dirname "$0")/../.."
port=${1:-8078}
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
profile=$(mktemp -d)
log=$(mktemp)
out=store/images
mkdir -p "$out"

python3 -m http.server "$port" --bind 127.0.0.1 >"$log" 2>&1 &
server=$!
trap 'kill $server 2>/dev/null; rm -rf "$profile"' EXIT
sleep 1

shoot() { # name width height query [motion]
  # Reduced motion keeps every frame still. The lock (shot 2) needs motion on, or it has no bubbles; frames.html sets them.
  rm=--force-prefers-reduced-motion budget=6000; [ "${5:-}" = motion ] && rm=--no-default-browser-check budget=9000
  # A profile per shot: sharing one cut 23px off the bottom of shot 2's panel (round 3, 2026-11-09).
  "$chrome" --headless --disable-gpu --user-data-dir="$profile/$1" --hide-scrollbars $rm \
    --force-dark-mode --window-size="$2,$3" --virtual-time-budget=$budget --screenshot="$out/$1.png" --log-net-log="$profile/net-$1.json" \
    "http://127.0.0.1:$port/store/art/frames.html?$4" >/dev/null 2>&1
  size=$(sips -g pixelWidth -g pixelHeight "$out/$1.png" | awk '/pixel/ {printf "%s ", $2}')
  [ "$size" = "$2 $3 " ] || { echo "capture: $1 is $size, not $2x$3" >&2; exit 1; }
  # Chrome's own network log sees every request. A YouTube host in it means a real thumbnail or logo got in.
  if grep -E -o 'https?://[a-z0-9.-]*(ytimg|ggpht|youtube|googlevideo)[a-z0-9.-]*/' "$profile/net-$1.json" | sort -u | grep .; then
    echo "capture: $1 asked YouTube for something" >&2; exit 1
  fi
  echo "$out/$1.png"
}

for n in 1 3 4 5; do shoot "screenshot-$n" 1280 800 "shot=$n"; done
shoot screenshot-2 1280 800 shot=2 motion
for t in c d d2 d3 e; do shoot "tile-$t" 440 280 "tile=$t"; done
