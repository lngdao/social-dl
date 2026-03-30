import type { VideoInfo, DownloadJob, HistoryEntry, Settings } from '../adapters/types';

export enum OffscreenMsg {
  MERGE_DASH = 'MERGE_DASH',
  MERGE_DASH_PROGRESS = 'MERGE_DASH_PROGRESS',
  MERGE_DASH_DONE = 'MERGE_DASH_DONE',
  MERGE_DASH_ERROR = 'MERGE_DASH_ERROR',
  REVOKE_BLOB_URL = 'REVOKE_BLOB_URL',
}

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

export type BackgroundToContent =
  | { type: 'ACTIVATE_SCAN' };

export type AnyMessage = ContentToBackground | SidePanelToBackground | BackgroundToContent;
