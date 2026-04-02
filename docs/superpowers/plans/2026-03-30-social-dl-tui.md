# Social-DL TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CLI tool có TUI thân thiện, wrap yt-dlp + ffmpeg, tự động tải dependencies lần đầu, user chỉ cần paste link và chọn chất lượng.

**Architecture:** Go binary thuần (CGO_ENABLED=0) với bubbletea TUI. Lần đầu chạy sẽ tự tải yt-dlp + ffmpeg về app data dir. Gọi yt-dlp subprocess để extract metadata (`-j`) và download (`--progress-template` JSON). Multi-view TUI: Home (paste URL) → Info (chọn quality) → Download (progress bar) → Done.

**Tech Stack:** Go 1.23+, bubbletea (TUI framework), bubbles (components), lipgloss (styling), yt-dlp + ffmpeg (external binaries)

---

## Cấu trúc file

```
social-dl/
├── cmd/
│   └── social-dl/
│       └── main.go              # Entry point, khởi tạo TUI
├── internal/
│   ├── deps/
│   │   ├── platform.go          # Detect OS/arch, map download URLs
│   │   ├── download.go          # Tải binary với progress callback
│   │   └── ensure.go            # Check + tải yt-dlp, ffmpeg nếu thiếu
│   ├── ytdlp/
│   │   ├── metadata.go          # Gọi yt-dlp -j, parse JSON metadata
│   │   ├── download.go          # Gọi yt-dlp download, parse progress
│   │   └── types.go             # Struct cho metadata, format, progress
│   └── tui/
│       ├── app.go               # Top-level model, view routing
│       ├── home.go              # Home view: paste URL input
│       ├── setup.go             # Setup view: tải deps lần đầu
│       ├── info.go              # Info view: hiển thị video + chọn quality
│       ├── progress.go          # Progress view: download progress bar
│       ├── history.go           # History view: danh sách đã tải
│       └── styles.go            # Lipgloss styles dùng chung
├── go.mod
├── go.sum
├── Makefile
└── .goreleaser.yaml
```

---

## Task 1: Khởi tạo Go module + dependencies

**Files:**
- Create: `go.mod`
- Create: `cmd/social-dl/main.go`
- Create: `Makefile`

- [ ] **Step 1: Init Go module**

```bash
cd /Users/longdao/Projects/social-dl
go mod init github.com/lngdao/social-dl
```

- [ ] **Step 2: Cài dependencies**

```bash
go get github.com/charmbracelet/bubbletea@latest
go get github.com/charmbracelet/bubbles@latest
go get github.com/charmbracelet/lipgloss@latest
```

- [ ] **Step 3: Tạo main.go minimal**

```go
// cmd/social-dl/main.go
package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
)

type model struct{}

func (m model) Init() tea.Cmd                           { return nil }
func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) { return m, nil }
func (m model) View() string                            { return "Social-DL v0.1.0\n" }

func main() {
	if _, err := tea.NewProgram(model{}).Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
```

- [ ] **Step 4: Tạo Makefile**

```makefile
# Makefile
APP_NAME := social-dl
BUILD_DIR := dist

.PHONY: build run clean

build:
	go build -o $(BUILD_DIR)/$(APP_NAME) ./cmd/social-dl

run:
	go run ./cmd/social-dl

clean:
	rm -rf $(BUILD_DIR)
```

- [ ] **Step 5: Verify build + run**

```bash
make run
```

Expected: Hiển thị "Social-DL v0.1.0" rồi thoát (nhấn ctrl+c).

- [ ] **Step 6: Commit**

```bash
git init
git add .
git commit -m "init: go module with bubbletea skeleton"
```

---

## Task 2: Platform detection + binary URLs (`internal/deps`)

**Files:**
- Create: `internal/deps/platform.go`
- Create: `internal/deps/platform_test.go`

- [ ] **Step 1: Viết test cho platform detection**

```go
// internal/deps/platform_test.go
package deps

import (
	"runtime"
	"testing"
)

func TestCurrentPlatform(t *testing.T) {
	p := CurrentPlatform()
	if p.OS != runtime.GOOS {
		t.Errorf("expected OS %s, got %s", runtime.GOOS, p.OS)
	}
	if p.Arch != runtime.GOARCH {
		t.Errorf("expected Arch %s, got %s", runtime.GOARCH, p.Arch)
	}
}

func TestYtDlpURL_Darwin(t *testing.T) {
	p := Platform{OS: "darwin", Arch: "arm64"}
	url, name, err := p.YtDlpURL()
	if err != nil {
		t.Fatal(err)
	}
	if name != "yt-dlp" {
		t.Errorf("expected name yt-dlp, got %s", name)
	}
	if url != "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" {
		t.Errorf("unexpected url: %s", url)
	}
}

func TestYtDlpURL_Windows(t *testing.T) {
	p := Platform{OS: "windows", Arch: "amd64"}
	url, name, err := p.YtDlpURL()
	if err != nil {
		t.Fatal(err)
	}
	if name != "yt-dlp.exe" {
		t.Errorf("expected name yt-dlp.exe, got %s", name)
	}
	if url == "" {
		t.Error("url should not be empty")
	}
}

func TestYtDlpURL_Unsupported(t *testing.T) {
	p := Platform{OS: "freebsd", Arch: "mips"}
	_, _, err := p.YtDlpURL()
	if err == nil {
		t.Error("expected error for unsupported platform")
	}
}

func TestFfmpegURLs(t *testing.T) {
	cases := []struct {
		os, arch    string
		wantSuffix  string
	}{
		{"darwin", "arm64", "darwin-arm64"},
		{"darwin", "amd64", "darwin-x64"},
		{"linux", "amd64", "linux-x64"},
		{"windows", "amd64", "win32-x64"},
	}
	for _, tc := range cases {
		p := Platform{OS: tc.os, Arch: tc.arch}
		ffURL, fpURL, _, _, err := p.FfmpegURLs()
		if err != nil {
			t.Errorf("%s/%s: %v", tc.os, tc.arch, err)
			continue
		}
		if ffURL == "" || fpURL == "" {
			t.Errorf("%s/%s: empty URLs", tc.os, tc.arch)
		}
	}
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

```bash
go test ./internal/deps/ -v
```

Expected: FAIL — package chưa tồn tại.

- [ ] **Step 3: Implement platform.go**

```go
// internal/deps/platform.go
package deps

import (
	"fmt"
	"runtime"
)

type Platform struct {
	OS   string // "darwin", "linux", "windows"
	Arch string // "amd64", "arm64"
}

func CurrentPlatform() Platform {
	return Platform{OS: runtime.GOOS, Arch: runtime.GOARCH}
}

