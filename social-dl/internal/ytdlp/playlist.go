package ytdlp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
)

// ScanPlaylist gọi yt-dlp --flat-playlist -j để liệt kê video trong profile/playlist.
func ScanPlaylist(ctx context.Context, ytdlpPath, url string) ([]PlaylistEntry, error) {
	cmd := exec.CommandContext(ctx, ytdlpPath,
		"--flat-playlist", "-j", "--no-warnings", url,
	)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start yt-dlp: %w", err)
	}

	var entries []PlaylistEntry
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Bytes()
		var entry PlaylistEntry
		if json.Unmarshal(line, &entry) == nil && entry.ID != "" {
			entries = append(entries, entry)
		}
	}

	if err := cmd.Wait(); err != nil {
		if len(entries) > 0 {
			return entries, nil // partial results ok
		}
		return nil, fmt.Errorf("yt-dlp: %w", err)
	}

	return entries, nil
}
