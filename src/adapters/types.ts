export type Platform = 'facebook' | 'instagram' | 'tiktok';
export type VideoType = 'mp4' | 'dash';
export type JobStatus = 'pending' | 'downloading' | 'merging' | 'done' | 'error';
export type PageType = 'single' | 'profile' | 'unknown';

export interface VideoQuality {
  label: string;
  url: string;
  type: VideoType;
  audioUrl?: string;
}

export interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  qualities: VideoQuality[];
  platform: Platform;
  sourceUrl: string;
}

export interface DownloadJob {
  id: string;
  videoInfo: VideoInfo;
  selectedQuality: string;
  status: JobStatus;
  progress: number;
  retryCount: number;
  error?: string;
}

export interface HistoryEntry {
  id: string;
  title: string;
  platform: Platform;
  sourceUrl: string;
  downloadedAt: number;
  fileSizeBytes?: number;
}

export type MergeMethod = 'mp4box' | 'ffmpeg' | 'direct';

export interface Settings {
  concurrency: number;
  defaultQuality: string;
  mergeMethod: MergeMethod;
  includeAudio: boolean;
  cobaltInstance: string;
  cobaltApiKey: string;
}

export interface PlatformAdapter {
  platform: Platform;
  matchesUrl(url: string): boolean;
  detectPageType(url: string): PageType;
  installFetchInterceptor(onVideo: (info: VideoInfo) => void): () => void;
}
