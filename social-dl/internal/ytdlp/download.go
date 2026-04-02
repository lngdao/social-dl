package ytdlp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
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
	LogFile      string // optional, path to write yt-dlp output log
}

// Download chạy yt-dlp download, stream progress qua callback.
// Trả về đường dẫn file đã tải.
func Download(ctx context.Context, opts DownloadOpts, onProgress func(Progress)) (string, error) {
	args := []string{
		"-f", opts.FormatSpec,
		"--merge-output-format", "mp4",
		"--ffmpeg-location", opts.FfmpegDir,
		"-o", filepath.Join(opts.OutputDir, "%(title).80s [%(id)s].%(ext)s"),
		"--newline",
		"--progress",
		"--progress-template", `download:{"status":"%(progress.status)s","percent":"%(progress._percent_str)s","speed":"%(progress._speed_str)s","eta":"%(progress._eta_str)s","downloaded":"%(progress._downloaded_bytes_str)s"}`,
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

	// Verbose mode: add -v flag and remove --no-warnings
	if opts.LogFile != "" {
		for i, a := range args {
			if a == "--no-warnings" {
				args[i] = "-v"
				break
			}
		}
	}

	args = append(args, opts.URL)

	// Open log file if specified
	var logWriter *os.File
	if opts.LogFile != "" {
		logWriter, _ = os.OpenFile(opts.LogFile, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
		if logWriter != nil {
			defer logWriter.Close()
			fmt.Fprintf(logWriter, "\n=== %s ===\n", time.Now().Format("2006-01-02 15:04:05"))
			fmt.Fprintf(logWriter, "CMD: %s %s\n", opts.YtDlpPath, strings.Join(args, " "))
		}
	}

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

		if logWriter != nil {
			fmt.Fprintln(logWriter, line)
		}

		tryParseProgress(line, onProgress)

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
		if logWriter != nil {
			fmt.Fprintf(logWriter, "EXIT ERROR: %v\n", err)
		}
		return "", fmt.Errorf("yt-dlp exited: %w", err)
	}

	if logWriter != nil {
		fmt.Fprintf(logWriter, "OK: %s\n", lastFile)
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
		"-o", filepath.Join(opts.OutputDir, "%(title).80s [%(id)s].%(ext)s"),
		"--newline",
		"--progress",
		"--progress-template", `download:{"status":"%(progress.status)s","percent":"%(progress._percent_str)s","speed":"%(progress._speed_str)s","eta":"%(progress._eta_str)s","downloaded":"%(progress._downloaded_bytes_str)s"}`,
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

		tryParseProgress(line, onProgress)
	}

	return cmd.Wait()
}

func parsePercent(s string) float64 {
	s = strings.TrimSpace(s)
	s = strings.TrimSuffix(s, "%")
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

// tryParseProgress attempts to parse a progress line and calls onProgress if successful.
func tryParseProgress(line string, onProgress func(Progress)) {
	if onProgress == nil {
		return
	}
	// Method 1: JSON progress template "download:{...}"
	if strings.HasPrefix(line, "download:") {
		jsonStr := strings.TrimPrefix(line, "download:")
		var raw struct {
			Status     string `json:"status"`
			Percent    string `json:"percent"`
			Speed      string `json:"speed"`
			ETA        string `json:"eta"`
			Downloaded string `json:"downloaded"`
		}
		if json.Unmarshal([]byte(jsonStr), &raw) == nil {
			onProgress(Progress{
				Status:     raw.Status,
				Percent:    parsePercent(raw.Percent),
				Speed:      raw.Speed,
				ETA:        raw.ETA,
				Downloaded: raw.Downloaded,
			})
			return
		}
	}
	// Method 2: Standard "[download]  45.2% of ~12.3MiB at 5.2MiB/s ETA 00:02"
	if strings.Contains(line, "[download]") && strings.Contains(line, "%") {
		pct := extractPercentFromLine(line)
		if pct > 0 {
			onProgress(Progress{
				Status:  "downloading",
				Percent: pct,
				Speed:   extractFieldAfter(line, " at "),
				ETA:     extractFieldAfter(line, "ETA "),
			})
		}
	}
}

func extractPercentFromLine(line string) float64 {
	// Find "XX.X%" pattern in line
	for _, part := range strings.Fields(line) {
		if strings.HasSuffix(part, "%") {
			return parsePercent(part)
		}
	}
	return 0
}

func extractFieldAfter(line, prefix string) string {
	idx := strings.Index(line, prefix)
	if idx < 0 {
		return ""
	}
	rest := line[idx+len(prefix):]
	fields := strings.Fields(rest)
	if len(fields) > 0 {
		return fields[0]
	}
	return ""
}
