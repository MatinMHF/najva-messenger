#!/usr/bin/env bash
# =============================================================================
# Najva Messenger — One-click installer for Linux / macOS
# Does NOT require cloning the repository.
# Usage:  bash <(curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install/install-linux.sh)
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; MAGENTA='\033[0;35m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}[>>] $*${NC}"; }
ok()    { echo -e "${GREEN}[OK] $*${NC}"; }
warn()  { echo -e "${YELLOW}[!!] $*${NC}"; }
fatal() { echo -e "${RED}[XX] $*${NC}"; exit 1; }

RAW="https://raw.githubusercontent.com/MatinMHF/najva-messenger/main"

echo -e "${MAGENTA}"
cat <<'BANNER'

  _   _        _
 | \ | |      (_)
 |  \| | __ _  ___   ____ _
 | . ` |/ _` |/ \ \ / / _` |
 | |\  | (_| | | \ V / (_| |
 \_| \_/\__,_| |  \_/ \__,_|
            _/ |
           |__/

  Najva Messenger — Linux / macOS Installer
BANNER
echo -e "${NC}"

command_exists() { command -v "$1" &>/dev/null; }

gen_secret() {
    local bytes=${1:-32}
    if command_exists openssl; then
        openssl rand -hex "$bytes"
    elif command_exists python3; then
        python3 -c "import secrets,sys; sys.stdout.write(secrets.token_hex(int(sys.argv[1])))" "$bytes"
    else
        cat /dev/urandom | tr -dc 'a-f0-9' | head -c $((bytes*2))
    fi
}

# ---- Step 1: Docker ---------------------------------------------------------
step "Checking Docker..."

if command_exists docker && docker compose version &>/dev/null; then
    ok "Docker $(docker --version | awk '{print $3}' | tr -d ',') with Compose plugin found."
else
    warn "Docker not found. Attempting automatic installation..."
    OS="$(uname -s)"

    if [[ "$OS" == "Darwin" ]]; then
        if command_exists brew; then
            brew install --cask docker
            warn "Please open Docker Desktop, complete setup, then re-run this script."
            exit 0
        else
            fatal "Install Docker Desktop from https://docs.docker.com/desktop/mac/install/ then re-run."
        fi
    elif [[ -f /etc/debian_version ]]; then
        sudo apt-get update -qq
        sudo apt-get install -y -qq ca-certificates curl gnupg lsb-release
        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg \
            | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        sudo chmod a+r /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") \
$(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        sudo apt-get update -qq
        sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        sudo systemctl enable --now docker
        sudo usermod -aG docker "$USER" || true
        ok "Docker installed via apt."
    elif [[ -f /etc/redhat-release ]] || [[ -f /etc/fedora-release ]]; then
        sudo dnf -y install dnf-plugins-core
        sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo 2>/dev/null || \
            sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        sudo systemctl enable --now docker
        sudo usermod -aG docker "$USER" || true
        ok "Docker installed via dnf."
    elif command_exists pacman; then
        sudo pacman -Sy --noconfirm docker docker-compose
        sudo systemctl enable --now docker
        sudo usermod -aG docker "$USER" || true
        ok "Docker installed via pacman."
    else
        fatal "Unsupported distro. Install Docker manually: https://docs.docker.com/engine/install/"
    fi
fi

if ! docker info &>/dev/null; then
    warn "Docker daemon not running. Trying to start..."
    sudo systemctl start docker 2>/dev/null || fatal "Could not start Docker. Please start it manually."
fi

# ---- Step 2: Create install directory ---------------------------------------
INSTALL_DIR="${NAJVA_DIR:-$HOME/najva}"
step "Creating install directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"/nginx "$INSTALL_DIR"/turn
cd "$INSTALL_DIR"
ok "Working directory: $INSTALL_DIR"

# ---- Step 3: Download config files ------------------------------------------
step "Downloading configuration files from GitHub..."

curl -fsSL "$RAW/docker-compose.yml"       -o docker-compose.yml
curl -fsSL "$RAW/.env.example"             -o .env.example
curl -fsSL "$RAW/nginx/nginx.conf"         -o nginx/nginx.conf
curl -fsSL "$RAW/turn/turnserver.conf"     -o turn/turnserver.conf

ok "Config files downloaded."

# ---- Step 4: .env -----------------------------------------------------------
step "Configuring environment..."

if [[ -f .env ]]; then
    warn ".env already exists — skipping secret generation."
    warn "Delete .env and re-run if you want fresh secrets."
else
    JWT_SECRET=$(gen_secret 32)
    JWT_REFRESH=$(gen_secret 32)
    DB_PASS=$(gen_secret 24)
    TURN_SECRET=$(gen_secret 24)

    sed \
        -e "s/change_me_strong_password/${DB_PASS}/g" \
        -e "s/change_me_32_random_bytes_minimum/${JWT_SECRET}/g" \
        -e "s/change_me_another_32_random_bytes/${JWT_REFRESH}/g" \
        -e "s/change_me_turn_secret/${TURN_SECRET}/g" \
        .env.example > .env

    ok ".env created with generated secrets."
    warn "Back up $INSTALL_DIR/.env — losing it means losing access to encrypted data."
fi

# ---- Step 5: Build & Start --------------------------------------------------
step "Pulling images and starting Najva services (first run may take a few minutes)..."
docker compose up -d --pull always

# ---- Step 6: Health check ---------------------------------------------------
step "Waiting for services to become healthy..."
for i in $(seq 1 12); do
    sleep 5
    if docker compose ps 2>/dev/null | grep -q 'healthy'; then break; fi
done

# ---- Done -------------------------------------------------------------------
echo ""
ok "====================================="
ok "  Najva is running!"
ok "  Open: http://localhost"
ok "  Install dir: $INSTALL_DIR"
ok "====================================="
echo ""

if command_exists xdg-open; then xdg-open http://localhost &
elif command_exists open;     then open http://localhost &
fi
