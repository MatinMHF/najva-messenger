#!/usr/bin/env bash
#
# najva — management menu for a Najva Messenger install.
# Placed at /usr/local/bin/najva by install.sh.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run as root: sudo najva"; exit 1; }

INSTALL_DIR=/opt/najva
[ -f /etc/najva.conf ] && . /etc/najva.conf
cd "$INSTALL_DIR" || { echo "Install directory $INSTALL_DIR is missing."; exit 1; }
. "$INSTALL_DIR/scripts/najva-lib.sh"

# The answers given at install time live in .env; re-read them every action so
# the menu keeps working after a domain or port change.
load_env() {
  DOMAIN="$(grep '^NAJVA_DOMAIN=' .env | cut -d= -f2-)"
  HTTP_PORT="$(grep '^NAJVA_HTTP_PORT=' .env | cut -d= -f2-)"
  HTTPS_PORT="$(grep '^NAJVA_HTTPS_PORT=' .env | cut -d= -f2-)"
  LE_EMAIL="$(grep '^VAPID_SUBJECT=' .env | cut -d: -f2-)"
  HOSTNAME_="${DOMAIN:-$(hostname -I | awk '{print $1}')}"
  [ -n "$DOMAIN" ] && [ -d "/etc/letsencrypt/live/$DOMAIN" ] && TLS=yes || TLS=no
}

pause() { read -rp "  Press Enter to continue..." _ </dev/tty; }

retry_ssl() {
  load_env
  if [ -z "$DOMAIN" ]; then
    read -rp "  What is your domain? " DOMAIN </dev/tty
    [ -n "$DOMAIN" ] || { warn "No domain given."; return; }
    read -rp "  Email for Let's Encrypt notices [admin@$DOMAIN]: " LE_EMAIL </dev/tty
    LE_EMAIL="${LE_EMAIL:-admin@$DOMAIN}"
    HOSTNAME_="$DOMAIN"
    sed -i "s#^NAJVA_DOMAIN=.*#NAJVA_DOMAIN=$DOMAIN#; s#^WEBAUTHN_RP_ID=.*#WEBAUTHN_RP_ID=$DOMAIN#; \
            s#^TURN_URLS=.*#TURN_URLS=turn:$DOMAIN:3478#" .env
    write_static_config
  fi

  bold "==> Requesting certificate for $DOMAIN"
  if issue_certificate; then
    info "Certificate installed."
    write_nginx_conf yes
    apply_urls https "$HTTPS_PORT"
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    printf '#!/bin/sh\ncd %s && docker compose exec -T nginx nginx -s reload\n' "$INSTALL_DIR" \
      > /etc/letsencrypt/renewal-hooks/deploy/najva.sh
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/najva.sh
  else
    warn "Issuance failed. Check that DNS points here and port 80 is reachable."
    write_nginx_conf no
    apply_urls http "$HTTP_PORT"
  fi
  docker compose up -d
}

# Password derives the account's encryption key, so it cannot be rotated
# server-side without the old one. Resetting therefore re-provisions the account.
reset_admin() {
  load_env
  local user pass pass2 old
  old="$(grep '^ADMIN_USERNAME=' .env | cut -d= -f2-)"
  warn "This deletes the current admin account and creates a new one."
  warn "Its chat history is end-to-end encrypted and will not be recoverable."
  read -rp "  Continue? [y/N] " ok </dev/tty
  [ "$ok" = "y" ] || [ "$ok" = "Y" ] || return

  while :; do
    read -rp "  New admin username [$old]: " user </dev/tty
    user="${user:-$old}"
    read -rsp "  New admin password (min 8 chars): " pass </dev/tty; echo
    read -rsp "  Confirm password: " pass2 </dev/tty; echo
    [ "$pass" = "$pass2" ] || { warn "Passwords do not match."; continue; }
    [ "${#pass}" -ge 8 ] || { warn "Password too short."; continue; }
    break
  done

  docker compose exec -T -e OLD_USER="$old" -e NEW_USER="$user" server node -e '
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient();
    const names = [...new Set([process.env.OLD_USER, process.env.NEW_USER])];
    p.user.deleteMany({ where: { username: { in: names } } })
      .then(r => console.log("removed " + r.count))
      .finally(() => p.$disconnect());
  ' >/dev/null

  sed -i "s#^ADMIN_USERNAME=.*#ADMIN_USERNAME=$user#" .env
  # The password can contain '#', so build the replacement with a literal file edit.
  grep -v '^ADMIN_PASSWORD=' .env > .env.new && printf 'ADMIN_PASSWORD=%s\n' "$pass" >> .env.new
  mv .env.new .env && chmod 600 .env

  if docker compose exec -T server npx prisma db seed >/dev/null 2>&1; then
    info "Admin '$user' recreated."
  else
    warn "Seeding failed. Check 'docker compose logs server'."
  fi
}

status() {
  load_env
  docker compose ps
  echo
  info "Domain: ${DOMAIN:-<none>}   TLS: $TLS   Ports: $HTTP_PORT/$HTTPS_PORT"
}

while :; do
  echo
  bold "  Najva Messenger"
  cat <<'MENU'
    1) Retry SSL certificate
    2) Reset admin username and password
    3) Restart the service
    4) Stop the service
    5) Start the service
    6) Status
    7) Logs (follow, Ctrl-C to exit)
    0) Quit
MENU
  read -rp "  Choice: " choice </dev/tty
  case "$choice" in
    1) retry_ssl; pause ;;
    2) reset_admin; pause ;;
    3) docker compose restart; info "Restarted."; pause ;;
    4) docker compose down; info "Stopped."; pause ;;
    5) docker compose up -d; info "Started."; pause ;;
    6) status; pause ;;
    7) docker compose logs -f --tail 100 || true ;;
    0|q) exit 0 ;;
    *) warn "Unknown choice." ;;
  esac
done
