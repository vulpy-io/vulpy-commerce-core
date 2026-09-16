#!/usr/bin/env bash
# Shared helpers for pnpm vulpy install / hermes lifecycle.
# shellcheck shell=bash

vulpy_is_tty() {
  # Tests: force the interactive prompt path without a real PTY.
  if [ "${VULPY_FORCE_TTY:-0}" = "1" ]; then
    [ "${NON_INTERACTIVE:-0}" != "1" ] && [ "${CI:-}" != "true" ]
    return $?
  fi
  # After vulpy_ui_init, stdout is the log file — treat FD 3 as the user TTY.
  if [ "${VULPY_UI_ACTIVE:-0}" = "1" ]; then
    [ "${NON_INTERACTIVE:-0}" != "1" ] && [ "${CI:-}" != "true" ]
    return $?
  fi
  [ -t 0 ] && [ -t 1 ] && [ "${NON_INTERACTIVE:-0}" != "1" ] && [ "${CI:-}" != "true" ]
}

# Trim leading/trailing whitespace and CR (SSH/paste). Safe for emails/labels.
vulpy_trim_input() {
  local s="${1:-}"
  s="${s//$'\r'/}"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "${s}"
}

# Strip CR only — passwords may intentionally include spaces.
vulpy_trim_secret() {
  printf '%s' "${1//$'\r'/}"
}

# Consume one line from VULPY_TEST_ANSWERS_FILE when set (wizard unit tests).
# Bounded timeout avoids hangs if a scenario under-feeds answers.
vulpy_test_read_answer() {
  local dest="$1"
  local _ta_buf=""
  local timeout="${VULPY_TEST_READ_TIMEOUT:-5}"
  if [ -z "${VULPY_TEST_ANSWERS_FILE:-}" ] || [ ! -r "${VULPY_TEST_ANSWERS_FILE}" ]; then
    printf -v "${dest}" '%s' ""
    return 1
  fi
  # shellcheck disable=SC2034
  if ! IFS= read -r -t "${timeout}" _ta_buf <&"${VULPY_TEST_ANSWERS_FD:-9}"; then
    printf -v "${dest}" '%s' ""
    return 1
  fi
  printf -v "${dest}" '%s' "${_ta_buf}"
  return 0
}

# Overridable in tests. Sets DEST via printf -v (must not local-shadow DEST).
# vulpy_read_line DEST [prompt]
vulpy_read_line() {
  local dest="$1"
  local prompt="${2:-}"
  local _rl_buf=""
  if [ -n "${prompt}" ]; then
    vulpy_ui_printf '%s' "${prompt}"
  fi
  if [ -n "${VULPY_TEST_ANSWERS_FILE:-}" ]; then
    vulpy_test_read_answer _rl_buf || true
  else
    read -r _rl_buf || true
  fi
  printf -v "${dest}" '%s' "$(vulpy_trim_input "${_rl_buf}")"
}

# Overridable in tests. Hidden input; echoes newline after read.
# vulpy_read_secret DEST [prompt]
vulpy_read_secret() {
  local dest="$1"
  local prompt="${2:-}"
  local _rs_buf=""
  if [ -n "${prompt}" ]; then
    vulpy_ui_printf '%s' "${prompt}"
  fi
  if [ -n "${VULPY_TEST_ANSWERS_FILE:-}" ]; then
    vulpy_test_read_answer _rs_buf || true
  else
    read -r -s _rs_buf || true
  fi
  vulpy_ui_printf '\n'
  printf -v "${dest}" '%s' "$(vulpy_trim_secret "${_rs_buf}")"
}

# --- Friendly output / quiet interactive UI --------------------------------

vulpy_verbose() {
  [ "${VULPY_VERBOSE:-0}" = "1" ]
}

# Interactive install: only vulpy_* communication helpers hit the terminal.
# Child process chatter goes to VULPY_INSTALL_LOG unless --verbose.
vulpy_quiet_ui() {
  vulpy_is_tty && ! vulpy_verbose
}

vulpy_ui_init() {
  # Redirect shell stdout/stderr to the install log; keep FD 3 as the user TTY.
  if ! vulpy_quiet_ui; then
    return 0
  fi
  if [ "${VULPY_UI_ACTIVE:-0}" = "1" ]; then
    return 0
  fi
  export VULPY_UI_ACTIVE=1
  exec 3>&1
  export VULPY_UI_FD=3
  if [ -n "${VULPY_INSTALL_LOG:-}" ]; then
    mkdir -p "$(dirname "${VULPY_INSTALL_LOG}")" 2>/dev/null || true
    touch "${VULPY_INSTALL_LOG}" 2>/dev/null || true
    exec >>"${VULPY_INSTALL_LOG}" 2>&1
  else
    exec >/dev/null 2>&1
  fi
  vulpy_log "quiet UI active (child output → log)"
}

vulpy_ui_printf() {
  # Prefer the quiet-UI TTY FD; fall back to /dev/tty (survives sudo/runuser).
  # shellcheck disable=SC2059
  if [ -n "${VULPY_UI_FD:-}" ] && { true >&"${VULPY_UI_FD}"; } 2>/dev/null; then
    printf "$@" >&"${VULPY_UI_FD}"
    return 0
  fi
  if { true >/dev/tty; } 2>/dev/null; then
    # shellcheck disable=SC2059
    printf "$@" >/dev/tty
    return 0
  fi
  # shellcheck disable=SC2059
  printf "$@"
}

vulpy_ui() {
  local line
  for line in "$@"; do
    vulpy_ui_printf '%s\n' "${line}"
  done
}

vulpy_step() {
  vulpy_ui ""
  vulpy_ui "==> $*"
  vulpy_log "STEP: $*"
}

vulpy_note() {
  # Indented explanation lines for non-technical users.
  local line
  for line in "$@"; do
    vulpy_ui "    ${line}"
  done
}

# --- Install log + wizard screens ------------------------------------------

vulpy_log_init() {
  # vulpy_log_init [path] — empty disables file logging.
  VULPY_INSTALL_LOG="${1:-${VULPY_INSTALL_LOG:-}}"
  if [ -n "${VULPY_INSTALL_LOG}" ]; then
    mkdir -p "$(dirname "${VULPY_INSTALL_LOG}")" 2>/dev/null || true
    touch "${VULPY_INSTALL_LOG}" 2>/dev/null || true
    # Bootstrap runs as root; shop install runs as the deploy user and must append.
    # Cloud SSH user (ubuntu) should also be able to `tail -f` without sudo.
    chmod a+rw "${VULPY_INSTALL_LOG}" 2>/dev/null || true
  fi
}

# Default install log: vulpy-install-<app-user>-<UTC-timestamp>.log
# Order: product → app Linux user (default vulpy-commerce) → time.
# Optional arg / VULPY_INSTALL_LOG_USER / DEPLOY_USER override the user segment.
vulpy_default_install_log_path() {
  local user ts dir
  user="${1:-${VULPY_INSTALL_LOG_USER:-${DEPLOY_USER:-${VULPY_DEFAULT_APP_USER:-vulpy-commerce}}}}"
  user="${user//[^a-zA-Z0-9._-]/_}"
  [ -n "${user}" ] || user="vulpy-commerce"
  ts="$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || date +%Y%m%d%H%M%S)"
  if [ "$(id -u)" -eq 0 ] || [ -w /var/log 2>/dev/null ]; then
    dir="/var/log"
  else
    dir="${HOME:-/tmp}"
  fi
  printf '%s/vulpy-install-%s-%s.log' "${dir}" "${user}" "${ts}"
}

# Keep the install log reachable for the deploy user (and via ~/vulpy-install.log).
# vulpy_log_share_with_user USER
vulpy_log_share_with_user() {
  local user="${1:-}"
  local home_dir=""
  [ -n "${user}" ] || return 0
  [ -n "${VULPY_INSTALL_LOG:-}" ] || return 0
  [ -e "${VULPY_INSTALL_LOG}" ] || touch "${VULPY_INSTALL_LOG}" 2>/dev/null || true
  chmod a+rw "${VULPY_INSTALL_LOG}" 2>/dev/null || true
  home_dir="$(getent passwd "${user}" | cut -d: -f6)"
  [ -n "${home_dir}" ] && [ -d "${home_dir}" ] || return 0
  ln -sfn "${VULPY_INSTALL_LOG}" "${home_dir}/vulpy-install.log" 2>/dev/null || true
  chown -h "${user}:${user}" "${home_dir}/vulpy-install.log" 2>/dev/null || true
}

vulpy_log() {
  local msg="$*"
  local ts
  ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date)"
  if [ -n "${VULPY_INSTALL_LOG:-}" ]; then
    # Never let log I/O kill the installer (set -e).
    { printf '%s %s\n' "${ts}" "${msg}" >> "${VULPY_INSTALL_LOG}"; } 2>/dev/null || true
  fi
}

# Render a command for logs without persisting credentials passed through env.
# Execution still receives the original arguments unchanged.
vulpy_command_for_log() {
  local arg key rendered="" quoted
  for arg in "$@"; do
    case "${arg}" in
      *PASSWORD=*|*SECRET=*|*TOKEN=*|*API_KEY=*|*AUTH_KEY=*|*AUTHKEY=*|*PRIVATE_KEY=*|*CREDENTIAL=*)
        key="${arg%%=*}"
        arg="${key}=[REDACTED]"
        ;;
    esac
    printf -v quoted '%q' "${arg}"
    rendered="${rendered}${rendered:+ }${quoted}"
  done
  printf '%s' "${rendered}"
}

# Run a noisy child command. Always appends to the install log when set.
# Quiet interactive: log only. Verbose / non-interactive: tee to terminal.
# Stdin is always /dev/null so hidden prompts (Corepack, apt, …) fail fast
# instead of hanging forever under quiet UI.
vulpy_run() {
  local rc=0
  vulpy_log "RUN: $(vulpy_command_for_log "$@")"
  if [ -z "${VULPY_INSTALL_LOG:-}" ]; then
    if vulpy_quiet_ui; then
      echo "ERROR: quiet UI requires a writable VULPY_INSTALL_LOG (got none)." >&2
      return 1
    fi
    "$@" </dev/null || rc=$?
    return "${rc}"
  fi
  if vulpy_quiet_ui; then
    if [ ! -w "${VULPY_INSTALL_LOG}" ]; then
      echo "ERROR: quiet UI requires a writable install log: ${VULPY_INSTALL_LOG}" >&2
      return 1
    fi
    "$@" </dev/null >>"${VULPY_INSTALL_LOG}" 2>&1 || rc=$?
  else
    if [ -w "${VULPY_INSTALL_LOG}" ]; then
      "$@" </dev/null 2>&1 | tee -a "${VULPY_INSTALL_LOG}" || rc=${PIPESTATUS[0]}
    else
      "$@" </dev/null || rc=$?
    fi
  fi
  return "${rc}"
}

# Print the last N lines of the install log to the TTY (failures under quiet UI).
vulpy_ui_tail_log() {
  local n="${1:-40}"
  local log="${VULPY_INSTALL_LOG:-}"
  [ -n "${log}" ] && [ -f "${log}" ] || return 0
  vulpy_ui "---- last ${n} lines of ${log} ----"
  tail -n "${n}" "${log}" 2>/dev/null | while IFS= read -r line || [ -n "${line}" ]; do
    vulpy_ui "${line}"
  done
  vulpy_ui "---- end log ----"
}

# Like vulpy_run, but in quiet UI prints a heartbeat so long steps do not look stuck.
# Interval: VULPY_RUN_HEARTBEAT_SECS (default 30). No-op heartbeat when not quiet.
vulpy_run_with_heartbeat() {
  local interval="${VULPY_RUN_HEARTBEAT_SECS:-30}"
  local rc=0
  local hb_pid=""

  if ! vulpy_quiet_ui; then
    vulpy_run "$@"
    return $?
  fi

  vulpy_log "RUN(heartbeat/${interval}s): $(vulpy_command_for_log "$@")"
  (
    while true; do
      sleep "${interval}"
      vulpy_note "Still working… details: ${VULPY_INSTALL_LOG:-the install log}"
    done
  ) &
  hb_pid=$!
  vulpy_run "$@" || rc=$?
  kill "${hb_pid}" 2>/dev/null || true
  wait "${hb_pid}" 2>/dev/null || true
  return "${rc}"
}

vulpy_wizard_screen() {
  # vulpy_wizard_screen "Title" "line" "line" ...
  # One step per screen — keeps the install easy to follow.
  local title="$1"
  shift
  vulpy_ui ""
  vulpy_ui "========================================================"
  vulpy_ui " ${title}"
  vulpy_ui "========================================================"
  vulpy_ui ""
  if [ "$#" -gt 0 ]; then
    vulpy_note "$@"
    vulpy_ui ""
  fi
  vulpy_log "SCREEN: ${title}"
}

# Print Fox/host Tailscale login URLs when still unauthorized (end of install).
# Mid-install: vulpy_print_tailscale_auth_now prints as soon as AuthURL appears.
vulpy_print_tailscale_auth_now() {
  # Operator-facing: print a login URL immediately (install waits for approval before finish).
  local which="$1" url="$2"
  [ -n "${url}" ] || return 1
  vulpy_ui ""
  vulpy_ui ">>> ${which} Tailscale login (approve to finish setup):"
  vulpy_ui "${url}"
  vulpy_ui ""
  vulpy_log "${which} Tailscale auth URL (printed immediately): ${url}"
  return 0
}

