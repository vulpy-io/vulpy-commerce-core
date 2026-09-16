#!/usr/bin/env bash
# tenant-limits.sh — shared library for per-tenant resource limits.
#
# Host-owned percentage ceilings: the host operator defines each tenant's share
# of host RAM/CPU in a root-owned manifest OUTSIDE the checkout
# (/etc/vulpy/tenants/<appId>.conf). These functions translate the share into
# enforcement artifacts (systemd MemoryMax/CPUQuota placeholders, compose
# deploy.resources.limits overrides) that the tenant cannot raise from inside
# their own checkout.
#
# Source from other scripts: source "$(dirname "$0")/lib/tenant-limits.sh"
# Standalone — no dependency on install-helpers.sh (wrapper scripts source it).
#
# Test hooks (never set in production):
#   VULPY_TL_ETC_DIR       root of generated artifacts (default /etc/vulpy)
#   VULPY_TL_HOST_MEM_MB   host RAM in MB override (default /proc/meminfo)
#   VULPY_TL_HOST_CPUS     host cpu count override (default nproc)
#   VULPY_TL_ENV_FILE      watchdog limits env override (default /etc/vulpy/...)

# --- Paths -------------------------------------------------------------------

vulpy_tl_etc_dir() {
  printf '%s' "${VULPY_TL_ETC_DIR:-/etc/vulpy}"
}

vulpy_tl_manifest_path() {
  printf '%s/tenants/%s.conf' "$(vulpy_tl_etc_dir)" "$1"
}

vulpy_tl_env_path() {
  printf '%s/tenant-limits-%s.env' "$(vulpy_tl_etc_dir)" "$1"
}

vulpy_tl_compose_path() {
  printf '%s/compose-limits-%s.yml' "$(vulpy_tl_etc_dir)" "$1"
}

vulpy_tl_hermes_compose_path() {
  printf '%s/compose-limits-%s.hermes.yml' "$(vulpy_tl_etc_dir)" "$1"
}

# --- Host totals (overridable for tests / unusual hosts) ---------------------

vulpy_tl_host_mem_mb() {
  local mem_kb
  if [ -n "${VULPY_TL_HOST_MEM_MB:-}" ]; then
    printf '%s' "${VULPY_TL_HOST_MEM_MB}"
    return 0
  fi
  mem_kb="$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo 2>/dev/null || echo 0)"
  if [ -z "${mem_kb}" ] || [ "${mem_kb}" -eq 0 ]; then
    echo 0
    return 0
  fi
  # kB -> MB, rounded up (a 1MB-granularity ceiling must never round the host down).
  printf '%s' "$(( (mem_kb + 1023) / 1024 ))"
}

vulpy_tl_host_cpus() {
  if [ -n "${VULPY_TL_HOST_CPUS:-}" ]; then
    printf '%s' "${VULPY_TL_HOST_CPUS}"
    return 0
  fi
  nproc 2>/dev/null || echo 1
}

# --- App id resolution --------------------------------------------------------

vulpy_tl_checkout_app_id() {
  local checkout="$1" raw=""
  if [ -f "${checkout}/.env" ]; then
    raw="$(grep -E '^VULPY_APP_ID=' "${checkout}/.env" | tail -1 | cut -d= -f2- || true)"
  fi
  raw="${raw:-${VULPY_APP_ID:-}}"
  if [ -z "${raw}" ]; then
    return 1
  fi
  printf '%s' "${raw}"
}

# --- Manifest (root-owned, tenant-readable) ----------------------------------

# vulpy_tl_read_manifest APP_ID — sources the manifest and exports the share
# percentages. Returns 1 when the manifest is missing (no-ceiling fallback).
vulpy_tl_read_manifest() {
  local app_id="$1" manifest
  manifest="$(vulpy_tl_manifest_path "${app_id}")"
  if [ ! -f "${manifest}" ]; then
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "${manifest}"
  set +a
  : "${TENANT_MEM_SHARE_PERCENT:=25}"
  : "${TENANT_CPU_SHARE_PERCENT:=25}"
  export TENANT_MEM_SHARE_PERCENT TENANT_CPU_SHARE_PERCENT
  return 0
}

