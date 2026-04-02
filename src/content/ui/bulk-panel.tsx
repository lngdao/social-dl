import { render } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { VideoInfo } from '../../adapters/types';

const QUALITY_OPTIONS = ['highest', '1080p', '720p', '360p'];
const SCROLL_INTERVAL_MS = 1500;
const MAX_STALE_TIME_MS = 30_000;

interface BulkPanelProps {
  onDownloadSelected: (videos: VideoInfo[], quality: string) => void;
  onClose: () => void;
}

function BulkPanel({ onDownloadSelected, onClose }: BulkPanelProps) {
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quality, setQuality] = useState('highest');
  const [scanning, setScanning] = useState(false); // start paused
  const [copyLabel, setCopyLabel] = useState('');
  const scrollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastNewVideoTimeRef = useRef(Date.now());

  // Listen for video found messages (always, regardless of scan state)
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== '__SD_VIDEO_FOUND__') return;
      const info = e.data.payload as VideoInfo;
      setVideos(prev => {
        if (prev.some(v => v.id === info.id)) return prev;
        lastNewVideoTimeRef.current = Date.now();
        return [...prev, info];
      });
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const stopScan = useCallback(() => {
    setScanning(false);
    if (scrollRef.current) {
      clearInterval(scrollRef.current);
      scrollRef.current = null;
    }
  }, []);

  const startScan = useCallback(() => {
    if (scrollRef.current) return; // already running
    setScanning(true);
    lastNewVideoTimeRef.current = Date.now();

    scrollRef.current = setInterval(() => {
      const staleDuration = Date.now() - lastNewVideoTimeRef.current;
      if (staleDuration >= MAX_STALE_TIME_MS) {
        stopScan();
        return;
      }
      window.scrollBy(0, window.innerHeight * 0.8);
    }, SCROLL_INTERVAL_MS);
  }, [stopScan]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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

  function getSelectedURLs(): string[] {
    return videos
      .filter(v => selected.has(v.id))
      .map(v => v.sourceUrl)
      .filter(Boolean);
  }

  function handleCopyURLs() {
    const urls = getSelectedURLs();
    if (urls.length === 0) return;
    navigator.clipboard.writeText(urls.join('\n')).then(() => {
      setCopyLabel(`Copied ${urls.length}!`);
      setTimeout(() => setCopyLabel(''), 2000);
    });
  }

  function handleSaveFile() {
    const urls = getSelectedURLs();
    if (urls.length === 0) return;
    const blob = new Blob([urls.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `social-dl-urls-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
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

      {/* Scan control */}
      <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #374151' }}>
        <div style={{ fontSize: '13px', color: scanning ? '#60a5fa' : videos.length > 0 ? '#34d399' : '#9ca3af' }}>
          {scanning
            ? `Scanning… ${videos.length} video${videos.length !== 1 ? 's' : ''}`
            : videos.length > 0
              ? `${videos.length} video${videos.length !== 1 ? 's' : ''} found`
              : 'Ready to scan'}
        </div>
        <button
          onClick={scanning ? stopScan : startScan}
          style={{
            background: scanning ? '#dc2626' : '#2563eb',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 600,
            padding: '4px 12px',
            cursor: 'pointer',
          }}
        >
          {scanning ? 'Pause' : videos.length > 0 ? 'Resume' : 'Start Scan'}
        </button>
      </div>

      {/* Video list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 8px', marginTop: '8px' }}>
        {videos.length === 0 && (
          <div style={{ color: '#6b7280', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
            {scanning ? 'Scrolling page to find videos…' : 'Press "Start Scan" to begin'}
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
              color: videos.length > 0 ? '#d1d5db' : '#6b7280', fontSize: '12px', padding: '4px 10px',
              cursor: videos.length > 0 ? 'pointer' : 'not-allowed',
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
        {/* Export buttons */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={handleCopyURLs}
            disabled={selected.size === 0}
            style={{
              flex: 1, background: '#374151', border: '1px solid #4b5563', borderRadius: '6px',
              color: selected.size > 0 ? '#d1d5db' : '#6b7280', fontSize: '12px', padding: '6px 8px',
              cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            {copyLabel || `Copy URLs (${selected.size})`}
          </button>
          <button
            onClick={handleSaveFile}
            disabled={selected.size === 0}
            style={{
              flex: 1, background: '#374151', border: '1px solid #4b5563', borderRadius: '6px',
              color: selected.size > 0 ? '#d1d5db' : '#6b7280', fontSize: '12px', padding: '6px 8px',
              cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            Save .txt
          </button>
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

  // If already mounted, just show it again (toggle)
  const existing = document.getElementById(mountId);
  if (existing) {
    existing.remove();
    return;
  }

  const mount = document.createElement('div');
  mount.id = mountId;
  document.body.appendChild(mount);

  function handleClose() {
    render(null, mount);
    mount.remove();
  }

  render(<BulkPanel onDownloadSelected={onDownloadSelected} onClose={handleClose} />, mount);
}
