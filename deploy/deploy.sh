#!/usr/bin/env bash
# Deploy Crew Chief (MotoGP app + the AC app + the shared PHP API) to Hostinger over SSH/rsync.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$SCRIPT_DIR/.deploy.env"
DRY_RUN=0
UPLOAD_CONFIG=0
SKIP_BUILD=0

ok()   { printf '\033[32m✔\033[0m %s\n' "$1"; }
step() { printf '\033[36m▸\033[0m %s\n' "$1"; }
warn() { printf '\033[33m!\033[0m %s\n' "$1"; }
die()  { printf '\033[31m✘ %s\033[0m\n' "$1" >&2; exit 1; }

usage() {
  printf '%s\n' \
    'Deploy Crew Chief to Hostinger.' \
    '' \
    'Usage: ./deploy/deploy.sh [options]' \
    '' \
    '  --init         Create missing deploy/.deploy.env from the example' \
    '  -n, --dry-run  Preview changes without modifying Hostinger' \
    '  --config       Also upload api/config.php (first deploy only — it holds the DB password)' \
    '  --no-build     Skip npm run build in both apps; deploy whatever is already in dist/' \
    '  -h, --help     Show this help'
}

init_config() {
  if [ ! -f "$CONFIG" ]; then
    cp "$SCRIPT_DIR/.deploy.env.example" "$CONFIG"
    chmod 600 "$CONFIG"
    ok 'Created deploy/.deploy.env'
  else
    warn 'deploy/.deploy.env already exists'
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --init) init_config; exit 0 ;;
    -n|--dry-run) DRY_RUN=1 ;;
    --config) UPLOAD_CONFIG=1 ;;
    --no-build) SKIP_BUILD=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

[ -f "$CONFIG" ] || die 'Missing deploy/.deploy.env. Run ./deploy/deploy.sh --init'
# shellcheck disable=SC1090
source "$CONFIG"

for command in rsync ssh; do
  command -v "$command" >/dev/null 2>&1 || die "$command is required."
done

: "${SSH_USER:?Set SSH_USER in deploy/.deploy.env}"
: "${SSH_HOST:?Set SSH_HOST in deploy/.deploy.env}"
: "${SSH_PORT:?Set SSH_PORT in deploy/.deploy.env}"
: "${REMOTE_PATH:?Set REMOTE_PATH in deploy/.deploy.env}"
REQUIRE_CLEAN_GIT="${REQUIRE_CLEAN_GIT:-1}"
REMOTE_PATH="${REMOTE_PATH%/}"

[[ "$SSH_PORT" =~ ^[0-9]+$ ]] || die 'SSH_PORT must be numeric.'
[[ "$SSH_USER" =~ ^[A-Za-z0-9._-]+$ ]] || die 'SSH_USER contains unsupported characters.'
[[ "$SSH_HOST" =~ ^[A-Za-z0-9._:-]+$ ]] || die 'SSH_HOST contains unsupported characters.'
[[ "$REMOTE_PATH" =~ ^/[A-Za-z0-9._/-]+$ ]] || die 'REMOTE_PATH contains unsupported characters.'
[[ "$REMOTE_PATH" == *'/public_html/'* || "$REMOTE_PATH" == *'/public_html' ]] || die 'REMOTE_PATH must be inside public_html.'
[ "$REMOTE_PATH" != '/' ] || die 'REMOTE_PATH cannot be /.'

if [ "$REQUIRE_CLEAN_GIT" = '1' ] && git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  [ -z "$(git -C "$PROJECT_DIR" status --porcelain -- .)" ] || die 'The project has uncommitted changes. Commit them or set REQUIRE_CLEAN_GIT=0.'
fi

SSH=(ssh -p "$SSH_PORT" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SSH_HOST")
RSYNC_SSH="ssh -p $SSH_PORT -o StrictHostKeyChecking=accept-new"

step 'Checking SSH access...'
"${SSH[@]}" "printf connected" >/dev/null
ok 'SSH connection works.'

if [ "$SKIP_BUILD" -eq 0 ]; then
  step 'Building the MotoGP app...'
  (cd "$PROJECT_DIR" && npm run build)
  ok 'MotoGP app built to dist/.'

  step 'Building the AC app...'
  (cd "$PROJECT_DIR/ac" && npm run build)
  ok 'AC app built to ac/dist/.'
else
  warn 'Skipping build — deploying whatever is already in dist/ and ac/dist/.'
fi

[ -d "$PROJECT_DIR/dist" ] || die 'dist/ is missing. Run npm run build first (or drop --no-build).'
[ -d "$PROJECT_DIR/ac/dist" ] || die 'ac/dist/ is missing. Run (cd ac && npm run build) first (or drop --no-build).'

RSYNC_ARGS=(-az --delete --human-readable --stats --itemize-changes --exclude '.DS_Store')
[ "$DRY_RUN" -eq 1 ] && RSYNC_ARGS+=(--dry-run)

if [ "$DRY_RUN" -eq 0 ]; then
  step "Preparing $REMOTE_PATH on Hostinger..."
  "${SSH[@]}" "mkdir -p '$REMOTE_PATH' '$REMOTE_PATH/ac' '$REMOTE_PATH/api' && chmod 755 '$REMOTE_PATH' '$REMOTE_PATH/ac' '$REMOTE_PATH/api'"
fi

step "Deploying the MotoGP app to $SSH_HOST:$REMOTE_PATH"
rsync "${RSYNC_ARGS[@]}" -e "$RSYNC_SSH" "$PROJECT_DIR/dist/" "$SSH_USER@$SSH_HOST:$REMOTE_PATH/"

step "Deploying the AC app to $SSH_HOST:$REMOTE_PATH/ac"
rsync "${RSYNC_ARGS[@]}" -e "$RSYNC_SSH" "$PROJECT_DIR/ac/dist/" "$SSH_USER@$SSH_HOST:$REMOTE_PATH/ac/"

step "Deploying the shared API to $SSH_HOST:$REMOTE_PATH/api"
API_ARGS=("${RSYNC_ARGS[@]}" --exclude 'config.php')
rsync "${API_ARGS[@]}" -e "$RSYNC_SSH" "$PROJECT_DIR/api/" "$SSH_USER@$SSH_HOST:$REMOTE_PATH/api/"

if [ "$DRY_RUN" -eq 1 ]; then
  warn 'Dry run only; Hostinger was not modified.'
  exit 0
fi

if [ "$UPLOAD_CONFIG" -eq 1 ]; then
  step 'Uploading api/config.php (holds the DB password)...'
  [ -f "$PROJECT_DIR/api/config.php" ] || die 'Missing api/config.php locally.'
  rsync -az -e "$RSYNC_SSH" "$PROJECT_DIR/api/config.php" "$SSH_USER@$SSH_HOST:$REMOTE_PATH/api/config.php"
  "${SSH[@]}" "chmod 600 '$REMOTE_PATH/api/config.php'"
  ok 'api/config.php uploaded with mode 600.'
else
  "${SSH[@]}" "test -f '$REMOTE_PATH/api/config.php'" || warn 'Remote api/config.php is missing. Re-run with --config.'
fi

printf '\n\033[32m✔ Deployment complete.\033[0m %s\n' "$(date '+%b %d %H:%M')"
printf 'MotoGP app: https://ucleus.co/crew-chief/\n'
printf 'AC app:     https://ucleus.co/crew-chief/ac/\n'