# --- Tenant split vars (checkout-owned, within their ceiling) ----------------
#
# VULPY_MEM_SPLIT_<SVC>_PERCENT / VULPY_CPU_SPLIT_<SVC>_PERCENT — percentages
# OF THE TENANT SHARE. Defaults: storefront 40, medusa 35, postgres 15, redis
# 5, fox 20 (mem and cpu). Read from root .env + environments/<env>/.env +
# deploy/.env (later files win). Only the split vars are sourced — never whole
# tenant env files (they hold secrets and shell-unsafe values).
vulpy_tl_read_splits() {
  local checkout="$1" file
  local files=()
  [ -f "${checkout}/.env" ] && files+=("${checkout}/.env")
  for env in dev staging live hermes edge; do
    [ -f "${checkout}/environments/${env}/.env" ] && files+=("${checkout}/environments/${env}/.env")
  done
  [ -f "${checkout}/deploy/.env" ] && files+=("${checkout}/deploy/.env")
  for file in "${files[@]}"; do
    set -a
    # shellcheck disable=SC1091,SC1090
    source <(grep -E '^VULPY_(MEM|CPU)_SPLIT_[A-Z_]+_PERCENT=' "${file}" 2>/dev/null || true)
    set +a
  done
  export VULPY_MEM_SPLIT_STOREFRONT_PERCENT="${VULPY_MEM_SPLIT_STOREFRONT_PERCENT:-40}"
  export VULPY_MEM_SPLIT_MEDUSA_PERCENT="${VULPY_MEM_SPLIT_MEDUSA_PERCENT:-35}"
  export VULPY_MEM_SPLIT_POSTGRES_PERCENT="${VULPY_MEM_SPLIT_POSTGRES_PERCENT:-15}"
  export VULPY_MEM_SPLIT_REDIS_PERCENT="${VULPY_MEM_SPLIT_REDIS_PERCENT:-5}"
  export VULPY_MEM_SPLIT_FOX_PERCENT="${VULPY_MEM_SPLIT_FOX_PERCENT:-20}"
  export VULPY_CPU_SPLIT_STOREFRONT_PERCENT="${VULPY_CPU_SPLIT_STOREFRONT_PERCENT:-40}"
  export VULPY_CPU_SPLIT_MEDUSA_PERCENT="${VULPY_CPU_SPLIT_MEDUSA_PERCENT:-35}"
  export VULPY_CPU_SPLIT_POSTGRES_PERCENT="${VULPY_CPU_SPLIT_POSTGRES_PERCENT:-15}"
  export VULPY_CPU_SPLIT_REDIS_PERCENT="${VULPY_CPU_SPLIT_REDIS_PERCENT:-5}"
  export VULPY_CPU_SPLIT_FOX_PERCENT="${VULPY_CPU_SPLIT_FOX_PERCENT:-20}"
}

