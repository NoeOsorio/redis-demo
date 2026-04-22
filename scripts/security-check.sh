#!/usr/bin/env bash
# Pre-commit security gate.
# Runs automatically via .git/hooks/pre-commit.
# Run manually: npm run security

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "🔐 Running security checks..."
FAIL=0
STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)

# ── 1. Block real .env files ──────────────────────────────────────────────────
for file in $STAGED; do
  if [[ "$file" =~ (^|/)\.env$ ]]; then
    echo "  ❌ Blocked: '$file' — commit .env.example instead, never real .env files"
    FAIL=1
  fi
done

# ── 2. Scan staged source files for secret patterns ───────────────────────────
SECRET_PATTERNS=(
  'AKIA[0-9A-Z]{16}'                          # AWS Access Key ID
  'AIza[0-9A-Za-z\-_]{35}'                   # Google API Key
  'sk-[a-zA-Z0-9]{32,}'                      # OpenAI / Stripe secret
  'xox[baprs]-[0-9a-zA-Z]{10,}'              # Slack token
  '-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY'   # Private key block
  'redis://:[^@\s]{4,}@'                      # Redis URL with inline password
  '(?i)(password|secret|api_key)\s*[:=]\s*["\047][^"\047\s]{6,}' # Hardcoded creds
)

for file in $STAGED; do
  ext="${file##*.}"
  if [[ "$ext" =~ ^(js|ts|mjs|cjs|json|sh|yaml|yml|env|py|rb|go)$ ]]; then
    for pattern in "${SECRET_PATTERNS[@]}"; do
      if git show ":$file" 2>/dev/null | grep -qP "$pattern" 2>/dev/null; then
        echo "  ❌ Possible secret in '$file'  (matched: $pattern)"
        FAIL=1
      fi
    done
  fi
done

# ── 3. npm audit — fail on HIGH or CRITICAL ───────────────────────────────────
echo "  → Checking npm dependencies for vulnerabilities..."
if ! npm audit --audit-level=high --silent 2>/dev/null; then
  echo ""
  npm audit --audit-level=high 2>&1 | head -40
  echo "  ❌ npm audit found HIGH or CRITICAL vulnerabilities — fix before committing"
  FAIL=1
else
  echo "  ✅ No high/critical npm vulnerabilities"
fi

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "❌ Security check failed. Fix the issues above before committing."
  echo "   Emergency bypass (use with care): git commit --no-verify"
  exit 1
fi
echo "✅ All security checks passed."
