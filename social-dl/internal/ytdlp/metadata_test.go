package ytdlp

import (
	"testing"
)

func TestExtractQualities(t *testing.T) {
	meta := &VideoMeta{
		Formats: []Format{
			{FormatID: "18", Width: 640, Height: 360, VCodec: "avc1", ACodec: "mp4a"},
			{FormatID: "22", Width: 1280, Height: 720, VCodec: "avc1", ACodec: "mp4a"},
			{FormatID: "137", Width: 1920, Height: 1080, VCodec: "avc1", ACodec: "none"},
			{FormatID: "140", Width: 0, Height: 0, VCodec: "none", ACodec: "mp4a"},
		},
	}

	qualities := ExtractQualities(meta)

	if len(qualities) < 2 {
		t.Fatalf("expected at least 2 qualities, got %d", len(qualities))
	}

	if qualities[0].Label != "Best" {
		t.Errorf("first quality should be 'Best', got %s", qualities[0].Label)
	}

	// 1080p, 720p, 360p = 3, plus "Best" = 4
	if len(qualities) != 4 {
		t.Errorf("expected 4 qualities, got %d", len(qualities))
	}

	// Sorted descending
	if qualities[1].Label != "1080p" {
		t.Errorf("expected 1080p, got %s", qualities[1].Label)
	}
	if qualities[2].Label != "720p" {
		t.Errorf("expected 720p, got %s", qualities[2].Label)
	}
}

func TestExtractQualities_Empty(t *testing.T) {
	meta := &VideoMeta{Formats: []Format{}}
	qualities := ExtractQualities(meta)
	if len(qualities) < 1 {
		t.Fatal("expected at least 1 quality (Best)")
	}
	if qualities[0].Label != "Best" {
		t.Errorf("expected Best, got %s", qualities[0].Label)
	}
}
