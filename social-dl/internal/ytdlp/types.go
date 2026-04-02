package ytdlp

// VideoMeta là metadata trả về từ yt-dlp -j.
type VideoMeta struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Thumbnail   string   `json:"thumbnail"`
	Duration    float64  `json:"duration"`
	Uploader    string   `json:"uploader"`
	WebpageURL  string   `json:"webpage_url"`
	Extractor   string   `json:"extractor"`
	Formats     []Format `json:"formats"`
}

// Format là 1 stream có sẵn.
type Format struct {
	FormatID       string  `json:"format_id"`
	Ext            string  `json:"ext"`
	Width          int     `json:"width"`
	Height         int     `json:"height"`
	FPS            float64 `json:"fps"`
	VCodec         string  `json:"vcodec"`
	ACodec         string  `json:"acodec"`
	FileSizeApprox int64   `json:"filesize_approx"`
	FormatNote     string  `json:"format_note"`
	URL            string  `json:"url"`
}

// Quality là lựa chọn chất lượng cho user.
type Quality struct {
	Label      string // "1080p", "720p", ...
	FormatSpec string // -f argument cho yt-dlp
}

// Progress là trạng thái download real-time.
type Progress struct {
	Status     string  // "downloading", "finished", "error"
	Percent    float64 // 0-100
	Speed      string  // "5.2MiB/s"
	ETA        string  // "00:23"
	Downloaded string  // "12.5MiB"
}

// PlaylistEntry là 1 entry từ --flat-playlist -j.
type PlaylistEntry struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	URL      string  `json:"url"`
	Duration float64 `json:"duration"`
	Uploader string  `json:"uploader"`
}
