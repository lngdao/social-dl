package tui

import (
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type submitURLMsg struct{ url string }

type singleModel struct {
	input textinput.Model
	err   string
}

func newSingleModel() singleModel {
	ti := textinput.New()
	ti.Placeholder = "Dan link video tu bat ky trang nao (YouTube, TikTok, FB, ...)"
	ti.Focus()
	ti.CharLimit = 500
	ti.Width = 65
	ti.PromptStyle = lipgloss.NewStyle().Foreground(colorPrimary)
	ti.TextStyle = lipgloss.NewStyle().Foreground(colorText)

	return singleModel{input: ti}
}

func (m singleModel) Init() tea.Cmd {
	return textinput.Blink
}

func (m singleModel) Update(msg tea.Msg) (singleModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			url := strings.TrimSpace(m.input.Value())
			if url == "" {
				m.err = "Vui long nhap link video"
				return m, nil
			}
			if !isValidURL(url) {
				m.err = "Link khong hop le"
				return m, nil
			}
			m.err = ""
			return m, func() tea.Msg { return submitURLMsg{url: url} }
		}
	case tea.WindowSizeMsg:
		w := msg.Width - 10
		if w > 80 {
			w = 80
		}
		if w < 30 {
			w = 30
		}
		m.input.Width = w
	}

	var cmd tea.Cmd
	m.input, cmd = m.input.Update(msg)
	return m, cmd
}

func (m singleModel) View() string {
	header := headingStyle.Render("Tai 1 video") + "\n"

	inputBox := activeBoxStyle.Render(
		subtitleStyle.Render("Dan link video:") + "\n\n" +
			m.input.View(),
	)

	errText := ""
	if m.err != "" {
		errText = "\n" + errorStyle.Render(m.err)
	}

	help := "\n" + helpStyle.Render("enter: tiep tuc  |  esc: quay lai")

	return header + "\n" + inputBox + errText + help
}

func isValidURL(s string) bool {
	s = strings.ToLower(s)
	return strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://")
}
