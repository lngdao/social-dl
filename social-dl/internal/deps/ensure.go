package deps

import (
	"os"
	"path/filepath"
	"runtime"
)

const appName = "social-dl"

// BinDir trả về thư mục chứa binary dependencies.
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

// DepItem mô tả 1 dependency cần tải.
type DepItem struct {
	Name string
	URL  string
	Dest string
}

// PendingDownloads trả về danh sách binary cần tải.
func PendingDownloads(paths Paths, status Status) ([]DepItem, error) {
	p := CurrentPlatform()
	var items []DepItem

	if status.NeedYtDlp {
		url, _, err := p.YtDlpURL()
		if err != nil {
			return nil, err
		}
		items = append(items, DepItem{Name: "yt-dlp", URL: url, Dest: paths.YtDlp})
	}

	if status.NeedFfmpeg || status.NeedFfprobe {
		ffURL, fpURL, _, _, err := p.FfmpegURLs()
		if err != nil {
			return nil, err
		}
		if status.NeedFfmpeg {
			items = append(items, DepItem{Name: "ffmpeg", URL: ffURL, Dest: paths.Ffmpeg})
		}
		if status.NeedFfprobe {
			items = append(items, DepItem{Name: "ffprobe", URL: fpURL, Dest: paths.Ffprobe})
		}
	}

	return items, nil
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