# --- Computation (share × host total × split, clamped at the share) ----------
#
# Domains (each clamps at the tenant share independently — the tenant can
# shuffle splits within, never exceed):
#   app     storefront + medusa + postgres + redis   (compose overrides)
#   dev     storefront + medusa                      (host dev systemd cgroup)
#   hermes  fox                                      (hermes compose override)
#
# vulpy_tl_compute_json MEM_SHARE_PCT CPU_SHARE_PCT — prints a JSON document
# with per-service ceilings, dev totals and per-domain warnings. Reads the
# split vars from the environment (call vulpy_tl_read_splits first).
vulpy_tl_compute_json() {
  local mem_share="$1" cpu_share="$2"
  python3 - "${mem_share}" "${cpu_share}" "$(vulpy_tl_host_mem_mb)" "$(vulpy_tl_host_cpus)" <<'PY'
import json, os, sys

mem_share, cpu_share, host_mem_mb, host_cpus = (int(x) for x in sys.argv[1:5])

DEFAULTS = {"STOREFRONT": 40, "MEDUSA": 35, "POSTGRES": 15, "REDIS": 5, "FOX": 20}
DOMAINS = {
    "app": ["STOREFRONT", "MEDUSA", "POSTGRES", "REDIS"],
    "dev": ["STOREFRONT", "MEDUSA"],
    "hermes": ["FOX"],
}

def split_pct(metric, svc):
    key = "VULPY_{}_SPLIT_{}_PERCENT".format(metric.upper(), svc)
    raw = os.environ.get(key)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return DEFAULTS[svc]

def compute_domain(domain, metric, share, host_total):
    svcs = DOMAINS[domain]
    raw = {s: split_pct(metric, s) for s in svcs}
    raw_sum = sum(raw.values())
    # Clamp at the share: scale every enabled split proportionally.
    scaled = raw if raw_sum <= 100 else {s: v * 100.0 / raw_sum for s, v in raw.items()}
    per = {}
    for s in svcs:
        if metric == "mem":
            per[s] = int(round(host_total * share * scaled[s] / 10000.0))
        else:
            per[s] = int(round(host_total * share * scaled[s] / 100.0))
    return per, raw_sum

app_mem, app_mem_sum = compute_domain("app", "mem", mem_share, host_mem_mb)
app_cpu, app_cpu_sum = compute_domain("app", "cpu", cpu_share, host_cpus)
dev_mem, dev_mem_sum = compute_domain("dev", "mem", mem_share, host_mem_mb)
dev_cpu, dev_cpu_sum = compute_domain("dev", "cpu", cpu_share, host_cpus)
her_mem, her_mem_sum = compute_domain("hermes", "mem", mem_share, host_mem_mb)
her_cpu, her_cpu_sum = compute_domain("hermes", "cpu", cpu_share, host_cpus)

warnings = []
for name, raw_sum in (("app-mem", app_mem_sum), ("app-cpu", app_cpu_sum),
                      ("dev-mem", dev_mem_sum), ("dev-cpu", dev_cpu_sum),
                      ("hermes-mem", her_mem_sum), ("hermes-cpu", her_cpu_sum)):
    if raw_sum > 100:
        warnings.append("{}: enabled split sum {}% > 100% of the tenant share — clamped at the share".format(name, raw_sum))

def high(mb):
    return int(round(mb * 0.9))

services = {}
for svc in ("storefront", "medusa", "postgres", "redis"):
    upper = svc.upper()
    d = {
        "app_mem_max_mb": app_mem[upper],
        "app_mem_high_mb": high(app_mem[upper]),
        "app_cpu_quota_pct": app_cpu[upper],
        "app_cpu_fraction": round(app_cpu[upper] / 100.0, 2),
    }
    if upper in dev_mem:
        d["dev_mem_max_mb"] = dev_mem[upper]
        d["dev_mem_high_mb"] = high(dev_mem[upper])
        d["dev_cpu_quota_pct"] = dev_cpu[upper]
    services[svc] = d

services["hermes"] = {
    "mem_max_mb": her_mem["FOX"],
    "mem_high_mb": high(her_mem["FOX"]),
    "cpu_quota_pct": her_cpu["FOX"],
    "cpu_fraction": round(her_cpu["FOX"] / 100.0, 2),
}

dev_total_mem = dev_mem["STOREFRONT"] + dev_mem["MEDUSA"]
dev_total_cpu = dev_cpu["STOREFRONT"] + dev_cpu["MEDUSA"]

print(json.dumps({
    "host": {"mem_mb": host_mem_mb, "cpus": host_cpus},
    "shares": {"mem": mem_share, "cpu": cpu_share},
    "services": services,
    "dev": {
        "mem_max_mb": dev_total_mem,
        "mem_high_mb": high(dev_total_mem),
        "cpu_quota_pct": dev_total_cpu,
        "store_mem_max_mb": dev_mem["STOREFRONT"],
        "store_mem_high_mb": high(dev_mem["STOREFRONT"]),
        "store_cpu_quota_pct": dev_cpu["STOREFRONT"],
    },
    "warnings": warnings,
}))
PY
}

# --- Rendering (pure — prints to stdout) -------------------------------------

