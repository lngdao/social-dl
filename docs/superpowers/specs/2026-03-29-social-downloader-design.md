# Social Downloader Extension — Design Spec

**Date:** 2026-03-29
**Platform:** Chrome (Firefox port later)
**Scope:** Cá nhân + bạn bè, không publish lên Chrome Web Store

---

## Tổng quan

Chrome extension cho phép download video Reels từ Facebook, Instagram, và TikTok. Hỗ trợ single video lẫn bulk download toàn bộ reels từ một profile. Thuần client-side, không cần server hay VPS.

---

## Kiến trúc

3 thành phần chính giao tiếp qua `chrome.runtime.sendMessage`:

```
Content Script  ◄──►  Background Service Worker  ◄──►  Side Panel
```

### Content Script
- Inject vào Facebook, Instagram, TikTok
- Detect loại trang: single reel hay profile reels
- Profile reels: hiện floating panel, auto-scroll để load hết danh sách
- Single reel: hiện nút Download overlay trên video
- Gửi VideoInfo sang Background để xử lý

### Background Service Worker
- Intercept network requests (`webRequest` API) để bắt CDN video URLs và GraphQL responses
- Quản lý download queue với concurrency có thể config (mặc định 3)
- Xử lý DASH merge bằng ffmpeg.wasm (load một lần, cache trong memory)
- Lưu lịch sử download vào `chrome.storage.local`

### Side Panel
- Hiển thị download queue với progress per item
- Lịch sử download (title, platform, thời gian, file size)
- Settings: concurrency, default quality

---

## Platform Adapters

Mỗi platform implement interface chung:

```typescript
interface PlatformAdapter {
  matches(url: string): boolean
  extractSingle(tab: Tab): Promise<VideoInfo>
  extractProfile(tab: Tab): AsyncGenerator<VideoInfo>
}

interface VideoInfo {
  id: string
  title: string
  thumbnail: string
  qualities: { label: string; url: string; type: 'mp4' | 'dash' }[]
  platform: 'facebook' | 'instagram' | 'tiktok'
  sourceUrl: string
}
```

### Facebook
- Intercept GraphQL responses (`/graphql`) để lấy `video_url` và `dash_manifest`
- Profile: scroll trang `/username/reels`, collect từ GraphQL pagination

### Instagram
- Tương tự Facebook — cùng Meta infrastructure, cùng GraphQL pattern
- Profile: scroll trang `/username/reels/`

### TikTok
- Intercept response từ `/api/item/detail`, lấy `play_addr` (no-watermark URL)
- Profile: scroll trang `/@username/video` hoặc dedicated reels tab

---

## Download Queue

```
PENDING → DOWNLOADING → [MERGING] → DONE
                                  ↘ ERROR (retry tối đa 2 lần)
```

```typescript
interface DownloadJob {
  id: string
  videoInfo: VideoInfo
  selectedQuality: string
  status: 'pending' | 'downloading' | 'merging' | 'done' | 'error'
  progress: number  // 0-100
  error?: string
  retryCount: number
}
```

- **MP4 trực tiếp**: fetch → `chrome.downloads.download()`
- **DASH**: fetch video track + audio track song song → ffmpeg.wasm merge → download MP4
- **Concurrency**: mặc định 3, có thể chỉnh trong Settings

---

## UI

### Floating Panel (profile reels page)
- Tự động scroll xuống, hiện "Đang tìm... (47 reels)"
- Danh sách thumbnail + checkbox + quality selector per item
- Nút "Select All" và "Download Selected"

### Download Button (single reel)
- Nút nhỏ overlay góc dưới phải của video
- Click → dropdown chọn quality → download ngay

### Side Panel
- Tab Queue: danh sách jobs với progress bar, status icon
- Tab History: lịch sử download, có thể xóa từng mục
- Tab Settings: concurrency slider, default quality dropdown

---

## Tech Stack

| Thành phần | Lựa chọn | Lý do |
|---|---|---|
| Language | TypeScript | Type safety, dễ maintain |
| Build | Vite + CRXJS | HMR khi dev, bundle tốt cho extension |
| UI | Preact + Tailwind | Nhẹ (~3KB), đủ dùng cho overlay + panel |
| Video merge | ffmpeg.wasm | Chạy trong browser, không cần server |
| Storage | chrome.storage.local | Built-in, đủ cho history + settings |

---

## Permissions (manifest.json)

```json
{
  "manifest_version": 3,
  "permissions": ["webRequest", "storage", "sidePanel", "downloads"],
  "host_permissions": [
    "*://*.facebook.com/*",
    "*://*.instagram.com/*",
    "*://*.tiktok.com/*",
    "*://*.fbcdn.net/*",
    "*://*.cdninstagram.com/*"
  ]
}
```

---

## Các điểm cần lưu ý khi implement

1. **ffmpeg.wasm bundle size** (~30MB) — lazy load chỉ khi cần merge DASH, không load khi chỉ có MP4 trực tiếp
2. **GraphQL schema thay đổi** — FB/IG có thể update response format, cần log raw response khi debug
3. **Rate limiting** — khi bulk download, delay nhỏ giữa các scroll request để tránh bị block
4. **CORS** — video CDN URLs thường có CORS headers cho phép fetch trực tiếp từ browser
