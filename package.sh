#!/bin/sh
# Chrome Web Store にアップロードする zip を作る。拡張機能の動作に必要なファイルだけを入れる
set -eu
cd "$(dirname "$0")"

version=$(sed -n 's/^ *"version": "\(.*\)",$/\1/p' manifest.json)
out="reply-hider-24th-letter-$version.zip"

rm -f "$out"
zip -q -X "$out" \
  manifest.json \
  content.js content.css main.js \
  popup.html popup.css popup.js \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png \
  LICENSE
echo "$out"