vulpy_print_pending_tailscale_auth() {
  local fox_want="${1:-n}"
  local host_want="${2:-n}"
  local fox_url="" host_url="" any=0
  local _i

  # Tailscale sometimes needs a few seconds after start before AuthURL is set.
  # This is the operator-facing reminder — wait long enough to surface the link.
  for _i in $(seq 1 15); do
    fox_url=""
    host_url=""
    if [ "${fox_want}" = "y" ] && ! vulpy_fox_tailscale_is_up 2>/dev/null; then
      fox_url="$(vulpy_fox_tailscale_auth_url 2>/dev/null || true)"
    fi
    if [ "${host_want}" = "y" ] && ! vulpy_tailscale_is_up 2>/dev/null; then
      host_url="$(vulpy_tailscale_auth_url 2>/dev/null || true)"
    fi
    # Done polling once every wanted side is either up or has a URL.
    if { [ "${fox_want}" != "y" ] || vulpy_fox_tailscale_is_up 2>/dev/null || [ -n "${fox_url}" ]; } \
      && { [ "${host_want}" != "y" ] || vulpy_tailscale_is_up 2>/dev/null || [ -n "${host_url}" ]; }; then
      break
    fi
    sleep 2
  done

  # Re-check after the wait — approval may have completed during install.
  if [ "${fox_want}" = "y" ] && vulpy_fox_tailscale_is_up 2>/dev/null; then
    fox_url=""
  fi
  if [ "${host_want}" = "y" ] && vulpy_tailscale_is_up 2>/dev/null; then
    host_url=""
  fi

  if [ -z "${fox_url}" ] && [ -z "${host_url}" ]; then
    # Still unauthorized but AuthURL not ready — remind without inventing a link.
    if { [ "${fox_want}" = "y" ] && ! vulpy_fox_tailscale_is_up 2>/dev/null; } \
      || { [ "${host_want}" = "y" ] && ! vulpy_tailscale_is_up 2>/dev/null; }; then
      vulpy_ui ""
      vulpy_ui "========================================================"
      vulpy_ui " Tailscale — approval still needed"
      vulpy_ui "========================================================"
      vulpy_ui ""
      vulpy_note "Shop install finished, but Tailscale is not authorized yet." \
                 "Watch the install log for the sign-in link, or re-check with:" \
                 "  pnpm vulpy hermes doctor"
      vulpy_ui ""
      vulpy_log "Tailscale still unauthorized at end of install (AuthURL not ready yet)"
    fi
    return 0
  fi

  vulpy_ui ""
  vulpy_ui "========================================================"
  vulpy_ui " Tailscale — approve in your browser"
  vulpy_ui "========================================================"
  vulpy_ui ""
  vulpy_note "Shop install is done. Private Tailscale HTTPS finishes automatically" \
             "after you approve — no SSH commands needed."
  vulpy_ui ""
  if [ -n "${fox_url}" ]; then
    any=1
    vulpy_ui " Assistant (Fox):"
    vulpy_ui ""
    vulpy_ui "	${fox_url}"
    vulpy_ui ""
    vulpy_log "Fox Tailscale auth URL (end of install): ${fox_url}"
  fi
  if [ -n "${host_url}" ]; then
    any=1
    vulpy_ui " This server:"
    vulpy_ui ""
    vulpy_ui "	${host_url}"
    vulpy_ui ""
    vulpy_log "Host Tailscale auth URL (end of install): ${host_url}"
  fi
  if [ "${any}" = "1" ]; then
    vulpy_note "Open each link, approve the device, then wait ~30s."
    vulpy_ui ""
  fi
}

# --- Agent risk acknowledgment (before install work) -----------------------

vulpy_agent_risk_warning() {
  vulpy_ui ""
  vulpy_ui "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  vulpy_ui "  IMPORTANT — please read before continuing"
  vulpy_ui "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  vulpy_ui ""
  vulpy_ui "  Vulpy Commerce is designed to reduce risk by default (private access"
  vulpy_ui "  where configured, assistant isolated from the live storefront, and"
  vulpy_ui "  host networking locked from reaching other private devices)."
  vulpy_ui ""
  vulpy_ui "  No AI agent available today is fully secure. Agents can make mistakes,"
  vulpy_ui "  take unintended actions, or be manipulated into unsafe behavior."
  vulpy_ui ""
  vulpy_ui "  TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, NEITHER VULPY, INC."
  vulpy_ui "  NOR ANY OTHER THIRD PARTY (INCLUDING, WITHOUT LIMITATION, MODEL"
  vulpy_ui "  PROVIDERS, CLOUD OR HOSTING PROVIDERS, NETWORK OPERATORS, AND"
  vulpy_ui "  OPEN-SOURCE CONTRIBUTORS) ASSUMES ANY RESPONSIBILITY OR LIABILITY FOR"
  vulpy_ui "  ANY ACTIONS, OMISSIONS, OUTPUTS, DECISIONS, OR CONSEQUENCES ARISING"
  vulpy_ui "  OUT OF OR RELATED TO THE AI AGENT OR THIS SOFTWARE."
  vulpy_ui ""
  vulpy_ui "  By continuing, you acknowledge these risks and agree that security and"
  vulpy_ui "  operation of this deployment remain solely your responsibility."
  vulpy_ui ""
  vulpy_ui "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  vulpy_ui ""
}

vulpy_require_agent_risk_ack() {
  # Interactive: must type exactly "yes" (any case). Non-interactive: require
  # --i-understand-agent-risk or VULPY_I_UNDERSTAND_AGENT_RISK=1.
  vulpy_agent_risk_warning
  if [ "${VULPY_I_UNDERSTAND_AGENT_RISK:-0}" = "1" ]; then
    vulpy_note "Agent-risk acknowledgment accepted (flag/env)."
    return 0
  fi
  if ! vulpy_is_tty; then
    vulpy_ui "Refusing to continue without explicit risk acknowledgment."
    vulpy_ui "Re-run with: --i-understand-agent-risk"
    vulpy_ui "(or export VULPY_I_UNDERSTAND_AGENT_RISK=1)."
    vulpy_ui "Note: --non-interactive alone is not enough."
    return 1
  fi
  local answer=""
  while true; do
    vulpy_read_line answer "Type yes to continue: "
    answer="$(vulpy_trim_input "${answer}")"
    answer="$(printf '%s' "${answer}" | tr '[:upper:]' '[:lower:]')"
    case "${answer}" in
      yes)
        vulpy_note "Acknowledged."
        return 0
        ;;
      n|no|"")
        vulpy_ui "Setup cancelled — you must type yes to continue."
        return 1
        ;;
      y)
        vulpy_note "Please type the full word yes (not just y)."
        ;;
      *)
        vulpy_note "Please type yes to continue (or n to cancel)."
        ;;
    esac
  done
}

# --- Guardrail: environments are managed by humans on the host -------------

# True when running inside the Hermes (Fox) container. The agent must never
# create/start/stop environments; only a person on the server does that.
vulpy_in_hermes_container() {
  [ -f /.dockerenv ] && [ -d /app/workspace ]
}

# UID of the Hermes (Fox) container user. Everything inside the container runs
# as this uid and it cannot be spoofed from inside; the host agent command
# server's children run as the host deploy user (non-999).
vulpy_hermes_uid() { printf '%s' 999; }

vulpy_current_uid() { id -u; }

# True when a dev-lifecycle mutation would run as the Hermes container user —
# i.e. inside the container AND under the container uid. Env markers are not
# consulted: any process in the container can set one, so they grant nothing.
vulpy_hermes_dev_refused() {
  vulpy_in_hermes_container && [ "$(vulpy_current_uid)" -eq "$(vulpy_hermes_uid)" ]
}

vulpy_refuse_in_hermes() {
  local action="${1:-this action}"
  if vulpy_in_hermes_container; then
    cat >&2 <<EOF
Environments are managed by a person on the server, not by the assistant.
'${action}' is disabled inside the assistant container.

Ask your human operator to run this on the server (SSH or console):
  pnpm vulpy ${action}
EOF
    exit 78  # EX_CONFIG-ish: refused by policy
  fi
}

vulpy_prompt() {
  # vulpy_prompt VAR "Question" "default"
  # Buffer / read helpers must not local-shadow VAR (e.g. caller pass-through "answer").
  local var="$1"
  local question="$2"
  local default="${3:-}"
  local _prompt_buf=""
  if ! vulpy_is_tty; then
    printf -v "${var}" '%s' "${default}"
    return
  fi
  if [ -n "${default}" ]; then
    vulpy_read_line _prompt_buf "${question} [${default}]: "
  else
    vulpy_read_line _prompt_buf "${question}: "
  fi
  _prompt_buf="$(vulpy_trim_input "${_prompt_buf}")"
  if [ -z "${_prompt_buf}" ]; then
    _prompt_buf="${default}"
  fi
  printf -v "${var}" '%s' "${_prompt_buf}"
}

vulpy_prompt_yn() {
  # vulpy_prompt_yn VAR "Question" "y"|"n"
  # Re-prompts until y/yes/n/no (or empty → default). Never maps free text to n.
  local var="$1"
  local question="$2"
  local default="${3:-y}"
  local _yn_buf=""
  local hint="y/n"
  if [ "${default}" = "y" ]; then
    hint="Y/n"
  else
    hint="y/N"
  fi
  if ! vulpy_is_tty; then
    printf -v "${var}" '%s' "${default}"
    return
  fi
  while true; do
    vulpy_read_line _yn_buf "${question} [${hint}]: "
    _yn_buf="$(vulpy_trim_input "${_yn_buf}")"
    _yn_buf="$(printf '%s' "${_yn_buf}" | tr '[:upper:]' '[:lower:]')"
    if [ -z "${_yn_buf}" ]; then
      _yn_buf="${default}"
    fi
    case "${_yn_buf}" in
      y|yes)
        printf -v "${var}" '%s' "y"
        return 0
        ;;
      n|no)
        printf -v "${var}" '%s' "n"
        return 0
        ;;
      *)
        vulpy_note "Please answer y or n (got: ${_yn_buf})."
        ;;
    esac
  done
}

vulpy_is_dns_label() {
  # Single DNS label: lowercase alnum/hyphen, 1–63 chars, no leading/trailing hyphen.
  local s="${1:-}"
  [[ "${s}" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]
}

vulpy_is_domain_name() {
  # Apex or multi-label host (myshop.com, shop.example.com). No scheme/path.
  local s="${1:-}"
  [[ "${s}" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]]
}

vulpy_is_linux_username() {
  local s="${1:-}"
  [[ "${s}" =~ ^[a-z_][a-z0-9_-]*$ ]]
}

vulpy_is_access_mode() {
  case "${1:-}" in
    tailscale|domain|random|both) return 0 ;;
    *) return 1 ;;
  esac
}

vulpy_normalize_domain_input() {
  # Strip scheme/path/trailing dot; lowercase.
  local s
  s="$(vulpy_trim_input "${1:-}")"
  s="$(printf '%s' "${s}" | tr '[:upper:]' '[:lower:]')"
  s="${s#http://}"
  s="${s#https://}"
  s="${s%%/*}"
  s="${s%.}"
  printf '%s' "${s}"
}

vulpy_prompt_domain() {
  # vulpy_prompt_domain VAR "Question" ["default"]
  local var="$1"
  local question="$2"
  local default="${3:-}"
  local answer=""
  while true; do
    vulpy_prompt answer "${question}" "${default}"
    answer="$(vulpy_normalize_domain_input "${answer}")"
    if vulpy_is_domain_name "${answer}"; then
      printf -v "${var}" '%s' "${answer}"
      return 0
    fi
    if ! vulpy_is_tty; then
      echo "Invalid domain: '${answer}'" >&2
      return 1
    fi
    vulpy_note "Please enter a domain like myshop.com (got: ${answer:-empty})."
  done
}

vulpy_prompt_dns_label() {
  # vulpy_prompt_dns_label VAR "Question" ["default"] — subdomain / Tailscale device name.
  local var="$1"
  local question="$2"
  local default="${3:-}"
  local answer=""
  while true; do
    vulpy_prompt answer "${question}" "${default}"
    answer="$(printf '%s' "$(vulpy_trim_input "${answer}")" | tr '[:upper:]' '[:lower:]')"
    if vulpy_is_dns_label "${answer}"; then
      printf -v "${var}" '%s' "${answer}"
      return 0
    fi
    if ! vulpy_is_tty; then
      echo "Invalid DNS label: '${answer}'" >&2
      return 1
    fi
    vulpy_note "Use a simple label: letters, digits, hyphens (example: dev)."
  done
}

vulpy_prompt_linux_user() {
  # vulpy_prompt_linux_user VAR "Question" ["default"]
  local var="$1"
  local question="$2"
  local default="${3:-vulpy-commerce}"
  local answer=""
  while true; do
    vulpy_prompt answer "${question}" "${default}"
    if vulpy_is_linux_username "${answer}"; then
      printf -v "${var}" '%s' "${answer}"
      return 0
    fi
    if ! vulpy_is_tty; then
      echo "Invalid Linux username: '${answer}'" >&2
      return 1
    fi
    vulpy_note "Use a simple Linux username (start with a letter; letters, digits, _ or -)."
  done
}

vulpy_prompt_access() {
  # vulpy_prompt_access VAR ["default"]
  local var="$1"
  local default="${2:-tailscale}"
  local answer=""
  while true; do
    vulpy_prompt answer "Access mode (tailscale|domain|random|both)" "${default}"
    answer="$(printf '%s' "$(vulpy_trim_input "${answer}")" | tr '[:upper:]' '[:lower:]')"
    if vulpy_is_access_mode "${answer}"; then
      printf -v "${var}" '%s' "${answer}"
      return 0
    fi
    if ! vulpy_is_tty; then
      echo "Invalid --access: ${answer}" >&2
      return 1
    fi
    vulpy_note "Choose one of: tailscale, domain, random, both."
  done
}

vulpy_default_service_domain() {
  local service="$1"
  local env_name="$2"
  local main_domain="$3"
  printf '%s.%s.%s' "${service}" "${env_name}" "${main_domain}"
}

