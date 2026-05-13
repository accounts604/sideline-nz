// Pick the active AI provider from env. Default to Gemini (the free path).

import type { AiProvider, ProviderName } from "./types";
import { geminiProvider } from "./gemini";
import { claudeProvider } from "./claude";

const PROVIDERS: Record<ProviderName, AiProvider> = {
  gemini: geminiProvider,
  claude: claudeProvider,
};

export function getProvider(): AiProvider {
  const name = (process.env.AI_PROVIDER as ProviderName) || "gemini";
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown AI_PROVIDER: ${name}. Expected one of: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  return provider;
}
