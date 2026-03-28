import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  ffmpegInstance = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.2/dist/esm';
  await ffmpegInstance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
  });
  return ffmpegInstance;
}

export async function mergeDashToMp4(
  videoUrl: string,
  audioUrl: string,
  onProgress: (p: number) => void,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  onProgress(5);

  ffmpeg.on('progress', ({ progress }) => {
    onProgress(5 + Math.round(progress * 90));
  });

  await ffmpeg.writeFile('video.mp4', await fetchFile(videoUrl));
  onProgress(30);
  await ffmpeg.writeFile('audio.mp4', await fetchFile(audioUrl));
  onProgress(50);

  await ffmpeg.exec(['-i', 'video.mp4', '-i', 'audio.mp4', '-c:v', 'copy', '-c:a', 'copy', 'output.mp4']);
  onProgress(95);

  const data = await ffmpeg.readFile('output.mp4');
  await ffmpeg.deleteFile('video.mp4');
  await ffmpeg.deleteFile('audio.mp4');
  await ffmpeg.deleteFile('output.mp4');
  onProgress(100);

  return new Blob([data as BlobPart], { type: 'video/mp4' });
}
