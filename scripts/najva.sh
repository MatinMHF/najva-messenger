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
    write_nginx_conf letsencrypt
    apply_urls https "$HTTPS_PORT"
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    printf '#!/bin/sh\ncd %s && docker compose exec -T nginx nginx -s reload\n' "$INSTALL_DIR" \
      > /etc/letsencrypt/renewal-hooks/deploy/najva.sh
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/najva.sh
  else
    warn "Issuance failed. Check that DNS points here and port 80 is reachable."
    write_nginx_conf "$TLS"
    if [ "$TLS" = "letsencrypt" ] || [ "$TLS" = "selfsigned" ]; then
      apply_urls https "$HTTPS_PORT"
    else
      apply_urls http "$HTTP_PORT"
    fi
  fi
  docker compose up -d
}

issue_self_signed() {
  load_env
  generate_self_signed_cert
  write_static_config
  write_nginx_conf selfsigned
  apply_urls https "$HTTPS_PORT"
  docker compose up -d
  echo
  bold "==> Self-signed SSL Certificate & Root CA Issued!"
  info "App HTTPS URL:    https://$HOSTNAME_"
  info "Admin Panel:      https://$HOSTNAME_/admin"
  info "CA Download Link: http://$HOSTNAME_/ca.crt"
  echo
  info "To trust this certificate on your client device (Windows/Mac/Android/iOS):"
  info "  1. Download Root CA: http://$HOSTNAME_/ca.crt"
  info "  2. Install 'najva-ca.crt' into 'Trusted Root Certification Authorities'."
  info "  3. Open https://$HOSTNAME_ — camera, mic, voice messages & WebCrypto will work."
}

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
  ' </dev/null >/dev/null

  sed -i "s#^ADMIN_USERNAME=.*#ADMIN_USERNAME=$user#" .env
  grep -v '^ADMIN_PASSWORD=' .env > .env.new && printf 'ADMIN_PASSWORD=%s\n' "$pass" >> .env.new
  mv .env.new .env && chmod 600 .env

  docker compose up -d server >/dev/null

  if SEED_OUT="$(docker compose exec -T server npm run seed </dev/null 2>&1)"; then
    info "Admin '$user' recreated."
  else
    warn "Seeding failed:"
    printf '%s\n' "$SEED_OUT" | tail -5
  fi
}

status() {
  load_env
  docker compose ps
  echo
  info "Version: $(installed_version)"
  info "Domain: ${DOMAIN:-<none>}   TLS: $TLS   Ports: $HTTP_PORT/$HTTPS_PORT"
  if [ "$TLS" = "selfsigned" ]; then
    info "CA Certificate Download: http://$HOSTNAME_/ca.crt"
  fi
}

check_updates() {
  local current latest ans
  current="$(installed_version)"
  info "Installed version: $current"
  info "Checking for updates..."

  latest="$(latest_version || true)"
  if [ -z "$latest" ]; then
    warn "Could not check for updates. Is the server online?"
    return
  fi

  if ! version_gt "$latest" "$current"; then
    info "You are on the latest version ($current)."
    return
  fi

  bold "  Version $latest is available."
  read -rp "  Do you want to update? [y/N] " ans </dev/tty
  case "$ans" in
    y|Y) perform_update || warn "Update failed; the running install was left alone." ;;
    *)   info "Left unchanged." ;;
  esac
}

uninstall() {
  warn "This removes Najva completely: containers, images, volumes, the"
  warn "checkout at $INSTALL_DIR and all stored data. Messages are"
  warn "end-to-end encrypted and will not be recoverable."
  read -rp "  Type 'uninstall' to confirm: " ok </dev/tty
  [ "$ok" = "uninstall" ] || { info "Left unchanged."; return; }

  docker compose down -v --rmi local 2>/dev/null || true
  cd /
  rm -rf "$INSTALL_DIR" /etc/najva.conf /usr/local/bin/najva
  rm -f /etc/letsencrypt/renewal-hooks/deploy/najva.sh
  info "Najva has been uninstalled."
  exit 0
}

while :; do
  echo
  bold "  Najva Messenger Management"
  cat <<'MENU'
    1) Retry Let's Encrypt SSL certificate
    2) Issue self-signed SSL certificate & CA download link
    3) Reset admin username and password
    4) Restart the service
    5) Stop the service
    6) Start the service
    7) Status
    8) Logs (follow, Ctrl-C to exit)
    9) Check for updates
   10) Uninstall
    0) Quit
MENU
  read -rp "  Choice: " choice </dev/tty
  case "$choice" in
    1) retry_ssl; pause ;;
    2) issue_self_signed; pause ;;
    3) reset_admin; pause ;;
    4) docker compose restart; info "Restarted."; pause ;;
    5) docker compose down; info "Stopped."; pause ;;
    6) docker compose up -d; info "Started."; pause ;;
    7) status; pause ;;
    8) docker compose logs -f --tail 100 || true ;;
    9) check_updates; pause ;;
    10) uninstall; pause ;;
    0|q) exit 0 ;;
    *) warn "Unknown choice." ;;
  esac
done
