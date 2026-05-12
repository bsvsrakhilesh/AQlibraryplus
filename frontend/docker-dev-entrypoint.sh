#!/bin/sh
set -eu

manifest_hash="$(node -e "const fs=require('fs'),crypto=require('crypto'); const h=crypto.createHash('sha256'); for (const f of ['package.json','package-lock.json']) { if (fs.existsSync(f)) { h.update(f); h.update('\0'); h.update(fs.readFileSync(f)); h.update('\0'); } } process.stdout.write(h.digest('hex'))")"
hash_file="node_modules/.docker-manifest-sha256"
installed_hash=""
if [ -f "$hash_file" ]; then
  installed_hash="$(cat "$hash_file")"
fi

if [ ! -d node_modules ] || [ ! -f node_modules/.package-lock.json ] || [ "$manifest_hash" != "$installed_hash" ]; then
  if [ -f package-lock.json ]; then
    npm ci || {
      echo "npm ci failed; package-lock.json may be out of sync. Running npm install to refresh the dev container dependencies."
      npm install
    }
  else
    npm install
  fi
  mkdir -p node_modules
  printf "%s" "$manifest_hash" > "$hash_file"
fi

exec npm run dev
