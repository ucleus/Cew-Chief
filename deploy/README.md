# Hostinger deployment

This folder deploys Crew Chief — the MotoGP app, the AC (Assetto Corsa) app,
and the PHP API both of them share — to a `public_html` subfolder over
SSH/rsync.

## Source repository

```text
https://github.com/ucleus/Cew-Chief.git
```

The `main` branch should contain the production-ready source. Local
deployment credentials stay in the ignored `deploy/.deploy.env` and must
never be committed.

Before deploying a release, commit and push the verified source:

```bash
git add .
git commit -m "Describe the release"
git push origin main
./deploy/deploy.sh --dry-run
./deploy/deploy.sh
```

Pushing to GitHub does not deploy anything by itself — Hostinger only gets
updated when you run `deploy.sh`, which builds both apps locally and rsyncs
the built `dist/` output (plus the shared `api/` folder) up. The database
dump, SQL and PHP source never go to GitHub as raw files beyond what's
already in `api/` and `database`-adjacent docs — GitHub holds source, not
secrets.

## What gets deployed where

```
public_html/crew-chief/        <- dist/        (MotoGP app)
public_html/crew-chief/ac/     <- ac/dist/     (AC app)
public_html/crew-chief/api/    <- api/         (shared PHP + PDO backend)
```

Both apps are built with `VITE_API_URL=/crew-chief/api` baked in at build
time (see `.env.production` and `ac/.env.production`) so their `fetch`
calls resolve correctly from inside the `/crew-chief/` subfolder instead of
the domain root. If you ever move the deploy path, update those two
`.env.production` files **and** `REMOTE_PATH` in `deploy/.deploy.env`
together — they have to agree.

## 1. Database

The database (`u652263477_uzi544086`) already exists on this Hostinger
account and is shared by both apps — nothing to create. `api/config.php`
holds the connection (gitignored; never committed). First deploy only, push
it up with `--config` (see below).

If the schema or catalog isn't seeded yet on the production DB, SSH in and
run the seed scripts once:

```bash
ssh -p 65002 u652263477@185.164.108.137
cd ~/domains/ucleus.co/public_html/crew-chief/api
php seed.php      # MotoGP tracks/bikes/param ranges
php ac_seed.php   # AC cars/tracks/param ranges
```

## 2. Verify deployment settings

`deploy/.deploy.env` holds the SSH destination:

```dotenv
SSH_USER="u652263477"
SSH_HOST="185.164.108.137"
SSH_PORT="65002"
REMOTE_PATH="/home/u652263477/domains/ucleus.co/public_html/crew-chief"
PHP_BIN="/opt/alt/php82/usr/bin/php"
REQUIRE_CLEAN_GIT="1"
```

This account also hosts an unrelated site (`Tuner`) at `public_html/tuner`
with its own, separate deploy tooling — not touched by anything here.

## 3. Preview and deploy

Preview the transfer without changing Hostinger:

```bash
./deploy/deploy.sh --dry-run
```

For the first release, also upload `api/config.php` (it holds the DB
password and isn't in git):

```bash
./deploy/deploy.sh --config
```

For later releases, the remote `api/config.php` is left alone by default:

```bash
./deploy/deploy.sh
```

`deploy.sh` runs `npm run build` in both the project root and `ac/` before
rsyncing; pass `--no-build` to redeploy whatever is already sitting in
`dist/`/`ac/dist/` without rebuilding.

After deploying:

- MotoGP app: `https://ucleus.co/crew-chief/`
- AC app: `https://ucleus.co/crew-chief/ac/`

## Troubleshooting

- **API calls 404 or hit the wrong app:** check that `.env.production` in
  both apps and `REMOTE_PATH` all agree on the same subfolder.
- **Database unavailable:** confirm `api/config.php` is present on the
  server (`--config` on first deploy) and has the right password.
- **403/404 on the subfolder itself:** confirm `REMOTE_PATH` is a real
  subfolder under the domain's document root and that Hostinger is serving
  static files from it (no `.htaccess` rewrite needed for a plain SPA
  build, but make sure nothing else already occupies that path).
