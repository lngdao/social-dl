package ytdlp

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"sort"
)

// FetchMeta gọi yt-dlp -j để lấy metadata video.
func FetchMeta(ctx context.Context, ytdlpPath, url string) (*VideoMeta, error) {
	cmd := exec.CommandContext(ctx, ytdlpPath, "-j", "--no-warnings", "--no-playlist", url)
	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("yt-dlp: %s", string(exitErr.Stderr))
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
