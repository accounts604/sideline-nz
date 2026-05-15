#!/usr/bin/env bash
# Set ANTHROPIC_API_KEY + AI_PROVIDER=claude across local .env, Vercel,
# and Railway in one shot. Paste the key when prompted (input is hidden —
# never echoes to terminal or shell history).
#
# Usage:  bash scripts/set-anthropic-key.sh
#
# What it does:
#   1. Reads the key from a silent prompt (read -s, no echo)
#   2. Adds/updates ANTHROPIC_API_KEY + AI_PROVIDER=claude in .env
#   3. Pushes both to Vercel production + preview environments
#   4. Pushes both to Railway production
#
# Prerequisites:
#   - You're already logged in to Vercel (vercel whoami) and Railway
#     (railway whoami). Both checks at the top will fail fast if not.

set -euo pipefail

# Check tool availability
command -v vercel >/dev/null 2>&1 || { echo "vercel CLI not found — install via 'npm i -g vercel'"; exit 1; }
command -v railway >/dev/null 2>&1 || { echo "railway CLI not found — install via 'brew install railway'"; exit 1; }

# Silent prompt — key is hidden
read -s -p "Paste your Anthropic API key (starts with sk-ant-…): " KEY
echo
if [ -z "$KEY" ]; then
  echo "Empty input — aborting."
  exit 1
fi
if [[ ! "$KEY" =~ ^sk-ant- ]]; then
  echo "That doesn't look like an Anthropic key (should start with 'sk-ant-')."
  read -p "Continue anyway? [y/N] " CONFIRM
  [[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

echo "→ Updating local .env..."
# Replace existing line if present, else append
if grep -q '^ANTHROPIC_API_KEY=' .env 2>/dev/null; then
  awk -v k="$KEY" '/^ANTHROPIC_API_KEY=/{print "ANTHROPIC_API_KEY=" k; next} {print}' .env > .env.tmp && mv .env.tmp .env
else
  echo "ANTHROPIC_API_KEY=$KEY" >> .env
fi
if grep -q '^AI_PROVIDER=' .env 2>/dev/null; then
  awk '/^AI_PROVIDER=/{print "AI_PROVIDER=claude"; next} {print}' .env > .env.tmp && mv .env.tmp .env
else
  echo "AI_PROVIDER=claude" >> .env
fi

echo "→ Pushing to Vercel (production + preview)..."
# Vercel CLI: env add reads value from stdin
for ENV in production preview; do
  # Remove existing key if it's already there so add doesn't choke
  echo "y" | vercel env rm ANTHROPIC_API_KEY "$ENV" 2>/dev/null || true
  echo "y" | vercel env rm AI_PROVIDER "$ENV" 2>/dev/null || true
  echo "$KEY" | vercel env add ANTHROPIC_API_KEY "$ENV" >/dev/null
  echo "claude" | vercel env add AI_PROVIDER "$ENV" >/dev/null
  echo "  vercel $ENV ✓"
done

echo "→ Pushing to Railway (production)..."
railway variables --set "ANTHROPIC_API_KEY=$KEY" --set "AI_PROVIDER=claude" --service sideline-nz >/dev/null
echo "  railway ✓"

# Wipe the key from this shell — paranoia
KEY=""
unset KEY

echo
echo "Done. Next steps:"
echo "  - Local dev: restart 'npm run dev' to pick up the new env"
echo "  - Vercel: next preview/prod deploy will pick it up automatically"
echo "  - Railway: trigger a redeploy ('railway redeploy --service sideline-nz --yes') or wait for the next git push to main"
