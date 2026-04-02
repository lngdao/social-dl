package tui

import (
	"fmt"
	"strings"
	"sync"

	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/lngdao/social-dl/internal/ytdlp"
)

type downloadProgressMsg struct {
	progress ytdlp.Progress
	index    int // -1 for single mode
}
type downloadDoneMsg struct{ filePath string }
type downloadErrorMsg struct{ err error }

// Batch messages
type batchItemStartMsg struct {
	index int
	total int
	title string
}
type batchItemDoneMsg struct {
	index int
	total int
}
type batchDoneMsg struct {
	succeeded int
	failed    int
}

// Active download tracking for concurrent batch
type activeDownload struct {
	title   string
	percent float64
	speed   string
}

type progressModel struct {
	spinner     spinner.Model
	progressBar progress.Model
	title       string
	percent     float64
	speed       string
	eta         string
	status      string // "downloading", "merging", "finished", "error"
	filePath    string
	err         error

	// Batch state
	isBatch      bool
	batchTotal   int
	batchDone    int // completed (success + failed)
	batchSuccess int
	batchFailed  int

	// Active concurrent downloads
	active   map[int]*activeDownload
	activeMu sync.Mutex
}

func newProgressModel(title string, isBatch bool) progressModel {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(colorPrimary)

	p := progress.New(
		progress.WithDefaultGradient(),
		progress.WithWidth(50),
	)

	return progressModel{
		spinner:     s,
		progressBar: p,
		title:       title,
		status:      "downloading",
		isBatch:     isBatch,
		active:      make(map[int]*activeDownload),
	}
}

func (m progressModel) Init() tea.Cmd {
	return m.spinner.Tick
}

func (m progressModel) Update(msg tea.Msg) (progressModel, tea.Cmd) {
	switch msg := msg.(type) {
	case downloadProgressMsg:
		if m.isBatch && msg.index >= 0 {
			// Update per-video progress
			if dl, ok := m.active[msg.index]; ok {
				dl.percent = msg.progress.Percent / 100
				dl.speed = msg.progress.Speed
			}
		} else {
			m.percent = msg.progress.Percent / 100
			m.speed = msg.progress.Speed
			m.eta = msg.progress.ETA
			if msg.progress.Status == "finished" && !m.isBatch {
				m.status = "merging"
			}
		}
		return m, nil

	case batchItemStartMsg:
		m.batchTotal = msg.total
		m.active[msg.index] = &activeDownload{
			title:   msg.title,
			percent: 0,
		}
		return m, nil

	case batchItemDoneMsg:
		delete(m.active, msg.index)
		m.batchDone++
		return m, nil

	case batchDoneMsg:
		m.status = "finished"
		m.batchSuccess = msg.succeeded
		m.batchFailed = msg.failed
		m.batchDone = msg.succeeded + msg.failed
		return m, nil

	case downloadDoneMsg:
		m.status = "finished"
		m.percent = 1
		m.filePath = msg.filePath
		return m, nil

	case downloadErrorMsg:
		m.status = "error"
		m.err = msg.err
		return m, nil

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd

	case progress.FrameMsg:
		model, cmd := m.progressBar.Update(msg)
		m.progressBar = model.(progress.Model)
		return m, cmd
	}
	return m, nil
}

func (m progressModel) View() string {
	if m.isBatch {
		return m.batchView()
	}
	return m.singleView()
}

