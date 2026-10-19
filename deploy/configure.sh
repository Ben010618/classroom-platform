#!/usr/bin/env bash
# Prepares a Hubs Community Edition config for our classroom, on the server.
#   1. clones hubs-cloud at the pinned commit into deploy/work/hubs-cloud
#   2. writes community-edition/input-values.yaml from deploy/.env, generating random secrets
#   3. runs the CE generator (hcce.yaml) — it does NOT apply anything to the cluster
# Re-running keeps the generated secrets (stored in deploy/work/secrets.env) so the instance stays consistent.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$HERE/work"
ENV_FILE="$HERE/.env"
SECRETS="$WORK/secrets.env"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE — copy .env.example and fill it in."; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

for v in HUB_DOMAIN ADM_EMAIL SMTP_SERVER SMTP_PORT SMTP_USER SMTP_PASS HUBS_IMAGE HUBS_CLOUD_REF; do
  [ -n "${!v:-}" ] || { echo "$v is empty in $ENV_FILE"; exit 1; }
  case "${!v}" in *example*|changeMe) echo "$v still has a placeholder value: ${!v}"; exit 1;; esac
done

mkdir -p "$WORK"
chmod 700 "$WORK"

# Secrets: generate once, then reuse.
if [ ! -f "$SECRETS" ]; then
  rnd() { openssl rand -hex 32; }
  {
    echo "DB_PASS=$(rnd)"
    echo "NODE_COOKIE=$(rnd)"
    echo "GUARDIAN_KEY=$(rnd)"
    echo "PHX_KEY=$(rnd)"
  } > "$SECRETS"
  chmod 600 "$SECRETS"
  echo "Generated new secrets in $SECRETS (back this file up somewhere safe)."
fi
# shellcheck disable=SC1090
. "$SECRETS"

CE="$WORK/hubs-cloud/community-edition"
if [ ! -d "$WORK/hubs-cloud/.git" ]; then
  git clone --quiet https://github.com/Hubs-Foundation/hubs-cloud.git "$WORK/hubs-cloud"
fi
git -C "$WORK/hubs-cloud" fetch --quiet origin
git -C "$WORK/hubs-cloud" checkout --quiet "$HUBS_CLOUD_REF"

cat > "$CE/input-values.yaml" <<EOF
HUB_DOMAIN: "$HUB_DOMAIN"
ADM_EMAIL: "$ADM_EMAIL"
Namespace: "hcce"
Container_Dockerhub_Username: "mozillareality"
Container_Tag: "stable-latest"
DB_USER: "postgres"
DB_PASS: "$DB_PASS"
DB_NAME: "retdb"
DB_HOST: "pgbouncer"
DB_HOST_T: "pgbouncer-t"
PGRST_DB_URI: "postgres://\$DB_USER:\$DB_PASS@pgbouncer/\$DB_NAME"
PSQL: "postgres://\$DB_USER:\$DB_PASS@pgbouncer/\$DB_NAME"
SMTP_SERVER: "$SMTP_SERVER"
SMTP_PORT: "$SMTP_PORT"
SMTP_USER: "$SMTP_USER"
SMTP_PASS: "$SMTP_PASS"
NODE_COOKIE: "$NODE_COOKIE"
GUARDIAN_KEY: "$GUARDIAN_KEY"
PHX_KEY: "$PHX_KEY"
SKETCHFAB_API_KEY: "?"
TENOR_API_KEY: "?"
GENERATE_PERSISTENT_VOLUMES: "Yes"
PERSISTENT_VOLUME_STORAGE_CLASS: "${PERSISTENT_VOLUME_STORAGE_CLASS:-local-path}"
PERSISTENT_VOLUME_SIZE: "${PERSISTENT_VOLUME_SIZE:-20Gi}"
OVERRIDE_RETICULUM_IMAGE: "hubsfoundation/reticulum:\$Container_Tag"
OVERRIDE_POSTGREST_IMAGE: "No"
OVERRIDE_POSTGRES_IMAGE: "No"
OVERRIDE_PGBOUNCER_IMAGE: "No"
OVERRIDE_HUBS_IMAGE: "$HUBS_IMAGE"
OVERRIDE_SPOKE_IMAGE: "hubsfoundation/spoke:\$Container_Tag"
OVERRIDE_NEARSPARK_IMAGE: "hubsfoundation/nearspark:\$Container_Tag"
OVERRIDE_PHOTOMNEMONIC_IMAGE: "hubsfoundation/photomnemonic:\$Container_Tag"
OVERRIDE_DIALOG_IMAGE: "No"
OVERRIDE_COTURN_IMAGE: "No"
OVERRIDE_HAPROXY_IMAGE: "No"
EOF
chmod 600 "$CE/input-values.yaml"

( cd "$CE" && npm ci --silent && npm run --silent gen-hcce )
chmod 600 "$CE/hcce.yaml"

echo
echo "Generated $CE/hcce.yaml"
echo "Next: cd $CE && npm run apply   (see deploy/README.md step 5)"
