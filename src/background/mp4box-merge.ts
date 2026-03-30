import { createFile, type Sample, type MP4BoxBuffer } from 'mp4box';

const TAG = '[SD-MP4Box]';

/**
 * Fetch a URL and return an ArrayBuffer with the `fileStart` property
 * that mp4box.js requires for appendBuffer.
 */
async function fetchAsMP4BoxBuffer(url: string): Promise<MP4BoxBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${TAG} Fetch failed: ${response.status} ${response.statusText} for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  // mp4box expects an ArrayBuffer with a fileStart property
  const buffer = arrayBuffer as MP4BoxBuffer;
  buffer.fileStart = 0;
  return buffer;
}

interface ParsedTrack {
  samples: Sample[];
  info: ReturnType<ReturnType<typeof createFile>['getInfo']>;
  file: ReturnType<typeof createFile>;
}

/**
 * Feed an ArrayBuffer into an mp4box ISOFile, extract all samples for the
 * first video or audio track, and return the parsed info + samples.
 */
function parseFile(buffer: MP4BoxBuffer, label: string): Promise<ParsedTrack> {
  return new Promise((resolve, reject) => {
    const file = createFile();
    let resolved = false;

    file.onError = (_module: string, message: string) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`${TAG} ${label} parse error: ${message}`));
      }
    };

    file.onReady = (info) => {
      console.log(`${TAG} ${label} ready – ${info.tracks.length} track(s)`);

      // Pick first track (caller decides whether this is video or audio)
      const track = info.tracks[0];
      if (!track) {
        resolved = true;
        reject(new Error(`${TAG} ${label} has no tracks`));
        return;
      }

      const collectedSamples: Sample[] = [];

      file.onSamples = (_id, _user, samples) => {
        for (const s of samples) {
          collectedSamples.push(s);
        }
      };

      file.setExtractionOptions(track.id, undefined, { nbSamples: track.nb_samples });
      file.start();
      file.flush();

      resolved = true;
      resolve({ samples: collectedSamples, info, file });
    };

    file.appendBuffer(buffer);
    file.flush();
  });
}

/**
 * Merge a DASH video+audio into a single MP4 and return the raw bytes.
 * Does NOT trigger a download — caller decides what to do with the result.
 */
