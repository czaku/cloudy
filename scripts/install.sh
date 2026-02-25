#!/usr/bin/env bash
# cloudy installer — macOS + Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/czaku/cloudy/main/scripts/install.sh | bash
# Or locally: bash scripts/install.sh [--boot] [--port <n>] [--no-local]

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOOT=0
PORT="1510"
SETUP_LOCAL=1
OS="$(uname -s)"   # Darwin | Linux

for arg in "$@"; do
  case "$arg" in
    --boot)     BOOT=1 ;;
    --no-local) SETUP_LOCAL=0 ;;
    --port)     shift; PORT="$1" ;;
    --port=*)   PORT="${arg#--port=}" ;;
  esac
done

# ── colours ──────────────────────────────────────────────────────────────────
bold='\033[1m'
green='\033[32m'
cyan='\033[36m'
yellow='\033[33m'
dim='\033[2m'
reset='\033[0m'

step() { echo -e "${cyan}▸${reset}  ${bold}$*${reset}"; }
ok()   { echo -e "${green}✓${reset}  $*"; }
warn() { echo -e "${yellow}⚠${reset}  $*"; }

echo -e "\n${bold}  ☁️  cloudy installer${reset}\n"

# ── 1. build ──────────────────────────────────────────────────────────────────
step "Building cloudy…"
cd "$REPO_DIR"
npm install --silent
npm run build:client
npx tsc --skipLibCheck 2>/dev/null || true

# ── 2. link globally ─────────────────────────────────────────────────────────
step "Linking cloudy globally…"
npm link --silent
ok "cloudy linked — $(which cloudy)"

# ── 3. hosts entry ───────────────────────────────────────────────────────────
if [[ $SETUP_LOCAL -eq 1 ]]; then
  HOSTS_FILE="/etc/hosts"
  HOSTS_ENTRY="127.0.0.1 cloudy.local"
  if grep -q "cloudy.local" "$HOSTS_FILE" 2>/dev/null; then
    ok "cloudy.local already in /etc/hosts"
  else
    step "Adding cloudy.local to /etc/hosts…"
    if echo "$HOSTS_ENTRY" >> "$HOSTS_FILE" 2>/dev/null; then
      ok "Added: $HOSTS_ENTRY"
    else
      warn "Need sudo to write /etc/hosts. Run:"
      echo "   sudo sh -c 'echo \"$HOSTS_ENTRY\" >> /etc/hosts'"
    fi
  fi
fi

# ── 4. port forwarding ────────────────────────────────────────────────────────
if [[ $SETUP_LOCAL -eq 1 ]]; then
  if [[ "$OS" == "Darwin" ]]; then
    # ── macOS: pfctl + LaunchDaemon ──────────────────────────────────────────
    ANCHOR_FILE="/etc/pf.anchors/cloudy"
    PLIST_FILE="/Library/LaunchDaemons/com.cloudy.portforward.plist"
    PF_RULE="rdr pass on lo0 proto tcp from any to 127.0.0.1 port 80 -> 127.0.0.1 port ${PORT}"

    if [[ -f "$ANCHOR_FILE" ]]; then
      ok "Port forwarding already configured (macOS pfctl)"
    else
      step "Setting up port forwarding 80 → ${PORT} (macOS pfctl)…"
      PLIST_CONTENT="<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
  <key>Label</key>
  <string>com.cloudy.portforward</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>echo \"${PF_RULE}\" | pfctl -ef -</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>"

      if echo "$PF_RULE" > "$ANCHOR_FILE" 2>/dev/null && \
         echo "$PLIST_CONTENT" > "$PLIST_FILE" 2>/dev/null && \
         launchctl load "$PLIST_FILE" 2>/dev/null; then
        ok "Port forwarding active — http://cloudy.local works"
      else
        warn "Need sudo for port forwarding (macOS). Run:"
        echo "   sudo sh -c 'echo \"${PF_RULE}\" > ${ANCHOR_FILE}'"
        echo "   sudo launchctl load ${PLIST_FILE}"
        echo "   (or re-run installer with sudo)"
      fi
    fi

  elif [[ "$OS" == "Linux" ]]; then
    # ── Linux: iptables + systemd ────────────────────────────────────────────
    SYSTEMD_FILE="/etc/systemd/system/cloudy-portforward.service"
    if iptables -t nat -L PREROUTING 2>/dev/null | grep -q "dpt:80"; then
      ok "Port forwarding already configured (iptables)"
    else
      step "Setting up port forwarding 80 → ${PORT} (iptables)…"
      IPT_CMD="iptables -t nat -A PREROUTING -i lo -p tcp --dport 80 -j REDIRECT --to-port ${PORT}"
      IPT_CMD_OUT="iptables -t nat -A OUTPUT -p tcp -d 127.0.0.1 --dport 80 -j REDIRECT --to-port ${PORT}"

      UNIT_CONTENT="[Unit]
Description=cloudy port forward 80 -> ${PORT}
After=network.target

[Service]
Type=oneshot
ExecStart=/bin/sh -c '${IPT_CMD}; ${IPT_CMD_OUT}'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target"

      if eval "$IPT_CMD" 2>/dev/null && eval "$IPT_CMD_OUT" 2>/dev/null; then
        ok "Port forwarding active (iptables)"
        if [[ $BOOT -eq 1 ]] && command -v systemctl &>/dev/null; then
          echo "$UNIT_CONTENT" > "$SYSTEMD_FILE" 2>/dev/null && \
          systemctl daemon-reload 2>/dev/null && \
          systemctl enable cloudy-portforward 2>/dev/null && \
          ok "Persisted via systemd (survives reboot)" || \
          warn "Could not install systemd unit — rule will not survive reboot"
        fi
      else
        warn "Need sudo for iptables. Run:"
        echo "   sudo $IPT_CMD"
        echo "   sudo $IPT_CMD_OUT"
      fi
    fi
  fi
fi

# ── 5. start daemon ───────────────────────────────────────────────────────────
step "Starting cloudy daemon on port ${PORT}…"
cloudy daemon stop 2>/dev/null || true
sleep 0.5

BOOT_ARG=""
[[ $BOOT -eq 1 ]] && BOOT_ARG="--boot"

cloudy daemon start --port "$PORT" $BOOT_ARG

# ── done ─────────────────────────────────────────────────────────────────────
echo ""
ok "Installation complete"
PF_ACTIVE=0
[[ "$OS" == "Darwin" && -f "/etc/pf.anchors/cloudy" ]] && PF_ACTIVE=1
[[ "$OS" == "Linux" ]] && iptables -t nat -L OUTPUT 2>/dev/null | grep -q "${PORT}" && PF_ACTIVE=1

if [[ $PF_ACTIVE -eq 1 && $SETUP_LOCAL -eq 1 ]]; then
  echo -e "  ${bold}http://cloudy.local${reset}  ${dim}· http://localhost:${PORT}${reset}"
else
  echo -e "  ${bold}http://localhost:${PORT}${reset}"
fi
echo -e "  ${dim}Docs: cloudy --help${reset}"
echo ""
