import { h } from 'preact';
import type { DownloadJob, JobStatus } from '../adapters/types';

function statusIcon(status: JobStatus): string {
  switch (status) {
    case 'pending': return '⏳';
    case 'downloading': return '⬇️';
    case 'merging': return '⚙️';
    case 'done': return '✅';
    case 'error': return '❌';
    default: return '•';
  }
}

interface QueueTabProps {
  jobs: DownloadJob[];
}

export function QueueTab({ jobs }: QueueTabProps) {
  if (jobs.length === 0) {
    return (
      <div class="flex flex-col items-center justify-center h-48 text-gray-500 text-sm">
        No downloads yet
      </div>
    );
  }

  return (
    <div class="flex flex-col gap-2 p-3">
      {jobs.map(job => (
        <div key={job.id} class="bg-gray-800 rounded-lg p-3 flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <span class="text-base">{statusIcon(job.status)}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm text-gray-100 truncate">{job.videoInfo.title || job.videoInfo.id}</div>
              <div class="text-xs text-gray-400">{job.videoInfo.platform} · {job.selectedQuality}</div>
            </div>
            <span class="text-xs text-gray-500 capitalize">{job.status}</span>
          </div>

          {(job.status === 'downloading' || job.status === 'merging') && (
            <div class="w-full bg-gray-700 rounded-full h-1.5 mt-1">
              <div
                class="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          )}

          {job.status === 'error' && job.error && (
            <div class="text-xs text-red-400 mt-1">{job.error}</div>
          )}
        </div>
      ))}
    </div>
  );
}
