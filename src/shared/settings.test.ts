import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./contracts.js";
import { chatCompletionsUrl, sanitizeSettings } from "./settings.js";

describe("sanitizeSettings", () => {
  it("uses a laptop-friendly local vision model by default", () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.model).toBe("qwen3.5:4b");
    expect(DEFAULT_SETTINGS.maxOutputTokens).toBe(1_024);
  });

  it("migrates previous bundled model defaults to native Ollama", () => {
    expect(sanitizeSettings({ model: "RedHatAI/Qwen3.5-9B-quantized.w4a16" }).model)
      .toBe("qwen3.5:4b");
    expect(sanitizeSettings({ model: "RedHatAI/Qwen3.5-4B-quantized.w4a16" }).model)
      .toBe("qwen3.5:4b");
  });

  it("normalizes URLs and clamps tool steps", () => {
    const settings = sanitizeSettings({
      providerMode: "remote",
      baseUrl: " https://models.example/v1/// ",
      model: " custom-model ",
      apiKey: " secret ",
      permissionMode: "automatic",
      maxToolSteps: 100,
    });
    expect(settings).toEqual({
      providerMode: "remote",
      baseUrl: "https://models.example/v1",
      model: "custom-model",
      apiKey: "secret",
      permissionMode: "automatic",
      maxToolSteps: 30,
      maxOutputTokens: DEFAULT_SETTINGS.maxOutputTokens,
    });
  });

  it("clamps the generation budget", () => {
    expect(sanitizeSettings({ maxOutputTokens: 20_000 }).maxOutputTokens).toBe(4_096);
    expect(sanitizeSettings({ maxOutputTokens: 1 }).maxOutputTokens).toBe(256);
  });

  it("migrates the legacy approval checkbox", () => {
    const settings = sanitizeSettings({ requireActionApproval: false } as never);
    expect(settings.permissionMode).toBe("automatic");
  });
});

describe("chatCompletionsUrl", () => {
  it("builds the OpenAI-compatible endpoint", () => {
    expect(chatCompletionsUrl("http://localhost:8000/v1/")).toBe("http://localhost:8000/v1/chat/completions");
  });
});
