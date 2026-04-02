package tui

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/lngdao/social-dl/internal/deps"
	"github.com/lngdao/social-dl/internal/ytdlp"
)

type viewState int

const (
	viewSetup viewState = iota
	viewHome
	viewSingle
	viewBatch
	viewProfile
	viewSettings
	viewInfo
	viewProgress
	viewHistory
)

type App struct {
	state    viewState
	setup    setupModel
	home     homeModel
	single   singleModel
	batch    batchModel
	profile  profileModel
	settings settingsViewModel
	info     infoModel
	progress progressModel
	history  historyModel

	paths       deps.Paths
	needsSetup  bool
	version     string
	appSettings AppSettings

	width, height   int
	currentURL      string
	currentPlatform string
	program         *tea.Program
}

func NewApp(version string) (*App, error) {
	paths, status, err := deps.Check()
	if err != nil {
		return nil, err
	}

	s := loadSettings()

	app := &App{
		paths:       paths,
		needsSetup:  status.NeedsSetup(),
		version:     version,
		appSettings: s,
	}

	if app.needsSetup {
		app.state = viewSetup
		app.setup = newSetupModel(paths, status)
	} else {
		app.state = viewHome
		app.home = newHomeModel(version, s)
	}

	return app, nil
}

func (a *App) SetProgram(p *tea.Program) {
	a.program = p
}

func (a App) Init() tea.Cmd {
	switch a.state {
	case viewSetup:
		return a.setup.Init()
	case viewHome:
		return nil
	}
	return nil
}

func (a App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	// Global
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return &a, tea.Quit
		case "q":
			if a.state == viewHome {
				return &a, tea.Quit
			}
			if a.state == viewProgress && (a.progress.status == "finished" || a.progress.status == "error") {
				return &a, tea.Quit
			}
		case "esc":
			switch a.state {
			case viewSingle, viewBatch, viewProfile, viewSettings, viewHistory:
				return a.goHome()
			case viewInfo:
				// Back to single input
				a.state = viewSingle
				a.single = newSingleModel()
				return &a, a.single.Init()
			case viewProgress:
				if a.progress.status == "finished" || a.progress.status == "error" {
					return a.goHome()
				}
			}
		}
	case tea.WindowSizeMsg:
		a.width = msg.Width
		a.height = msg.Height
	}

	switch a.state {
	case viewSetup:
		return a.updateSetup(msg)
	case viewHome:
		return a.updateHome(msg)
	case viewSingle:
		return a.updateSingle(msg)
	case viewBatch:
		return a.updateBatch(msg)
	case viewProfile:
		return a.updateProfile(msg)
	case viewSettings:
		return a.updateSettings(msg)
	case viewInfo:
		return a.updateInfo(msg)
	case viewProgress:
		return a.updateProgress(msg)
	case viewHistory:
		return a.updateHistory(msg)
	}

	return &a, nil
}

func (a App) goHome() (tea.Model, tea.Cmd) {
	a.appSettings = loadSettings()
	a.state = viewHome
	a.home = newHomeModel(a.version, a.appSettings)
	return &a, nil
}

// --- Setup ---

func (a App) updateSetup(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	a.setup, cmd = a.setup.Update(msg)
	if a.setup.done {
		paths, _, _ := deps.Check()
		a.paths = paths
		return a.goHome()
	}
	return &a, cmd
}

// --- Home ---

func (a App) updateHome(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case menuSelectMsg:
		switch msg.action {
		case menuSingle:
			a.state = viewSingle
			a.single = newSingleModel()
			return &a, a.single.Init()
		case menuBatch:
			a.state = viewBatch
			a.batch = newBatchModel()
			return &a, a.batch.Init()
		case menuProfile:
			a.state = viewProfile
			a.profile = newProfileModel()
			return &a, a.profile.Init()
		case menuSettings:
			a.state = viewSettings
			a.settings = newSettingsViewModel(a.appSettings)
			return &a, a.settings.Init()
		case menuHistory:
			a.state = viewHistory
			a.history = newHistoryModel()
			return &a, nil
		}
	}
	var cmd tea.Cmd
	a.home, cmd = a.home.Update(msg)
	return &a, cmd
}

// --- Single ---

func (a App) updateSingle(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case submitURLMsg:
		a.currentURL = msg.url
		a.state = viewInfo
		a.info = newInfoModel(msg.url)
		return &a, tea.Batch(a.info.Init(), a.fetchMeta(msg.url))
	}
	var cmd tea.Cmd
	a.single, cmd = a.single.Update(msg)
	return &a, cmd
}

