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
