/**
 * Eleven Labs voiceover service.
 * Generates a professional voiceover script for the mockup presentation video.
 */

interface VoiceoverOptions {
  teamName: string;
  sport: string;
  designCount: number;
}

interface VoiceoverResult {
  audioBuffer: Buffer;
  script: string;
}

function buildScript(opts: VoiceoverOptions): string {
  const sportLabel = opts.sport.charAt(0).toUpperCase() + opts.sport.slice(1);

  return `Hey ${opts.teamName}! We've put together ${opts.designCount} custom ${sportLabel} uniform concepts just for your team. Each design features your team colours and is built for performance on the field. Take a look through these options and let us know which direction you'd like to go — or we can mix and match elements from different designs. We're Sideline, and we can't wait to get your team kitted out. Flick us a message to lock in your favourite.`;
}

export async function generateVoiceover(opts: VoiceoverOptions): Promise<VoiceoverResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY not configured");
  }

  // Default to a professional NZ-friendly voice
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel — clear, professional

  const script = buildScript(opts);

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: script,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.8,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs API error (${response.status}): ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  return { audioBuffer, script };
}

export { buildScript };
export type { VoiceoverOptions, VoiceoverResult };
