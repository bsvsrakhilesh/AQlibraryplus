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

npx prisma generate

case "${1:-api}" in
  api)
    echo "Waiting for db:5432..."
    i=0
    until node -e "const net=require('net'); const s=net.createConnection({host:'db',port:5432}); s.on('connect',()=>process.exit(0)); s.on('error',()=>process.exit(1)); setTimeout(()=>process.exit(1),1000);"; do
      i=$((i+1))
      if [ "$i" -ge 30 ]; then
        echo "Postgres not ready after ~60s"
        exit 1
      fi
      echo "  still waiting ($i/30)"
      sleep 2
    done
    echo "Postgres is up"
    npx prisma migrate deploy
    exec npm run dev
    ;;
  worker)
    exec npm run worker
    ;;
  *)
    exec "$@"
    ;;
esac
