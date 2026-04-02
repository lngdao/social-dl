package tui

import "github.com/charmbracelet/lipgloss"

var (
	// Palette
	colorPrimary    = lipgloss.Color("#7C3AED")
	colorSecondary  = lipgloss.Color("#06B6D4")
	colorAccent     = lipgloss.Color("#F59E0B")
	colorSuccess    = lipgloss.Color("#10B981")
	colorError      = lipgloss.Color("#EF4444")
	colorMuted      = lipgloss.Color("#6B7280")
	colorText       = lipgloss.Color("#E5E7EB")
	colorDim        = lipgloss.Color("#374151")
	colorBg         = lipgloss.Color("#111827")
	colorBgSurface  = lipgloss.Color("#1F2937")

	// Typography
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(colorPrimary)

	subtitleStyle = lipgloss.NewStyle().
			Foreground(colorMuted).
			Italic(true)

	headingStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(colorText).
			MarginBottom(1)

	// Containers
	boxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(colorDim).
			Padding(1, 2)

	activeBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(colorPrimary).
			Padding(1, 2)

	// Status
	successStyle = lipgloss.NewStyle().
			Foreground(colorSuccess).
			Bold(true)

	errorStyle = lipgloss.NewStyle().
			Foreground(colorError).
			Bold(true)

	warnStyle = lipgloss.NewStyle().
			Foreground(colorAccent)

	mutedStyle = lipgloss.NewStyle().
			Foreground(colorMuted)

	// Interactive
	helpStyle = lipgloss.NewStyle().
			Foreground(colorMuted)

	selectedStyle = lipgloss.NewStyle().
			Foreground(colorPrimary).
			Bold(true)

	unselectedStyle = lipgloss.NewStyle().
			Foreground(colorText)

	activeItemStyle = lipgloss.NewStyle().
			Foreground(colorPrimary).
			Bold(true)

	// Tags
	tagStyle = lipgloss.NewStyle().
			Foreground(colorBg).
			Background(colorPrimary).
			Padding(0, 1).
			Bold(true)

	tagSuccessStyle = lipgloss.NewStyle().
			Foreground(colorBg).
			Background(colorSuccess).
			Padding(0, 1)

	tagErrorStyle = lipgloss.NewStyle().
			Foreground(colorBg).
			Background(colorError).
			Padding(0, 1)

	tagMutedStyle = lipgloss.NewStyle().
			Foreground(colorText).
			Background(colorDim).
			Padding(0, 1)
)

func logoView() string {
	logo := lipgloss.NewStyle().
		Bold(true).
		Foreground(colorPrimary).
		Render("SOCIAL-DL")
	line := lipgloss.NewStyle().
		Foreground(colorDim).
		Render(" ── ")
	desc := mutedStyle.Render("Video downloader")
	return logo + line + desc
}
