package updater

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const repoAPI = "https://api.github.com/repos/lngdao/social-downloader-extension/releases/latest"

type Release struct {
	TagName string  `json:"tag_name"`
	Assets  []Asset `json:"assets"`
}

type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

// CheckLatest returns the latest release tag from GitHub.
func CheckLatest() (string, error) {
	resp, err := http.Get(repoAPI)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("GitHub API: %d", resp.StatusCode)
	}

	var rel Release
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return "", err
	}
	return rel.TagName, nil
}

// IsNewer returns true if remote version is newer than current.
func IsNewer(current, remote string) bool {
	current = strings.TrimPrefix(current, "v")
	remote = strings.TrimPrefix(remote, "v")
	return remote != current && remote > current
}

// SelfUpdate downloads the latest release binary and replaces the current executable.
func SelfUpdate(onProgress func(downloaded, total int64)) error {
	resp, err := http.Get(repoAPI)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var rel Release
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return err
	}

	assetName := matchAssetName()
	if assetName == "" {
		return fmt.Errorf("no matching binary for %s/%s", runtime.GOOS, runtime.GOARCH)
	}

	var downloadURL string
	for _, a := range rel.Assets {
		if a.Name == assetName {
			downloadURL = a.BrowserDownloadURL
			break
		}
	}
	if downloadURL == "" {
		return fmt.Errorf("asset %s not found in release %s", assetName, rel.TagName)
	}

	// Download to temp file
	dlResp, err := http.Get(downloadURL)
	if err != nil {
		return err
	}
	defer dlResp.Body.Close()

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)

	tmpFile := exe + ".update"
	f, err := os.Create(tmpFile)
	if err != nil {
		return err
	}
	defer func() {
		f.Close()
		os.Remove(tmpFile)
	}()

	total := dlResp.ContentLength
	var downloaded int64
	buf := make([]byte, 32*1024)
	for {
		n, readErr := dlResp.Body.Read(buf)
		if n > 0 {
			f.Write(buf[:n])
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

	// Make executable
	os.Chmod(tmpFile, 0755)

	// Replace current binary
	backupFile := exe + ".bak"
	os.Remove(backupFile)
	if err := os.Rename(exe, backupFile); err != nil {
		return fmt.Errorf("backup old binary: %w", err)
	}
	if err := os.Rename(tmpFile, exe); err != nil {
		// Rollback
		os.Rename(backupFile, exe)
		return fmt.Errorf("replace binary: %w", err)
	}
	os.Remove(backupFile)

	return nil
}

func matchAssetName() string {
	switch {
	case runtime.GOOS == "darwin" && runtime.GOARCH == "arm64":
		return "social-dl-macos-apple-silicon"
	case runtime.GOOS == "darwin" && runtime.GOARCH == "amd64":
		return "social-dl-macos-intel"
	case runtime.GOOS == "linux" && runtime.GOARCH == "amd64":
		return "social-dl-linux-amd64"
	case runtime.GOOS == "linux" && runtime.GOARCH == "arm64":
		return "social-dl-linux-arm64"
	case runtime.GOOS == "windows" && runtime.GOARCH == "amd64":
		return "social-dl-windows-amd64.exe"
	default:
		return ""
	}
}