export async function mergeToBlob(
  videoUrl: string,
  audioUrl: string,
  onProgress: (percent: number) => void,
): Promise<Uint8Array> {
  onProgress(0);

  // ── 1. Fetch both streams in parallel ──────────────────────────────
  console.log(`${TAG} Fetching video and audio streams...`);
  const [videoBuf, audioBuf] = await Promise.all([
    fetchAsMP4BoxBuffer(videoUrl),
    fetchAsMP4BoxBuffer(audioUrl),
  ]);
  onProgress(20);
  console.log(
    `${TAG} Fetched video (${(videoBuf.byteLength / 1024 / 1024).toFixed(1)} MB) ` +
      `and audio (${(audioBuf.byteLength / 1024 / 1024).toFixed(1)} MB)`,
  );

  // ── 2. Parse both files ────────────────────────────────────────────
  console.log(`${TAG} Parsing input files...`);
  const [videoParsed, audioParsed] = await Promise.all([
    parseFile(videoBuf, 'video'),
    parseFile(audioBuf, 'audio'),
  ]);
  onProgress(40);

  const videoTrackInfo = videoParsed.info.videoTracks[0];
  const audioTrackInfo = audioParsed.info.audioTracks[0];

  if (!videoTrackInfo) throw new Error(`${TAG} No video track found in video stream`);
  if (!audioTrackInfo) throw new Error(`${TAG} No audio track found in audio stream`);

  console.log(
    `${TAG} Video: ${videoTrackInfo.codec} ${videoTrackInfo.video?.width}x${videoTrackInfo.video?.height} ` +
      `@ timescale ${videoTrackInfo.timescale}, ${videoParsed.samples.length} samples`,
  );
  console.log(
    `${TAG} Audio: ${audioTrackInfo.codec} ${audioTrackInfo.audio?.sample_rate}Hz ` +
      `${audioTrackInfo.audio?.channel_count}ch, ${audioParsed.samples.length} samples`,
  );

  // ── 3. Extract codec description boxes from source files ───────────
  function getDescriptionBoxes(file: ReturnType<typeof createFile>, trackId: number) {
    const trakBox = (file as any).moov?.traks?.find(
      (t: any) => t.tkhd?.track_id === trackId,
    );
    const stsd = (trakBox as any)?.mdia?.minf?.stbl?.stsd;
    return stsd?.entries ? [...stsd.entries] : [];
  }

  const videoDescBoxes = getDescriptionBoxes(videoParsed.file, videoTrackInfo.id);
  const audioDescBoxes = getDescriptionBoxes(audioParsed.file, audioTrackInfo.id);

  // ── 4. Create output file and add tracks ───────────────────────────
  console.log(`${TAG} Building output MP4...`);
  const output = createFile();

  const outVideoTrackId = output.addTrack({
    timescale: videoTrackInfo.timescale,
    duration: videoTrackInfo.duration,
    width: videoTrackInfo.video?.width ?? 0,
    height: videoTrackInfo.video?.height ?? 0,
    description_boxes: videoDescBoxes,
    brands: ['isom', 'iso2', 'avc1', 'mp41'],
  });

  const outAudioTrackId = output.addTrack({
    timescale: audioTrackInfo.timescale,
    duration: audioTrackInfo.duration,
    hdlr: 'soun',
    samplerate: audioTrackInfo.audio?.sample_rate ?? 44100,
    channel_count: audioTrackInfo.audio?.channel_count ?? 2,
    samplesize: audioTrackInfo.audio?.sample_size ?? 16,
    description_boxes: audioDescBoxes,
  });

  onProgress(50);

  // ── 5. Copy video samples ──────────────────────────────────────────
  for (const sample of videoParsed.samples) {
    const data = sample.data
      ? new Uint8Array(sample.data.buffer, sample.data.byteOffset, sample.data.byteLength)
      : new Uint8Array(0);
    output.addSample(outVideoTrackId, data, {
      duration: sample.duration, dts: sample.dts, cts: sample.cts, is_sync: sample.is_sync,
    });
  }
  onProgress(65);

  // ── 6. Copy audio samples (trimmed to video duration → -shortest) ──
  const videoDurationSec = videoTrackInfo.duration / videoTrackInfo.timescale;
  const videoDurationInAudioTs = videoDurationSec * audioTrackInfo.timescale;

  let audioSamplesCopied = 0;
  for (const sample of audioParsed.samples) {
    if (sample.dts >= videoDurationInAudioTs) break;
    const data = sample.data
      ? new Uint8Array(sample.data.buffer, sample.data.byteOffset, sample.data.byteLength)
      : new Uint8Array(0);
    output.addSample(outAudioTrackId, data, {
      duration: sample.duration, dts: sample.dts, cts: sample.cts, is_sync: sample.is_sync,
    });
    audioSamplesCopied++;
  }

  console.log(`${TAG} Copied ${videoParsed.samples.length} video + ${audioSamplesCopied} audio samples`);
  onProgress(80);

  // ── 7. Serialize output to buffer ──────────────────────────────────
  const outputStream = output.getBuffer();
  const outputBuffer = outputStream.buffer as ArrayBuffer;
  console.log(`${TAG} Output: ${(outputBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);
  onProgress(90);

  return new Uint8Array(outputBuffer);
}

/**
 * Merge and immediately download as a single MP4 file.
 * Convenience wrapper around mergeToBlob.
 */
export async function mergeWithMp4box(
  videoUrl: string,
  audioUrl: string,
  filename: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  console.log(`${TAG} Starting merge: ${filename}`);
  const data = await mergeToBlob(videoUrl, audioUrl, onProgress);

  const blobUrl = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }));
  await chrome.downloads.download({ url: blobUrl, filename: `${filename}.mp4`, saveAs: false });
  onProgress(100);

  setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
}
