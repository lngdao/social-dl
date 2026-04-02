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
		os.Remove(tmpPath)
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
