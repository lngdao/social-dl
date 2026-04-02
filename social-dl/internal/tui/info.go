package tui

import (
	"fmt"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/lngdao/social-dl/internal/ytdlp"
)

type metaFetchedMsg struct{ meta *ytdlp.VideoMeta }
type metaErrorMsg struct{ err error }
type startDownloadMsg struct {
	meta         *ytdlp.VideoMeta
	quality      ytdlp.Quality
	includeAudio bool
}

type infoModel struct {
	spinner      spinner.Model
	url          string
	meta         *ytdlp.VideoMeta
	qualities    []ytdlp.Quality
	cursor       int
	includeAudio bool
	loading      bool
	err          error
}

func newInfoModel(url string, includeAudio bool) infoModel {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(colorPrimary)

	return infoModel{spinner: s, url: url, loading: true, includeAudio: includeAudio}
}

func (m infoModel) Init() tea.Cmd {
	return m.spinner.Tick
}

func (m infoModel) Update(msg tea.Msg) (infoModel, tea.Cmd) {
	switch msg := msg.(type) {
	case metaFetchedMsg:
		m.loading = false
		m.meta = msg.meta
		m.qualities = ytdlp.ExtractQualities(msg.meta)
		return m, nil
	case metaErrorMsg:
		m.loading = false
		m.err = msg.err
		return m, nil
	case tea.KeyMsg:
		if m.loading {
			return m, nil
		}
		switch msg.String() {
		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
			}
		case "down", "j":
			if m.cursor < len(m.qualities)-1 {
				m.cursor++
			}
		case "a":
			m.includeAudio = !m.includeAudio
		case "enter":
			if m.meta != nil && len(m.qualities) > 0 {
				return m, func() tea.Msg {
					return startDownloadMsg{
						meta:         m.meta,
						quality:      m.qualities[m.cursor],
						includeAudio: m.includeAudio,
					}
				}
			}
		}
	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m infoModel) View() string {
	if m.loading {
		return activeBoxStyle.Render(
			m.spinner.View()+" Dang lay thong tin video...\n\n"+
				mutedStyle.Render(truncate(m.url, 60)),
		)
	}

	if m.err != nil {
		return activeBoxStyle.Render(
			errorStyle.Render("Loi: "+m.err.Error())+"\n\n"+
				mutedStyle.Render(m.url),
		) + "\n" + helpStyle.Render("esc: quay lai")
	}

	// Video info card
	platform := tagStyle.Render(m.meta.Extractor)
	title := lipgloss.NewStyle().Bold(true).Foreground(colorText).Render(truncate(m.meta.Title, 55))
	uploader := mutedStyle.Render(m.meta.Uploader)
	duration := lipgloss.NewStyle().Foreground(colorSecondary).Render(formatDuration(m.meta.Duration))

	card := boxStyle.Render(
		platform + "\n\n" +
			title + "\n" +
			uploader + "  " + duration,
	)

	// Audio toggle
	audioTag := ""
	if m.includeAudio {
		audioTag = tagSuccessStyle.Render(" AUDIO ON ")
	} else {
		audioTag = tagErrorStyle.Render(" NO AUDIO ")
	}

	// Quality selector
	qualityList := headingStyle.Render("Chon chat luong:") + "  " + audioTag + "\n"
	for i, q := range m.qualities {
		cursor := "  "
		style := unselectedStyle
		if i == m.cursor {
			cursor = lipgloss.NewStyle().Foreground(colorPrimary).Bold(true).Render("> ")
			style = activeItemStyle
		}
		qualityList += cursor + style.Render(q.Label) + "\n"
	}

	help := helpStyle.Render("up/down: chon  |  a: bat/tat audio  |  enter: tai  |  esc: quay lai")

	return card + "\n\n" + qualityList + "\n" + help
}

func truncate(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max-1]) + "..."
}

func formatDuration(seconds float64) string {
	total := int(seconds)
	h := total / 3600
	m := (total % 3600) / 60
	s := total % 60
	if h > 0 {
		return fmt.Sprintf("%d:%02d:%02d", h, m, s)
	}
	return fmt.Sprintf("%d:%02d", m, s)
}
