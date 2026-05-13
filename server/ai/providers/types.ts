// Provider-agnostic interface for the in-app AI worker.
//
// Today there's one provider: Gemini (free tier). The Claude provider is a
// stub. Adding another provider means implementing this interface and
// registering it in `select.ts` — no caller-side changes.

export type ProviderName = "gemini" | "claude";

export type ImageInput = {
  // Either a public URL (fetched by the provider) or an inline base64 blob.
  url?: string;
  base64?: string;
  mimeType?: string;
};

export type CompleteRequest = {
  // The system prompt — usually a skill file's body.
  system: string;
  // The user message. Free-form text describing the task + context.
  user: string;
  // Optional images for vision tasks.
  images?: ImageInput[];
  // If set, the provider must return strict JSON parseable as this shape.
  // Provided as a JSON-schema-compatible object (Gemini's responseSchema /
  // Claude's tool-output format). Keep it minimal — provider quirks vary.
  jsonSchema?: Record<string, any>;
  // Hard cap on output tokens. Defaults per provider.
  maxOutputTokens?: number;
  temperature?: number;
};

export type CompleteResponse = {
  // Raw text returned by the model. If jsonSchema was supplied, this is the
  // JSON string — callers should JSON.parse it themselves so the caller owns
  // error handling for malformed JSON.
  text: string;
  // Usage info if the provider reports it. All optional — Gemini's free-tier
  // responses sometimes omit usage counts.
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  // Model identifier the provider actually used (e.g. "gemini-2.5-flash").
  model: string;
  // The provider name that handled the call.
  provider: ProviderName;
};

export interface AiProvider {
  name: ProviderName;
  complete(req: CompleteRequest): Promise<CompleteResponse>;
}
