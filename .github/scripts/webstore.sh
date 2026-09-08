#!/usr/bin/env bash
# Chrome Web Store API v2 client.
#
# v2 addresses items as publishers/<publisher>/items/<extension>, so PUBLISHER_ID
# is mandatory and must be the publisher that OWNS the item (Developer Dashboard >
# Publisher > Settings). A publisher/item pair the caller cannot reach returns 403
# PERMISSION_DENIED, worded "or it might not exist" - it never distinguishes a wrong
# id from a missing grant, which is why `status` exists as a standalone probe.
#
# Auth: a service account added under Developer Dashboard > Account (preferred, no
# human in the loop, no 7-day test-mode token expiry), or the legacy installed-app
# refresh token. Only one of the two needs to be configured.
set -euo pipefail

: "${PUBLISHER_ID:?PUBLISHER_ID is required}"
: "${EXTENSION_ID:?EXTENSION_ID is required}"

API="https://chromewebstore.googleapis.com"
SCOPE="https://www.googleapis.com/auth/chromewebstore"
ITEM="publishers/${PUBLISHER_ID}/items/${EXTENSION_ID}"

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# Self-signed JWT assertion: avoids the IAM Credentials API, so the service account
# needs no roles at all in its GCP project (only the Dashboard grant matters).
token_from_service_account() {
  local key_file sa_email now exp header claims signing_input signature response
  key_file="$(mktemp)"
  trap 'rm -f "$key_file"' RETURN

  printf '%s' "$WEBSTORE_SERVICE_ACCOUNT_KEY" | jq -r '.private_key' > "$key_file"
  sa_email="$(printf '%s' "$WEBSTORE_SERVICE_ACCOUNT_KEY" | jq -r '.client_email')"

  now="$(date +%s)"
  exp="$((now + 3600))"
  header='{"alg":"RS256","typ":"JWT"}'
  claims="$(jq -nc --arg iss "$sa_email" --arg scope "$SCOPE" --argjson iat "$now" --argjson exp "$exp" \
    '{iss:$iss, scope:$scope, aud:"https://oauth2.googleapis.com/token", iat:$iat, exp:$exp}')"

  signing_input="$(printf '%s' "$header" | b64url).$(printf '%s' "$claims" | b64url)"
  signature="$(printf '%s' "$signing_input" | openssl dgst -sha256 -sign "$key_file" -binary | b64url)"

  response="$(curl -sS -X POST https://oauth2.googleapis.com/token \
    --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer' \
    --data-urlencode "assertion=${signing_input}.${signature}")"
  local token
  token="$(printf '%s' "$response" | jq -r '.access_token // empty')"
  if [ -z "$token" ]; then
    echo "service account token exchange failed: $(printf '%s' "$response" | jq -r '.error // "unknown"')" >&2
    return 1
  fi
  printf '%s' "$token"
}

token_from_refresh_token() {
  local response
  response="$(curl -sS https://oauth2.googleapis.com/token \
    --data-urlencode "client_id=${CLIENT_ID}" \
    --data-urlencode "client_secret=${CLIENT_SECRET}" \
    --data-urlencode "refresh_token=${REFRESH_TOKEN}" \
    --data-urlencode 'grant_type=refresh_token')"
  local token
  token="$(printf '%s' "$response" | jq -r '.access_token // empty')"
  if [ -z "$token" ]; then
    echo "refresh token exchange failed: $(printf '%s' "$response" | jq -r '.error // "unknown"')" >&2
    return 1
  fi
  printf '%s' "$token"
}

access_token() {
  if [ -n "${WEBSTORE_SERVICE_ACCOUNT_KEY:-}" ]; then
    token_from_service_account
  elif [ -n "${CLIENT_ID:-}" ] && [ -n "${REFRESH_TOKEN:-}" ]; then
    token_from_refresh_token
  else
    echo "no credentials: set WEBSTORE_SERVICE_ACCOUNT_KEY, or CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN" >&2
    return 1
  fi
}

# Every call prints the body then fails on a non-2xx, so a PERMISSION_DENIED reaches
# the log instead of being flattened into a bare "exit code 22" by curl -f.
call() {
  local method="$1" url="$2"; shift 2
  local body status
  body="$(curl -sS -X "$method" -H "Authorization: Bearer ${TOKEN}" -w '\n%{http_code}' "$@" "$url")"
  status="${body##*$'\n'}"
  body="${body%$'\n'*}"
  echo "$body"
  case "$status" in
    2*) return 0 ;;
    *)  echo "HTTP $status" >&2; return 1 ;;
  esac
}

command="${1:-}"
case "$command" in
  token)
    access_token
    ;;
  status)
    TOKEN="$(access_token)"
    call GET "${API}/v2/${ITEM}:fetchStatus"
    ;;
  upload)
    package="${2:?usage: webstore.sh upload <package.zip>}"
    TOKEN="$(access_token)"
    # Raw upload protocol; the store rejects a package whose manifest version was not bumped.
    call POST "${API}/upload/v2/${ITEM}:upload" \
      -H 'X-Goog-Upload-Protocol: raw' \
      -H 'X-Goog-Upload-File-Name: extension.zip' \
      -H 'Content-Type: application/zip' \
      --data-binary "@${package}"
    ;;
  publish)
    TOKEN="$(access_token)"
    # Publishes with the listing's existing visibility; a visibility changed in the
    # Dashboard must be published manually once before the API can publish again.
    call POST "${API}/v2/${ITEM}:publish" -H 'Content-Length: 0'
    ;;
  *)
    echo "usage: webstore.sh {token|status|upload <package.zip>|publish}" >&2
    exit 64
    ;;
esac
