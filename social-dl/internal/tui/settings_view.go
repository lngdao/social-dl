package tui

import (
	"fmt"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type settingsSavedMsg struct{}

type settingsField int

const (
	fieldAudio settingsField = iota
	fieldQuality
	fieldConcurrency
	fieldOutputDir
	fieldArchive
	fieldVerbose
	fieldCount
)

type settingsViewModel struct {
	settings    AppSettings
	cursor      settingsField
	editing     bool // true when editing output dir
	dirInput    textinput.Model
}

func newSettingsViewModel(s AppSettings) settingsViewModel {
	di := textinput.New()
	di.Placeholder = "/path/to/downloads"
	di.CharLimit = 200
	di.Width = 50
	di.SetValue(s.OutputDir)
	di.PromptStyle = lipgloss.NewStyle().Foreground(colorPrimary)
	di.TextStyle = lipgloss.NewStyle().Foreground(colorText)

	return settingsViewModel{settings: s, dirInput: di}
}

func (m settingsViewModel) Init() tea.Cmd { return nil }

func (m settingsViewModel) Update(msg tea.Msg) (settingsViewModel, tea.Cmd) {
	if m.editing {
		return m.updateEditing(msg)
	}

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
			}
		case "down", "j":
			if m.cursor < fieldCount-1 {
				m.cursor++
			}
		case "enter", " ":
			switch m.cursor {
			case fieldAudio:
				m.settings.IncludeAudio = !m.settings.IncludeAudio
			case fieldQuality:
				m.settings.Quality = nextQuality(m.settings.Quality)
			case fieldOutputDir:
				m.editing = true
				m.dirInput.SetValue(m.settings.OutputDir)
				m.dirInput.Focus()
				return m, textinput.Blink
			case fieldArchive:
				m.settings.UseArchive = !m.settings.UseArchive
			case fieldConcurrency:
				m.settings.Concurrency++
				if m.settings.Concurrency > 10 {
					m.settings.Concurrency = 1
				}
			case fieldVerbose:
				m.settings.VerboseLog = !m.settings.VerboseLog
			}
			saveSettings(m.settings)
			return m, func() tea.Msg { return settingsSavedMsg{} }
		case "left", "h":
			switch m.cursor {
			case fieldQuality:
				m.settings.Quality = prevQuality(m.settings.Quality)
				saveSettings(m.settings)
				return m, func() tea.Msg { return settingsSavedMsg{} }
			case fieldConcurrency:
				if m.settings.Concurrency > 1 {
					m.settings.Concurrency--
				}
				saveSettings(m.settings)
				return m, func() tea.Msg { return settingsSavedMsg{} }
			}
		case "right", "l":
			switch m.cursor {
			case fieldQuality:
				m.settings.Quality = nextQuality(m.settings.Quality)
				saveSettings(m.settings)
				return m, func() tea.Msg { return settingsSavedMsg{} }
			case fieldConcurrency:
				if m.settings.Concurrency < 10 {
					m.settings.Concurrency++
				}
				saveSettings(m.settings)
				return m, func() tea.Msg { return settingsSavedMsg{} }
			}
		}
	}
	return m, nil
}

func (m settingsViewModel) updateEditing(msg tea.Msg) (settingsViewModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			m.settings.OutputDir = m.dirInput.Value()
			m.editing = false
			m.dirInput.Blur()
			saveSettings(m.settings)
			return m, func() tea.Msg { return settingsSavedMsg{} }
		case "esc":
			m.editing = false
			m.dirInput.Blur()
			return m, nil
		}
	}
	var cmd tea.Cmd
	m.dirInput, cmd = m.dirInput.Update(msg)
	return m, cmd
}

func (m settingsViewModel) View() string {
	header := headingStyle.Render("Cai dat") + "\n\n"

	rows := []struct {
		field settingsField
		label string
		value string
	}{
		{fieldAudio, "Bao gom audio", toggleView(m.settings.IncludeAudio)},
		{fieldQuality, "Chat luong", qualityView(m.settings.Quality)},
		{fieldConcurrency, "Song song", concurrencyView(m.settings.Concurrency)},
		{fieldOutputDir, "Thu muc luu", m.settings.OutputDir},
		{fieldArchive, "Bo qua da tai", toggleView(m.settings.UseArchive)},
		{fieldVerbose, "Ghi log debug", verboseView(m.settings.VerboseLog)},
	}

	content := ""
	for _, row := range rows {
		cursor := "  "
		label := mutedStyle.Render(row.label)
		value := lipgloss.NewStyle().Foreground(colorText).Render(row.value)

		if m.cursor == row.field {
			cursor = lipgloss.NewStyle().Foreground(colorPrimary).Bold(true).Render("> ")
			label = lipgloss.NewStyle().Foreground(colorText).Bold(true).Render(row.label)
			value = lipgloss.NewStyle().Foreground(colorPrimary).Bold(true).Render(row.value)
		}

		// If editing output dir, show text input instead
		if m.editing && row.field == fieldOutputDir {
			content += fmt.Sprintf("%s%s\n", cursor, label)
			content += "    " + m.dirInput.View() + "\n"
			continue
		}

		padding := ""
		nameLen := len(row.label)
		for i := nameLen; i < 20; i++ {
			padding += " "
		}

		content += fmt.Sprintf("%s%s%s%s\n", cursor, label, padding, value)
	}

	var help string
	if m.editing {
		help = "\n" + helpStyle.Render("enter: luu  |  esc: huy")
	} else {
		help = "\n" + helpStyle.Render("enter/space: thay doi  |  left/right: dieu chinh  |  esc: quay lai")
	}

	return header + boxStyle.Render(content) + help
}

func concurrencyView(n int) string {
	bar := ""
	for i := 1; i <= 10; i++ {
		if i <= n {
			bar += lipgloss.NewStyle().Foreground(colorPrimary).Bold(true).Render("█")
		} else {
			bar += mutedStyle.Render("░")
		}
	}
	return fmt.Sprintf("< %s > %d", bar, n)
}

func verboseView(on bool) string {
	if on {
		return "[ON]   " + mutedStyle.Render(logFilePath())
	}
	return "[OFF] "
}

func toggleView(on bool) string {
	if on {
		return "[ON]  "
	}
	return "[OFF] "
}

func qualityView(q string) string {
	result := ""
	for _, opt := range qualityOptions {
		if opt == q {
			result += lipgloss.NewStyle().Foreground(colorPrimary).Bold(true).Render(" " + opt + " ")
		} else {
			result += mutedStyle.Render(" " + opt + " ")
		}
	}
	return "<" + result + ">"
}

func nextQuality(current string) string {
	for i, q := range qualityOptions {
		if q == current {
			return qualityOptions[(i+1)%len(qualityOptions)]
		}
	}
	return qualityOptions[0]
}

func prevQuality(current string) string {
	for i, q := range qualityOptions {
		if q == current {
			idx := i - 1
			if idx < 0 {
				idx = len(qualityOptions) - 1
			}
			return qualityOptions[idx]
		}
	}
	return qualityOptions[0]
}
