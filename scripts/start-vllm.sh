#!/usr/bin/env bash
set -euo pipefail

VLLM_ENV_DIR="${VLLM_ENV_DIR:-${HOME}/venvs/vllm}"
ORVANE_MAX_MODEL_LEN="${ORVANE_MAX_MODEL_LEN:-8192}"

if ! [[ "${ORVANE_MAX_MODEL_LEN}" =~ ^[0-9]+$ ]] || (( ORVANE_MAX_MODEL_LEN < 4096 )); then
  echo "ORVANE_MAX_MODEL_LEN must be an integer of at least 4096." >&2
  exit 1
fi

if [[ ! -f "${VLLM_ENV_DIR}/bin/activate" ]]; then
  echo "vLLM environment not found at ${VLLM_ENV_DIR}." >&2
  echo "Set VLLM_ENV_DIR to the directory containing bin/activate." >&2
  exit 1
fi

# Activation is required because FlashInfer invokes Ninja by executable name.
source "${VLLM_ENV_DIR}/bin/activate"

python - <<'PY'
from importlib.metadata import PackageNotFoundError, version
try:
    installed = version("vllm")
except PackageNotFoundError:
    raise SystemExit("vLLM is not installed in the selected environment.")
parts = tuple(int(part) for part in installed.split(".")[:2])
if parts < (0, 17):
    raise SystemExit(f"Qwen3.5 requires vLLM >= 0.17.0; found {installed}.")
print(f"Using vLLM {installed}")
PY

if ! command -v ninja >/dev/null 2>&1; then
  echo "Ninja is missing from the vLLM environment." >&2
  echo "Install it with: uv pip install --python ${VLLM_ENV_DIR}/bin/python ninja" >&2
  exit 1
fi

exec vllm serve RedHatAI/Qwen3.5-9B-quantized.w4a16 \
  --port 8000 \
  --trust-remote-code \
  --tensor-parallel-size 1 \
  --max-model-len "${ORVANE_MAX_MODEL_LEN}" \
  --max-num-seqs 1 \
  --gpu-memory-utilization 0.90 \
  --reasoning-parser qwen3 \
  --default-chat-template-kwargs '{"enable_thinking": false}' \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_coder