vulpy_tl_render_env_file() {
  local json="$1" app_id="$2"
  python3 - "${json}" "${app_id}" <<'PY'
import json, sys
doc, app_id = json.loads(sys.argv[1]), sys.argv[2]
s, d = doc["services"], doc["dev"]
lines = [
    "# Generated by scripts/vulpy-tenant-limits.sh refresh — DO NOT EDIT (root-owned).",
    "# Per-tenant resource ceilings. Host: mem={mem}MB cpus={cpus}  Tenant share: mem={ms}% cpu={cs}%".format(
        mem=doc["host"]["mem_mb"], cpus=doc["host"]["cpus"],
        ms=doc["shares"]["mem"], cs=doc["shares"]["cpu"]),
    "VULPY_APP_ID={}".format(app_id),
    "HOST_TOTAL_MEM_MB={}".format(doc["host"]["mem_mb"]),
    "HOST_TOTAL_CPUS={}".format(doc["host"]["cpus"]),
    "TENANT_MEM_SHARE_PERCENT={}".format(doc["shares"]["mem"]),
    "TENANT_CPU_SHARE_PERCENT={}".format(doc["shares"]["cpu"]),
    "",
    "# app compose domain (storefront/medusa/postgres/redis containers)",
    "APP_STORE_MEM_MAX_MB={}".format(s["storefront"]["app_mem_max_mb"]),
    "APP_STORE_MEM_HIGH_MB={}".format(s["storefront"]["app_mem_high_mb"]),
    "APP_STORE_CPU_QUOTA_PERCENT={}".format(s["storefront"]["app_cpu_quota_pct"]),
    "APP_MEDUSA_MEM_MAX_MB={}".format(s["medusa"]["app_mem_max_mb"]),
    "APP_MEDUSA_MEM_HIGH_MB={}".format(s["medusa"]["app_mem_high_mb"]),
    "APP_MEDUSA_CPU_QUOTA_PERCENT={}".format(s["medusa"]["app_cpu_quota_pct"]),
    "APP_POSTGRES_MEM_MAX_MB={}".format(s["postgres"]["app_mem_max_mb"]),
    "APP_POSTGRES_MEM_HIGH_MB={}".format(s["postgres"]["app_mem_high_mb"]),
    "APP_POSTGRES_CPU_QUOTA_PERCENT={}".format(s["postgres"]["app_cpu_quota_pct"]),
    "APP_REDIS_MEM_MAX_MB={}".format(s["redis"]["app_mem_max_mb"]),
    "APP_REDIS_MEM_HIGH_MB={}".format(s["redis"]["app_mem_high_mb"]),
    "APP_REDIS_CPU_QUOTA_PERCENT={}".format(s["redis"]["app_cpu_quota_pct"]),
    "",
    "# hermes (fox) compose domain",
    "FOX_MEM_MAX_MB={}".format(s["hermes"]["mem_max_mb"]),
    "FOX_MEM_HIGH_MB={}".format(s["hermes"]["mem_high_mb"]),
    "FOX_CPU_QUOTA_PERCENT={}".format(s["hermes"]["cpu_quota_pct"]),
    "",
    "# dev host systemd domain (storefront+medusa cgroup)",
    "DEV_MEM_MAX_MB={}".format(d["mem_max_mb"]),
    "DEV_MEM_HIGH_MB={}".format(d["mem_high_mb"]),
    "DEV_CPU_QUOTA_PERCENT={}".format(d["cpu_quota_pct"]),
    "",
    "# watchdog storefront RSS ceiling (dev domain)",
    "STORE_MEM_MAX_MB={}".format(d["store_mem_max_mb"]),
    "STORE_MEM_HIGH_MB={}".format(d["store_mem_high_mb"]),
    "STORE_CPU_QUOTA_PERCENT={}".format(d["store_cpu_quota_pct"]),
]
print("\n".join(lines))
PY
}

vulpy_tl_render_app_compose() {
  local json="$1"
  python3 - "${json}" <<'PY'
import json, sys
doc = json.loads(sys.argv[1])
out = [
    "# Generated by scripts/vulpy-tenant-limits.sh refresh — DO NOT EDIT (root-owned).",
    "# Applied via -f at compose invocation; later -f files win in compose merge,",
    "# so tenant compose files cannot raise these ceilings.",
    "services:",
]
for svc in ("storefront", "medusa", "postgres", "redis"):
    d = doc["services"][svc]
    out.append("  {}:".format(svc))
    out.append("    deploy:")
    out.append("      resources:")
    out.append("        limits:")
    out.append("          memory: {}M".format(d["app_mem_max_mb"]))
    out.append("          cpus: \"{}\"".format(d["app_cpu_fraction"]))
print("\n".join(out))
PY
}