vulpy_env_quote_value() {
  # Quote VALUE for bash `source` when it contains whitespace or shell metachars.
  # Single-quote style: literal through awk -v (which would eat backslash
  # escapes like \$ in bcrypt hashes) AND through `source`/docker --env-file.
  # Embedded single quotes become '\'' (classic safe sequence).
  local value="$1"
  case "${value}" in
    *[[:space:]\$\`\"\\]*)
      printf "'%s'" "${value//\'/\'\\\'\'}"
      ;;
    *)
      printf '%s' "${value}"
      ;;
  esac
}

vulpy_set_env_kv() {
  # vulpy_set_env_kv FILE KEY VALUE — upsert KEY=VALUE in FILE
  local file="$1"
  local key="$2"
  local value
  value="$(vulpy_env_quote_value "$3")"
  local tmp
  tmp="$(mktemp)"
  if [ -f "${file}" ] && grep -qE "^${key}=" "${file}"; then
    # Avoid sed delimiter collisions with URLs/secrets.
    awk -v k="${key}" -v v="${value}" '
      BEGIN { done = 0 }
      index($0, k "=") == 1 {
        print k "=" v
        done = 1
        next
      }
      { print }
      END { if (!done) print k "=" v }
    ' "${file}" > "${tmp}"
  elif [ -f "${file}" ]; then
    cat "${file}" > "${tmp}"
    printf '%s=%s\n' "${key}" "${value}" >> "${tmp}"
  else
    printf '%s=%s\n' "${key}" "${value}" > "${tmp}"
  fi
  mv "${tmp}" "${file}"
}

# vulpy_env_csv_append FILE KEY VALUE — append VALUE to a comma-separated KEY if missing.
# Prints "changed" when the file was updated, "ok" when already present / nothing to do.
vulpy_env_csv_append() {
  local file="$1"
  local key="$2"
  local add="$3"
  local cur
  if [ -z "${add}" ]; then
    echo ok
    return 0
  fi
  if [ ! -f "${file}" ]; then
    vulpy_set_env_kv "${file}" "${key}" "${add}"
    echo changed
    return 0
  fi
  cur="$(grep -E "^${key}=" "${file}" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  if [ -z "${cur}" ]; then
    vulpy_set_env_kv "${file}" "${key}" "${add}"
    echo changed
    return 0
  fi
  case ",${cur}," in
    *",${add},"*)
      echo ok
      return 0
      ;;
  esac
  vulpy_set_env_kv "${file}" "${key}" "${cur},${add}"
  echo changed
}

# After Fox Tailscale is Running, inject MagicDNS into Next allowedDevOrigins +
# Medusa Vite allowedHosts / CORS. Install often writes config before login, so
# TS DNS is missing until this runs (typically from vulpy_tailscale_serve_fox).
# Returns 0 when applied (or already present). Echoes "changed" / "ok" / "skip".
vulpy_apply_fox_tailscale_dev_access() {
  local root="${ROOT_DIR:-.}"
  local ts_dns shop_port api_port
  local root_env store_env medusa_env
  local changed=0 status

  ts_dns="$(vulpy_fox_tailscale_dns_name 2>/dev/null || true)"
  if vulpy_is_pending_tailscale_dns "${ts_dns}"; then
    echo skip
    return 1
  fi
  if ! vulpy_fox_tailscale_is_up 2>/dev/null; then
    echo skip
    return 1
  fi

  shop_port="${HERMES_DEV_STOREFRONT_PORT:-${VULPY_SHOP_PORT:-3000}}"
  api_port="${HERMES_DEV_MEDUSA_PORT:-${VULPY_API_PORT:-9000}}"
  root_env="${root}/.env"
  store_env="${root}/apps/storefront/.env"
  medusa_env="${root}/apps/medusa-backend/.env"

  echo "==> Allowing Fox Tailscale host on shop/Medusa (${ts_dns})..."

  status="$(vulpy_env_csv_append "${root_env}" ALLOWED_DEV_ORIGINS "${ts_dns}")"
  [ "${status}" = changed ] && changed=1
  status="$(vulpy_env_csv_append "${store_env}" ALLOWED_DEV_ORIGINS "${ts_dns}")"
  [ "${status}" = changed ] && changed=1

  if [ -f "${medusa_env}" ]; then
    status="$(vulpy_env_csv_append "${medusa_env}" __MEDUSA_ADMIN_ADDITIONAL_ALLOWED_HOSTS "${ts_dns}")"
    [ "${status}" = changed ] && changed=1
    status="$(vulpy_env_csv_append "${medusa_env}" ADMIN_CORS "https://${ts_dns}:${api_port}")"
    [ "${status}" = changed ] && changed=1
    status="$(vulpy_env_csv_append "${medusa_env}" AUTH_CORS "https://${ts_dns}:${api_port}")"
    [ "${status}" = changed ] && changed=1
    status="$(vulpy_env_csv_append "${medusa_env}" AUTH_CORS "https://${ts_dns}:${shop_port}")"
    [ "${status}" = changed ] && changed=1
    status="$(vulpy_env_csv_append "${medusa_env}" STORE_CORS "https://${ts_dns}:${shop_port}")"
    [ "${status}" = changed ] && changed=1
  fi

  if [ "${changed}" = "1" ]; then
    if [ -x "${root}/scripts/dev-app-server.sh" ]; then
      echo "    Restarting host shop/API so allowlists take effect..."
      bash "${root}/scripts/dev-app-server.sh" restart || true
      vulpy_wait_tcp 127.0.0.1 "${shop_port}" 90 || true
      vulpy_wait_tcp 127.0.0.1 "${api_port}" 90 || true
      # Next must finish compiling before HMR allowlist probes are meaningful.
      local i code=000
      for i in $(seq 1 40); do
        code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 -m 8 \
          "http://127.0.0.1:${shop_port}/" 2>/dev/null || echo 000)"
        if [ "${code}" = "200" ]; then
          break
        fi
        sleep 2
      done
      if [ "${code}" != "200" ]; then
        echo "    WARN: shop :${shop_port} not HTTP 200 yet (got ${code}) — probes may flake." >&2
      fi
    fi
    echo changed
  else
    # Env already listed Fox DNS, but Next may have started before that write.
    local hmr_probe
    hmr_probe="$(mktemp)"
    curl -sS -o "${hmr_probe}" --connect-timeout 3 -m 8 \
      -H "Origin: https://${ts_dns}:${shop_port}" \
      "http://127.0.0.1:${shop_port}/_next/webpack-hmr" >/dev/null 2>&1 || true
    if [ "$(tr -d '\r\n' <"${hmr_probe}")" = "Unauthorized" ]; then
      rm -f "${hmr_probe}"
      echo "    Fox DNS already in env but Next HMR still Unauthorized — restarting shop/API..."
      if [ -x "${root}/scripts/dev-app-server.sh" ]; then
        bash "${root}/scripts/dev-app-server.sh" restart || true
        vulpy_wait_tcp 127.0.0.1 "${shop_port}" 90 || true
        vulpy_wait_tcp 127.0.0.1 "${api_port}" 90 || true
      fi
      echo changed
    else
      rm -f "${hmr_probe}"
      echo ok
    fi
  fi
  return 0
}

vulpy_apply_domain_urls() {
  # Derive HTTPS URL / CORS fields from SHOP_DOMAIN / API_DOMAIN / MATOMO_DOMAIN.
  # Canonical storefront = the apex; www and preview.<apex> are extra origins.
  local file="$1"
  local shop api matomo preview
  shop="$(grep -E '^SHOP_DOMAIN=' "${file}" | tail -1 | cut -d= -f2- || true)"
  api="$(grep -E '^API_DOMAIN=' "${file}" | tail -1 | cut -d= -f2- || true)"
  matomo="$(grep -E '^MATOMO_DOMAIN=' "${file}" | tail -1 | cut -d= -f2- || true)"
  preview="$(grep -E '^PREVIEW_DOMAIN=' "${file}" | tail -1 | cut -d= -f2- || true)"

  [ -n "${shop}" ] || return 0
  if [ -z "${preview}" ]; then
    preview="preview.${shop}"
    vulpy_set_env_kv "${file}" PREVIEW_DOMAIN "${preview}"
  fi
  vulpy_set_env_kv "${file}" STOREFRONT_URL "https://${shop}"
  vulpy_set_env_kv "${file}" NEXT_PUBLIC_SERVER_URL "https://${shop}"
  vulpy_set_env_kv "${file}" STORE_CORS "https://${shop},https://www.${shop},https://${preview}"
  vulpy_set_env_kv "${file}" PAYLOAD_URL "https://${shop}"
  vulpy_set_env_kv "${file}" MEDUSA_BACKEND_URL_STOREFRONT "http://medusa:9000"

  if [ -n "${api}" ]; then
    vulpy_set_env_kv "${file}" MEDUSA_BACKEND_URL "https://${api}"
    vulpy_set_env_kv "${file}" VITE_MEDUSA_BACKEND_URL "https://${api}"
    vulpy_set_env_kv "${file}" NEXT_PUBLIC_MEDUSA_ASSET_URL "https://${api}"
    vulpy_set_env_kv "${file}" ADMIN_CORS "https://${api}"
    vulpy_set_env_kv "${file}" AUTH_CORS "https://${api},https://${shop},https://www.${shop},https://${preview}"
  fi

  if [ -n "${matomo}" ]; then
    vulpy_set_env_kv "${file}" NEXT_PUBLIC_MATOMO_URL "https://${matomo}"
  fi
}

vulpy_resolve_preview_caddy_snippet() {
  # SHOP_LIVE=0 → preview host serves the shop (noindex);
  # SHOP_LIVE=1 → preview + www redirect to the apex.
  local live="${1:-0}"
  if [ "${live}" = "1" ]; then
    printf './deploy/caddy-snippets/preview-redirect.caddy'
  else
    printf './deploy/caddy-snippets/preview-serve.caddy'
  fi
}

vulpy_resolve_hermes_caddy_snippet() {
  local access="${1:-tailscale}"
  case "${access}" in
    public|both)
      printf './deploy/caddy-snippets/hermes-public.caddy'
      ;;
    *)
      printf './deploy/caddy-snippets/empty.caddy'
      ;;
  esac
}

vulpy_sanitize_app_id() {
  # Stable Docker-safe application id. Keep it short enough for network names.
  local raw="${1:-}"
  local clean
  clean="$(
    printf '%s' "${raw}" \
      | tr '[:upper:]_' '[:lower:]-' \
      | sed -E 's/[^a-z0-9-]+/-/g; s/^-+//; s/-+$//; s/-+/-/g' \
      | cut -c1-48
  )"
  if [ -z "${clean}" ]; then
    echo "Invalid application id: ${raw}" >&2
    return 1
  fi
  printf '%s\n' "${clean}"
}

vulpy_app_id() {
  local raw="${1:-${VULPY_APP_ID:-}}"
  if [ -z "${raw}" ] && [ -n "${ROOT_DIR:-}" ] && [ -f "${ROOT_DIR}/.env" ]; then
    raw="$(grep -E '^VULPY_APP_ID=' "${ROOT_DIR}/.env" | tail -1 | cut -d= -f2- || true)"
  fi
  raw="${raw:-$(basename "${ROOT_DIR:-vulpy-commerce}")}"
  vulpy_sanitize_app_id "${raw}"
}

vulpy_app_network_name() {
  local app_id
  app_id="$(vulpy_app_id "${1:-}")"
  printf 'vulpy-app-%s\n' "${app_id}"
}

vulpy_application_ingress_enabled() {
  local value="${VULPY_APPLICATION_INGRESS:-}"
  if [ -z "${value}" ] && [ -n "${ROOT_DIR:-}" ] && [ -f "${ROOT_DIR}/.env" ]; then
    value="$(grep -E '^VULPY_APPLICATION_INGRESS=' "${ROOT_DIR}/.env" | tail -1 | cut -d= -f2- || true)"
  fi
  [ "${value:-0}" = "1" ]
}

vulpy_edge_caddyfile() {
  # vulpy_edge_caddyfile [EDGE_ENV_FILE]
  # Resolve the Caddyfile mounted by the application edge. Shell exports
  # override values in the edge env file (compose env-file semantics):
  #   1. EDGE_CADDYFILE explicitly set (shell or edge env)  -> that file
  #   2. EDGE_INTERNAL=1 (shell or edge env)                -> ./deploy/Caddyfile.internal
  #   3. default                                            -> ./deploy/Caddyfile.dev
  # Used by vulpy-edge.sh before invoking compose; unit-tested in
  # scripts/tests/install-config.assert.sh.
  local edge_env="${1:-${EDGE_ENV:-${ROOT_DIR:-}/environments/edge/.env}}"
  local env_internal="" env_caddyfile="" caddyfile=""
  if [ -n "${edge_env}" ] && [ -f "${edge_env}" ]; then
    env_internal="$(grep -E '^EDGE_INTERNAL=' "${edge_env}" | tail -1 | cut -d= -f2- || true)"
    env_caddyfile="$(grep -E '^EDGE_CADDYFILE=' "${edge_env}" | tail -1 | cut -d= -f2- || true)"
  fi
  caddyfile="${EDGE_CADDYFILE:-${env_caddyfile:-}}"
  if [ -n "${caddyfile}" ]; then
    printf '%s\n' "${caddyfile}"
    return 0
  fi
  if [ "${EDGE_INTERNAL:-${env_internal:-0}}" = "1" ]; then
    printf './deploy/Caddyfile.internal\n'
    return 0
  fi
  printf './deploy/Caddyfile.dev\n'
}

vulpy_write_application_route() {
  # vulpy_write_application_route ENV ENV_FILE OUTPUT_DIR [EDGE_ENV_FILE]
  # Writes a Caddy route consumed by the one application ingress. The route
  # selects the environment gateway; that gateway still selects the service.
  # In internal mode (EDGE_INTERNAL=1 in the edge env) routes are emitted as
  # http:// blocks because the shared router terminates TLS; bare host blocks
  # would re-enable Caddy ACME/auto-TLS and fight the router's HTTP-01.
  local env_name="$1"
  local env_file="$2"
  local output_dir="$3"
  local edge_env="${4:-${ROOT_DIR:-}/environments/edge/.env}"
  local key value joined="" tmp scheme="" edge_internal=""
  local -a hosts=()

  if ! [[ "${env_name}" =~ ^[a-z][a-z0-9-]*$ ]]; then
    echo "Invalid environment name for application route: ${env_name}" >&2
    return 1
  fi
  if [ ! -f "${env_file}" ]; then
    echo "Missing environment file for application route: ${env_file}" >&2
    return 1
  fi

  for key in SHOP_DOMAIN PREVIEW_DOMAIN API_DOMAIN MATOMO_DOMAIN; do
    value="$(grep -E "^${key}=" "${env_file}" | tail -1 | cut -d= -f2- || true)"
    [ -n "${value}" ] || continue
    if ! [[ "${value}" =~ ^[A-Za-z0-9.*-]+$ ]]; then
      echo "Unsafe ${key} value for Caddy route: ${value}" >&2
      return 1
    fi
    hosts+=("${value}")
    if [ "${key}" = "SHOP_DOMAIN" ]; then
      hosts+=("www.${value}")
    fi
  done
  if [ "${#hosts[@]}" -eq 0 ]; then
    echo "No routeable domains found in ${env_file}" >&2
    return 1
  fi

  # Internal mode: the shared router terminates TLS and forwards plain HTTP,
  # so the edge must serve http:// blocks — bare host blocks would auto-enable
  # Caddy HTTPS/ACME and fight the router's HTTP-01 for the same domains.
  # The scheme is applied PER HOST (http://a, http://b, http://c) because Caddy
  # parses each address in a comma-separated site block independently: a single
  # http:// on the first host would leave the rest bare and re-enable ACME.
  if [ -f "${edge_env}" ]; then
    edge_internal="$(grep -E '^EDGE_INTERNAL=' "${edge_env}" | tail -1 | cut -d= -f2- || true)"
  fi
  if [ "${edge_internal:-0}" = "1" ]; then
    scheme="http://"
  fi
  for value in "${hosts[@]}"; do
    joined="${joined}${joined:+, }${scheme}${value}"
  done

  mkdir -p "${output_dir}"
  tmp="$(mktemp "${output_dir}/.${env_name}.XXXXXX")"
  {
    printf '# Generated by pnpm vulpy env sync %s; do not edit.\n' "${env_name}"
    printf '%s {\n' "${joined}"
    printf '\treverse_proxy gateway-%s:80\n' "${env_name}"
    printf '}\n'
  } > "${tmp}"
  mv "${tmp}" "${output_dir}/${env_name}.caddy"
}

vulpy_sync_application_ingress_route() {
  local env_name="$1"
  local env_file="$2"
  local output_dir="${VULPY_EDGE_ROUTES_DIR:-${ROOT_DIR}/.data/edge/routes}"
  vulpy_application_ingress_enabled || return 0
  [ "${env_name}" != "dev" ] || return 0
  vulpy_write_application_route "${env_name}" "${env_file}" "${output_dir}"
}

vulpy_tailscale_backend_state() {
  # Running | NeedsLogin | Stopped | NoState | …
  tailscale status --json 2>/dev/null \
    | sed -n 's/.*"BackendState"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -1
}

vulpy_tailscale_auth_url() {
  # Prints AuthURL when NeedsLogin; empty otherwise.
  tailscale status --json 2>/dev/null \
    | sed -n 's/.*"AuthURL"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -1
}

vulpy_tailscale_status_line() {
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "missing"
    return
  fi
  local state
  state="$(vulpy_tailscale_backend_state)"
  case "${state}" in
    Running)
      local ip hostname
      ip="$(tailscale ip -4 2>/dev/null | head -1 || true)"
      hostname="$(vulpy_tailscale_dns_name)"
      if [ -n "${hostname}" ]; then
        echo "up ${hostname} ${ip}"
      elif [ -n "${ip}" ]; then
        echo "up ${ip}"
      else
        echo "up"
      fi
      ;;
    NeedsLogin)
      local url
      url="$(vulpy_tailscale_auth_url)"
      if [ -n "${url}" ]; then
        echo "needs-login ${url}"
      else
        echo "needs-login"
      fi
      ;;
    "")
      echo "installed-not-connected"
      ;;
    *)
      echo "installed-not-connected (${state:-unknown})"
      ;;
  esac
}

vulpy_random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    head -c 24 /dev/urandom | xxd -p
  fi
}

vulpy_urlencode() {
  # Percent-encode a value for use in a URL userinfo (hex secrets are safe,
  # but stay robust if a password ever contains reserved characters).
  local s="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys,urllib.parse; sys.stdout.write(urllib.parse.quote(sys.argv[1], safe=""))' "${s}"
  else
    printf '%s' "${s}"
  fi
}

vulpy_sync_database_urls() {
  # Rewrite DATABASE_URL / PAYLOAD_DATABASE_URL in an environment file so they
  # embed the current POSTGRES_USER / POSTGRES_PASSWORD. Called after the
  # secret-regeneration loop in `env add` — otherwise the generated password
  # never reaches the DB URLs and the stack fails auth (H4b B4: placeholder
  # `***` in the example was carried into the live env verbatim).
  # Optional args allow local bootstrap to supply the credentials from the
  # root project env without copying POSTGRES_PASSWORD into every app env.
  local file="$1"
  local user="${2:-}" pass="${3:-}" enc_user enc_pass
  if [ -z "${user}" ]; then
    user="$(grep -E '^POSTGRES_USER=' "${file}" | tail -1 | cut -d= -f2- || true)"
  fi
  if [ -z "${pass}" ]; then
    pass="$(grep -E '^POSTGRES_PASSWORD=' "${file}" | tail -1 | cut -d= -f2- || true)"
  fi
  [ -n "${user}" ] || user=medusa
  [ -n "${pass}" ] || return 0
  enc_user="$(vulpy_urlencode "${user}")"
  enc_pass="$(vulpy_urlencode "${pass}")"

  local key cur
  for key in DATABASE_URL PAYLOAD_DATABASE_URL; do
    cur="$(grep -E "^${key}=" "${file}" | tail -1 | cut -d= -f2- || true)"
    if [ -z "${cur}" ] || [[ "${cur}" != postgres://* ]]; then
      continue
    fi
    # postgres://user:pass@host:port/db?params — keep everything after the
    # first '@' (host:port/db?params) and swap in the current credentials.
    local db_part
    db_part="${cur#postgres://}"
    db_part="${db_part#*@}"
    vulpy_set_env_kv "${file}" "${key}" "postgres://${enc_user}:${enc_pass}@${db_part}"
  done
}

vulpy_hash_caddy_password() {
  local password="$1"
  if command -v caddy >/dev/null 2>&1; then
    caddy hash-password --plaintext "${password}"
    return
  fi
  # Fallback: run hash inside the caddy image.
  docker run --rm caddy:2-alpine caddy hash-password --plaintext "${password}"
}

vulpy_ensure_agent_network() {
  local docker=(docker)
  VULPY_APP_ID="$(vulpy_app_id)"
  VULPY_APP_NETWORK="${VULPY_APP_NETWORK:-$(vulpy_app_network_name "${VULPY_APP_ID}")}"
  export VULPY_APP_ID VULPY_APP_NETWORK
  if [ "${COMPOSE_SUDO:-0}" = "1" ]; then
    docker=(sudo -E docker)
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required to create network ${VULPY_APP_NETWORK}" >&2
    return 1
  fi
  if "${docker[@]}" network inspect "${VULPY_APP_NETWORK}" >/dev/null 2>&1; then
    return 0
  fi
  echo "==> Creating application Docker network ${VULPY_APP_NETWORK}"
  "${docker[@]}" network create "${VULPY_APP_NETWORK}" >/dev/null
}

# Paths that must never be host-chowned to the deploy user: Docker volume trees
# (Postgres/Redis run as container UIDs, typically 999) and heavy package caches.
vulpy_checkout_chown_prune_expr() {
  printf '%s' "\\( -path '*/node_modules' -o -path '*/.pnpm-store' -o -path '*/.next' -o -path '*/.medusa' -o -path '*/.data' -o -path '*/.turbo' -o -path '*/.git/objects' -o -path '*/coverage' \\) -prune"
}

# Safe checkout chown for the deploy user — skips .data / caches (see prune expr).
# vulpy_chown_checkout_for_user USER ROOT
vulpy_chown_checkout_for_user() {
  local user="$1"
  local root="$2"
  local uid gid find_prune
  [ -n "${user}" ] && [ -n "${root}" ] && [ -d "${root}" ] || return 0
  uid="$(id -u "${user}" 2>/dev/null || true)"
  gid="$(id -g "${user}" 2>/dev/null || true)"
  [ -n "${uid}" ] && [ -n "${gid}" ] || return 1
  find_prune="$(vulpy_checkout_chown_prune_expr)"
  chown "${uid}:${gid}" "${root}" 2>/dev/null || true
  # shellcheck disable=SC2086
  eval "find \"${root}\" ${find_prune} -o -exec chown -h ${uid}:${gid} {} +" 2>/dev/null \
    || eval "find \"${root}\" ${find_prune} -o -exec chown ${uid}:${gid} {} +" || true
}

# Fox entrypoint chowns /app/workspace; restore host deploy ownership so CLI keeps working.
# Prefer root chown when available; otherwise docker (deploy user in docker group).
vulpy_repair_workspace_ownership() {
  local root="${1:-}"
  local user="${2:-}"
  local uid gid find_prune
  if [ -z "${root}" ]; then
    root="$(pwd)"
  fi
  if [ -n "${user}" ] && id -u "${user}" >/dev/null 2>&1; then
    uid="$(id -u "${user}")"
    gid="$(id -g "${user}")"
  else
    uid="${HOST_UID:-$(id -u)}"
    gid="${HOST_GID:-$(id -g)}"
    user="${user:-$(id -un 2>/dev/null || echo "${uid}")}"
  fi

  echo "==> Restoring workspace ownership to ${user} (${uid}:${gid}) after Hermes bind-mount chown"
  echo "    (skipping node_modules / caches / .data — never chown those trees)"

  find_prune="$(vulpy_checkout_chown_prune_expr)"

  if [ "$(id -u)" -eq 0 ]; then
    chown "${uid}:${gid}" "${root}"
    # shellcheck disable=SC2086
    eval "find \"${root}\" ${find_prune} -o -exec chown -h ${uid}:${gid} {} +" 2>/dev/null \
      || eval "find \"${root}\" ${find_prune} -o -exec chown ${uid}:${gid} {} +" || true
    eval "find \"${root}\" ${find_prune} -o -exec chmod g+rwX {} +" 2>/dev/null || true
    eval "find \"${root}\" ${find_prune} -o -type d -exec chmod g+s {} +" 2>/dev/null || true
    return 0
  fi

  if command -v docker >/dev/null 2>&1; then
    local docker=(docker)
    if [ "${COMPOSE_SUDO:-0}" = "1" ]; then
      docker=(sudo -E docker)
    fi
    "${docker[@]}" run --rm \
      -v "${root}:/w" \
      alpine:3.20 \
      sh -c "chown ${uid}:${gid} /w; find /w ${find_prune} -o -exec chown -h ${uid}:${gid} {} + 2>/dev/null || find /w ${find_prune} -o -exec chown ${uid}:${gid} {} + || true; find /w ${find_prune} -o -exec chmod g+rwX {} + 2>/dev/null || true; find /w ${find_prune} -o -type d -exec chmod g+s {} + 2>/dev/null || true"
    return 0
  fi

  echo "WARN: cannot repair ownership (not root and no docker). Run pruned repair:" >&2
  echo "  sudo find ${root} ${find_prune} -o -exec chown ${uid}:${gid} {} +" >&2
  return 1
}

# Apply POSIX default ACLs to the checkout so every file created by Fox
# (uid 999) or the host deploy user is group/other-readable — permanently,
# regardless of umask changes inside the container.
# Calls setup-workspace-acls.sh; silently skips if setfacl is unavailable
# (e.g. on macOS, non-ACL filesystems, or when not running as root).
vulpy_apply_workspace_acls() {
  local root="${1:-$(pwd)}"
  local fox_uid="${2:-999}"
  local host_user="${3:-${DEPLOY_USER:-${SUDO_USER:-$(id -un 2>/dev/null || echo "")}}}"
  local script="${root}/scripts/setup-workspace-acls.sh"

  if [ ! -f "${script}" ]; then
    return 0
  fi
  if [ "$(id -u)" -ne 0 ]; then
    # Non-root: attempt passwordless sudo; if unavailable, skip silently.
    if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
      sudo bash "${script}" "${root}" "${fox_uid}" "${host_user}" || true
    fi
    return 0
  fi
  bash "${script}" "${root}" "${fox_uid}" "${host_user}" || true
}

vulpy_wait_hermes_ready() {
  local bind="${HERMES_BIND:-127.0.0.1}"
  local port="${HERMES_PORT:-8787}"
  local seconds="${1:-180}"
  echo "==> Waiting for Hermes UI on http://${bind}:${port} (up to ${seconds}s)..."
  if vulpy_wait_tcp "${bind}" "${port}" "${seconds}"; then
    echo "    Hermes UI is responding (HTTP)"
    return 0
  fi
  echo "WARN: Hermes UI not ready after ${seconds}s — ownership repair still runs." >&2
  return 0
}

# vulpy_wait_tcp HOST PORT [SECONDS] — 0 when TCP connect succeeds.
vulpy_wait_tcp() {
  local host="$1"
  local port="$2"
  local seconds="${3:-60}"
  local i=0
  while [ "${i}" -lt "${seconds}" ]; do
    # Prefer raw TCP, then verify HTTP (docker-proxy can accept TCP while webui is down).
    if bash -c "echo >/dev/tcp/${host}/${port}" 2>/dev/null; then
      if command -v curl >/dev/null 2>&1; then
        if curl -sf -o /dev/null --connect-timeout 1 --max-time 2 "http://${host}:${port}/" 2>/dev/null \
          || curl -sf -o /dev/null --connect-timeout 1 --max-time 2 "http://${host}:${port}/health" 2>/dev/null; then
          return 0
        fi
      else
        return 0
      fi
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

# True when MagicDNS is still unknown (must never be written into sourced .env files —
# angle brackets like <your-tailnet> are shell redirections and abort set -e scripts).
vulpy_is_pending_tailscale_dns() {
  local dns="${1:-}"
  [ -z "${dns}" ] && return 0
  [[ "${dns}" == *"<"* || "${dns}" == *">"* ]] && return 0
  [[ "${dns}" == *pending-tailnet* ]] && return 0
  return 1
}

# vulpy_fox_canonical_dns REQUESTED [ACTUAL]
vulpy_fox_canonical_dns() {
  local requested="${1:-vulpy-commerce}"
  local actual="${2:-}"
  if [ -z "${actual}" ]; then
    actual="$(vulpy_fox_tailscale_dns_name 2>/dev/null || true)"
  fi
  if [ -n "${actual}" ]; then
    printf '%s\n' "${actual}"
    return 0
  fi
  # Empty until Tailscale is up — do not invent shell-unsafe placeholders for .env.
  printf '\n'
  return 0
}

# vulpy_env_default_port KIND ENV — KIND: storefront|medusa|fox ; ENV: dev|staging|live
vulpy_env_default_port() {
  local kind="$1"
  local env_name="${2:-dev}"
  case "${env_name}:${kind}" in
    dev:storefront) echo 3000 ;;
    dev:medusa) echo 9000 ;;
    dev:fox) echo 8787 ;;
    staging:storefront) echo 3100 ;;
    staging:medusa) echo 9100 ;;
    live:storefront) echo 3200 ;;
    live:medusa) echo 9200 ;;
    *)
      echo "unknown port for ${env_name}/${kind}" >&2
      return 1
      ;;
  esac
}

vulpy_require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "This step needs root. Re-run with sudo." >&2
    exit 1
  fi
}

vulpy_ensure_deploy_user() {
  # vulpy_ensure_deploy_user USER [PROJECT_DIR]
  # Creates USER if missing, adds to docker, owns PROJECT_DIR as USER:USER.
  local user="$1"
  local project_dir="${2:-}"
  local home_dir

  if ! [[ "${user}" =~ ^[a-z_][a-z0-9_-]*$ ]]; then
    echo "Invalid deploy user name: ${user}" >&2
    exit 1
  fi

  if ! id -u "${user}" >/dev/null 2>&1; then
    echo "==> Creating app user '${user}'..."
    if command -v adduser >/dev/null 2>&1 && adduser --help 2>&1 | grep -q -- '--disabled-password'; then
      adduser --disabled-password --gecos "Vulpy app ${user}" "${user}"
    else
      useradd -m -s /bin/bash "${user}"
    fi
  else
    echo "==> App user '${user}' already exists"
  fi

  if getent group docker >/dev/null 2>&1; then
    usermod -aG docker "${user}"
    echo "    Added '${user}' to group docker"
  else
    echo "    WARN: group 'docker' missing — install Docker, then: usermod -aG docker ${user}" >&2
  fi

  if [ -n "${project_dir}" ] && [ -d "${project_dir}" ]; then
    echo "==> Ensuring '${user}' owns ${project_dir} ..."
    echo "    (skipping .data / node_modules / caches — Docker volume UIDs must stay intact)"
    vulpy_chown_checkout_for_user "${user}" "${project_dir}"
  fi

  home_dir="$(getent passwd "${user}" | cut -d: -f6)"
  mkdir -p "${home_dir}"
  chown "${user}:${user}" "${home_dir}"
  chmod 750 "${home_dir}" 2>/dev/null || true
}

# Move checkout into USER's home when it lives under another user's private home
# (e.g. /home/ubuntu is mode 750 — app user cannot traverse it).
# Prints the path the deploy user should use. No symlinks.
# vulpy_relocate_checkout_to_deploy_home USER SRC_DIR
vulpy_relocate_checkout_to_deploy_home() {
  local user="$1"
  local src="$2"
  local home_dir dest

  home_dir="$(getent passwd "${user}" | cut -d: -f6)"
  if [ -z "${home_dir}" ]; then
    echo "Cannot resolve home for ${user}" >&2
    return 1
  fi
  dest="${home_dir}/${VULPY_DIR_NAME:-vulpy-commerce}"

  if [ ! -d "${src}" ]; then
    echo "Checkout not found: ${src}" >&2
    return 1
  fi

  # Resolve symlinks so we compare real locations.
  src="$(cd "${src}" && pwd -P)"
  if [ -d "${dest}" ]; then
    dest="$(cd "${dest}" && pwd -P)"
  fi

  if [ "${src}" = "${dest}" ]; then
    printf '%s' "${dest}"
    return 0
  fi

  # Already under deploy user's home tree.
  case "${src}/" in
    "${home_dir}/"*)
      printf '%s' "${src}"
      return 0
      ;;
  esac

  # Accessible in place? (covers world-executable parent dirs.)
  # Prefer sudo -u — runuser is root-only and bootstrap may not be root yet.
  if sudo -u "${user}" test -r "${src}/scripts/vulpy-bootstrap-host.sh" 2>/dev/null \
    || { [ "$(id -u)" -eq 0 ] && runuser -u "${user}" -- test -r "${src}/scripts/vulpy-bootstrap-host.sh" 2>/dev/null; }; then
    printf '%s' "${src}"
    return 0
  fi

  echo "==> Moving shop checkout to ${dest}" >&2
  echo "    (${user} cannot read files under $(dirname "${src}") — typical cloud home mode 750)" >&2

  if [ -e "${dest}" ] || [ -L "${dest}" ]; then
    echo "    Destination already exists — removing leftover ${dest}" >&2
    rm -rf "${dest}"
  fi

  mv "${src}" "${dest}"
  vulpy_chown_checkout_for_user "${user}" "${dest}"

  printf '%s' "${dest}"
}

# --- Interactive prompts for people, not sysadmins -------------------------

vulpy_is_email() {
  # True when $1 looks like a minimal email address.
  printf '%s' "${1:-}" | grep -qE '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
}

vulpy_is_password_ok() {
  # True when $1 has at least 8 characters (sane shared-admin floor).
  [ "${#1}" -ge 8 ]
}

vulpy_prompt_email() {
  # vulpy_prompt_email VAR "Question" ["default"]
  local var="$1"
  local question="$2"
  local default="${3:-}"
  local answer=""
  while true; do
    vulpy_prompt answer "${question}" "${default}"
    if vulpy_is_email "${answer}"; then
      printf -v "${var}" '%s' "${answer}"
      return 0
    fi
    if ! vulpy_is_tty; then
      echo "Invalid email address: '${answer}'" >&2
      return 1
    fi
    echo "    That doesn't look like an email address (example: you@example.com). Please try again."
  done
}

vulpy_prompt_password() {
  # vulpy_prompt_password VAR "Question"  — hidden input, confirmed, min 8 chars.
  local var="$1"
  local question="$2"
  local first="" second=""
  if ! vulpy_is_tty; then
    return 1
  fi
  while true; do
    vulpy_read_secret first "${question} (at least 8 characters, typing stays hidden): "
    if ! vulpy_is_password_ok "${first}"; then
      echo "    Too short — please use at least 8 characters."
      continue
    fi
    vulpy_read_secret second "Type the same password again to confirm: "
    if [ "${first}" != "${second}" ]; then
      echo "    The two entries don't match. Let's try again."
      continue
    fi
    printf -v "${var}" '%s' "${first}"
    return 0
  done
}

vulpy_random_label() {
  # Short lowercase label, e.g. "k3v7x9" — used for hard-to-guess URLs.
  head -c 64 /dev/urandom | tr -dc 'a-z0-9' | head -c 6
}

vulpy_public_ip() {
  local ip=""
  ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  if [ -z "${ip}" ]; then
    ip="$(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || true)"
  fi
  if [ -z "${ip}" ]; then
    ip="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -Ev '^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)' | head -1 || true)"
  fi
  printf '%s' "${ip}"
}

vulpy_sslip_host() {
  # vulpy_sslip_host LABEL IP → LABEL.1-2-3-4.sslip.io (wildcard DNS on the server IP)
  local label="$1"
  local ip="$2"
  printf '%s.%s.sslip.io' "${label}" "$(printf '%s' "${ip}" | tr '.' '-')"
}

# --- Dependency bootstrap (root only) ---------------------------------------

vulpy_pkg_install() {
  # Best-effort package install across apt/dnf/yum.
  if command -v apt-get >/dev/null 2>&1; then
    vulpy_run env DEBIAN_FRONTEND=noninteractive apt-get update -qq
    vulpy_run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@"
  elif command -v dnf >/dev/null 2>&1; then
    vulpy_run dnf install -y -q "$@"
  elif command -v yum >/dev/null 2>&1; then
    vulpy_run yum install -y -q "$@"
  else
    vulpy_ui "No supported package manager found (apt/dnf/yum). Please install manually: $*"
    return 1
  fi
}

vulpy_ensure_basics() {
  local missing=()
  command -v curl >/dev/null 2>&1 || missing+=(curl)
  command -v git >/dev/null 2>&1 || missing+=(git)
  command -v psql >/dev/null 2>&1 || missing+=(postgresql-client)
  if [ "${#missing[@]}" -gt 0 ]; then
    vulpy_step "Installing basic tools (${missing[*]})..."
    vulpy_pkg_install "${missing[@]}"
  fi
}

vulpy_ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    vulpy_note "Docker is already installed — good."
    return 0
  fi
  vulpy_step "Installing Docker (this runs the shop's building blocks)..."
  vulpy_note "Using Docker's official install script. This can take a minute or two."
  vulpy_run bash -c 'curl -fsSL https://get.docker.com | sh'
  systemctl enable --now docker 2>/dev/null || true
  if ! docker compose version >/dev/null 2>&1; then
    vulpy_pkg_install docker-compose-plugin || {
      echo "Docker Compose plugin could not be installed automatically." >&2
      echo "Please install it and re-run: https://docs.docker.com/compose/install/linux/" >&2
      return 1
    }
  fi
}

vulpy_node_major() {
  command -v node >/dev/null 2>&1 || { echo 0; return; }
  node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0
}

vulpy_ensure_node22() {
  if [ "$(vulpy_node_major)" -ge 20 ]; then
    vulpy_note "Node.js $(node -v) is already installed — good."
    return 0
  fi
  vulpy_step "Installing Node.js 22 (the runtime the shop is built with)..."
  if command -v apt-get >/dev/null 2>&1; then
    vulpy_run bash -c 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash -'
    vulpy_run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
  elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
    vulpy_run bash -c 'curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -'
    vulpy_pkg_install nodejs
  else
    vulpy_ui "Could not install Node.js automatically. Install Node 20+ and re-run."
    return 1
  fi
}

vulpy_ensure_pnpm() {
  # Corepack's first download prompts "Do you want to continue?" — that hangs
  # forever under quiet install (no TTY). Always disable the prompt.
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  if command -v corepack >/dev/null 2>&1; then
    vulpy_run env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack enable || true
    vulpy_run env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare pnpm@10.15.0 --activate || true
  fi
  if command -v pnpm >/dev/null 2>&1; then
    vulpy_note "pnpm $(pnpm -v 2>/dev/null || echo '?') is ready."
    return 0
  fi
  vulpy_step "Installing pnpm (the package manager for this project)..."
  vulpy_run npm install -g pnpm@10.15.0
}

# Run pnpm without Corepack download prompts (safe for quiet / non-TTY installs).
vulpy_pnpm() {
  env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI="${CI:-1}" pnpm "$@"
}

# --- Tailscale --------------------------------------------------------------

vulpy_tailscale_ensure_installed() {
  if command -v tailscale >/dev/null 2>&1; then
    return 0
  fi
  vulpy_step "Installing Tailscale (your private, secure connection to this server)..."
  vulpy_run bash -c 'curl -fsSL https://tailscale.com/install.sh | sh'
}

vulpy_tailscale_is_up() {
  # `tailscale status` / `--json` succeed even when Logged out — require Running.
  [ "$(vulpy_tailscale_backend_state)" = "Running" ]
}

vulpy_tailscale_dns_name() {
  # Prints e.g. vulpy-commerce-server.tailXXXX.ts.net (no trailing dot).
  tailscale status --json 2>/dev/null \
    | sed -n 's/.*"DNSName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -1 | sed 's/\.$//'
}

vulpy_tailscale_up_args() {
  # vulpy_tailscale_up_args HOSTNAME [TAG]
  # Prints one argv per line (testable; no tags unless TAG non-empty).
  local hostname="$1"
  local tag="${2:-}"
  printf '%s\n' \
    --hostname="${hostname}" \
    --reset \
    --accept-routes=false \
    --accept-dns=false
  if [ -n "${tag}" ]; then
    printf '%s\n' --advertise-tags="${tag}"
  fi
}

vulpy_tailscale_join() {
  # vulpy_tailscale_join HOSTNAME [TAG]
  # Interactive join. Tags are optional — empty TAG = untagged (default path).
  # No silent untagged retry when a tag is requested and rejected.
  local hostname="$1"
  local tag="${2:-}"
  local -a args=()
  local line
  while IFS= read -r line; do
    [ -n "${line}" ] && args+=("${line}")
  done < <(vulpy_tailscale_up_args "${hostname}" "${tag}")

  vulpy_note "Starting Tailscale login for this server." \
             "If approval is still needed at the end of install, the sign-in link is printed there."
  if [ -n "${tag}" ]; then
    vulpy_note "Requesting Tailscale tag: ${tag}"
  fi
  if ! vulpy_run tailscale up "${args[@]}"; then
    if [ -n "${tag}" ]; then
      vulpy_ui "WARN: tailscale up with --advertise-tags=${tag} failed."
      vulpy_ui "      Create the tag in Access controls first (see tip below), then:"
      vulpy_ui "      sudo tailscale up --hostname=${hostname} --accept-routes=false --accept-dns=false --advertise-tags=${tag}"
      return 1
    fi
    vulpy_ui "ERROR: tailscale up failed."
    return 1
  fi
  return 0
}

vulpy_start_host_tailscale() {
  # Start host Tailscale without blocking install (same model as Fox sidecar).
  # vulpy_start_host_tailscale HOSTNAME [TAG]
  # Optional: VULPY_TS_HOST_AUTHKEY / VULPY_HOST_TS_AUTHKEY for fully unattended join.
  local hostname="$1"
  local tag="${2:-}"
  local authkey="${VULPY_TS_HOST_AUTHKEY:-${VULPY_HOST_TS_AUTHKEY:-}}"
  local -a args=()
  local line _i _url=""

  if vulpy_tailscale_is_up; then
    vulpy_note "This server is already on Tailscale."
    return 0
  fi

  while IFS= read -r line; do
    [ -n "${line}" ] && args+=("${line}")
  done < <(vulpy_tailscale_up_args "${hostname}" "${tag}")
  if [ -n "${authkey}" ]; then
    args+=(--authkey="${authkey}")
  fi

  if [ -n "${authkey}" ]; then
    vulpy_note "Joining host Tailscale with auth key (non-blocking)…"
    if ! pgrep -f "tailscale up --hostname=${hostname}" >/dev/null 2>&1; then
      nohup tailscale up "${args[@]}" >/tmp/vulpy-host-tailscale-up.log 2>&1 &
    fi
    sleep 3
    if vulpy_tailscale_is_up; then
      vulpy_note "Host is on Tailscale (auth key)."
      return 0
    fi
    echo "WARN: host auth key did not bring Tailscale online yet — install continues." >&2
    return 0
  fi

  vulpy_note "Host Tailscale login starts in the background — setup will wait for approval before finishing."
  # Kick login in the background; `tailscale up` blocks until approved.
  if ! pgrep -f "tailscale up --hostname=${hostname}" >/dev/null 2>&1; then
    nohup tailscale up "${args[@]}" >/tmp/vulpy-host-tailscale-up.log 2>&1 &
  fi

  for _i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    _url="$(vulpy_tailscale_auth_url 2>/dev/null || true)"
    if [ -n "${_url}" ]; then
      vulpy_print_tailscale_auth_now "HOST" "${_url}"
      return 0
    fi
    if vulpy_tailscale_is_up; then
      vulpy_note "Host came online during start."
      return 0
    fi
    sleep 2
  done
  vulpy_note "Host login link not ready yet — will wait (and re-print) before setup finishes."
  vulpy_log "Host Tailscale login link not ready yet — will wait before finish."
  return 0
}

vulpy_tailscale_suggest_tags() {
  # Optional tip after join — never blocks install.
  local server_tag="${1:-${VULPY_TS_SERVER_TAG:-tag:vulpy-vps}}"
  local fox_tag="${2:-${VULPY_TS_ASSISTANT_TAG:-tag:vulpy-fox}}"
  cat <<EOF

    ----------------------------------------------------------------
    Recommended (optional): label shop machines in Tailscale
    ----------------------------------------------------------------
    Create two separate tags so you can limit who reaches them:

      ${server_tag}  — this server
      ${fox_tag}  — the shop assistant (if it gets its own Tailscale address later)

    Direct links:
      Access controls:  https://login.tailscale.com/admin/acls
      Policy file:      https://login.tailscale.com/admin/acls/file
      Machines (tags):  https://login.tailscale.com/admin/machines
      Auth keys:        https://login.tailscale.com/admin/settings/keys

    Minimal paste for Access controls → tagOwners:

      "tagOwners": {
        "${server_tag}": ["autogroup:admin"],
        "${fox_tag}": ["autogroup:admin"]
      }

    Then: Machines → this server → Edit tags → add ${server_tag}.

    Press Enter to continue without this (you can do it anytime).
    ----------------------------------------------------------------
EOF
  if vulpy_is_tty; then
    read -r -p "    " _ || true
  fi
}

vulpy_tailscale_firewall_render() {
  # nftables ruleset: block host/container-initiated egress onto the Tailscale mesh.
  # Inbound to serve ports is left to Tailscale ACLs; public NIC egress unchanged.
  local shop_port="${HERMES_DEV_STOREFRONT_PORT:-${VULPY_SHOP_PORT:-3000}}"
  local api_port="${HERMES_DEV_MEDUSA_PORT:-${VULPY_API_PORT:-9000}}"
  local hermes_port="${HERMES_PORT:-${VULPY_HERMES_PORT:-8787}}"
  cat <<EOF
# vulpy Tailscale egress lock (auto-generated)
table inet vulpy_ts_lock {
  chain output {
    type filter hook output priority filter; policy accept;
    oifname "tailscale0" ct state established,related accept
    oifname "tailscale0" udp dport 41641 accept
    oifname "tailscale0" ip daddr 100.64.0.0/10 drop comment "vulpy: no host→peer"
    oifname "tailscale0" ip6 daddr fd7a:115c:a1e0::/48 drop comment "vulpy: no host→peer v6"
  }
  chain forward {
    type filter hook forward priority filter; policy accept;
    oifname "tailscale0" drop comment "vulpy: no docker→tailscale0"
  }
}
# serve ports reference (inbound via Tailscale): ${shop_port}/${api_port}/${hermes_port}
EOF
}

vulpy_tailscale_firewall_status() {
  # Prints "on" or "off". Listing nft tables usually needs root.
  local nft_cmd=(nft)
  if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    nft_cmd=(sudo -n nft)
  fi
  if command -v nft >/dev/null 2>&1 && "${nft_cmd[@]}" list table inet vulpy_ts_lock >/dev/null 2>&1; then
    echo "on"
    return 0
  fi
  echo "off"
  return 1
}

vulpy_tailscale_firewall_apply() {
  # Idempotent apply of vulpy_ts_lock (requires root + nft).
  if [ "$(id -u)" -ne 0 ]; then
    echo "WARN: Tailscale firewall apply needs root — skipped." >&2
    return 1
  fi
  if ! command -v nft >/dev/null 2>&1; then
    echo "WARN: nft not installed — Tailscale egress lock skipped." >&2
    echo "      Install nftables, then re-run firewall apply." >&2
    return 1
  fi
  nft delete table inet vulpy_ts_lock 2>/dev/null || true
  vulpy_tailscale_firewall_render | nft -f -
  echo "    Tailscale egress lock: on (this server cannot open connections to other Tailscale devices)."
  return 0
}

# AWS IMDS (169.254.169.254) — block host + Docker from instance-role credentials.
# Only applies on AWS (EC2/Lightsail). Default on there (VULPY_IMDS_LOCK=1); opt out: 0.
# Fleet ASG should still set launch-template metadata_options http_endpoint=disabled.
# Override detection: VULPY_FORCE_AWS=1 (tests) / VULPY_FORCE_AWS=0 (treat as non-AWS).
vulpy_host_is_aws() {
  case "${VULPY_FORCE_AWS:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    0|false|FALSE|no|NO|off|OFF) return 1 ;;
  esac
  local f=""
  for f in /sys/class/dmi/id/bios_vendor /sys/class/dmi/id/sys_vendor \
    /sys/class/dmi/id/board_vendor /sys/class/dmi/id/product_name; do
    if [ -r "${f}" ] && grep -qiE 'amazon|ec2|lightsail' "${f}" 2>/dev/null; then
      return 0
    fi
  done
  # Xen/KVM EC2 hypervisor uuid often starts with "ec2"
  if [ -r /sys/hypervisor/uuid ]; then
    if head -c 3 /sys/hypervisor/uuid 2>/dev/null | grep -qi '^ec2'; then
      return 0
    fi
  fi
  return 1
}

vulpy_imds_lock_enabled() {
  # Opt-out always wins; otherwise only "enabled" on AWS hosts.
  case "${VULPY_IMDS_LOCK:-1}" in
    0|false|FALSE|no|NO|off|OFF) return 1 ;;
  esac
  vulpy_host_is_aws
}

vulpy_imds_firewall_render() {
  cat <<'EOF'
# vulpy IMDS lock (auto-generated) — AWS only; block instance metadata / role creds
# Use reject (not drop) so clients fail fast instead of waiting on connect timeouts.
table inet vulpy_imds_lock {
  chain output {
    type filter hook output priority filter; policy accept;
    ip daddr 169.254.169.254 reject comment "vulpy: no host→IMDS"
    ip6 daddr fd00:ec2::254 reject comment "vulpy: no host→IMDSv6"
  }
  chain forward {
    type filter hook forward priority filter; policy accept;
    ip daddr 169.254.169.254 reject comment "vulpy: no docker→IMDS"
    ip6 daddr fd00:ec2::254 reject comment "vulpy: no docker→IMDSv6"
  }
}
EOF
}

vulpy_imds_firewall_status() {
  # Prints "on" or "off". Listing nft tables usually needs root.
  # Prefer absolute nft path so sudoers can allowlist
  # ``/usr/sbin/nft list table inet vulpy_imds_lock`` without a shell.
  local nft_bin=""
  if command -v nft >/dev/null 2>&1; then
    nft_bin="$(command -v nft)"
  elif [ -x /usr/sbin/nft ]; then
    nft_bin=/usr/sbin/nft
  fi
  [ -n "${nft_bin}" ] || {
    echo "off"
    return 1
  }
  if [ "$(id -u)" -eq 0 ]; then
    if "${nft_bin}" list table inet vulpy_imds_lock >/dev/null 2>&1; then
      echo "on"
      return 0
    fi
  elif command -v sudo >/dev/null 2>&1; then
    if sudo -n "${nft_bin}" list table inet vulpy_imds_lock >/dev/null 2>&1; then
      echo "on"
      return 0
    fi
  fi
  echo "off"
  return 1
}

vulpy_imds_firewall_apply() {
  # Idempotent apply of vulpy_imds_lock (requires root + nft). AWS hosts only.
  if ! vulpy_host_is_aws; then
    return 0
  fi
  if ! vulpy_imds_lock_enabled; then
    if [ "$(id -u)" -eq 0 ] && command -v nft >/dev/null 2>&1; then
      nft delete table inet vulpy_imds_lock 2>/dev/null || true
    fi
    echo "    IMDS lock: skipped (VULPY_IMDS_LOCK=0)"
    return 0
  fi
  if [ "$(id -u)" -ne 0 ]; then
    echo "WARN: IMDS lock apply needs root — skipped." >&2
    return 1
  fi
  if ! command -v nft >/dev/null 2>&1; then
    echo "WARN: nft not installed — IMDS lock skipped." >&2
    echo "      Install nftables, then: sudo bash scripts/vulpy-imds-lock-apply.sh" >&2
    return 1
  fi
  nft delete table inet vulpy_imds_lock 2>/dev/null || true
  vulpy_imds_firewall_render | nft -f -
  echo "    IMDS lock: on (host + containers cannot reach AWS instance metadata)."
  return 0
}

# Best-effort apply as non-root via passwordless sudo wrapper (hermes up).
# No-op and silent on non-AWS hosts.
vulpy_imds_firewall_apply_best_effort() {
  local root="${ROOT_DIR:-}"
  local wrapper=""
  if [ -z "${root}" ]; then
    root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  fi
  wrapper="${root}/scripts/vulpy-imds-lock-apply.sh"
  if ! vulpy_host_is_aws; then
    return 0
  fi
  if ! vulpy_imds_lock_enabled; then
    echo "IMDS lock: skipped (VULPY_IMDS_LOCK=0)"
    return 0
  fi
  if [ "$(id -u)" -eq 0 ]; then
    vulpy_imds_firewall_apply || true
    return 0
  fi
  if [ -x "${wrapper}" ] && command -v sudo >/dev/null 2>&1; then
    if sudo -n "${wrapper}" 2>/dev/null; then
      return 0
    fi
  fi
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    sudo -n bash -c "source '${root}/scripts/lib/install-helpers.sh'; vulpy_imds_firewall_apply" 2>/dev/null && return 0
  fi
  echo "WARN: IMDS lock not applied (need root or passwordless sudo for ${wrapper})." >&2
  echo "      As root: bash scripts/vulpy-imds-lock-apply.sh" >&2
  return 1
}

# Probe IMDS (IMDSv2 token). Prints "reachable", "blocked", or "n/a" (non-AWS).
# Exit 0 if blocked or n/a; 1 if reachable.
vulpy_imds_probe_host() {
  if ! vulpy_host_is_aws; then
    echo "n/a"
    return 0
  fi
  local token=""
  token="$(curl -sS --connect-timeout 2 -m 3 -X PUT \
    "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)"
  if [ -n "${token}" ]; then
    echo "reachable"
    return 1
  fi
  # IMDSv1 fallback (role name listing)
  if curl -sS --connect-timeout 2 -m 3 \
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/" 2>/dev/null \
    | grep -q .; then
    echo "reachable"
    return 1
  fi
  echo "blocked"
  return 0
}

vulpy_imds_probe_hermes() {
  # Probe from running Hermes container. Prints reachable|blocked|unavailable|n/a.
  local root="${ROOT_DIR:-}"
  local out=""
  if ! vulpy_host_is_aws; then
    echo "n/a"
    return 0
  fi
  if [ -z "${root}" ]; then
    root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  fi
  if ! bash "${root}/scripts/hermes-compose.sh" ps --status running hermes 2>/dev/null | grep -q hermes; then
    echo "unavailable"
    return 2
  fi
  out="$(bash "${root}/scripts/hermes-compose.sh" exec -T hermes sh -c \
    'TOKEN=$(curl -sS --connect-timeout 2 -m 3 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true); \
     if [ -n "$TOKEN" ]; then echo reachable; exit 0; fi; \
     if curl -sS --connect-timeout 2 -m 3 "http://169.254.169.254/latest/meta-data/iam/security-credentials/" 2>/dev/null | grep -q .; then echo reachable; exit 0; fi; \
     echo blocked' 2>/dev/null || echo unavailable)"
  out="$(printf '%s' "${out}" | tr -d '\r' | tail -1)"
  echo "${out:-unavailable}"
  case "${out}" in
    blocked) return 0 ;;
    reachable) return 1 ;;
    *) return 2 ;;
  esac
}

vulpy_tailscale_https_ready() {
  # Host Tailscale HTTPS certs (legacy). Prefer vulpy_fox_tailscale_https_ready.
  local dns_name
  dns_name="$(vulpy_tailscale_dns_name)"
  [ -n "${dns_name}" ] || return 1
  tailscale cert --min-validity 1h "${dns_name}" >/dev/null 2>&1
}

# Issue / refresh Let's Encrypt certs for the Fox MagicDNS name via the sidecar.
# Retries with backoff — LE can take several minutes after a fresh machine join.
# Env: VULPY_FOX_CERT_WAIT_SECS (default 900), VULPY_FOX_CERT_POLL_SECS (default 20),
#      VULPY_FOX_CERT_ATTEMPT_SECS (default 45) — hard cap per `tailscale cert` call.
# Returns: 0 ready, 1 failed/pending, 3 ACME rate-limited (caller may soft-fail HTTPS).
vulpy_fox_acme_rate_limited() {
  # True when Fox sidecar logs show LE exact-identifier rate limit recently.
  local logs=""
  logs="$(vulpy_hermes_compose logs --tail=80 tailscale 2>/dev/null || true)"
  printf '%s' "${logs}" | grep -qiE 'rateLimited|too many certificates|urn:ietf:params:acme:error:rateLimited'
}

vulpy_fox_tailscale_https_ready() {
  local dns_name=""
  local wait_secs="${VULPY_FOX_CERT_WAIT_SECS:-900}"
  local poll_secs="${VULPY_FOX_CERT_POLL_SECS:-20}"
  local attempt_secs="${VULPY_FOX_CERT_ATTEMPT_SECS:-45}"
  local started="${SECONDS}"
  local attempt=0
  local out=""
  local tmp
  local rc=1
  local rate_limited=0

  dns_name="$(vulpy_fox_tailscale_dns_name 2>/dev/null || true)"
  if [ -z "${dns_name}" ]; then
    echo "WARN: Fox MagicDNS not ready — cannot issue HTTPS certs yet." >&2
    return 1
  fi

  echo "==> Waiting for Fox Tailscale HTTPS cert (${dns_name}, up to ${wait_secs}s)..."
  tmp="$(mktemp)"
  while [ $((SECONDS - started)) -lt "${wait_secs}" ]; do
    attempt=$((attempt + 1))
    # `tailscale cert` can hang indefinitely on ACME; never block the install gate.
    if command -v timeout >/dev/null 2>&1; then
      vulpy_fox_tailscale_exec timeout "${attempt_secs}" tailscale cert --min-validity 1h "${dns_name}" \
        >"${tmp}" 2>&1
      rc=$?
    else
      vulpy_fox_tailscale_exec tailscale cert --min-validity 1h "${dns_name}" \
        >"${tmp}" 2>&1
      rc=$?
    fi
    if [ "${rc}" -eq 0 ]; then
      rm -f "${tmp}"
      echo "    Fox HTTPS cert ready (${dns_name})"
      return 0
    fi
    out="$(tr '\n' ' ' <"${tmp}" | head -c 240)"
    if [ "${rc}" -eq 124 ]; then
      out="timed out after ${attempt_secs}s${out:+; ${out}}"
    fi
    if printf '%s' "${out}" | grep -qiE 'rateLimited|too many certificates|rate.?limit'; then
      rate_limited=1
    elif vulpy_fox_acme_rate_limited; then
      rate_limited=1
      out="ACME rate-limited (see Fox Tailscale logs)${out:+; ${out}}"
    fi
    echo "    cert attempt ${attempt}: ${out:-failed} — retry in ${poll_secs}s" >&2
    if [ "${rate_limited}" = "1" ]; then
      echo "FAIL: Let's Encrypt rate limit for ${dns_name} (max 5 certs / exact name / 168h)." >&2
      echo "      Use a different Fox Tailscale hostname, or wait until LE retry-after." >&2
      echo "      MagicDNS HTTPS will fail until then; HTTP :80 may work on the tailnet" >&2
      echo "      (browsers with HSTS may still force HTTPS — prefer public edge URLs)." >&2
      rm -f "${tmp}"
      return 3
    fi
    sleep "${poll_secs}"
  done
  if vulpy_fox_acme_rate_limited; then
    echo "FAIL: Let's Encrypt rate limit for ${dns_name} (max 5 certs / exact name / 168h)." >&2
    echo "      Rename Fox (--ts-assistant-name) or wait for LE retry-after." >&2
    rm -f "${tmp}"
    return 3
  fi
  echo "FAIL: Fox HTTPS cert not ready for ${dns_name} within ${wait_secs}s." >&2
  echo "      Approving the machine in Tailscale is enough for HTTP MagiDNS — HTTPS is separate." >&2
  echo "      Enable HTTPS Certificates in Tailscale Admin → DNS, then wait for Let's Encrypt" >&2
  echo "      (ACME DNS-01 via Tailscale SetDNS). Finish watcher keeps retrying;" >&2
  echo "      or rename Fox to dodge rate limits, then: pnpm vulpy hermes doctor" >&2
  echo "      HTTP http://${dns_name}/ may work on the tailnet while HTTPS is pending" >&2
  echo "      (HSTS from prior HTTPS visits can still force broken HTTPS in browsers)." >&2
  rm -f "${tmp}"
  return 1
}

# Passwordless sudo for deploy user to apply Tailscale egress lock from the finish watcher.
vulpy_install_firewall_sudoers() {
  local user="${1:-}"
  local root="${2:-$(pwd)}"
  local dest="/etc/sudoers.d/vulpy-ts-firewall"
  local wrapper="${root}/scripts/vulpy-ts-firewall-apply.sh"
  local imds_dest="/etc/sudoers.d/vulpy-imds-lock"
  local imds_wrapper="${root}/scripts/vulpy-imds-lock-apply.sh"
  if [ "$(id -u)" -ne 0 ]; then
    echo "WARN: firewall sudoers needs root — skipped." >&2
    return 1
  fi
  if [ -z "${user}" ] || ! id -u "${user}" >/dev/null 2>&1; then
    echo "WARN: firewall sudoers: invalid user '${user}'" >&2
    return 1
  fi
  if [ ! -f "${wrapper}" ]; then
    echo "WARN: missing ${wrapper}" >&2
    return 1
  fi
  chmod 755 "${wrapper}"
  cat >"${dest}" <<EOF
# Vulpy: deploy user may apply Tailscale egress lock (finish watcher).
${user} ALL=(root) NOPASSWD: ${wrapper}
EOF
  chmod 440 "${dest}"
  if command -v visudo >/dev/null 2>&1; then
    if ! visudo -cf "${dest}" >/dev/null 2>&1; then
      echo "WARN: sudoers validation failed for ${dest} — removing" >&2
      rm -f "${dest}"
      return 1
    fi
  fi
  echo "    Firewall sudoers installed for ${user} → ${wrapper}"
  if [ -f "${imds_wrapper}" ]; then
    chmod 755 "${imds_wrapper}"
    local nft_bin=/usr/sbin/nft
    if command -v nft >/dev/null 2>&1; then
      nft_bin="$(command -v nft)"
    fi
    cat >"${imds_dest}" <<EOF
# Vulpy: deploy user may apply IMDS lock (hermes up) and read status (doctor).
${user} ALL=(root) NOPASSWD: ${imds_wrapper}
${user} ALL=(root) NOPASSWD: ${nft_bin} list table inet vulpy_imds_lock
EOF
    chmod 440 "${imds_dest}"
    if command -v visudo >/dev/null 2>&1; then
      if ! visudo -cf "${imds_dest}" >/dev/null 2>&1; then
        echo "WARN: sudoers validation failed for ${imds_dest} — removing" >&2
        rm -f "${imds_dest}"
      else
        echo "    IMDS lock sudoers installed for ${user} → ${imds_wrapper}"
      fi
    else
      echo "    IMDS lock sudoers installed for ${user} → ${imds_wrapper}"
    fi
  fi
  return 0
}

vulpy_tailscale_serve_dev() {
  # Host Tailscale serve (legacy path when Fox sidecar is off).
  # Fox UI on default HTTPS :443 / HTTP :80 (no port in URL). Shop/API keep high ports.
  local shop_port="${HERMES_DEV_STOREFRONT_PORT:-${VULPY_SHOP_PORT:-3000}}"
  local api_port="${HERMES_DEV_MEDUSA_PORT:-${VULPY_API_PORT:-9000}}"
  local hermes_port="${HERMES_PORT:-${VULPY_HERMES_PORT:-8787}}"
  local matomo_port="${MATOMO_HOST_PORT:-${VULPY_MATOMO_PORT:-8081}}"

  if ! command -v tailscale >/dev/null 2>&1; then
    echo "tailscale CLI is missing — cannot configure serve" >&2
    return 1
  fi

  echo "==> Tailscale serve (Fox on :443/:80; shop/API on :${shop_port}/:${api_port})..."
  # Drop any old Fox mapping on :8787 so MagicDNS works without a port.
  tailscale serve --https="${hermes_port}" off >/dev/null 2>&1 || true
  if ! tailscale serve --bg --https=443 "http://127.0.0.1:${hermes_port}"; then
    echo "FAIL: serve HTTPS on :443 (Fox → :${hermes_port})" >&2
    return 1
  fi
  if ! tailscale serve --bg --http=80 "http://127.0.0.1:${hermes_port}"; then
    echo "WARN: serve HTTP on :80 (Fox) failed — HTTPS :443 still set." >&2
  fi
  if ! tailscale serve --bg --https="${shop_port}" "http://127.0.0.1:${shop_port}"; then
    echo "FAIL: tailscale serve HTTPS on :${shop_port} (shop)" >&2
    return 1
  fi
  if ! tailscale serve --bg --https="${api_port}" "http://127.0.0.1:${api_port}"; then
    echo "FAIL: tailscale serve HTTPS on :${api_port} (Medusa)" >&2
    return 1
  fi

  # Matomo is optional in dev — only serve when something answers on the port.
  if bash -c "echo >/dev/tcp/127.0.0.1/${matomo_port}" 2>/dev/null; then
    if ! tailscale serve --bg --https="${matomo_port}" "http://127.0.0.1:${matomo_port}"; then
      echo "FAIL: tailscale serve HTTPS on :${matomo_port} (Matomo)" >&2
      return 1
    fi
  fi
  return 0
}

vulpy_hermes_compose() {
  # Run hermes-compose as the current user (or via COMPOSE_SUDO).
  local root="${ROOT_DIR:-}"
  if [ -z "${root}" ]; then
    root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  fi
  bash "${root}/scripts/hermes-compose.sh" "$@"
}

vulpy_fox_tailscale_exec() {
  # Exec into the Fox Tailscale sidecar.
  vulpy_hermes_compose exec -T tailscale "$@"
}

# Run curl inside the Fox Tailscale network namespace (real MagicDNS / serve path).
# Host often cannot resolve or reach Fox MagicDNS (accept-dns=false + egress lock).
# Usage: vulpy_fox_tailscale_curl [curl args…] URL
# Prints response body to stdout; HTTP code to fd 3 if opened by caller, else ignored.
# Exit status follows curl. Requires docker + a curl image (pulled once).
vulpy_fox_tailscale_curl() {
  local url="${*: -1}"
  local args=("${@:1:$#-1}")
  local cid ip dns shop_port api_port hermes_port
  local curl_img="${VULPY_FOX_CURL_IMAGE:-curlimages/curl:8.5.0}"

  dns="$(vulpy_fox_tailscale_dns_name 2>/dev/null || true)"
  ip="$(vulpy_fox_tailscale_exec tailscale ip -4 2>/dev/null | tr -d '\r' | head -1 || true)"
  cid="$(vulpy_hermes_compose ps -q tailscale 2>/dev/null | tail -n1 || true)"
  shop_port="${HERMES_DEV_STOREFRONT_PORT:-${VULPY_SHOP_PORT:-3000}}"
  api_port="${HERMES_DEV_MEDUSA_PORT:-${VULPY_API_PORT:-9000}}"
  hermes_port="${HERMES_PORT:-${VULPY_HERMES_PORT:-8787}}"

  if [ -z "${cid}" ] || [ -z "${ip}" ] || [ -z "${dns}" ]; then
    echo "vulpy_fox_tailscale_curl: Fox Tailscale not ready (cid/ip/dns)" >&2
    return 1
  fi

  if ! docker image inspect "${curl_img}" >/dev/null 2>&1; then
    docker pull "${curl_img}" >/dev/null
  fi

  # shellcheck disable=SC2086
  docker run --rm --network "container:${cid}" "${curl_img}" \
    -sS -k \
    --resolve "${dns}:443:${ip}" \
    --resolve "${dns}:80:${ip}" \
    --resolve "${dns}:${shop_port}:${ip}" \
    --resolve "${dns}:${api_port}:${ip}" \
    --resolve "${dns}:${hermes_port}:${ip}" \
    --connect-timeout 8 -m 40 \
    "${args[@]}" \
    "${url}"
}

vulpy_fox_tailscale_dns_name() {
  vulpy_fox_tailscale_exec tailscale status --json 2>/dev/null \
    | sed -n 's/.*"DNSName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -1 | sed 's/\.$//'
}

vulpy_fox_tailscale_auth_url() {
  # Prints AuthURL when NeedsLogin; empty otherwise.
  vulpy_fox_tailscale_exec tailscale status --json 2>/dev/null \
    | sed -n 's/.*"AuthURL"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -1
}

vulpy_fox_tailscale_backend_state() {
  vulpy_fox_tailscale_exec tailscale status --json 2>/dev/null \
    | sed -n 's/.*"BackendState"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -1
}

vulpy_fox_tailscale_is_up() {
  [ "$(vulpy_fox_tailscale_backend_state)" = "Running" ]
}

vulpy_fox_tailscale_status_line() {
  if ! vulpy_hermes_compose ps --status running tailscale 2>/dev/null | grep -q tailscale; then
    echo "sidecar-not-running"
    return
  fi
  if vulpy_fox_tailscale_is_up; then
    local dns
    dns="$(vulpy_fox_tailscale_dns_name)"
    if [ -n "${dns}" ]; then
      echo "up ${dns}"
    else
      echo "up"
    fi
  else
    local url
    url="$(vulpy_fox_tailscale_auth_url)"
    if [ -n "${url}" ]; then
      echo "needs-login ${url}"
    else
      echo "starting"
    fi
  fi
}

vulpy_fox_tailscale_warn_name_mismatch() {
  # vulpy_fox_tailscale_warn_name_mismatch REQUESTED
  local requested="$1"
  local actual
  actual="$(vulpy_fox_tailscale_dns_name)"
  [ -n "${actual}" ] || return 0
  local short="${actual%%.*}"
  if [ -n "${requested}" ] && [ "${short}" != "${requested}" ]; then
    echo "WARN: Tailscale named this assistant '${short}' (you asked for '${requested}')." >&2
    echo "      Private URLs use: ${actual}" >&2
    vulpy_log "WARN: fox hostname mismatch requested=${requested} actual=${short}"
  fi
}

vulpy_fox_tailscale_wait_login() {
  # Block until Fox sidecar is logged in. Reprints AuthURL on the UI when it changes.
  # Env: VULPY_TS_LOGIN_ATTEMPTS (default 180 ≈ 6m at 2s), VULPY_TS_LOGIN_POLL_SECS (default 2).
  local requested_name="${1:-vulpy-commerce}"
  local max_attempts="${VULPY_TS_LOGIN_ATTEMPTS:-180}"
  local poll_secs="${VULPY_TS_LOGIN_POLL_SECS:-2}"
  local attempt=0
  local url="" last_url=""
  vulpy_wizard_screen "Approve Fox on Tailscale" \
    "Setup cannot finish until Fox joins your Tailscale network." \
    "Open the login link when it appears (it reprints if Tailscale refreshes it)."
  while [ "${attempt}" -lt "${max_attempts}" ]; do
    if vulpy_fox_tailscale_is_up; then
      vulpy_note "Fox is on Tailscale."
      vulpy_fox_tailscale_warn_name_mismatch "${requested_name}"
      vulpy_log "Fox Tailscale up $(vulpy_fox_tailscale_dns_name)"
      return 0
    fi
    url="$(vulpy_fox_tailscale_auth_url)"
    if [ -n "${url}" ] && [ "${url}" != "${last_url}" ]; then
      vulpy_print_tailscale_auth_now "FOX" "${url}" || true
      last_url="${url}"
    elif [ $((attempt % 15)) -eq 14 ] && [ -n "${last_url}" ]; then
      vulpy_note "Still waiting for Fox Tailscale approval…" \
                 "Re-open: ${last_url}"
    fi
    attempt=$((attempt + 1))
    sleep "${poll_secs}"
  done
  vulpy_ui "ERROR: Fox Tailscale login timed out — approve the device, then re-run install or: pnpm vulpy hermes doctor"
  return 1
}

vulpy_host_tailscale_wait_login() {
  # Block until host Tailscale is Running. Reprints AuthURL on the UI when it changes.
  local requested_name="${1:-vulpy-commerce-server}"
  local max_attempts="${VULPY_TS_LOGIN_ATTEMPTS:-180}"
  local poll_secs="${VULPY_TS_LOGIN_POLL_SECS:-2}"
  local attempt=0
  local url="" last_url=""
  vulpy_wizard_screen "Approve this server on Tailscale" \
    "Setup cannot finish until this VPS joins your Tailscale network." \
    "Open the login link when it appears."
  while [ "${attempt}" -lt "${max_attempts}" ]; do
    if vulpy_tailscale_is_up; then
      vulpy_note "Host is on Tailscale ($(vulpy_tailscale_dns_name 2>/dev/null || echo ok))."
      vulpy_log "Host Tailscale up $(vulpy_tailscale_dns_name 2>/dev/null || true)"
      return 0
    fi
    url="$(vulpy_tailscale_auth_url)"
    if [ -n "${url}" ] && [ "${url}" != "${last_url}" ]; then
      vulpy_print_tailscale_auth_now "HOST" "${url}" || true
      last_url="${url}"
    elif [ $((attempt % 15)) -eq 14 ] && [ -n "${last_url}" ]; then
      vulpy_note "Still waiting for host Tailscale approval…" \
                 "Re-open: ${last_url}"
    fi
    attempt=$((attempt + 1))
    sleep "${poll_secs}"
  done
  vulpy_ui "ERROR: Host Tailscale login timed out — approve the device, then re-run bootstrap."
  return 1
}

vulpy_tailscale_serve_fox() {
  # HTTPS/HTTP serve from the Fox Tailscale sidecar.
  # Fox UI: default :443 / :80 (no port in MagicDNS URL). Shop/API: high HTTPS ports.
  # Fox UI is local to the shared netns; shop/API run on the host.
  local shop_port="${HERMES_DEV_STOREFRONT_PORT:-${VULPY_SHOP_PORT:-3000}}"
  local api_port="${HERMES_DEV_MEDUSA_PORT:-${VULPY_API_PORT:-9000}}"
  local hermes_port="${HERMES_PORT:-${VULPY_HERMES_PORT:-8787}}"
  local shop_upstream="${VULPY_FOX_SHOP_UPSTREAM:-http://host.docker.internal:${shop_port}}"
  local api_upstream="${VULPY_FOX_API_UPSTREAM:-http://host.docker.internal:${api_port}}"
  local wait_secs="${VULPY_SERVE_WAIT_SECONDS:-120}"

  if ! vulpy_fox_tailscale_is_up; then
    echo "WARN: Fox Tailscale is not up — cannot configure serve yet." >&2
    return 1
  fi

  echo "==> Waiting for host shop/API before Fox serve (up to ${wait_secs}s)..."
  # Prefer loopback first — bootstrap runs on the host where host.docker.internal
  # often does not resolve; the sidecar still uses host.docker.internal upstreams.
  if vulpy_wait_tcp 127.0.0.1 "${shop_port}" "${wait_secs}"; then
    :
  elif vulpy_wait_tcp host.docker.internal "${shop_port}" 15; then
    :
  else
    echo "WARN: storefront :${shop_port} not ready — serve shop anyway (may 502 until pnpm vulpy dev up)." >&2
  fi
  if ! vulpy_wait_tcp 127.0.0.1 "${api_port}" 30 \
    && ! vulpy_wait_tcp host.docker.internal "${api_port}" 15; then
    echo "WARN: Medusa :${api_port} not ready yet." >&2
  fi

  echo "==> Fox Tailscale serve (Fox :443/:80 → :${hermes_port}; shop :${shop_port}; Medusa :${api_port})..."
  vulpy_log "Fox Tailscale serve 443/80→${hermes_port} ${shop_port}/${api_port}"
  # Clear legacy :8787 HTTPS mapping so https://<fox-magicdns>/ works without a port.
  vulpy_fox_tailscale_exec tailscale serve --https="${hermes_port}" off >/dev/null 2>&1 || true
  # Always publish HTTP :80 first so operators have a working URL while ACME retries.
  if ! vulpy_fox_tailscale_exec tailscale serve --bg --http=80 "http://127.0.0.1:${hermes_port}"; then
    echo "WARN: serve HTTP on :80 (Fox) failed." >&2
  fi
  if ! vulpy_fox_tailscale_exec tailscale serve --bg --https=443 "http://127.0.0.1:${hermes_port}"; then
    echo "FAIL: serve HTTPS on :443 (Fox → :${hermes_port})" >&2
    return 1
  fi
  if ! vulpy_fox_tailscale_exec tailscale serve --bg --https="${shop_port}" "${shop_upstream}"; then
    echo "FAIL: serve HTTPS on :${shop_port} (shop → ${shop_upstream})" >&2
    return 1
  fi
  if ! vulpy_fox_tailscale_exec tailscale serve --bg --https="${api_port}" "${api_upstream}"; then
    echo "FAIL: serve HTTPS on :${api_port} (Medusa → ${api_upstream})" >&2
    return 1
  fi
  # Install may have written allowlists before Tailscale login — refresh now.
  vulpy_apply_fox_tailscale_dev_access >/dev/null || true

  # Cert gate: HTTPS MagicDNS needs a valid LE cert. HTTP :80 remains usable.
  _cert_rc=0
  vulpy_fox_tailscale_https_ready || _cert_rc=$?
  if [ "${_cert_rc}" -eq 0 ]; then
    return 0
  fi
  if [ "${_cert_rc}" -eq 3 ]; then
    echo "WARN: Fox HTTPS certs rate-limited — soft-fail HTTPS; prefer public edge URLs." >&2
  else
    echo "WARN: Fox HTTPS certs not ready — HTTP http://$(vulpy_fox_tailscale_dns_name 2>/dev/null || echo '<fox-magicdns>')/ may work on the tailnet." >&2
  fi
  return 2
}

# Start a background watcher that configures Fox serve + host firewall after
# Tailscale browser approval — even if that happens hours after install.
# Always runs as the deploy user so allowlist/env writes never become root-owned.
vulpy_start_tailscale_finish_watcher() {
  local root="${1:-$(pwd)}"
  local want_fox="${2:-n}"
  local want_host="${3:-n}"
  local deploy_user="${4:-}"
  local state_dir="${root}/.data/vulpy"
  local state_file="${state_dir}/tailscale-finish.env"
  local pid_file="${state_dir}/tailscale-finish.pid"
  local log_file="${state_dir}/tailscale-finish.log"
  local finish_script="${root}/scripts/vulpy-tailscale-finish.sh"

  if [ "${want_fox}" != "y" ] && [ "${want_host}" != "y" ]; then
    return 0
  fi
  if [ ! -f "${finish_script}" ]; then
    echo "WARN: missing ${finish_script} — Tailscale finish watcher not started." >&2
    return 1
  fi

  if [ -z "${deploy_user}" ]; then
    if [ "$(id -u)" -eq 0 ]; then
      deploy_user="${SUDO_USER:-}"
    fi
    deploy_user="${deploy_user:-$(id -un)}"
  fi

  mkdir -p "${state_dir}"
  cat >"${state_file}" <<EOF
WANT_FOX=$([ "${want_fox}" = "y" ] && echo 1 || echo 0)
WANT_HOST=$([ "${want_host}" = "y" ] && echo 1 || echo 0)
EOF
  if id -u "${deploy_user}" >/dev/null 2>&1; then
    chown -R "${deploy_user}:${deploy_user}" "${state_dir}" 2>/dev/null || true
  fi

  if [ -f "${pid_file}" ]; then
    local old_pid=""
    old_pid="$(cat "${pid_file}" 2>/dev/null || true)"
    if [ -n "${old_pid}" ] && kill -0 "${old_pid}" 2>/dev/null; then
      vulpy_log "Tailscale finish watcher already running (pid ${old_pid})"
      return 0
    fi
  fi

  chmod +x "${finish_script}" 2>/dev/null || true
  if [ "$(id -un)" = "${deploy_user}" ]; then
    nohup bash "${finish_script}" >>"${log_file}" 2>&1 &
    echo $! >"${pid_file}"
  else
    # Drop to deploy user — never leave watcher (and env rewrites) as root.
    vulpy_run_as_deploy_user "${deploy_user}" -- bash -c \
      "cd '${root}' && nohup bash '${finish_script}' >>'${log_file}' 2>&1 & echo \$! >'${pid_file}'"
  fi
  vulpy_log "Tailscale finish watcher started as ${deploy_user} (pid $(cat "${pid_file}" 2>/dev/null || echo ?))"
}

# After hermes up / host hermes.env writes: ensure Fox can write onboarding + keys.
vulpy_fix_running_hermes_data_perms() {
  local cid="" gid
  gid="${HOST_GID:-$(id -g 2>/dev/null || echo 1000)}"
  if ! command -v docker >/dev/null 2>&1; then
    return 0
  fi
  local docker=(docker)
  if [ "${COMPOSE_SUDO:-0}" = "1" ]; then
    docker=(sudo -E docker)
  fi
  cid="$("${docker[@]}" ps -qf name=hermes-hermes 2>/dev/null | head -1 || true)"
  if [ -z "${cid}" ]; then
    return 0
  fi
  echo "==> Ensuring Fox can write Hermes /data (onboarding, hermes.env, settings)"
  "${docker[@]}" exec -u 0 "${cid}" sh -c \
    "chown -R foxinthebox:${gid} /data/config /data/data/hermes /data/state /data/logs /data/cache 2>/dev/null; \
     chmod -R ug+rwX /data/config /data/data/hermes /data/state /data/logs /data/cache 2>/dev/null; \
     chmod 660 /data/config/hermes.env /data/config/onboarding.json 2>/dev/null; true" \
    >/dev/null 2>&1 || true
}

vulpy_tailscale_finish_status() {
  local root="${1:-$(pwd)}"
  local state_dir="${root}/.data/vulpy"
  local pid_file="${state_dir}/tailscale-finish.pid"
  local fox_done="${state_dir}/tailscale-fox-serve.done"
  local fox_failed="${state_dir}/tailscale-fox-serve.failed"
  local host_done="${state_dir}/tailscale-host-firewall.done"
  local log_file="${state_dir}/tailscale-finish.log"

  if [ -f "${fox_done}" ]; then
    echo "Fox Tailscale serve: done"
  elif [ -f "${fox_failed}" ]; then
    echo "Fox Tailscale serve: FAILED — $(head -1 "${fox_failed}" 2>/dev/null || echo see log)"
  elif vulpy_fox_tailscale_is_up 2>/dev/null; then
    echo "Fox Tailscale serve: pending (device online — watcher should finish soon)"
  else
    echo "Fox Tailscale serve: waiting for browser approval"
  fi

  if [ -f "${host_done}" ]; then
    echo "Host egress lock: done"
  elif vulpy_tailscale_is_up 2>/dev/null; then
    echo "Host egress lock: pending (device online — watcher should finish soon)"
  else
    echo "Host egress lock: waiting for browser approval"
  fi

  if [ -f "${pid_file}" ] && kill -0 "$(cat "${pid_file}" 2>/dev/null)" 2>/dev/null; then
    echo "Watcher: running (pid $(cat "${pid_file}"))"
  else
    echo "Watcher: not running"
  fi
  [ -f "${log_file}" ] && echo "Log: ${log_file}"

  if vulpy_fox_tailscale_is_up 2>/dev/null; then
    local dns
    dns="$(vulpy_fox_tailscale_dns_name 2>/dev/null || true)"
    if [ -n "${dns}" ]; then
      if vulpy_fox_tailscale_exec tailscale cert --min-validity 1h "${dns}" >/dev/null 2>&1; then
        echo "Fox HTTPS cert: ready (${dns})"
      else
        echo "Fox HTTPS cert: pending/failed (${dns}) — try http://${dns}/"
      fi
      if vulpy_fox_tailscale_curl -o /dev/null -w '' "http://${dns}/" >/dev/null 2>&1 \
        || vulpy_fox_tailscale_curl -o /dev/null -w '' "https://${dns}/" >/dev/null 2>&1; then
        echo "Fox MagicDNS probe: ok"
      else
        echo "Fox MagicDNS probe: unreachable from netns"
      fi
    fi
  fi
}

vulpy_run_as_deploy_user() {
  # vulpy_run_as_deploy_user USER -- command...
  local user="$1"
  shift
  if [ "${1:-}" = "--" ]; then
    shift
  fi
  if [ "$#" -eq 0 ]; then
    echo "vulpy_run_as_deploy_user: missing command" >&2
    exit 1
  fi

  local home_dir
  home_dir="$(getent passwd "${user}" | cut -d: -f6)"

  # Preserve a clean login-ish env; keep PATH for node/pnpm.
  # Drop inherited SUDO_USER so nested sudo -u does not look like the cloud login.
  # runuser is root-only; bootstrap may be invoked via sudo already (root) or not.
  if [ "$(id -u)" -eq 0 ] && command -v runuser >/dev/null 2>&1; then
    runuser -u "${user}" -- env -u SUDO_USER \
      HOME="${home_dir}" \
      USER="${user}" \
      LOGNAME="${user}" \
      VULPY_BOOTSTRAPPED=1 \
      COMPOSE_SUDO=0 \
      PATH="${PATH}" \
      "$@"
  else
    sudo -u "${user}" -H env -u SUDO_USER \
      HOME="${home_dir}" \
      USER="${user}" \
      LOGNAME="${user}" \
      VULPY_BOOTSTRAPPED=1 \
      COMPOSE_SUDO=0 \
      PATH="${PATH}" \
      "$@"
  fi
}

