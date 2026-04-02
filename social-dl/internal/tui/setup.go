package tui

import (
	"fmt"
	"os"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/lngdao/social-dl/internal/deps"
)

type setupDoneMsg struct{ paths deps.Paths }
type setupErrMsg struct{ err error }

type setupModel struct {
	spinner     spinner.Model
	currentFile string
	fileIndex   int
	totalFiles  int
	done        bool
	err         error
	paths       deps.Paths
	status      deps.Status
}

func newSetupModel(paths deps.Paths, status deps.Status) setupModel {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(colorPrimary)

	total := 0
	if status.NeedYtDlp {
		total++
	}
	if status.NeedFfmpeg {
		total++
	}
	if status.NeedFfprobe {
		total++
	}

	return setupModel{
		spinner:    s,
		paths:      paths,
		status:     status,
		totalFiles: total,
	}
}

func (m setupModel) Init() tea.Cmd {
	return tea.Batch(m.spinner.Tick, m.startDownload())
}

func (m setupModel) startDownload() tea.Cmd {
	paths := m.paths
	status := m.status
	return func() tea.Msg {
		items, err := deps.PendingDownloads(paths, status)
		if err != nil {
			return setupErrMsg{err: err}
		}
		for _, item := range items {
			if err := deps.DownloadFile(item.URL, item.Dest, nil); err != nil {
				return setupErrMsg{err: fmt.Errorf("download %s: %w", item.Name, err)}
			}
			os.Chmod(item.Dest, 0755)
		}
		return setupDoneMsg{paths: paths}
	}
}

func (m setupModel) Update(msg tea.Msg) (setupModel, tea.Cmd) {
	switch msg := msg.(type) {
	case setupDoneMsg:
		m.done = true
		m.paths = msg.paths
		return m, nil
	case setupErrMsg:
		m.err = msg.err
		return m, nil
	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m setupModel) View() string {
	if m.err != nil {
		return boxStyle.Render(
			titleStyle.Render("Setup Failed") + "\n\n" +
				errorStyle.Render(fmt.Sprintf("Loi: %v", m.err)) + "\n\n" +
				mutedStyle.Render("Kiem tra ket noi mang va thu lai."),
		)
	}
	if m.done {
		return boxStyle.Render(
			successStyle.Render("OK Setup hoan tat!") + "\n" +
				mutedStyle.Render("Dang khoi dong..."),
		)
	}
	return boxStyle.Render(
		titleStyle.Render("Cai dat lan dau") + "\n\n" +
			m.spinner.View() + " Dang tai dependencies (yt-dlp, ffmpeg)...\n\n" +
			mutedStyle.Render("Chi can tai 1 lan duy nhat."),
	)
}