vulpy_tl_render_hermes_compose() {
  local json="$1"
  python3 - "${json}" <<'PY'
import json, sys
doc = json.loads(sys.argv[1])
d = doc["services"]["hermes"]
print("\n".join([
    "# Generated by scripts/vulpy-tenant-limits.sh refresh — DO NOT EDIT (root-owned).",
    "# Fox (hermes service) ceiling from the tenant share. Later -f files win.",
    "services:",
    "  hermes:",
    "    deploy:",
    "      resources:",
    "        limits:",
    "          memory: {}M".format(d["mem_max_mb"]),
    "          cpus: \"{}\"".format(d["cpu_fraction"]),
]))
PY
}

vulpy_tl_render_status() {
  local json="$1" app_id="$2"
  python3 - "${json}" "${app_id}" <<'PY'
import json, os, sys
doc, app_id = json.loads(sys.argv[1]), sys.argv[2]
s, d = doc["services"], doc["dev"]
host, sh = doc["host"], doc["shares"]

def split_pct(metric, svc):
    key = "VULPY_{}_SPLIT_{}_PERCENT".format(metric, svc)
    return os.environ.get(key, "")

out = []
out.append("Tenant resource limits for app '{}' (host: mem={}MB cpus={})".format(app_id, host["mem_mb"], host["cpus"]))
out.append("  Tenant share: mem={}% cpu={}%".format(sh["mem"], sh["cpu"]))
out.append("  Split pool (percent of tenant share, mem): storefront={} medusa={} postgres={} redis={} fox={}".format(
    split_pct("MEM", "STOREFRONT"), split_pct("MEM", "MEDUSA"),
    split_pct("MEM", "POSTGRES"), split_pct("MEM", "REDIS"), split_pct("MEM", "FOX")))
out.append("  dev host daemons (storefront+medusa): {}MB (high {}MB) cpu={}%".format(
    d["mem_max_mb"], d["mem_high_mb"], d["cpu_quota_pct"]))
out.append("    storefront: {}MB (high {}MB) cpu={}%  [watchdog RSS ceiling]".format(
    d["store_mem_max_mb"], d["store_mem_high_mb"], d["store_cpu_quota_pct"]))
out.append("    medusa: {}MB (high {}MB) cpu={}%".format(
    s["medusa"]["dev_mem_max_mb"], s["medusa"]["dev_mem_high_mb"], s["medusa"]["dev_cpu_quota_pct"]))
out.append("  app compose (storefront+medusa+postgres+redis):")
out.append("    storefront: {}MB (high {}MB) cpu={}%".format(
    s["storefront"]["app_mem_max_mb"], s["storefront"]["app_mem_high_mb"], s["storefront"]["app_cpu_quota_pct"]))
out.append("    medusa: {}MB (high {}MB) cpu={}%".format(
    s["medusa"]["app_mem_max_mb"], s["medusa"]["app_mem_high_mb"], s["medusa"]["app_cpu_quota_pct"]))
out.append("    postgres: {}MB (high {}MB) cpu={}%".format(
    s["postgres"]["app_mem_max_mb"], s["postgres"]["app_mem_high_mb"], s["postgres"]["app_cpu_quota_pct"]))
out.append("    redis: {}MB (high {}MB) cpu={}%".format(
    s["redis"]["app_mem_max_mb"], s["redis"]["app_mem_high_mb"], s["redis"]["app_cpu_quota_pct"]))
out.append("  fox/hermes compose: {}MB (high {}MB) cpu={}%".format(
    s["hermes"]["mem_max_mb"], s["hermes"]["mem_high_mb"], s["hermes"]["cpu_quota_pct"]))
warnings = doc.get("warnings") or []
if warnings:
    out.append("  Warnings:")
    for w in warnings:
        out.append("    WARN: " + w)
else:
    out.append("  Warnings: none")
out.append("  Artifacts: {}".format("/etc/vulpy (root-owned; tenant cannot edit)"))
out.append("  Re-materialize systemd units after changing splits: sudo bash scripts/install-reboot-survival.sh")
print("\n".join(out))
PY
}

# --- Artifact generation (writes root-owned files under /etc/vulpy) ----------
# Callers must run as root (the CLI enforces it). Missing manifest = no-ceiling
# fallback with a warning (backwards compatible) — never fail closed.

