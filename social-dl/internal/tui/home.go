package tui

import (
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type menuAction int

const (
	menuSingle menuAction = iota
	menuBatch
	menuProfile
	menuSettings
	menuHistory
)

type menuSelectMsg struct{ action menuAction }

type menuItem struct {
	action menuAction
	icon   string
	title  string
	desc   string
}

var menuItems = []menuItem{
	{menuSingle, ">>", "Tai 1 video", "YouTube, TikTok, Facebook, Twitter, 1800+ sites"},
	{menuBatch, "=", "Tai nhieu video", "Dan danh sach URLs hoac doc tu file"},
	{menuProfile, "@", "Tai tu profile", "Tai tat ca video tu trang ca nhan/kenh/playlist"},
	{menuSettings, "*", "Cai dat", "Audio, chat luong, thu muc luu, ..."},
	{menuHistory, "#", "Lich su", "Xem video da tai"},
}

type homeModel struct {
	cursor   int
	version  string
	settings AppSettings
}

func newHomeModel(version string, settings AppSettings) homeModel {
	return homeModel{version: version, settings: settings}
}

func (m homeModel) Init() tea.Cmd { return nil }

func (m homeModel) Update(msg tea.Msg) (homeModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
			}
		case "down", "j":
			if m.cursor < len(menuItems)-1 {
				m.cursor++
			}
		case "enter":
			item := menuItems[m.cursor]
			return m, func() tea.Msg { return menuSelectMsg{action: item.action} }
		case "1":
			return m, func() tea.Msg { return menuSelectMsg{action: menuSingle} }
		case "2":
			return m, func() tea.Msg { return menuSelectMsg{action: menuBatch} }
		case "3":
			return m, func() tea.Msg { return menuSelectMsg{action: menuProfile} }
		case "4":
			return m, func() tea.Msg { return menuSelectMsg{action: menuSettings} }
		case "5":
			return m, func() tea.Msg { return menuSelectMsg{action: menuHistory} }
		}
	}
	return m, nil
}

func (m homeModel) View() string {
	// Header
	header := logoView() + "  " + mutedStyle.Render("v"+m.version) + "\n\n"

	// Status bar
	audioTag := tagSuccessStyle.Render("AUDIO ON")
	if !m.settings.IncludeAudio {
		audioTag = tagMutedStyle.Render("NO AUDIO")
	}
	qualityTag := tagStyle.Render(m.settings.Quality)
	statusBar := audioTag + " " + qualityTag + " " +
		mutedStyle.Render(m.settings.OutputDir) + "\n\n"

	// Menu
	menu := ""
	for i, item := range menuItems {
		num := lipgloss.NewStyle().Foreground(colorDim).Render("[")
		numVal := lipgloss.NewStyle().Foreground(colorMuted)
		numEnd := lipgloss.NewStyle().Foreground(colorDim).Render("]")

		var title, desc string
		cursor := "  "

		if i == m.cursor {
			cursor = lipgloss.NewStyle().Foreground(colorPrimary).Bold(true).Render("> ")
			title = activeItemStyle.Render(item.title)
			desc = lipgloss.NewStyle().Foreground(colorSecondary).Render(" " + item.desc)
			numVal = numVal.Foreground(colorPrimary)
		} else {
			title = unselectedStyle.Render(item.title)
			desc = mutedStyle.Render(" " + item.desc)
		}

		line := cursor + num + numVal.Render(item.icon) + numEnd + " " + title + desc
		menu += line + "\n"
	}

	// Help
	help := "\n" + helpStyle.Render("up/down: di chuyen  |  enter: chon  |  1-5: chon nhanh  |  q: thoat")

	return header + statusBar + menu + help
}
