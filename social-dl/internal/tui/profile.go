package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/lngdao/social-dl/internal/ytdlp"
)

type profileScanMsg struct {
	entries []ytdlp.PlaylistEntry
	err     error
}

type submitProfileMsg struct {
	url     string
	entries []ytdlp.PlaylistEntry
}

type profileModel struct {
	input    textinput.Model
	spinner  spinner.Model
	scanning bool
	entries  []ytdlp.PlaylistEntry
	err      string
	platform string // detected platform
}

func newProfileModel() profileModel {
	ti := textinput.New()
	ti.Placeholder = "Link profile, channel, hoac playlist..."
	ti.Focus()
	ti.CharLimit = 300
	ti.Width = 65
	ti.PromptStyle = lipgloss.NewStyle().Foreground(colorPrimary)
	ti.TextStyle = lipgloss.NewStyle().Foreground(colorText)

	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(colorPrimary)

	return profileModel{input: ti, spinner: s}
}

func (m profileModel) Init() tea.Cmd {
	return textinput.Blink
}

func (m profileModel) Update(msg tea.Msg) (profileModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if m.scanning {
			return m, nil
		}
		switch msg.String() {
		case "enter":
			if len(m.entries) > 0 {
				url := strings.TrimSpace(m.input.Value())
				return m, func() tea.Msg {
					return submitProfileMsg{url: url, entries: m.entries}
				}
			}
			url := strings.TrimSpace(m.input.Value())
			if url == "" || !isValidURL(url) {
				m.err = "Vui long nhap link profile hop le"
				return m, nil
			}
			m.platform = detectPlatform(url)
			m.err = ""
			m.scanning = true
			m.entries = nil
			return m, tea.Batch(m.spinner.Tick, func() tea.Msg {
				return profileScanMsg{} // placeholder, real scan in app.go
			})
		}

	case profileScanMsg:
		m.scanning = false
		if msg.err != nil {
			m.err = msg.err.Error()
			return m, nil
		}
		m.entries = msg.entries
		return m, nil

	case spinner.TickMsg:
		if m.scanning {
			var cmd tea.Cmd
			m.spinner, cmd = m.spinner.Update(msg)
			return m, cmd
		}
	}

	if !m.scanning {
		var cmd tea.Cmd
		m.input, cmd = m.input.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m profileModel) View() string {
	header := headingStyle.Render("Tai tu profile") + "\n"

	// Platform support info
	info := boxStyle.Render(
		lipgloss.NewStyle().Foreground(colorSecondary).Render("Ho tro scan profile/playlist:") + "\n" +
			successStyle.Render("  YouTube") + mutedStyle.Render(" — channel, playlist") + "\n" +
			successStyle.Render("  TikTok") + mutedStyle.Render(" — @username") + "\n" +
			successStyle.Render("  Vimeo, Bilibili, ...") + mutedStyle.Render(" — va nhieu trang khac") + "\n" +
			warnStyle.Render("  Facebook/Instagram") + mutedStyle.Render(" — khong ho tro, dung 'Tai nhieu video'"),
	)

	var content string
	if m.scanning {
		content = "\n\n" + activeBoxStyle.Render(
			m.spinner.View()+" Dang scan profile...\n\n"+
				mutedStyle.Render("Co the mat vai phut tuy so luong video."),
		)
	} else if len(m.entries) > 0 {
		content = "\n\n" + activeBoxStyle.Render(
			successStyle.Render(fmt.Sprintf("Tim thay %d video!", len(m.entries)))+"\n\n"+
				m.entriesPreview()+"\n\n"+
				lipgloss.NewStyle().Foreground(colorSecondary).Render("Nhan enter de tai tat ca"),
		)
	} else {
		content = "\n\n" + activeBoxStyle.Render(
			subtitleStyle.Render("Link profile:")+"\n\n"+
				m.input.View(),
		)
	}

	if m.err != "" {
		content += "\n" + errorStyle.Render(m.err)
	}

	help := "\n" + helpStyle.Render("enter: scan/tai  |  esc: quay lai")

	return header + info + content + help
}

func (m profileModel) entriesPreview() string {
	max := 5
	if len(m.entries) < max {
		max = len(m.entries)
	}
	lines := ""
	for i := 0; i < max; i++ {
		e := m.entries[i]
		idx := mutedStyle.Render(fmt.Sprintf("%d.", i+1))
		title := lipgloss.NewStyle().Foreground(colorText).Render(truncate(e.Title, 50))
		dur := mutedStyle.Render(formatDuration(e.Duration))
		lines += fmt.Sprintf("  %s %s  %s\n", idx, title, dur)
	}
	if len(m.entries) > max {
		lines += mutedStyle.Render(fmt.Sprintf("  ... va %d video khac", len(m.entries)-max))
	}
	return lines
}

func detectPlatform(url string) string {
	u := strings.ToLower(url)
	switch {
	case strings.Contains(u, "tiktok.com"):
		return "tiktok"
	case strings.Contains(u, "facebook.com") || strings.Contains(u, "fb.com"):
		return "facebook"
	case strings.Contains(u, "instagram.com"):
		return "instagram"
	default:
		return "other"
	}
}