vulpy_tl_generate_env_file() {
  local app_id="$1" checkout="$2" json
  if ! vulpy_tl_read_manifest "${app_id}"; then
    echo "WARN: tenant-limits: no manifest at $(vulpy_tl_manifest_path "${app_id}") — no ceiling enforced (backwards compatible)" >&2
    return 0
  fi
  vulpy_tl_read_splits "${checkout}"
  json="$(vulpy_tl_compute_json "${TENANT_MEM_SHARE_PERCENT}" "${TENANT_CPU_SHARE_PERCENT}")"
  local dir out
  dir="$(vulpy_tl_etc_dir)"
  mkdir -p "${dir}"
  out="$(vulpy_tl_render_env_file "${json}" "${app_id}")"
  printf '%s\n' "${out}" > "${dir}/tenant-limits-${app_id}.env"
  chmod 444 "${dir}/tenant-limits-${app_id}.env"
}

vulpy_tl_generate_compose_overrides() {
  local app_id="$1" checkout="$2" json
  if ! vulpy_tl_read_manifest "${app_id}"; then
    echo "WARN: tenant-limits: no manifest at $(vulpy_tl_manifest_path "${app_id}") — no ceiling enforced (backwards compatible)" >&2
    return 0
  fi
  vulpy_tl_read_splits "${checkout}"
  json="$(vulpy_tl_compute_json "${TENANT_MEM_SHARE_PERCENT}" "${TENANT_CPU_SHARE_PERCENT}")"
  local dir out
  dir="$(vulpy_tl_etc_dir)"
  mkdir -p "${dir}"
  out="$(vulpy_tl_render_app_compose "${json}")"
  printf '%s\n' "${out}" > "$(vulpy_tl_compose_path "${app_id}")"
  chmod 644 "$(vulpy_tl_compose_path "${app_id}")"
  out="$(vulpy_tl_render_hermes_compose "${json}")"
  printf '%s\n' "${out}" > "$(vulpy_tl_hermes_compose_path "${app_id}")"
  chmod 644 "$(vulpy_tl_hermes_compose_path "${app_id}")"
}

# --- Systemd unit materialization --------------------------------------------
#
# vulpy_tl_materialize_units ENV_FILE TEMPLATE_DIR OUT_DIR STORE_USER CHECKOUT
# Renders every *.service/.timer template with the existing __STORE_USER__ /
# __CHECKOUT__ placeholders plus __MEMORY_MAX__ / __MEMORY_HIGH__ / __CPU_QUOTA__
# from the generated limits env. With no limits env (no manifest) the limit
# directive lines are dropped — no ceiling, current behavior.
vulpy_tl_materialize_units() {
  local env_file="$1" template_dir="$2" out_dir="$3" store_user="$4" checkout="$5"
  local sed_expr=(-e "s|__STORE_USER__|${store_user}|g" -e "s|__CHECKOUT__|${checkout}|g")
  local mem_max="" mem_high="" cpu_quota=""
  if [ -n "${env_file}" ] && [ -f "${env_file}" ]; then
    set -a
    # shellcheck disable=SC1090
    source "${env_file}"
    set +a
    if [ -n "${DEV_MEM_MAX_MB:-}" ]; then
      mem_max="${DEV_MEM_MAX_MB}M"
      mem_high="${DEV_MEM_HIGH_MB:-$(awk -v m="${DEV_MEM_MAX_MB}" 'BEGIN { printf "%d", m*0.9 }')}M"
      cpu_quota="${DEV_CPU_QUOTA_PERCENT:-100}%"
    fi
  fi
  if [ -n "${mem_max}" ]; then
    sed_expr+=(-e "s|__MEMORY_MAX__|${mem_max}|g" -e "s|__MEMORY_HIGH__|${mem_high}|g" -e "s|__CPU_QUOTA__|${cpu_quota}|g")
  else
    sed_expr+=(-e "/__MEMORY_MAX__/d" -e "/__MEMORY_HIGH__/d" -e "/__CPU_QUOTA__/d")
  fi
  mkdir -p "${out_dir}"
  local unit src dst
  for unit in vulpy-agent-cmd.service vulpy-dev-boot.service vulpy-watchdog.service vulpy-watchdog.timer; do
    src="${template_dir}/${unit}.template"
    dst="${out_dir}/${unit}"
    [ -f "${src}" ] || continue
    sed "${sed_expr[@]}" "${src}" > "${dst}"
  done
}

