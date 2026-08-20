#!/usr/bin/env bash
# Stops the local Supabase stack, preserving the Docker volume (default
# `supabase stop` behavior). Never pass --no-backup here — that destroys
# the local database on stop.
set -euo pipefail
cd "$(dirname "$0")/.."
supabase stop
