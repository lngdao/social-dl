import type { VideoInfo, Platform } from '../adapters/types';
import { getAdapter } from './platform-detector';

export function installFetchInterceptorForPlatform(
  platform: Platform,
  onVideo: (info: VideoInfo) => void,
): () => void {
  const adapter = getAdapter(platform);
  if (!adapter) return () => {};
  return adapter.installFetchInterceptor(onVideo);
}