# --- Compose invocation helper -------------------------------------------------
#
# vulpy_tl_compose_args [--override PATH] BASE_FILE... — prints "-f <override>"
# (one line) when an override file exists, is readable, AND shares at least one
# service with an existing base file. The intersection guard prevents a
# root-generated override for one stack (e.g. storefront/medusa services) from
# being merged into an unrelated stack (e.g. the edge) where compose would try
# to start phantom services. VULPY_TENANT_LIMITS_OVERRIDE overrides the default
# /etc/vulpy/compose-limits-<appId>.yml path.
vulpy_tl_compose_args() {
  local override="" base svc
  if [ "${1:-}" = "--override" ]; then
    override="$2"
    shift 2
  fi
  if [ -z "${override}" ]; then
    override="$(vulpy_tl_compose_override_path 2>/dev/null || true)"
  fi
  [ -n "${override}" ] || return 0
  [ -f "${override}" ] && [ -r "${override}" ] || return 0
  local ov_services
  ov_services="$(sed -nE 's/^  ([A-Za-z0-9_.-]+):.*/\1/p' "${override}")"
  [ -n "${ov_services}" ] || return 0
  for base in "$@"; do
    [ -f "${base}" ] || continue
    for svc in ${ov_services}; do
      if grep -qE "^  ${svc}:" "${base}"; then
        printf -- '-f %s\n' "${override}"
        return 0
      fi
    done
  done
  return 0
}

vulpy_tl_compose_override_path() {
  local app_id="${VULPY_APP_ID:-}"
  [ -n "${app_id}" ] || return 1
  printf '%s' "${VULPY_TENANT_LIMITS_OVERRIDE:-$(vulpy_tl_compose_path "${app_id}")}"
}

vulpy_tl_hermes_compose_override_path() {
  local app_id="${VULPY_APP_ID:-}"
  [ -n "${app_id}" ] || return 1
  printf '%s' "${VULPY_TENANT_LIMITS_OVERRIDE:-$(vulpy_tl_hermes_compose_path "${app_id}")}"
}

# --- Validation (doctor / status warnings) -----------------------------------

# vulpy_tl_check_splits CHECKOUT ENV — prints warnings when an enabled split
# pool exceeds 100% of the tenant share, or when no host manifest exists.
# Warn-only, always exit 0.
vulpy_tl_check_splits() {
  local checkout="$1" env_name="${2:-dev}" app_id json
  vulpy_tl_read_splits "${checkout}"
  app_id="$(vulpy_tl_checkout_app_id "${checkout}" 2>/dev/null || echo unknown)"
  if ! vulpy_tl_read_manifest "${app_id}"; then
    echo "WARN: tenant-limits: no host manifest at $(vulpy_tl_manifest_path "${app_id}") — no resource ceilings enforced (current behavior)"
    echo "     Install with: sudo bash scripts/vulpy-tenant-limits.sh install --app-id ${app_id} --checkout ${checkout}"
    return 0
  fi
  json="$(vulpy_tl_compute_json "${TENANT_MEM_SHARE_PERCENT}" "${TENANT_CPU_SHARE_PERCENT}")"
  python3 - "${json}" <<'PY'
import json, sys
doc = json.loads(sys.argv[1])
for w in doc.get("warnings") or []:
    print("WARN: tenant-limits: " + w)
PY
}

# --- Watchdog memory guard -----------------------------------------------------
#
# The dev storefront (next-server) runs on the HOST, outside any systemd cgroup
# when started manually. This guard restarts the dev stack when the storefront
# RSS exceeds its ceiling from the generated limits env (STORE_MEM_MAX_MB).
# No limits env (no manifest) = no-op, backwards compatible.

vulpy_tl_env_file_for_checkout() {
  local checkout="$1" app_id
  if [ -n "${VULPY_TL_ENV_FILE:-}" ]; then
    printf '%s' "${VULPY_TL_ENV_FILE}"
    return 0
  fi
  app_id="$(vulpy_tl_checkout_app_id "${checkout}" 2>/dev/null || true)"
  [ -n "${app_id}" ] || return 1
  printf '%s' "$(vulpy_tl_env_path "${app_id}")"
}

