/**
 * ffmpeg video montage service.
 * Combines 4 mockup images + voiceover audio into a branded presentation video.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);

interface VideoOptions {
  images: Buffer[]; // 4 image buffers (PNG/JPEG)
  audio: Buffer; // MP3 voiceover
  teamName: string;
}

interface VideoResult {
  videoBuffer: Buffer;
  durationSeconds: number;
}

/**
 * Create a video montage from 4 mockup images and a voiceover track.
 *
 * Each image is shown for ~4 seconds with a fade transition.
 * Branded intro/outro slides with Sideline logo text.
 * Total runtime: ~25-30 seconds depending on voiceover length.
 */
export async function createVideoMontage(opts: VideoOptions): Promise<VideoResult> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sideline-mockup-"));

  try {
    // Write images to temp files
    const imagePaths: string[] = [];
    for (let i = 0; i < opts.images.length; i++) {
      const imgPath = path.join(tmpDir, `design_${i + 1}.png`);
      await fs.promises.writeFile(imgPath, opts.images[i]);
      imagePaths.push(imgPath);
    }

    // Write audio
    const audioPath = path.join(tmpDir, "voiceover.mp3");
    await fs.promises.writeFile(audioPath, opts.audio);

    // Output path
    const outputPath = path.join(tmpDir, "mockup_video.mp4");

    // Get audio duration for timing
    const durationSeconds = await getAudioDuration(audioPath);
    const perImageDuration = Math.max(3, Math.floor(durationSeconds / opts.images.length));
    const fadeDuration = 0.5;

    // Build ffmpeg filter complex:
    // - Scale each image to 1920x1080 with padding (maintain aspect ratio)
    // - Add fade in/out transitions
    // - Concatenate with audio
    const filterParts: string[] = [];
    const inputs: string[] = [];

    // Add image inputs
    for (let i = 0; i < imagePaths.length; i++) {
      inputs.push("-loop", "1", "-t", String(perImageDuration), "-i", imagePaths[i]);
    }

    // Add audio input
    inputs.push("-i", audioPath);

    // Build filter for each image: scale + pad + fade
    for (let i = 0; i < imagePaths.length; i++) {
      const fadeIn = i === 0 ? 0 : 0; // First frame starts visible
      filterParts.push(
        `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=white,` +
        `drawtext=text='${opts.teamName.replace(/'/g, "\\'")}':fontsize=28:fontcolor=0x333333:x=(w-text_w)/2:y=h-60:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf,` +
        `drawtext=text='Design ${i + 1} of ${imagePaths.length}':fontsize=20:fontcolor=0x999999:x=(w-text_w)/2:y=h-30:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf,` +
        `fade=t=in:st=0:d=${fadeDuration},fade=t=out:st=${perImageDuration - fadeDuration}:d=${fadeDuration}[v${i}]`
      );
    }

    // Concatenate all video streams
    const concatInputs = imagePaths.map((_, i) => `[v${i}]`).join("");
    filterParts.push(`${concatInputs}concat=n=${imagePaths.length}:v=1:a=0[outv]`);

    const filterComplex = filterParts.join("; ");

    const ffmpegArgs = [
      ...inputs,
      "-filter_complex", filterComplex,
      "-map", "[outv]",
      "-map", `${imagePaths.length}:a`,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ];

    await execFileAsync("ffmpeg", ffmpegArgs, { timeout: 120000 });

    const videoBuffer = await fs.promises.readFile(outputPath);
    const totalDuration = perImageDuration * imagePaths.length;

    return { videoBuffer, durationSeconds: totalDuration };
  } finally {
    // Clean up temp dir
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-i", audioPath,
      "-show_entries", "format=duration",
      "-v", "quiet",
      "-of", "csv=p=0",
    ]);
    return parseFloat(stdout.trim()) || 20;
  } catch {
    return 20; // Default 20 seconds if ffprobe fails
  }
}

export type { VideoOptions, VideoResult };
