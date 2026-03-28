import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type { VideoInfo } from '../../adapters/types';

const QUALITY_OPTIONS = ['highest', '1080p', '720p', '360p'];
const SCROLL_INTERVAL_MS = 1500;
const NO_NEW_VIDEO_STOP_AFTER = 10; // stop after N scroll cycles with no new video

interface BulkPanelProps {
  onDownloadSelected: (videos: VideoInfo[], quality: string) => void;
  onClose: () => void;
}

function BulkPanel({ onDownloadSelected, onClose }: BulkPanelProps) {
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quality, setQuality] = useState('highest');
  const [scanning, setScanning] = useState(true);
  const scrollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let lastCount = 0;
    let staleScrollCycles = 0;

    function handleMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== '__SD_VIDEO_FOUND__') return;
      const info = e.data.payload as VideoInfo;
      setVideos(prev => {
        if (prev.some(v => v.id === info.id)) return prev;
        return [...prev, info];
      });
    }
    window.addEventListener('message', handleMessage);

    scrollRef.current = setInterval(() => {
      // Check if we found new videos since last scroll
      setVideos(prev => {
        if (prev.length === lastCount) {
          staleScrollCycles++;
          if (staleScrollCycles >= NO_NEW_VIDEO_STOP_AFTER) {
            setScanning(false);
            if (scrollRef.current) clearInterval(scrollRef.current);
          }
        } else {
          staleScrollCycles = 0;
          lastCount = prev.length;
        }
        return prev;
      });
      window.scrollBy(0, window.innerHeight * 0.8);
    }, SCROLL_INTERVAL_MS);

    return () => {
      window.removeEventListener('message', handleMessage);
      if (scrollRef.current) clearInterval(scrollRef.current);
    };
  }, []);

  function toggleVideo(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === videos.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(videos.map(v => v.id)));
    }
  }

  function handleDownload() {
    const toDownload = videos.filter(v => selected.has(v.id));
    if (toDownload.length === 0) return;
    onDownloadSelected(toDownload, quality);
  }

  const allSelected = videos.length > 0 && selected.size === videos.length;

  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        width: '320px',
        maxHeight: '80vh',
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: 'column',
        background: '#1f2937',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        fontFamily: 'system-ui, sans-serif',
        color: '#f9fafb',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #374151' }}>
        <div style={{ fontWeight: 700, fontSize: '15px' }}>Bulk Download</div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '2px 6px' }}
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Status */}
      <div style={{ padding: '8px 16px', fontSize: '13px', color: scanning ? '#60a5fa' : '#34d399' }}>
        {scanning ? `Scanning… ${videos.length} video${videos.length !== 1 ? 's' : ''} found` : `Scan complete — ${videos.length} video${videos.length !== 1 ? 's' : ''} found`}
      </div>

      {/* Video list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 8px' }}>
        {videos.length === 0 && (
          <div style={{ color: '#6b7280', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
            {scanning ? 'Waiting for videos…' : 'No videos detected'}
          </div>
        )}
        {videos.map(v => (
          <div
            key={v.id}
            onClick={() => toggleVideo(v.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px',
              marginBottom: '4px',
              borderRadius: '8px',
              cursor: 'pointer',
              background: selected.has(v.id) ? '#1e3a5f' : '#111827',
              border: `1px solid ${selected.has(v.id) ? '#3b82f6' : '#374151'}`,
            }}
          >
            <input
              type="checkbox"
              checked={selected.has(v.id)}
              onChange={() => toggleVideo(v.id)}
              onClick={(e) => e.stopPropagation()}
              style={{ accentColor: '#3b82f6', width: '16px', height: '16px', cursor: 'pointer' }}
            />
            {v.thumbnail ? (
              <img src={v.thumbnail} alt="" style={{ width: '56px', height: '36px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
            ) : (
              <div style={{ width: '56px', height: '36px', background: '#374151', borderRadius: '4px', flexShrink: 0 }} />
            )}
            <div style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: '#e5e7eb' }}>
              {v.title || v.id}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #374151', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={selectAll}
            disabled={videos.length === 0}
            style={{
              background: 'none', border: '1px solid #4b5563', borderRadius: '6px',
              color: '#d1d5db', fontSize: '12px', padding: '4px 10px', cursor: 'pointer',
            }}
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <select
            value={quality}
            onChange={(e) => setQuality((e.target as HTMLSelectElement).value)}
            style={{
              background: '#374151', border: '1px solid #4b5563', borderRadius: '6px',
              color: '#f9fafb', fontSize: '12px', padding: '4px 8px', cursor: 'pointer',
            }}
          >
            {QUALITY_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
        <button
          onClick={handleDownload}
          disabled={selected.size === 0}
          style={{
            background: selected.size > 0 ? '#2563eb' : '#1e3a5f',
            border: 'none', borderRadius: '8px', color: '#f9fafb',
            fontSize: '14px', fontWeight: 600, padding: '10px',
            cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
            opacity: selected.size > 0 ? 1 : 0.5,
          }}
        >
          Download Selected ({selected.size})
        </button>
      </div>
    </div>
  );
}

export function showBulkPanel(onDownloadSelected: (videos: VideoInfo[], quality: string) => void): void {
  const mountId = '__sd_bulk_panel_mount__';
  if (document.getElementById(mountId)) return;

  const mount = document.createElement('div');
  mount.id = mountId;
  document.body.appendChild(mount);

  function handleClose() {
    render(null, mount);
    mount.remove();
  }

  render(<BulkPanel onDownloadSelected={onDownloadSelected} onClose={handleClose} />, mount);
}
