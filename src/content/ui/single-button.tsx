import { render, h } from 'preact';
import { useState } from 'preact/hooks';
import type { VideoInfo, VideoQuality } from '../../adapters/types';

interface Props {
  videoInfo: VideoInfo;
  onDownload: (quality: VideoQuality) => void;
}

function SingleDownloadButton({ videoInfo, onDownload }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div class="fixed bottom-4 right-4 z-[999999] font-sans">
      {open && (
        <div class="mb-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden min-w-[160px]">
          <div class="px-3 py-2 text-xs font-semibold text-gray-500 border-b">Select Quality</div>
          {videoInfo.qualities.map(q => (
            <button
              key={q.label}
              class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-600"
              onClick={() => { onDownload(q); setOpen(false); }}
            >
              {q.label} ({q.type.toUpperCase()})
            </button>
          ))}
        </div>
      )}
      <button
        class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
        onClick={() => setOpen(o => !o)}
      >
        Download
      </button>
    </div>
  );
}

let mountPoint: HTMLDivElement | null = null;

export function showSingleDownloadButton(
  videoInfo: VideoInfo,
  onDownload: (quality: VideoQuality) => void,
): void {
  if (!mountPoint) {
    mountPoint = document.createElement('div');
    mountPoint.id = 'social-downloader-single-btn';
    document.body.appendChild(mountPoint);
  }
  render(h(SingleDownloadButton, { videoInfo, onDownload }), mountPoint);
}

export function hideSingleDownloadButton(): void {
  if (mountPoint) render(null, mountPoint);
}
