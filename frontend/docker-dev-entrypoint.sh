#!/bin/sh
set -eu

manifest="package.json"
if [ -f package-lock.json ]; then
  manifest="package-lock.json"
fi

manifest_hash="$(node -e "const fs=require('fs'),crypto=require('crypto'); const f=process.argv[1]; process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'))" "$manifest")"
hash_file="node_modules/.docker-manifest-sha256"
installed_hash=""
if [ -f "$hash_file" ]; then
  installed_hash="$(cat "$hash_file")"
fi

if [ ! -d node_modules ] || [ ! -f node_modules/.package-lock.json ] || [ "$manifest_hash" != "$installed_hash" ]; then
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
  mkdir -p node_modules
  printf "%s" "$manifest_hash" > "$hash_file"
fi

exec npm run dev