// --- Batch ---

func (a App) updateBatch(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case submitBatchMsg:
		if len(msg.urls) == 0 {
			a.batch.err = "Khong tim thay URL hop le"
			return &a, nil
		}
		a.state = viewProgress
		a.progress = newProgressModel(
			fmt.Sprintf("Tai %d video", len(msg.urls)), true)
		return &a, tea.Batch(a.progress.Init(), a.startBatchDownload(msg.urls, msg.subfolder))
	}
	var cmd tea.Cmd
	a.batch, cmd = a.batch.Update(msg)
	return &a, cmd
}

// --- Profile ---

func (a App) updateProfile(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case profileScanMsg:
		if msg.entries != nil || msg.err != nil {
			a.profile, _ = a.profile.Update(msg)
			return &a, nil
		}
		// Start actual scan
		url := a.profile.input.Value()
		return &a, a.scanProfile(url)

	case submitProfileMsg:
		urls := make([]string, len(msg.entries))
		for i, e := range msg.entries {
			if e.URL != "" {
				urls[i] = e.URL
			} else {
				urls[i] = msg.url // fallback to profile URL for yt-dlp playlist
			}
		}
		// Use playlist download for profile
		a.state = viewProgress
		a.progress = newProgressModel(
			fmt.Sprintf("Tai %d video tu profile", len(msg.entries)), true)
		return &a, tea.Batch(a.progress.Init(), a.startProfileDownload(msg.url, len(msg.entries)))
	}

	var cmd tea.Cmd
	a.profile, cmd = a.profile.Update(msg)
	return &a, cmd
}

// --- Settings ---

func (a App) updateSettings(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg.(type) {
	case settingsSavedMsg:
		a.appSettings = loadSettings()
	}
	var cmd tea.Cmd
	a.settings, cmd = a.settings.Update(msg)
	return &a, cmd
}

// --- Info ---

func (a App) updateInfo(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case metaFetchedMsg:
		if msg.meta != nil {
			a.currentPlatform = msg.meta.Extractor
		}
	case startDownloadMsg:
		a.state = viewProgress
		a.progress = newProgressModel(msg.meta.Title, false)
		a.currentPlatform = msg.meta.Extractor
		return &a, tea.Batch(a.progress.Init(), a.startSingleDownload(msg.meta, msg.quality))
	}
	var cmd tea.Cmd
	a.info, cmd = a.info.Update(msg)
	return &a, cmd
}

// --- Progress ---

func (a App) updateProgress(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if msg.String() == "enter" {
			if a.progress.status == "finished" || a.progress.status == "error" {
				return a.goHome()
			}
		}
	case downloadDoneMsg:
		SaveHistory(HistoryEntry{
			Title:      a.progress.title,
			URL:        a.currentURL,
			FilePath:   msg.filePath,
			Platform:   a.currentPlatform,
			DownloadAt: time.Now(),
		})
	}
	var cmd tea.Cmd
	a.progress, cmd = a.progress.Update(msg)
	return &a, cmd
}

// --- History ---

func (a App) updateHistory(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	a.history, cmd = a.history.Update(msg)
	return &a, cmd
}

// --- View ---

func (a App) View() string {
	header := logoView() + "  " + mutedStyle.Render("v"+a.version) + "\n\n"

	var content string
	switch a.state {
	case viewSetup:
		return a.setup.View()
	case viewHome:
		return a.home.View()
	case viewSingle:
		content = a.single.View()
	case viewBatch:
		content = a.batch.View()
	case viewProfile:
		content = a.profile.View()
	case viewSettings:
		content = a.settings.View()
	case viewInfo:
		content = a.info.View()
	case viewProgress:
		content = a.progress.View()
	case viewHistory:
		content = a.history.View()
	}

	return header + content
}

// ================== Commands ==================

func (a App) fetchMeta(url string) tea.Cmd {
	ytdlpPath := a.paths.YtDlp
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		meta, err := ytdlp.FetchMeta(ctx, ytdlpPath, url)
		if err != nil {
			return metaErrorMsg{err: err}
		}
		return metaFetchedMsg{meta: meta}
	}
}

func (a App) formatSpec() string {
	s := a.appSettings
	switch s.Quality {
	case "1080p":
		return "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"
	case "720p":
		return "bestvideo[height<=720]+bestaudio/best[height<=720]/best"
	case "480p":
		return "bestvideo[height<=480]+bestaudio/best[height<=480]/best"
	case "360p":
		return "bestvideo[height<=360]+bestaudio/best[height<=360]/best"
	default:
		return "bestvideo*+bestaudio/best"
	}
}

