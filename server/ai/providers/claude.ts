// Claude provider — stub.
//
// Activate when Anthropic credit is healthy. Implementation would use the
// official @anthropic-ai/sdk with prompt caching on the system block (the
// skill body), Claude Haiku 4.5 as default, vision via image content blocks,
// and tool-output / response_format for JSON. Until then, leave this as a
// loud failure so misconfiguration is obvious rather than silent.

import type { AiProvider, CompleteRequest, CompleteResponse } from "./types";

export const claudeProvider: AiProvider = {
  name: "claude",

  async complete(_req: CompleteRequest): Promise<CompleteResponse> {
    throw new Error(
      "Claude provider not configured. Set AI_PROVIDER=gemini (default) or " +
        "implement server/ai/providers/claude.ts and provide ANTHROPIC_API_KEY.",
    );
  },
};