func (p Platform) YtDlpURL() (url, binName string, err error) {
	const base = "https://github.com/yt-dlp/yt-dlp/releases/latest/download"
	switch {
	case p.OS == "darwin":
		return base + "/yt-dlp_macos", "yt-dlp", nil
	case p.OS == "linux" && p.Arch == "amd64":
		return base + "/yt-dlp_linux", "yt-dlp", nil
	case p.OS == "linux" && p.Arch == "arm64":
		return base + "/yt-dlp_linux_aarch64", "yt-dlp", nil
	case p.OS == "windows" && p.Arch == "amd64":
		return base + "/yt-dlp.exe", "yt-dlp.exe", nil
	default:
		return "", "", fmt.Errorf("unsupported platform: %s/%s", p.OS, p.Arch)
	}
}

func (p Platform) FfmpegURLs() (ffmpegURL, ffprobeURL, ffmpegName, ffprobeName string, err error) {
	const base = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1"

	var key string
	switch {
	case p.OS == "darwin" && p.Arch == "arm64":
		key = "darwin-arm64"
	case p.OS == "darwin" && p.Arch == "amd64":
		key = "darwin-x64"
	case p.OS == "linux" && p.Arch == "amd64":
		key = "linux-x64"
	case p.OS == "linux" && p.Arch == "arm64":
		key = "linux-arm64"
	case p.OS == "windows" && p.Arch == "amd64":
		key = "win32-x64"
	default:
		return "", "", "", "", fmt.Errorf("unsupported platform: %s/%s", p.OS, p.Arch)
	}

	ext := ""
	if p.OS == "windows" {
		ext = ".exe"
	}

	ffmpegName = "ffmpeg" + ext
	ffprobeName = "ffprobe" + ext
	ffmpegURL = fmt.Sprintf("%s/ffmpeg-%s", base, key)
	ffprobeURL = fmt.Sprintf("%s/ffprobe-%s", base, key)
	return
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

```bash
go test ./internal/deps/ -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/deps/
git commit -m "feat(deps): platform detection and binary URL mapping"
```

---

## Task 3: Tải binary với progress (`internal/deps/download.go` + `ensure.go`)

**Files:**
- Create: `internal/deps/download.go`
- Create: `internal/deps/ensure.go`

- [ ] **Step 1: Implement download.go — tải file với progress callback**

```go
// internal/deps/download.go
package deps

import (
	"fmt"
	"io"
	"net/http"
	"os"
)

// ProgressFunc nhận (bytes đã tải, tổng bytes). total có thể = 0 nếu server không gửi Content-Length.
type ProgressFunc func(downloaded, total int64)

// DownloadFile tải URL về destPath với progress callback.
// Ghi ra file .tmp trước, rename khi xong (atomic).
func DownloadFile(url, destPath string, onProgress ProgressFunc) error {
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d for %s", resp.StatusCode, url)
	}

	total := resp.ContentLength

	tmpPath := destPath + ".tmp"
	f, err := os.Create(tmpPath)
	if err != nil {
		return err
	}
	defer func() {
		f.Close()
		os.Remove(tmpPath) // cleanup nếu chưa rename
	}()

	var downloaded int64
	buf := make([]byte, 32*1024)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, wErr := f.Write(buf[:n]); wErr != nil {
				return wErr
			}
			downloaded += int64(n)
			if onProgress != nil {
				onProgress(downloaded, total)
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return readErr
		}
	}

	f.Close()
	return os.Rename(tmpPath, destPath)
}
```

- [ ] **Step 2: Implement ensure.go — check + tải yt-dlp, ffmpeg nếu thiếu**

```go
// internal/deps/ensure.go
package deps

import (
	"os"
	"path/filepath"
	"runtime"
)

const appName = "social-dl"

// BinDir trả về thư mục chứa binary dependencies.
//   - macOS:   ~/Library/Application Support/social-dl/bin
//   - Linux:   $XDG_DATA_HOME/social-dl/bin (default ~/.local/share/social-dl/bin)
//   - Windows: %LOCALAPPDATA%\social-dl\bin
func BinDir() (string, error) {
	var base string
	switch runtime.GOOS {
	case "darwin":
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, "Library", "Application Support")
	case "linux":
		if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
			base = xdg
		} else {
			home, _ := os.UserHomeDir()
			base = filepath.Join(home, ".local", "share")
		}
	case "windows":
		base = os.Getenv("LOCALAPPDATA")
	}
	dir := filepath.Join(base, appName, "bin")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return dir, nil
}

// Paths chứa đường dẫn tuyệt đối tới các binary.
type Paths struct {
	YtDlp   string
	Ffmpeg  string
	Ffprobe string
	BinDir  string
}

// Status cho biết cần tải gì.
type Status struct {
	NeedYtDlp   bool
	NeedFfmpeg  bool
	NeedFfprobe bool
}

// Check kiểm tra binary nào đã có, binary nào cần tải.
func Check() (Paths, Status, error) {
	p := CurrentPlatform()
	binDir, err := BinDir()
	if err != nil {
		return Paths{}, Status{}, err
	}

	ext := ""
	if p.OS == "windows" {
		ext = ".exe"
	}

	paths := Paths{
		YtDlp:   filepath.Join(binDir, "yt-dlp"+ext),
		Ffmpeg:  filepath.Join(binDir, "ffmpeg"+ext),
		Ffprobe: filepath.Join(binDir, "ffprobe"+ext),
		BinDir:  binDir,
	}

	status := Status{
		NeedYtDlp:   !fileExists(paths.YtDlp),
		NeedFfmpeg:  !fileExists(paths.Ffmpeg),
		NeedFfprobe: !fileExists(paths.Ffprobe),
	}

	return paths, status, nil
}

// NeedsSetup trả true nếu cần tải ít nhất 1 binary.
func (s Status) NeedsSetup() bool {
	return s.NeedYtDlp || s.NeedFfmpeg || s.NeedFfprobe
}

// EnsureAll tải tất cả binary còn thiếu. onProgress gọi cho mỗi file đang tải.
func EnsureAll(paths Paths, status Status, onFileStart func(name string), onProgress ProgressFunc) error {
	p := CurrentPlatform()

	if status.NeedYtDlp {
		url, _, err := p.YtDlpURL()
		if err != nil {
			return err
		}
		if onFileStart != nil {
			onFileStart("yt-dlp")
		}
		if err := DownloadFile(url, paths.YtDlp, onProgress); err != nil {
			return err
		}
		os.Chmod(paths.YtDlp, 0755)
	}

	if status.NeedFfmpeg || status.NeedFfprobe {
		ffURL, fpURL, _, _, err := p.FfmpegURLs()
		if err != nil {
			return err
		}
		if status.NeedFfmpeg {
			if onFileStart != nil {
				onFileStart("ffmpeg")
			}
			if err := DownloadFile(ffURL, paths.Ffmpeg, onProgress); err != nil {
				return err
			}
			os.Chmod(paths.Ffmpeg, 0755)
		}
		if status.NeedFfprobe {
			if onFileStart != nil {
				onFileStart("ffprobe")
			}
			if err := DownloadFile(fpURL, paths.Ffprobe, onProgress); err != nil {
				return err
			}
			os.Chmod(paths.Ffprobe, 0755)
		}
	}

	return nil
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
```

- [ ] **Step 3: Verify compile**

```bash
go build ./internal/deps/
```

Expected: Không lỗi.

- [ ] **Step 4: Commit**

```bash
git add internal/deps/
git commit -m "feat(deps): download binaries with progress + ensure logic"
```

---

## Task 4: yt-dlp wrapper — types + metadata (`internal/ytdlp`)

**Files:**
- Create: `internal/ytdlp/types.go`
- Create: `internal/ytdlp/metadata.go`
- Create: `internal/ytdlp/metadata_test.go`

- [ ] **Step 1: Định nghĩa types**

```go
// internal/ytdlp/types.go
package ytdlp

// VideoMeta là metadata trả về từ yt-dlp -j.
type VideoMeta struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Thumbnail   string   `json:"thumbnail"`
	Duration    float64  `json:"duration"`
	Uploader    string   `json:"uploader"`
	WebpageURL  string   `json:"webpage_url"`
	Extractor   string   `json:"extractor"`
	Formats     []Format `json:"formats"`
}

// Format là 1 stream có sẵn (video-only, audio-only, hoặc muxed).
type Format struct {
	FormatID   string  `json:"format_id"`
	Ext        string  `json:"ext"`
	Width      int     `json:"width"`
	Height     int     `json:"height"`
	FPS        float64 `json:"fps"`
	VCodec     string  `json:"vcodec"`
	ACodec     string  `json:"acodec"`
	FileSizeApprox int64 `json:"filesize_approx"`
	FormatNote string  `json:"format_note"`
	URL        string  `json:"url"`
}

// Quality là lựa chọn chất lượng đã lọc, hiển thị cho user.
type Quality struct {
	Label      string // "1080p", "720p", "480p", "audio-only"
	FormatSpec string // "-f" argument cho yt-dlp, vd: "bestvideo[height<=1080]+bestaudio/best"
	FileSize   string // estimated size, vd: "~50MB"
}

// Progress là trạng thái download real-time.
type Progress struct {
	Status  string  // "downloading", "finished", "error"
	Percent float64 // 0-100
	Speed   string  // "5.2MiB/s"
	ETA     string  // "00:23"
}
```

- [ ] **Step 2: Viết test cho ExtractQualities (parse formats thành danh sách quality)**

```go
// internal/ytdlp/metadata_test.go
package ytdlp

import (
	"testing"
)

func TestExtractQualities(t *testing.T) {
	meta := &VideoMeta{
		Formats: []Format{
			{FormatID: "18", Width: 640, Height: 360, VCodec: "avc1", ACodec: "mp4a", FormatNote: "360p"},
			{FormatID: "22", Width: 1280, Height: 720, VCodec: "avc1", ACodec: "mp4a", FormatNote: "720p"},
			{FormatID: "137", Width: 1920, Height: 1080, VCodec: "avc1", ACodec: "none", FormatNote: "1080p"},
			{FormatID: "140", Width: 0, Height: 0, VCodec: "none", ACodec: "mp4a", FormatNote: "m4a"},
		},
	}

	qualities := ExtractQualities(meta)

	if len(qualities) < 2 {
		t.Fatalf("expected at least 2 qualities, got %d", len(qualities))
	}

	// Phải có "best" option ở đầu
	if qualities[0].Label != "Best" {
		t.Errorf("first quality should be 'Best', got %s", qualities[0].Label)
	}
}

func TestExtractQualities_Empty(t *testing.T) {
	meta := &VideoMeta{Formats: []Format{}}
	qualities := ExtractQualities(meta)
	// Luôn có ít nhất "Best" option
	if len(qualities) < 1 {
		t.Fatal("expected at least 1 quality")
	}
}
```

- [ ] **Step 3: Chạy test, xác nhận fail**

```bash
go test ./internal/ytdlp/ -v
```

- [ ] **Step 4: Implement metadata.go**

```go
// internal/ytdlp/metadata.go
package ytdlp

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"sort"
	"strings"
)

// FetchMeta gọi yt-dlp -j để lấy metadata video.
func FetchMeta(ctx context.Context, ytdlpPath, url string) (*VideoMeta, error) {
	cmd := exec.CommandContext(ctx, ytdlpPath, "-j", "--no-warnings", "--no-playlist", url)
	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("yt-dlp error: %s", string(exitErr.Stderr))
		}
		return nil, fmt.Errorf("yt-dlp exec: %w", err)
	}

	var meta VideoMeta
	if err := json.Unmarshal(out, &meta); err != nil {
		return nil, fmt.Errorf("parse metadata: %w", err)
	}
	return &meta, nil
}

// ExtractQualities lọc formats thành danh sách quality cho user chọn.
func ExtractQualities(meta *VideoMeta) []Quality {
	qualities := []Quality{
		{Label: "Best", FormatSpec: "bestvideo*+bestaudio/best"},
	}

	// Thu thập các resolution duy nhất có video
	seen := map[int]bool{}
	var heights []int
	for _, f := range meta.Formats {
		if f.Height > 0 && !seen[f.Height] && hasVideo(f) {
			seen[f.Height] = true
			heights = append(heights, f.Height)
		}
	}

	sort.Sort(sort.Reverse(sort.IntSlice(heights)))

	for _, h := range heights {
		label := fmt.Sprintf("%dp", h)
		spec := fmt.Sprintf("bestvideo[height<=%d]+bestaudio/best[height<=%d]", h, h)
		qualities = append(qualities, Quality{Label: label, FormatSpec: spec})
	}

	return qualities
}

func hasVideo(f Format) bool {
	return f.VCodec != "" && f.VCodec != "none"
}
```

- [ ] **Step 5: Chạy test, xác nhận pass**

```bash
go test ./internal/ytdlp/ -v
```

- [ ] **Step 6: Commit**

```bash
git add internal/ytdlp/
git commit -m "feat(ytdlp): metadata extraction and quality parsing"
```

---

## Task 5: yt-dlp wrapper — download với progress (`internal/ytdlp/download.go`)

**Files:**
- Create: `internal/ytdlp/download.go`

- [ ] **Step 1: Implement download.go**

```go
// internal/ytdlp/download.go
package ytdlp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

// DownloadOpts cấu hình cho 1 lần download.
type DownloadOpts struct {
	YtDlpPath  string
	FfmpegDir  string
	URL        string
	FormatSpec string
	OutputDir  string
	CookieFile string // optional, path tới cookies.txt
}

// Download chạy yt-dlp download, stream progress qua callback.
// Trả về đường dẫn file đã tải.
func Download(ctx context.Context, opts DownloadOpts, onProgress func(Progress)) (string, error) {
	args := []string{
		"-f", opts.FormatSpec,
		"--merge-output-format", "mp4",
		"--ffmpeg-location", opts.FfmpegDir,
		"-o", fmt.Sprintf("%s/%%(title).80s [%%(id)s].%%(ext)s", opts.OutputDir),
		"--newline",
		"--progress-template", `download:{"status":"%(progress.status)s","percent":"%(progress._percent_str)s","speed":"%(progress._speed_str)s","eta":"%(progress._eta_str)s"}`,
		"--no-warnings",
		"--no-playlist",
	}

	if opts.CookieFile != "" {
		args = append(args, "--cookies", opts.CookieFile)
	}

	args = append(args, opts.URL)

	cmd := exec.CommandContext(ctx, opts.YtDlpPath, args...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	cmd.Stderr = cmd.Stdout // merge stderr vào stdout

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("start yt-dlp: %w", err)
	}

	scanner := bufio.NewScanner(stdout)
	var lastFile string
	for scanner.Scan() {
		line := scanner.Text()

		// Parse progress JSON lines (bắt đầu bằng "download:")
		if strings.HasPrefix(line, "download:") {
			jsonStr := strings.TrimPrefix(line, "download:")
			var raw struct {
				Status  string `json:"status"`
				Percent string `json:"percent"`
				Speed   string `json:"speed"`
				ETA     string `json:"eta"`
			}
			if json.Unmarshal([]byte(jsonStr), &raw) == nil && onProgress != nil {
				pct := parsePercent(raw.Percent)
				onProgress(Progress{
					Status:  raw.Status,
					Percent: pct,
					Speed:   raw.Speed,
					ETA:     raw.ETA,
				})
			}
		}

		// Detect output filename từ "[Merger]" hoặc "[download] Destination:"
		if strings.Contains(line, "Destination:") {
			parts := strings.SplitN(line, "Destination:", 2)
			if len(parts) == 2 {
				lastFile = strings.TrimSpace(parts[1])
			}
		}
		if strings.Contains(line, "[Merger] Merging formats into") {
			parts := strings.SplitN(line, "into \"", 2)
			if len(parts) == 2 {
				lastFile = strings.TrimSuffix(strings.TrimSpace(parts[1]), "\"")
			}
		}
	}

	if err := cmd.Wait(); err != nil {
		return "", fmt.Errorf("yt-dlp exited: %w", err)
	}

	if onProgress != nil {
		onProgress(Progress{Status: "finished", Percent: 100})
	}

	return lastFile, nil
}

// parsePercent parse "45.2%" thành 45.2
func parsePercent(s string) float64 {
	s = strings.TrimSpace(s)
	s = strings.TrimSuffix(s, "%")
	v, _ := strconv.ParseFloat(s, 64)
	return v
}
```

- [ ] **Step 2: Verify compile**

```bash
go build ./internal/ytdlp/
```

- [ ] **Step 3: Commit**

```bash
git add internal/ytdlp/download.go
git commit -m "feat(ytdlp): download with progress streaming"
```

---

## Task 6: TUI styles (`internal/tui/styles.go`)

**Files:**
- Create: `internal/tui/styles.go`

- [ ] **Step 1: Implement styles dùng chung**

```go
// internal/tui/styles.go
package tui

import "github.com/charmbracelet/lipgloss"

var (
	// Màu chủ đạo
	colorPrimary   = lipgloss.Color("#7C3AED") // tím
	colorSecondary = lipgloss.Color("#06B6D4") // cyan
	colorSuccess   = lipgloss.Color("#10B981") // xanh lá
	colorError     = lipgloss.Color("#EF4444") // đỏ
	colorMuted     = lipgloss.Color("#6B7280") // xám
	colorText      = lipgloss.Color("#F9FAFB") // trắng

	// Styles
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(colorPrimary).
			MarginBottom(1)

	subtitleStyle = lipgloss.NewStyle().
			Foreground(colorMuted).
			Italic(true)

	boxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(colorPrimary).
			Padding(1, 2)

	successStyle = lipgloss.NewStyle().
			Foreground(colorSuccess).
			Bold(true)

	errorStyle = lipgloss.NewStyle().
			Foreground(colorError).
			Bold(true)

	mutedStyle = lipgloss.NewStyle().
			Foreground(colorMuted)

	helpStyle = lipgloss.NewStyle().
			Foreground(colorMuted).
			MarginTop(1)
)
```

- [ ] **Step 2: Commit**

```bash
git add internal/tui/styles.go
git commit -m "feat(tui): shared lipgloss styles"
```

---

## Task 7: TUI setup view — tải deps lần đầu (`internal/tui/setup.go`)

**Files:**
- Create: `internal/tui/setup.go`

- [ ] **Step 1: Implement setup view**

```go
// internal/tui/setup.go
package tui

import (
	"fmt"

	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/lngdao/social-dl/internal/deps"
)

// Messages
type setupDoneMsg struct{ paths deps.Paths }
type setupErrMsg struct{ err error }
type setupFileMsg struct{ name string }
type setupProgressMsg struct{ downloaded, total int64 }

type setupModel struct {
	spinner     spinner.Model
	progress    progress.Model
	currentFile string
	done        bool
	err         error
	paths       deps.Paths
	status      deps.Status
}

func newSetupModel(paths deps.Paths, status deps.Status) setupModel {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(colorPrimary)

	p := progress.New(
		progress.WithDefaultGradient(),
		progress.WithWidth(40),
	)

	return setupModel{
		spinner:  s,
		progress: p,
		paths:    paths,
		status:   status,
	}
}

func (m setupModel) Init() tea.Cmd {
	return tea.Batch(
		m.spinner.Tick,
		m.startDownload(),
	)
}

func (m setupModel) startDownload() tea.Cmd {
	paths := m.paths
	status := m.status
	return func() tea.Msg {
		err := deps.EnsureAll(paths, status,
			func(name string) {
				// Gửi message qua channel sẽ phức tạp; dùng đơn giản
			},
			nil,
		)
		if err != nil {
			return setupErrMsg{err: err}
		}
		return setupDoneMsg{paths: paths}
	}
}

func (m setupModel) Update(msg tea.Msg) (setupModel, tea.Cmd) {
	switch msg := msg.(type) {
	case setupDoneMsg:
		m.done = true
		m.paths = msg.paths
		return m, nil
	case setupErrMsg:
		m.err = msg.err
		return m, nil
	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd
	case progress.FrameMsg:
		model, cmd := m.progress.Update(msg)
		m.progress = model.(progress.Model)
		return m, cmd
	}
	return m, nil
}

func (m setupModel) View() string {
	if m.err != nil {
		return boxStyle.Render(
			titleStyle.Render("Setup Failed") + "\n\n" +
				errorStyle.Render(fmt.Sprintf("Lỗi: %v", m.err)) + "\n\n" +
				mutedStyle.Render("Kiểm tra kết nối mạng và thử lại."),
		)
	}
	if m.done {
		return boxStyle.Render(
			successStyle.Render("✓ Setup hoàn tất!") + "\n" +
				mutedStyle.Render("Đang khởi động..."),
		)
	}

	return boxStyle.Render(
		titleStyle.Render("Cài đặt lần đầu") + "\n\n" +
			m.spinner.View() + " Đang tải dependencies (yt-dlp, ffmpeg)...\n\n" +
			mutedStyle.Render("Chỉ cần tải 1 lần duy nhất."),
	)
}
```

- [ ] **Step 2: Verify compile**

```bash
go build ./internal/tui/
```

- [ ] **Step 3: Commit**

```bash
git add internal/tui/setup.go
git commit -m "feat(tui): setup view for first-run dependency download"
```

---

## Task 8: TUI home view — paste URL (`internal/tui/home.go`)

**Files:**
- Create: `internal/tui/home.go`

- [ ] **Step 1: Implement home view**

```go
// internal/tui/home.go
package tui

import (
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type submitURLMsg struct{ url string }

type homeModel struct {
	input textinput.Model
	err   string
	width int
}

func newHomeModel() homeModel {
	ti := textinput.New()
	ti.Placeholder = "Dán link video vào đây..."
	ti.Focus()
	ti.CharLimit = 500
	ti.Width = 60
	ti.PromptStyle = lipgloss.NewStyle().Foreground(colorPrimary)
	ti.TextStyle = lipgloss.NewStyle().Foreground(colorText)

	return homeModel{input: ti}
}

func (m homeModel) Init() tea.Cmd {
	return textinput.Blink
}

func (m homeModel) Update(msg tea.Msg) (homeModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			url := strings.TrimSpace(m.input.Value())
			if url == "" {
				m.err = "Vui lòng nhập link video"
				return m, nil
			}
			if !isValidURL(url) {
				m.err = "Link không hợp lệ. Hỗ trợ: Facebook, Instagram, TikTok, YouTube, ..."
				return m, nil
			}
			m.err = ""
			return m, func() tea.Msg { return submitURLMsg{url: url} }
		case "ctrl+v":
			// textinput tự handle paste
		}
	case tea.WindowSizeMsg:
		m.width = msg.Width
		w := msg.Width - 10
		if w > 80 {
			w = 80
		}
		if w < 30 {
			w = 30
		}
		m.input.Width = w
	}

	var cmd tea.Cmd
	m.input, cmd = m.input.Update(msg)
	return m, cmd
}

func (m homeModel) View() string {
	logo := lipgloss.NewStyle().
		Bold(true).
		Foreground(colorPrimary).
		Render("⬇ Social-DL")

	version := mutedStyle.Render("v0.1.0")

	header := logo + "  " + version + "\n"

	inputBox := boxStyle.Render(
		subtitleStyle.Render("Nhập link video:") + "\n\n" +
			m.input.View(),
	)

	errText := ""
	if m.err != "" {
		errText = "\n" + errorStyle.Render(m.err)
	}

	help := helpStyle.Render("enter: tải  •  h: lịch sử  •  q: thoát")

	return header + "\n" + inputBox + errText + "\n" + help
}

func isValidURL(s string) bool {
	s = strings.ToLower(s)
	return strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://")
}
```

- [ ] **Step 2: Verify compile**

```bash
go build ./internal/tui/
```

- [ ] **Step 3: Commit**

```bash
git add internal/tui/home.go
git commit -m "feat(tui): home view with URL input"
```

---

## Task 9: TUI info view — hiển thị video + chọn quality (`internal/tui/info.go`)

**Files:**
- Create: `internal/tui/info.go`

- [ ] **Step 1: Implement info view**

```go
// internal/tui/info.go
package tui

import (
	"fmt"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/lngdao/social-dl/internal/ytdlp"
)

// Messages
type metaFetchedMsg struct{ meta *ytdlp.VideoMeta }
type metaErrorMsg struct{ err error }
type startDownloadMsg struct {
	meta    *ytdlp.VideoMeta
	quality ytdlp.Quality
}

type infoModel struct {
	spinner   spinner.Model
	url       string
	meta      *ytdlp.VideoMeta
	qualities []ytdlp.Quality
	cursor    int
	loading   bool
	err       error
}

func newInfoModel(url string) infoModel {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(colorPrimary)

	return infoModel{
		spinner: s,
		url:     url,
		loading: true,
	}
}

func (m infoModel) Init() tea.Cmd {
	return m.spinner.Tick
}

func (m infoModel) Update(msg tea.Msg) (infoModel, tea.Cmd) {
	switch msg := msg.(type) {
	case metaFetchedMsg:
		m.loading = false
		m.meta = msg.meta
		m.qualities = ytdlp.ExtractQualities(msg.meta)
		return m, nil

	case metaErrorMsg:
		m.loading = false
		m.err = msg.err
		return m, nil

	case tea.KeyMsg:
		if m.loading {
			return m, nil
		}
		switch msg.String() {
		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
			}
		case "down", "j":
			if m.cursor < len(m.qualities)-1 {
				m.cursor++
			}
		case "enter":
			if m.meta != nil && len(m.qualities) > 0 {
				return m, func() tea.Msg {
					return startDownloadMsg{
						meta:    m.meta,
						quality: m.qualities[m.cursor],
					}
				}
			}
		}

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd
	}

	return m, nil
}

func (m infoModel) View() string {
	if m.loading {
		return boxStyle.Render(
			m.spinner.View() + " Đang lấy thông tin video...\n\n" +
				mutedStyle.Render(m.url),
		)
	}

	if m.err != nil {
		return boxStyle.Render(
			errorStyle.Render("Lỗi: "+m.err.Error()) + "\n\n" +
				mutedStyle.Render(m.url) + "\n\n" +
				helpStyle.Render("esc: quay lại"),
		)
	}

	// Video info
	title := titleStyle.Render(truncate(m.meta.Title, 60))
	uploader := mutedStyle.Render(m.meta.Uploader)
	duration := mutedStyle.Render(formatDuration(m.meta.Duration))
	extractor := lipgloss.NewStyle().
		Foreground(colorSecondary).
		Render("[" + m.meta.Extractor + "]")

	info := title + "\n" + uploader + "  " + duration + "  " + extractor

	// Quality list
	qualityList := subtitleStyle.Render("Chọn chất lượng:") + "\n\n"
	for i, q := range m.qualities {
		cursor := "  "
		style := lipgloss.NewStyle().Foreground(colorText)
		if i == m.cursor {
			cursor = lipgloss.NewStyle().Foreground(colorPrimary).Render("▸ ")
			style = style.Bold(true).Foreground(colorPrimary)
		}
		qualityList += cursor + style.Render(q.Label) + "\n"
	}

	help := helpStyle.Render("↑↓: chọn  •  enter: tải  •  esc: quay lại")

	return boxStyle.Render(info) + "\n\n" + qualityList + "\n" + help
}

func truncate(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max-1]) + "…"
}

func formatDuration(seconds float64) string {
	total := int(seconds)
	h := total / 3600
	m := (total % 3600) / 60
	s := total % 60
	if h > 0 {
		return fmt.Sprintf("%d:%02d:%02d", h, m, s)
	}
	return fmt.Sprintf("%d:%02d", m, s)
}
```

- [ ] **Step 2: Verify compile**

```bash
go build ./internal/tui/
```

- [ ] **Step 3: Commit**

```bash
git add internal/tui/info.go
git commit -m "feat(tui): info view with quality selection"
```

---

## Task 10: TUI progress view — download progress (`internal/tui/progress.go`)

**Files:**
- Create: `internal/tui/progress.go`

- [ ] **Step 1: Implement progress view**

```go
// internal/tui/progress.go
package tui

import (
	"fmt"

	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/lngdao/social-dl/internal/ytdlp"
)

// Messages
type downloadProgressMsg struct{ progress ytdlp.Progress }
type downloadDoneMsg struct{ filePath string }
type downloadErrorMsg struct{ err error }

type progressModel struct {
	spinner     spinner.Model
	progressBar progress.Model
	title       string
	percent     float64
	speed       string
	eta         string
	status      string // "downloading", "merging", "finished", "error"
	filePath    string
	err         error
}

func newProgressModel(title string) progressModel {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(colorPrimary)

	p := progress.New(
		progress.WithDefaultGradient(),
		progress.WithWidth(50),
	)

	return progressModel{
		spinner:     s,
		progressBar: p,
		title:       title,
		status:      "downloading",
	}
}

func (m progressModel) Init() tea.Cmd {
	return m.spinner.Tick
}

func (m progressModel) Update(msg tea.Msg) (progressModel, tea.Cmd) {
	switch msg := msg.(type) {
	case downloadProgressMsg:
		m.percent = msg.progress.Percent / 100
		m.speed = msg.progress.Speed
		m.eta = msg.progress.ETA
		if msg.progress.Status == "finished" {
			m.status = "merging"
		}
		return m, nil

	case downloadDoneMsg:
		m.status = "finished"
		m.percent = 1
		m.filePath = msg.filePath
		return m, nil

	case downloadErrorMsg:
		m.status = "error"
		m.err = msg.err
		return m, nil

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd

	case progress.FrameMsg:
		model, cmd := m.progressBar.Update(msg)
		m.progressBar = model.(progress.Model)
		return m, cmd
	}

	return m, nil
}

func (m progressModel) View() string {
	switch m.status {
	case "finished":
		return boxStyle.Render(
			successStyle.Render("✓ Tải xong!") + "\n\n" +
				lipgloss.NewStyle().Foreground(colorText).Render(truncate(m.title, 50)) + "\n\n" +
				mutedStyle.Render("File: "+m.filePath) + "\n\n" +
				helpStyle.Render("enter: tải thêm  •  q: thoát"),
		)

	case "error":
		return boxStyle.Render(
			errorStyle.Render("✗ Lỗi tải video") + "\n\n" +
				mutedStyle.Render(fmt.Sprintf("%v", m.err)) + "\n\n" +
				helpStyle.Render("enter: thử lại  •  esc: quay lại"),
		)

	case "merging":
		return boxStyle.Render(
			titleStyle.Render(truncate(m.title, 50)) + "\n\n" +
				m.spinner.View() + " Đang ghép video + audio...\n\n" +
				mutedStyle.Render("ffmpeg đang xử lý, vui lòng chờ..."),
		)

	default: // downloading
		stats := ""
		if m.speed != "" && m.speed != "N/A" {
			stats += fmt.Sprintf("  %s", m.speed)
		}
		if m.eta != "" && m.eta != "N/A" {
			stats += fmt.Sprintf("  ETA: %s", m.eta)
		}

		return boxStyle.Render(
			titleStyle.Render(truncate(m.title, 50)) + "\n\n" +
				m.progressBar.ViewAs(m.percent) + "\n\n" +
				lipgloss.NewStyle().Foreground(colorSecondary).
					Render(fmt.Sprintf("%.1f%%", m.percent*100)) +
				mutedStyle.Render(stats),
		)
	}
}
```

- [ ] **Step 2: Verify compile**

```bash
go build ./internal/tui/
```

- [ ] **Step 3: Commit**

```bash
git add internal/tui/progress.go
git commit -m "feat(tui): progress view with download stats"
```

---

## Task 11: TUI history view (`internal/tui/history.go`)

**Files:**
- Create: `internal/tui/history.go`

- [ ] **Step 1: Implement history view**

History đơn giản, lưu vào JSON file trong app data dir.

```go
// internal/tui/history.go
package tui

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/lngdao/social-dl/internal/deps"
)

type HistoryEntry struct {
	Title      string    `json:"title"`
	URL        string    `json:"url"`
	FilePath   string    `json:"file_path"`
	Quality    string    `json:"quality"`
	Platform   string    `json:"platform"`
	DownloadAt time.Time `json:"download_at"`
}

type historyModel struct {
	entries []HistoryEntry
	cursor  int
	width   int
}

func newHistoryModel() historyModel {
	entries, _ := loadHistory()
	return historyModel{entries: entries}
}

func (m historyModel) Init() tea.Cmd { return nil }

func (m historyModel) Update(msg tea.Msg) (historyModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
			}
		case "down", "j":
			if m.cursor < len(m.entries)-1 {
				m.cursor++
			}
		}
	case tea.WindowSizeMsg:
		m.width = msg.Width
	}
	return m, nil
}

func (m historyModel) View() string {
	header := titleStyle.Render("Lịch sử tải") + "\n\n"

	if len(m.entries) == 0 {
		return boxStyle.Render(
			header + mutedStyle.Render("Chưa có video nào được tải.") + "\n\n" +
				helpStyle.Render("esc: quay lại"),
		)
	}

	list := ""
	// Hiển thị tối đa 15 entry gần nhất
	start := 0
	if len(m.entries) > 15 {
		start = len(m.entries) - 15
	}
	for i := len(m.entries) - 1; i >= start; i-- {
		e := m.entries[i]
		idx := len(m.entries) - 1 - i
		cursor := "  "
		style := lipgloss.NewStyle().Foreground(colorText)
		if idx == m.cursor {
			cursor = lipgloss.NewStyle().Foreground(colorPrimary).Render("▸ ")
			style = style.Foreground(colorPrimary)
		}

		timeStr := e.DownloadAt.Format("02/01 15:04")
		platform := lipgloss.NewStyle().Foreground(colorSecondary).Render("[" + e.Platform + "]")
		list += fmt.Sprintf("%s%s %s %s\n",
			cursor,
			style.Render(truncate(e.Title, 40)),
			platform,
			mutedStyle.Render(timeStr),
		)
	}

	help := helpStyle.Render("↑↓: di chuyển  •  esc: quay lại")
	return header + list + "\n" + help
}

// --- Persistence ---

func historyPath() string {
	dir, _ := deps.BinDir()
	return filepath.Join(filepath.Dir(dir), "history.json")
}

func loadHistory() ([]HistoryEntry, error) {
	data, err := os.ReadFile(historyPath())
	if err != nil {
		return nil, nil
	}
	var entries []HistoryEntry
	json.Unmarshal(data, &entries)
	return entries, nil
}

func SaveHistory(entry HistoryEntry) error {
	entries, _ := loadHistory()
	entries = append(entries, entry)
	// Giữ tối đa 100 entry
	if len(entries) > 100 {
		entries = entries[len(entries)-100:]
	}
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(historyPath(), data, 0644)
}
```

- [ ] **Step 2: Verify compile**

```bash
go build ./internal/tui/
```

- [ ] **Step 3: Commit**

```bash
git add internal/tui/history.go
git commit -m "feat(tui): history view with JSON persistence"
```

---

## Task 12: TUI app — kết nối tất cả views (`internal/tui/app.go`)

**Files:**
- Create: `internal/tui/app.go`

- [ ] **Step 1: Implement app.go — top-level model, view routing**

```go
// internal/tui/app.go
package tui

import (
	"context"
	"os"
	"path/filepath"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/lngdao/social-dl/internal/deps"
	"github.com/lngdao/social-dl/internal/ytdlp"
)

type viewState int

const (
	viewSetup viewState = iota
	viewHome
	viewInfo
	viewProgress
	viewHistory
)

type App struct {
	state    viewState
	setup    setupModel
	home     homeModel
	info     infoModel
	progress progressModel
	history  historyModel

	// Dependencies
	paths      deps.Paths
	needsSetup bool

	// State
	width, height int
	currentURL    string
}

func NewApp() (*App, error) {
	paths, status, err := deps.Check()
	if err != nil {
		return nil, err
	}

	app := &App{
		paths:      paths,
		needsSetup: status.NeedsSetup(),
	}

	if app.needsSetup {
		app.state = viewSetup
		app.setup = newSetupModel(paths, status)
	} else {
		app.state = viewHome
		app.home = newHomeModel()
	}

	return app, nil
}

func (a App) Init() tea.Cmd {
	switch a.state {
	case viewSetup:
		return a.setup.Init()
	case viewHome:
		return a.home.Init()
	}
	return nil
}

func (a App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	// Global keys
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return a, tea.Quit
		case "q":
			if a.state == viewHome || a.state == viewHistory {
				return a, tea.Quit
			}
		case "esc":
			switch a.state {
			case viewInfo, viewHistory:
				a.state = viewHome
				a.home = newHomeModel()
				return a, a.home.Init()
			case viewProgress:
				if a.progress.status == "finished" || a.progress.status == "error" {
					a.state = viewHome
					a.home = newHomeModel()
					return a, a.home.Init()
				}
			}
		case "h":
			if a.state == viewHome {
				a.state = viewHistory
				a.history = newHistoryModel()
				return a, a.history.Init()
			}
		}
	case tea.WindowSizeMsg:
		a.width = msg.Width
		a.height = msg.Height
	}

	// Delegate to active view
	switch a.state {
	case viewSetup:
		return a.updateSetup(msg)
	case viewHome:
		return a.updateHome(msg)
	case viewInfo:
		return a.updateInfo(msg)
	case viewProgress:
		return a.updateProgress(msg)
	case viewHistory:
		return a.updateHistory(msg)
	}

	return a, nil
}

func (a App) updateSetup(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	a.setup, cmd = a.setup.Update(msg)

	if a.setup.done {
		a.paths = a.setup.paths
		a.state = viewHome
		a.home = newHomeModel()
		return a, a.home.Init()
	}

	return a, cmd
}

func (a App) updateHome(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case submitURLMsg:
		a.currentURL = msg.url
		a.state = viewInfo
		a.info = newInfoModel(msg.url)
		return a, tea.Batch(a.info.Init(), a.fetchMeta(msg.url))
	}

	var cmd tea.Cmd
	a.home, cmd = a.home.Update(msg)
	return a, cmd
}

func (a App) updateInfo(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case startDownloadMsg:
		a.state = viewProgress
		a.progress = newProgressModel(msg.meta.Title)
		return a, tea.Batch(
			a.progress.Init(),
			a.startDownload(msg.meta, msg.quality),
		)
	}

	var cmd tea.Cmd
	a.info, cmd = a.info.Update(msg)
	return a, cmd
}

func (a App) updateProgress(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if msg.String() == "enter" {
			if a.progress.status == "finished" {
				a.state = viewHome
				a.home = newHomeModel()
				return a, a.home.Init()
			}
		}
	case downloadDoneMsg:
		// Lưu history
		SaveHistory(HistoryEntry{
			Title:      a.progress.title,
			URL:        a.currentURL,
			FilePath:   msg.filePath,
			Quality:    "",
			Platform:   "",
			DownloadAt: time.Now(),
		})
	}

	var cmd tea.Cmd
	a.progress, cmd = a.progress.Update(msg)
	return a, cmd
}

func (a App) updateHistory(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	a.history, cmd = a.history.Update(msg)
	return a, cmd
}

func (a App) View() string {
	switch a.state {
	case viewSetup:
		return a.setup.View()
	case viewHome:
		return a.home.View()
	case viewInfo:
		return a.info.View()
	case viewProgress:
		return a.progress.View()
	case viewHistory:
		return a.history.View()
	}
	return ""
}

// --- Commands ---

func (a App) fetchMeta(url string) tea.Cmd {
	ytdlpPath := a.paths.YtDlp
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		meta, err := ytdlp.FetchMeta(ctx, ytdlpPath, url)
		if err != nil {
			return metaErrorMsg{err: err}
		}
		return metaFetchedMsg{meta: meta}
	}
}

func (a App) startDownload(meta *ytdlp.VideoMeta, quality ytdlp.Quality) tea.Cmd {
	paths := a.paths
	url := a.currentURL
	return func() tea.Msg {
		// Output vào thư mục Downloads hoặc cwd
		outputDir := downloadDir()

		ctx := context.Background()
		filePath, err := ytdlp.Download(ctx, ytdlp.DownloadOpts{
			YtDlpPath:  paths.YtDlp,
			FfmpegDir:  paths.BinDir,
			URL:        url,
			FormatSpec: quality.FormatSpec,
			OutputDir:  outputDir,
		}, func(p ytdlp.Progress) {
			// TODO: gửi progress message qua tea.Program
			// Cần dùng p.Send() — sẽ xử lý ở step tiếp
		})
		if err != nil {
			return downloadErrorMsg{err: err}
		}
		return downloadDoneMsg{filePath: filePath}
	}
}

func downloadDir() string {
	home, _ := os.UserHomeDir()
	dl := filepath.Join(home, "Downloads")
	if info, err := os.Stat(dl); err == nil && info.IsDir() {
		return dl
	}
	dir, _ := os.Getwd()
	return dir
}
```

- [ ] **Step 2: Verify compile**

```bash
go build ./internal/tui/
```

- [ ] **Step 3: Commit**

```bash
git add internal/tui/app.go
git commit -m "feat(tui): app model connecting all views"
```

---

## Task 13: Kết nối progress streaming với TUI (dùng tea.Program.Send)

**Files:**
- Modify: `internal/tui/app.go`
- Modify: `cmd/social-dl/main.go`

`tea.Cmd` chạy trong goroutine không thể gửi message liên tục. Cần truyền `*tea.Program` vào để gọi `p.Send()`.

- [ ] **Step 1: Thêm field program vào App, inject sau khi tạo**

Trong `internal/tui/app.go`, thêm:

```go
// Thêm vào struct App:
type App struct {
	// ... existing fields ...
	program *tea.Program // set sau khi NewProgram()
}

// Thêm method:
func (a *App) SetProgram(p *tea.Program) {
	a.program = p
}
```

- [ ] **Step 2: Sửa startDownload để dùng p.Send cho progress**

Sửa method `startDownload` trong `app.go`:

```go
func (a App) startDownload(meta *ytdlp.VideoMeta, quality ytdlp.Quality) tea.Cmd {
	paths := a.paths
	url := a.currentURL
	program := a.program
	return func() tea.Msg {
		outputDir := downloadDir()

		ctx := context.Background()
		filePath, err := ytdlp.Download(ctx, ytdlp.DownloadOpts{
			YtDlpPath:  paths.YtDlp,
			FfmpegDir:  paths.BinDir,
			URL:        url,
			FormatSpec: quality.FormatSpec,
			OutputDir:  outputDir,
		}, func(p ytdlp.Progress) {
			if program != nil {
				program.Send(downloadProgressMsg{progress: p})
			}
		})
		if err != nil {
			return downloadErrorMsg{err: err}
		}
		return downloadDoneMsg{filePath: filePath}
	}
}
```

- [ ] **Step 3: Cập nhật main.go**

```go
// cmd/social-dl/main.go
package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/lngdao/social-dl/internal/tui"
)

func main() {
	app, err := tui.NewApp()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	p := tea.NewProgram(app, tea.WithAltScreen())
	app.SetProgram(p)

	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
```

- [ ] **Step 4: Build và test thủ công**

```bash
make build
./dist/social-dl
```

Expected: Lần đầu sẽ hiện setup screen tải yt-dlp + ffmpeg. Sau đó hiện home screen với text input.

- [ ] **Step 5: Commit**

```bash
git add cmd/social-dl/main.go internal/tui/app.go
git commit -m "feat: wire progress streaming via tea.Program.Send"
```

---

## Task 14: GoReleaser + Makefile cho cross-compile

**Files:**
- Create: `.goreleaser.yaml`
- Modify: `Makefile`

- [ ] **Step 1: Tạo .goreleaser.yaml**

```yaml
# .goreleaser.yaml
version: 2

project_name: social-dl

before:
  hooks:
    - go mod tidy

builds:
  - id: cli
    main: ./cmd/social-dl
    binary: social-dl
    env:
      - CGO_ENABLED=0
    goos:
      - darwin
      - linux
      - windows
    goarch:
      - amd64
      - arm64
    ignore:
      - goos: windows
        goarch: arm64
    ldflags:
      - -s -w
      - -X main.version={{.Version}}
      - -X main.commit={{.Commit}}

archives:
  - id: default
    formats:
      - tar.gz
    format_overrides:
      - goos: windows
        formats:
          - zip
    name_template: "{{ .ProjectName }}_{{ .Version }}_{{ .Os }}_{{ .Arch }}"

checksum:
  name_template: "checksums.txt"

changelog:
  sort: asc
  filters:
    exclude:
      - "^docs:"
      - "^test:"
```

- [ ] **Step 2: Cập nhật Makefile**

```makefile
APP_NAME := social-dl
BUILD_DIR := dist
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")

.PHONY: build run clean release-snapshot

build:
	CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$(VERSION)" -o $(BUILD_DIR)/$(APP_NAME) ./cmd/social-dl

run:
	go run ./cmd/social-dl

test:
	go test ./... -v

clean:
	rm -rf $(BUILD_DIR)

release-snapshot:
	goreleaser release --snapshot --clean
```

- [ ] **Step 3: Verify build**

```bash
make build
file dist/social-dl
```

- [ ] **Step 4: Commit**

```bash
git add .goreleaser.yaml Makefile
git commit -m "build: goreleaser config and Makefile improvements"
```

---

## Tóm tắt luồng hoạt động

```
User mở social-dl
  ↓
[Lần đầu] Setup view → tải yt-dlp + ffmpeg (~80MB)
  ↓
Home view → User paste link video
  ↓
Info view → spinner → hiện title/uploader/duration + danh sách quality
  ↓
User chọn quality, nhấn Enter
  ↓
Progress view → progress bar + speed + ETA
  ↓ (yt-dlp tải + ffmpeg merge tự động)
Done → file lưu vào ~/Downloads
  ↓
User nhấn Enter → quay lại Home, paste link tiếp
```

Platforms hỗ trợ: **tất cả sites mà yt-dlp hỗ trợ** (~1800 sites) — Facebook, Instagram, TikTok, YouTube, Twitter/X, Reddit, v.v.
