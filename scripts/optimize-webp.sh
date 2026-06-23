#!/usr/bin/env bash
# Convert metadata/images/*.jpg -> .webp (<= ~150KB each) and rewrite each
# metadata/<id>.json image URL from .jpg to .webp.
# Run AFTER scripts/gen-ai-images.mjs (which saves raw flux JPEGs).
#
# Needs `cwebp` (libwebp-tools) + sed. Easiest with throwaway containers:
#
#   # 1) images -> webp (in an alpine container with libwebp-tools)
#   sudo docker run --rm -v "$(pwd)/metadata/images:/imgs" -w /imgs alpine \
#     sh -c 'apk add --no-cache libwebp-tools >/dev/null;
#            for f in *.jpg; do cwebp -quiet -m 6 -size 153600 "$f" -o "${f%.jpg}.webp" && rm "$f"; done'
#
#   # 2) metadata .jpg -> .webp (node in the hardhat container)
#   sudo docker compose exec -T hardhat node -e '
#     const fs=require("fs");
#     for (const f of fs.readdirSync("/app/metadata")) {
#       if (!f.endsWith(".json")) continue;
#       const p="/app/metadata/"+f, m=JSON.parse(fs.readFileSync(p));
#       if (m.image && m.image.endsWith(".jpg")) { m.image=m.image.slice(0,-4)+".webp"; fs.writeFileSync(p, JSON.stringify(m,null,2)); }
#     }'
#
# Or run this script directly in an environment that already has cwebp + sed.
# TARGET (bytes) overridable; default 150KB.
set -e
TARGET="${TARGET:-153600}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$DIR/metadata/images"
for f in *.jpg; do
  [ -e "$f" ] || continue
  cwebp -quiet -m 6 -size "$TARGET" "$f" -o "${f%.jpg}.webp" && rm "$f"
done

cd "$DIR/metadata"
for j in *.json; do
  sed -i 's/\.jpg"/.webp"/' "$j"
done

echo "optimized images -> webp (<= ${TARGET} bytes) + updated metadata"
