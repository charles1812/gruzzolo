#!/usr/bin/env bash
# Costruisce la versione web di prova in _site: la stessa app del telefono (android/app/src/main/assets)
# più web/demo-native.js (fa le veci di Android) e web/demo.js (pulsante 🧪 con l'esempio).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-_site}"
rm -rf "$OUT" && mkdir -p "$OUT"
cp android/app/src/main/assets/*.{html,js,css,json} "$OUT"/
rm -f "$OUT/config.local.json"
cp web/demo-native.js web/demo.js "$OUT"/
# demo-native.js prima di tutti gli altri script, demo.js alla fine
sed -i 's#</head>#<script src="demo-native.js"></script>\n</head>#' "$OUT/index.html"
sed -i 's#</body>#<script src="demo.js"></script>\n</body>#' "$OUT/index.html"
grep -q 'demo-native.js' "$OUT/index.html" && grep -q 'src="demo.js"' "$OUT/index.html"
touch "$OUT/.nojekyll"
echo "versione web pronta in $OUT"
