package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/lngdao/social-dl/internal/tui"
)

var version = "dev"

func main() {
	// Strip v prefix if injected from git tag (e.g. "v2026.402.1" → "2026.402.1")
	v := version
	if len(v) > 0 && v[0] == 'v' {
		v = v[1:]
	}
	app, err := tui.NewApp(v)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	p := tea.NewProgram(app, tea.WithAltScreen())
	app.SetProgram(p)

	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