func (a App) makeDownloadOpts(url string) ytdlp.DownloadOpts {
	opts := ytdlp.DownloadOpts{
		YtDlpPath:    a.paths.YtDlp,
		FfmpegDir:    a.paths.BinDir,
		URL:          url,
		FormatSpec:   a.formatSpec(),
		OutputDir:    a.appSettings.OutputDir,
		IncludeAudio: a.appSettings.IncludeAudio,
		CookieFile:   a.appSettings.CookieFile,
	}
	if a.appSettings.UseArchive {
		opts.ArchiveFile = archivePath()
	}
	if a.appSettings.VerboseLog {
		opts.LogFile = logFilePath()
	}
	return opts
}

func (a App) startSingleDownload(meta *ytdlp.VideoMeta, quality ytdlp.Quality) tea.Cmd {
	opts := a.makeDownloadOpts(a.currentURL)
	opts.FormatSpec = quality.FormatSpec
	program := a.program
	return func() tea.Msg {
		ctx := context.Background()
		filePath, err := ytdlp.Download(ctx, opts, func(p ytdlp.Progress) {
			if program != nil {
				program.Send(downloadProgressMsg{progress: p})
			}
		})
		if err != nil {
			return downloadErrorMsg{err: err}
		}
		return downloadDoneMsg{filePath: filePath}
	}
}

func (a App) startBatchDownload(urls []string, subfolder string) tea.Cmd {
	program := a.program
	settings := a.appSettings
	paths := a.paths
	fmtSpec := a.formatSpec()
	return func() tea.Msg {
		// Resolve output dir, create subfolder if specified
		outputDir := settings.OutputDir
		if subfolder != "" {
			outputDir = filepath.Join(outputDir, subfolder)
			os.MkdirAll(outputDir, 0755)
		}

		succeeded := 0
		failed := 0

		for i, url := range urls {
			// Fetch metadata first
			title := url
			platform := ""
			metaCtx, metaCancel := context.WithTimeout(context.Background(), 15*time.Second)
			meta, metaErr := ytdlp.FetchMeta(metaCtx, paths.YtDlp, url)
			metaCancel()
			if metaErr == nil && meta != nil {
				if meta.Title != "" {
					title = meta.Title
				}
				platform = meta.Extractor
			}

			if program != nil {
				program.Send(batchItemStartMsg{
					index: i,
					total: len(urls),
					title: title,
				})
			}

			opts := ytdlp.DownloadOpts{
				YtDlpPath:    paths.YtDlp,
				FfmpegDir:    paths.BinDir,
				URL:          url,
				FormatSpec:   fmtSpec,
				OutputDir:    outputDir,
				IncludeAudio: settings.IncludeAudio,
				CookieFile:   settings.CookieFile,
			}
			if settings.UseArchive {
				opts.ArchiveFile = archivePath()
			}
			if settings.VerboseLog {
				opts.LogFile = logFilePath()
			}

			ctx := context.Background()
			filePath, err := ytdlp.Download(ctx, opts, func(p ytdlp.Progress) {
				if program != nil {
					program.Send(downloadProgressMsg{progress: p})
				}
			})

			if err != nil {
				failed++
			} else {
				succeeded++
				SaveHistory(HistoryEntry{
					Title:      title,
					URL:        url,
					FilePath:   filePath,
					Platform:   platform,
					DownloadAt: time.Now(),
				})
			}

			if program != nil {
				program.Send(batchItemDoneMsg{index: i, total: len(urls)})
			}
		}

		return batchDoneMsg{succeeded: succeeded, failed: failed}
	}
}

func (a App) scanProfile(url string) tea.Cmd {
	ytdlpPath := a.paths.YtDlp
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		defer cancel()
		entries, err := ytdlp.ScanPlaylist(ctx, ytdlpPath, url)
		return profileScanMsg{entries: entries, err: err}
	}
}

func (a App) startProfileDownload(profileURL string, total int) tea.Cmd {
	program := a.program
	opts := a.makeDownloadOpts(profileURL)
	return func() tea.Msg {
		ctx := context.Background()
		err := ytdlp.DownloadPlaylist(ctx, opts, func(p ytdlp.Progress) {
			if program != nil {
				program.Send(downloadProgressMsg{progress: p})
			}
		})
		if err != nil {
			return downloadErrorMsg{err: err}
		}
		return batchDoneMsg{succeeded: total, failed: 0}
	}
}
