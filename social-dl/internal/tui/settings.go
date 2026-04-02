package tui

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/lngdao/social-dl/internal/deps"
)

// AppSettings lưu cấu hình người dùng.
type AppSettings struct {
	IncludeAudio bool   `json:"include_audio"`
	Quality      string `json:"quality"`       // "best", "1080p", "720p", "480p"
	OutputDir    string `json:"output_dir"`     // thư mục lưu video
	UseArchive   bool   `json:"use_archive"`    // skip video đã tải
	Concurrency  int    `json:"concurrency"`    // số lượng tải song song (batch)
	CookieFile   string `json:"cookie_file"`    // path tới cookies.txt (optional)
	VerboseLog   bool   `json:"verbose_log"`    // ghi log yt-dlp ra file
}

func defaultSettings() AppSettings {
	home, _ := os.UserHomeDir()
	dlDir := filepath.Join(home, "Downloads")
	if _, err := os.Stat(dlDir); err != nil {
		dlDir, _ = os.Getwd()
	}
	return AppSettings{
		IncludeAudio: true,
		Quality:      "best",
		OutputDir:    dlDir,
		UseArchive:   true,
		Concurrency:  3,
	}
}

func settingsPath() string {
	dir, _ := deps.BinDir()
	return filepath.Join(filepath.Dir(dir), "settings.json")
}

func loadSettings() AppSettings {
	s := defaultSettings()
	data, err := os.ReadFile(settingsPath())
	if err != nil {
		return s
	}
	json.Unmarshal(data, &s)
	if s.OutputDir == "" {
		s.OutputDir = defaultSettings().OutputDir
	}
	if s.Concurrency < 1 || s.Concurrency > 10 {
		s.Concurrency = 3
	}
	return s
}

func saveSettings(s AppSettings) {
	data, _ := json.MarshalIndent(s, "", "  ")
	os.WriteFile(settingsPath(), data, 0644)
}

func archivePath() string {
	dir, _ := deps.BinDir()
	return filepath.Join(filepath.Dir(dir), "archive.txt")
}

func logFilePath() string {
	dir, _ := deps.BinDir()
	return filepath.Join(filepath.Dir(dir), "social-dl.log")
}

var qualityOptions = []string{"best", "1080p", "720p", "480p", "360p"}
