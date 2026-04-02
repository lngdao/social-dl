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
		os, arch   string
		wantSuffix string
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
