package tui

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/lngdao/social-dl/internal/deps"
)

type HistoryEntry struct {
	Title      string    `json:"title"`
	URL        string    `json:"url"`
	FilePath   string    `json:"file_path"`
	Quality    string    `json:"quality"`
	Platform   string    `json:"platform"`
	DownloadAt time.Time `json:"download_at"`
}

type historyModel struct {
	entries []HistoryEntry
	cursor  int
	offset  int // for scrolling
}

func newHistoryModel() historyModel {
	entries, _ := loadHistory()
	return historyModel{entries: entries}
}

func (m historyModel) Init() tea.Cmd { return nil }

func (m historyModel) Update(msg tea.Msg) (historyModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
				if m.cursor < m.offset {
					m.offset = m.cursor
				}
			}
		case "down", "j":
			if m.cursor < len(m.entries)-1 {
				m.cursor++
				if m.cursor >= m.offset+12 {
					m.offset = m.cursor - 11
				}
			}
		}
	}
	return m, nil
}

func (m historyModel) View() string {
	header := headingStyle.Render("Lich su tai") +
		mutedStyle.Render(fmt.Sprintf("  (%d video)", len(m.entries))) + "\n\n"

	if len(m.entries) == 0 {
		return header + boxStyle.Render(
			mutedStyle.Render("Chua co video nao duoc tai.")+"\n\n"+
				helpStyle.Render("esc: quay lai"),
		)
	}

	// Show reversed (newest first), with scrolling
	list := ""
	maxVisible := 12
	reversed := reverseEntries(m.entries)

	end := m.offset + maxVisible
	if end > len(reversed) {
		end = len(reversed)
	}

	for i := m.offset; i < end; i++ {
		e := reversed[i]
		cursor := "  "
		style := lipgloss.NewStyle().Foreground(colorText)
		if i == m.cursor {
			cursor = lipgloss.NewStyle().Foreground(colorPrimary).Bold(true).Render("> ")
			style = style.Foreground(colorPrimary)
		}

		timeStr := mutedStyle.Render(e.DownloadAt.Format("02/01 15:04"))
		platform := ""
		if e.Platform != "" {
			platform = tagMutedStyle.Render(e.Platform) + " "
		}
		title := style.Render(truncate(e.Title, 45))

		list += fmt.Sprintf("%s%s%s  %s\n", cursor, platform, title, timeStr)
	}

	if len(reversed) > maxVisible {
		scroll := mutedStyle.Render(fmt.Sprintf("  [%d-%d / %d]", m.offset+1, end, len(reversed)))
		list += scroll
	}

	help := "\n" + helpStyle.Render("up/down: di chuyen  |  esc: quay lai")
	return header + list + help
}

func reverseEntries(entries []HistoryEntry) []HistoryEntry {
	n := len(entries)
	rev := make([]HistoryEntry, n)
	for i, e := range entries {
		rev[n-1-i] = e
	}
	return rev
}

// --- Persistence ---

func historyPath() string {
	dir, _ := deps.BinDir()
	return filepath.Join(filepath.Dir(dir), "history.json")
}

func loadHistory() ([]HistoryEntry, error) {
	data, err := os.ReadFile(historyPath())
	if err != nil {
		return nil, nil
	}
	var entries []HistoryEntry
	json.Unmarshal(data, &entries)
	return entries, nil
}

func SaveHistory(entry HistoryEntry) error {
	entries, _ := loadHistory()
	entries = append(entries, entry)
	if len(entries) > 200 {
		entries = entries[len(entries)-200:]
	}
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(historyPath(), data, 0644)
}