func (m progressModel) singleView() string {
	switch m.status {
	case "finished":
		return activeBoxStyle.Render(
			successStyle.Render("[OK] Tai xong!")+"\n\n"+
				lipgloss.NewStyle().Foreground(colorText).Render(truncate(m.title, 50))+"\n\n"+
				mutedStyle.Render(m.filePath),
		) + "\n" + helpStyle.Render("enter: tai them  |  q: thoat")

	case "error":
		return activeBoxStyle.Render(
			errorStyle.Render("[X] Loi tai video")+"\n\n"+
				mutedStyle.Render(fmt.Sprintf("%v", m.err)),
		) + "\n" + helpStyle.Render("esc: quay lai")

	case "merging":
		return activeBoxStyle.Render(
			lipgloss.NewStyle().Foreground(colorText).Bold(true).Render(truncate(m.title, 50))+"\n\n"+
				m.spinner.View()+" Dang ghep video + audio...",
		)

	default:
		stats := ""
		if m.speed != "" && m.speed != "N/A" {
			stats += "  " + lipgloss.NewStyle().Foreground(colorSecondary).Render(m.speed)
		}
		if m.eta != "" && m.eta != "N/A" {
			stats += "  " + mutedStyle.Render("ETA: "+m.eta)
		}
		pctText := lipgloss.NewStyle().Foreground(colorPrimary).Bold(true).
			Render(fmt.Sprintf("%.1f%%", m.percent*100))
		return activeBoxStyle.Render(
			lipgloss.NewStyle().Foreground(colorText).Bold(true).Render(truncate(m.title, 50))+"\n\n"+
				m.progressBar.ViewAs(m.percent)+"\n"+
				pctText+stats,
		)
	}
}

func (m progressModel) batchView() string {
	switch m.status {
	case "finished":
		summary := successStyle.Render(fmt.Sprintf("[OK] Hoan tat! %d/%d thanh cong",
			m.batchSuccess, m.batchSuccess+m.batchFailed))
		if m.batchFailed > 0 {
			summary += "\n" + errorStyle.Render(fmt.Sprintf("%d that bai", m.batchFailed))
		}
		return activeBoxStyle.Render(summary) + "\n" +
			helpStyle.Render("enter: quay lai  |  q: thoat")

	default:
		// Overall progress bar
		overallPct := 0.0
		if m.batchTotal > 0 {
			overallPct = float64(m.batchDone) / float64(m.batchTotal)
		}

		counter := lipgloss.NewStyle().Foreground(colorSecondary).Bold(true).
			Render(fmt.Sprintf("[%d/%d]", m.batchDone, m.batchTotal))
		stats := counter + "  " + successStyle.Render(fmt.Sprintf("%d OK", m.batchSuccess))
		if m.batchFailed > 0 {
			stats += "  " + errorStyle.Render(fmt.Sprintf("%d loi", m.batchFailed))
		}
		activeCount := len(m.active)
		if activeCount > 0 {
			stats += "  " + lipgloss.NewStyle().Foreground(colorPrimary).
				Render(fmt.Sprintf("%d dang tai", activeCount))
		}

		overall := stats + "\n" + m.progressBar.ViewAs(overallPct) + "\n"

		// Active downloads list with per-video progress
		activeList := ""
		count := 0
		for _, dl := range m.active {
			if count >= 5 {
				remaining := activeCount - 5
				activeList += mutedStyle.Render(fmt.Sprintf("  ... +%d khac\n", remaining))
				break
			}
			pct := lipgloss.NewStyle().Foreground(colorPrimary).Bold(true).
				Render(fmt.Sprintf("%3.0f%%", dl.percent*100))
			spd := ""
			if dl.speed != "" && dl.speed != "N/A" {
				spd = "  " + lipgloss.NewStyle().Foreground(colorSecondary).Render(dl.speed)
			}
			title := lipgloss.NewStyle().Foreground(colorText).Render(truncate(dl.title, 40))

			// Mini progress bar
			barWidth := 20
			filled := int(dl.percent * float64(barWidth))
			bar := lipgloss.NewStyle().Foreground(colorPrimary).Render(strings.Repeat("█", filled)) +
				lipgloss.NewStyle().Foreground(colorDim).Render(strings.Repeat("░", barWidth-filled))

			activeList += fmt.Sprintf("%s %s %s%s\n", pct, bar, title, spd)
			count++
		}

		if activeList == "" {
			activeList = m.spinner.View() + " Dang chuan bi...\n"
		}

		return overall + "\n" + activeBoxStyle.Render(activeList)
	}
}
