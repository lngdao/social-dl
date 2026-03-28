import type { VideoInfo, DownloadJob, HistoryEntry, Settings } from '../adapters/types';

export type ContentToBackground =
  | { type: 'BULK_DOWNLOAD_REQUEST'; payload: { videos: VideoInfo[]; quality: string } };

export type BackgroundToUI =
  | { type: 'QUEUE_UPDATE'; payload: DownloadJob[] }
  | { type: 'HISTORY_UPDATE'; payload: HistoryEntry[] }
  | { type: 'SETTINGS_UPDATE'; payload: Settings };

export type SidePanelToBackground =
  | { type: 'GET_QUEUE' }
  | { type: 'GET_HISTORY' }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'CANCEL_JOB'; payload: { jobId: string } }
  | { type: 'CLEAR_HISTORY' };

export type AnyMessage = ContentToBackground | SidePanelToBackground;
