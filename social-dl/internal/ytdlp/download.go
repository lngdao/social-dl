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
	YtDlpPath    string
	FfmpegDir    string
	URL          string
	FormatSpec   string
	OutputDir    string
	CookieFile   string // optional
	IncludeAudio bool
	ArchiveFile  string // optional, path to download archive
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

	if !opts.IncludeAudio {
		args = append(args, "--postprocessor-args", "ffmpeg:-an")
	}

	if opts.CookieFile != "" {
		args = append(args, "--cookies", opts.CookieFile)
	}

	if opts.ArchiveFile != "" {
		args = append(args, "--download-archive", opts.ArchiveFile)
	}

	args = append(args, opts.URL)

	cmd := exec.CommandContext(ctx, opts.YtDlpPath, args...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("start yt-dlp: %w", err)
	}

	scanner := bufio.NewScanner(stdout)
	var lastFile string
	for scanner.Scan() {
		line := scanner.Text()

		if strings.HasPrefix(line, "download:") {
			jsonStr := strings.TrimPrefix(line, "download:")
			var raw struct {
				Status  string `json:"status"`
				Percent string `json:"percent"`
				Speed   string `json:"speed"`
				ETA     string `json:"eta"`
			}
			if json.Unmarshal([]byte(jsonStr), &raw) == nil && onProgress != nil {
				onProgress(Progress{
					Status:  raw.Status,
					Percent: parsePercent(raw.Percent),
					Speed:   raw.Speed,
					ETA:     raw.ETA,
				})
			}
		}

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

		// Detect "already downloaded" (archive skip)
		if strings.Contains(line, "has already been recorded in the archive") {
			if onProgress != nil {
				onProgress(Progress{Status: "skipped", Percent: 100})
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

// DownloadPlaylist tải tất cả video từ playlist/profile URL.
func DownloadPlaylist(ctx context.Context, opts DownloadOpts, onProgress func(Progress)) error {
	args := []string{
		"-f", opts.FormatSpec,
		"--merge-output-format", "mp4",
		"--ffmpeg-location", opts.FfmpegDir,
		"-o", fmt.Sprintf("%s/%%(title).80s [%%(id)s].%%(ext)s", opts.OutputDir),
		"--newline",
		"--progress-template", `download:{"status":"%(progress.status)s","percent":"%(progress._percent_str)s","speed":"%(progress._speed_str)s","eta":"%(progress._eta_str)s"}`,
		"--no-warnings",
		"--yes-playlist",
	}

	if !opts.IncludeAudio {
		args = append(args, "--postprocessor-args", "ffmpeg:-an")
	}

	if opts.CookieFile != "" {
		args = append(args, "--cookies", opts.CookieFile)
	}

	if opts.ArchiveFile != "" {
		args = append(args, "--download-archive", opts.ArchiveFile)
	}

	args = append(args, opts.URL)

	cmd := exec.CommandContext(ctx, opts.YtDlpPath, args...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start yt-dlp: %w", err)
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()

		if strings.HasPrefix(line, "download:") {
			jsonStr := strings.TrimPrefix(line, "download:")
			var raw struct {
				Status  string `json:"status"`
				Percent string `json:"percent"`
				Speed   string `json:"speed"`
				ETA     string `json:"eta"`
			}
			if json.Unmarshal([]byte(jsonStr), &raw) == nil && onProgress != nil {
				onProgress(Progress{
					Status:  raw.Status,
					Percent: parsePercent(raw.Percent),
					Speed:   raw.Speed,
					ETA:     raw.ETA,
				})
			}
		}
	}

	return cmd.Wait()
}

func parsePercent(s string) float64 {
	s = strings.TrimSpace(s)
	s = strings.TrimSuffix(s, "%")
	v, _ := strconv.ParseFloat(s, 64)
	return v
}