vulpy_tl_watchdog_limits_env() {
  vulpy_tl_env_file_for_checkout "$@"
}

# vulpy_tl_nextserver_rss_mb CHECKOUT [PROCFS] — sum of VmRSS (MB, rounded up)
# of this checkout's next-server processes. Filters by cmdline containing
# "next-server" AND (cmdline or cwd) containing the checkout path, so sibling
# tenants on the same host are never charged.
vulpy_tl_nextserver_rss_mb() {
  local checkout="$1" procfs="${2:-/proc}"
  python3 - "${checkout}" "${procfs}" <<'PY'
import os, sys
checkout, procfs = sys.argv[1], sys.argv[2]
total_kb = 0
try:
    pids = os.listdir(procfs)
except OSError:
    print(0)
    sys.exit(0)
for pid in pids:
    if not pid.isdigit():
        continue
    pdir = os.path.join(procfs, pid)
    if not os.path.isdir(pdir):
        continue
    try:
        cmd = open(os.path.join(pdir, "cmdline"), "rb").read().decode("utf-8", "replace")
        if "next-server" not in cmd:
            continue
        try:
            cwd = os.path.realpath(os.path.join(pdir, "cwd"))
        except OSError:
            cwd = ""
        if checkout not in cmd and checkout not in cwd:
            continue
        status = open(os.path.join(pdir, "status"), encoding="utf-8", errors="replace").read()
        for line in status.splitlines():
            if line.startswith("VmRSS:"):
                total_kb += int(line.split()[1])
                break
    except (OSError, ValueError, IndexError):
        continue
print(-(-total_kb // 1024))  # ceil to MB
PY
}

# vulpy_tl_watchdog_should_restart ENV_FILE CHECKOUT [PROCFS] — prints 1 when the
# storefront RSS exceeds STORE_MEM_MAX_MB, 0 otherwise (incl. missing env/limit).
vulpy_tl_watchdog_should_restart() {
  local env_file="$1" checkout="$2" procfs="${3:-/proc}" limit_mb rss_mb
  if [ -z "${env_file}" ] || [ ! -f "${env_file}" ]; then
    echo 0
    return 0
  fi
  limit_mb="$(grep -E '^STORE_MEM_MAX_MB=' "${env_file}" | tail -1 | cut -d= -f2- || true)"
  if [ -z "${limit_mb}" ]; then
    echo 0
    return 0
  fi
  rss_mb="$(vulpy_tl_nextserver_rss_mb "${checkout}" "${procfs}")"
  if [ "${rss_mb}" -gt "${limit_mb}" ]; then
    echo 1
  else
    echo 0
  fi
}

# vulpy_tl_watchdog_memory_guard CHECKOUT LOG_FILE — performs the restart when
# the guard fires. Runs before the health probe (same silent-when-healthy
# discipline): no limits = nothing logged.
vulpy_tl_watchdog_memory_guard() {
  local checkout="$1" log_file="$2" env_file limit_mb rss_mb
  env_file="$(vulpy_tl_watchdog_limits_env "${checkout}" 2>/dev/null || true)"
  [ -n "${env_file}" ] || return 0
  limit_mb="$(grep -E '^STORE_MEM_MAX_MB=' "${env_file}" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  [ -n "${limit_mb}" ] || return 0
  rss_mb="$(vulpy_tl_nextserver_rss_mb "${checkout}" /proc)"
  [ "${rss_mb}" -gt "${limit_mb}" ] || return 0
  printf '%s [watchdog] memory guard: storefront next-server RSS %sMB > %sMB ceiling — dev-app-server restart\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${rss_mb}" "${limit_mb}" >> "${log_file}" 2>/dev/null || true
  if cd "${checkout}" && timeout 600 bash scripts/dev-app-server.sh restart >> "${log_file}" 2>&1; then
    printf '%s [watchdog] memory guard restart ok\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "${log_file}" 2>/dev/null || true
  else
    printf '%s [watchdog] memory guard restart FAILED (rc=%s)\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$?" >> "${log_file}" 2>/dev/null || true
  fi
  return 0
}
