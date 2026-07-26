#!/usr/bin/env bash
# MOVA local Whisper ASR server (Apple Silicon / MLX)
set -euo pipefail
cd "$(dirname "$0")"

# one-time env setup (py3.12 to avoid bleeding-edge wheel gaps on 3.14)
if [ ! -d .venv ]; then
  uv venv --python 3.12 .venv
  uv pip install --python .venv -r requirements.txt
fi

# Speed/quality ladder (decode ms on M4 for a short clip; constrained matching keeps
# accuracy high even on tiny because the grammar is tiny):
#   tiny  ~80ms   ← game default (reflex input; snappiest)
#   base  ~150ms
#   small ~500ms
#   large-v3-turbo ~1050ms  ← best quality; use for the future conversation NPCs
# Override: WHISPER_MODEL=mlx-community/whisper-base-mlx ./run.sh
export WHISPER_MODEL="${WHISPER_MODEL:-mlx-community/whisper-tiny-mlx}"
exec .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8756
