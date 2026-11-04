# Orvane

[![CI](https://github.com/BethalaRinosh/Orvane/actions/workflows/ci.yml/badge.svg)](https://github.com/BethalaRinosh/Orvane/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-3da639.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-43-47848f.svg)](https://www.electronjs.org/)

Orvane is an open-source, local-first computer-use agent for Linux, Windows, and macOS. It lives in a small desktop orb, expands into a chat panel, understands the screen, and can operate applications with the same basic interactions as a person.

Run it privately with a local vision-language model through native Windows [Ollama](https://ollama.com/), or connect any compatible hosted API. The default configuration uses `qwen3.5:4b`, a multimodal model with vision and tool support that is a more realistic starting point for 8 GB laptop GPUs. vLLM remains an optional Linux/WSL2 backend.

> [!WARNING]
> Orvane is experimental software with the ability to control your mouse and keyboard. Keep **Ask first** enabled, supervise actions, and do not use it around sensitive or irreversible workflows without understanding the risks.

## Why Orvane?

- **Local by default:** screenshots, prompts, and tool results can stay on your machine.
- **Provider independent:** the model boundary uses an OpenAI-compatible Chat Completions API.
- **Cross-platform desktop shell:** one Electron application for Linux, Windows, and macOS.
- **Visible and interruptible:** watch actions, approve individual steps, or stop a running task.
- **General computer control:** works with normal desktop applications instead of one browser-specific automation API.
- **Open and extensible:** tools, model providers, safety policies, and integrations are regular TypeScript modules.

## Current features

- Click-to-open, always-on-top desktop orb with system light and dark themes.
- Automatic desktop screenshot at the start of every request.
- Multimodal agent loop with rolling context compaction and a default 25-step limit.
- Normalized `1000 × 1000` visual coordinates plus region zoom for small targets.
- Mouse movement, left/right/middle/double click, drag, and horizontal/vertical scrolling.
- Text entry, individual keys, keyboard shortcuts, URL opening, and UI waits.
- Fresh visual verification after every desktop action.
- **Ask first** and **Automatic** desktop permission modes.
- `Enter` to approve and `Delete`/`Backspace` to deny without stealing focus from the target application.
- A stop control that cancels model generation, waits, and pending approvals.
- Clarifying questions when the model needs information instead of guessing.
- Linux AppImage/deb, Windows NSIS, and macOS DMG build targets.

## How it works

```text
┌──────────────────────────────┐
│ Sandboxed Electron renderer │  orb, chat, settings, approvals
└──────────────┬───────────────┘
               │ narrow typed IPC
┌──────────────▼───────────────┐
│ Electron main process       │
│  ├─ model agent loop        ├──── OpenAI-compatible API
│  ├─ desktop capture         │
│  ├─ permission broker       │
│  └─ mouse/keyboard tools    │
└──────────────────────────────┘
```

The renderer has no Node.js access. Credentials, screenshots, model calls, and automation remain in the Electron main process. See [ARCHITECTURE.md](ARCHITECTURE.md) for the detailed design and trust boundaries.

## Platform support

| Platform | Status | Notes |
|---|---|---|
| Linux X11 | Best supported | Install the XTest runtime; synthetic input works in normal desktop sessions. |
| Linux Wayland | Experimental | Screen capture uses portals, while compositor policy may block synthetic input or global shortcuts. |
| Windows 10/11 | Experimental | A non-elevated app cannot control elevated windows. Code signing is recommended for distribution. |
| macOS | Experimental | Screen Recording and Accessibility permissions are required. Signing and notarization are required for normal distribution. |

The current agent operates the **primary display only**. Multi-monitor automation is on the roadmap.

## Requirements

- Node.js `22.12` or newer.
- npm `10` or newer.
- A multimodal OpenAI-compatible endpoint.
- For local inference: a vLLM-supported GPU and Python environment.

Ubuntu/Debian users may need:

```bash
sudo apt install libxtst6 libxtst-dev
```

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/BethalaRinosh/Orvane.git
cd Orvane
npm install
```

### 2. Start a model

The included launcher expects a vLLM environment at `~/venvs/vllm`. Qwen3.5 requires a recent vLLM release (use vLLM 0.17.0 or newer). vLLM is intended to run in Linux; on Windows, use WSL2 with a supported NVIDIA CUDA setup rather than trying to install the vLLM server natively in PowerShell.

### Native Windows setup (recommended for Windows laptops)

Install Ollama for Windows from [ollama.com/download](https://ollama.com/download). It runs natively, uses NVIDIA GPU acceleration when available, and exposes an API on `http://localhost:11434`. No WSL or separate CUDA Toolkit installation is required for the Ollama path. Then run:

```powershell
ollama pull qwen3.5:4b
ollama run qwen3.5:4b
```

In Orvane model settings use:

- Provider: Local
- Base URL: `http://127.0.0.1:11434/v1`
- Model: `qwen3.5:4b`
- API key: blank (Ollama ignores API keys)

The default context is controlled by Ollama/model configuration rather than the OpenAI-compatible request. Orvane reduces screenshots to 1280×720 to reduce vision-token usage. Confirm GPU offload in `ollama ps` while a prompt is running. If the model does not fit, close GPU-heavy applications or choose a smaller model.

### Optional vLLM backend (Linux/WSL2 only)

vLLM does not support Windows natively. Use WSL2 with a supported NVIDIA CUDA setup if you specifically need vLLM. The launcher defaults to a 4096-token context for an 8 GB GPU and reserves GPU memory conservatively. Qwen3.5 is launched in non-thinking mode to keep its response budget available for answers and desktop tool calls. Increase context only after checking free VRAM and confirming the server can allocate its KV cache. This is a local GPU-memory/context setting, not a paid token quota:

```bash
ORVANE_MAX_MODEL_LEN=4096 npm run model:start
```

From Windows PowerShell, start your configured WSL distribution and run the Linux launcher inside it, for example:

```powershell
wsl -d Ubuntu
# Then, inside WSL:
cd /path/to/Orvane
ORVANE_MAX_MODEL_LEN=8192 npm run model:start
```

Set `VLLM_ENV_DIR` if your environment is elsewhere:

```bash
VLLM_ENV_DIR=/path/to/vllm-env npm run model:start
```

Equivalent vLLM command:

```bash
vllm serve RedHatAI/Qwen3.5-9B-quantized.w4a16 \
  --port 8000 \
  --tensor-parallel-size 1 \
  --trust-remote-code \
  --max-model-len 8192 \
  --max-num-seqs 1 \
  --gpu-memory-utilization 0.90 \
  --reasoning-parser qwen3 \
  --default-chat-template-kwargs '{"enable_thinking": false}' \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_coder
```

Start at 4096 context for the optional vLLM path on an 8 GB laptop GPU. Actual runtime VRAM includes the vision encoder, CUDA/vLLM overhead, and KV cache. If the model does not load, close GPU-heavy applications and check `nvidia-smi` before trying a smaller model or lower context.

### 3. Start Orvane

```bash
npm start
```

Click the orb, enter a request, and approve actions as they appear.

For development with hot reload:

```bash
npm run dev
```

## Using a hosted or different local API

Open model settings from the gear button and configure:

- **Provider:** local vLLM or remote API.
- **Endpoint:** an OpenAI-compatible base URL such as `http://127.0.0.1:8000/v1`.
- **Model:** the exact model identifier accepted by the server.
- **API key:** optional for local endpoints.
- **Tool steps:** maximum agent iterations for one request.

The endpoint must support image inputs, function tools, and the model's tool-call format. With local vLLM, inference runs on your own hardware and Orvane does not charge per token. The generated-token setting is a per-response compute limit, not a credit balance or subscription. If you switch to a remote provider, that provider may bill according to its own pricing, and prompts/screenshots are sent to that provider. API keys are stored in Electron's per-user application-data directory with user-only file permissions, but are not yet backed by the operating-system keychain.

## Permission modes and safety

| Mode | Behavior |
|---|---|
| Ask first | Screenshots are automatic and read-only. Mouse, keyboard, and URL actions require individual approval. This is the default. |
| Automatic | Actions run without individual prompts. Use only in a controlled environment. |

Orvane validates coordinates and external URL protocols, limits agent steps, times out approvals, supports cancellation, and prompts the model to avoid unnecessary or out-of-scope actions. These controls reduce risk; they do not make arbitrary model-generated desktop automation safe.

Prompt injection can appear inside webpages, documents, chat messages, and application UI. Treat visible third-party content as untrusted and supervise consequential workflows.

## Development

```bash
npm install        # install and rebuild native Electron dependencies
npm run typecheck  # check main/preload and renderer TypeScript
npm test           # run unit tests
npm run build      # create production main and renderer bundles
```

Build an installer on its target operating system:

```bash
npm run dist:linux
npm run dist:windows
npm run dist:mac
```

Native automation dependencies and signed installers should be built and smoke-tested on each target OS rather than relying on cross-compilation.

## Project status and roadmap

Orvane is an early alpha. Important remaining work includes multi-monitor support, native permission onboarding, encrypted credential storage, streaming responses, target-native end-to-end tests, dedicated service integrations, and signed release automation.

See [ROADMAP.md](ROADMAP.md) for planned work and [CHANGELOG.md](CHANGELOG.md) for release history.

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), and use the provided GitHub templates. For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Responsible use

Use Orvane only on systems and accounts you are authorized to control. Do not use it to bypass access controls, violate privacy, send spam, deceive people, or perform unlawful activity. You are responsible for reviewing automated actions and complying with the terms of services you interact with.

## License

Orvane is licensed under the [MIT License](LICENSE). Third-party dependencies and model weights retain their own licenses.


## Original project and attribution

Orvane is currently a rebranded and modified foundation based on [OpenComputer](https://github.com/andykr1k/OpenComputer) by Andrew Krikorian. The original MIT license and copyright notice are preserved in [LICENSE](LICENSE). Orvane-specific changes will be documented as development continues.
