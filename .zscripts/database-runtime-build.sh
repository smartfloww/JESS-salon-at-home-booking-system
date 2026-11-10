#!/bin/bash

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

if [ ! -d "$PROJECT_DIR/supabase/migrations" ]; then
    echo "ERROR: Supabase migrations were not found in $PROJECT_DIR/supabase/migrations"
    exit 1
fi

echo "Supabase PostgreSQL is managed remotely; no database file is copied into the build."
echo "Apply migrations with the Supabase CLI before deploying."
