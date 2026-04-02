package tui

import (
	"bufio"
	"os"
	"strings"
	"time"

	"github.com/atotto/clipboard"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type submitBatchMsg struct {
	urls      []string
	subfolder string
}

type batchMode int

const (
	batchModeInput batchMode = iota
	batchModeFile
)

type batchStep int

const (
	stepURLs    batchStep = iota // nhập URLs
	stepOptions                  // chọn subfolder rồi confirm
)

type batchModel struct {
	step     batchStep
	mode     batchMode
	textarea textarea.Model
	fileInput textinput.Model
	folderInput textinput.Model
	err      string
	urlCount int
	urls     []string // parsed URLs, saved when moving to stepOptions
}

func newBatchModel() batchModel {
	ta := textarea.New()
	ta.Placeholder = "Dan danh sach URLs vao day, moi URL 1 dong...\nhttps://youtube.com/watch?v=xxx\nhttps://tiktok.com/@user/video/456"
	ta.SetWidth(70)
	ta.SetHeight(8)
	ta.Focus()
	ta.ShowLineNumbers = false

	fi := textinput.New()
	fi.Placeholder = "/path/to/urls.txt"
	fi.CharLimit = 300
	fi.Width = 65
	fi.PromptStyle = lipgloss.NewStyle().Foreground(colorPrimary)

	fo := textinput.New()
	fo.Placeholder = "vd: fb-reels-03-2026  (de trong = luu thang vao output dir)"
	fo.CharLimit = 100
	fo.Width = 65
	fo.PromptStyle = lipgloss.NewStyle().Foreground(colorPrimary)
	fo.TextStyle = lipgloss.NewStyle().Foreground(colorText)

	return batchModel{
		step:        stepURLs,
		mode:        batchModeInput,
		textarea:    ta,
		fileInput:   fi,
		folderInput: fo,
	}
}

func (m batchModel) Init() tea.Cmd {
	return textarea.Blink
}

func (m batchModel) Update(msg tea.Msg) (batchModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch m.step {
		case stepURLs:
			return m.updateURLStep(msg)
		case stepOptions:
			return m.updateOptionsStep(msg)
		}
	case tea.WindowSizeMsg:
		w := msg.Width - 10
		if w > 80 {
			w = 80
		}
		if w < 30 {
			w = 30
		}
		m.textarea.SetWidth(w)
		m.fileInput.Width = w
		m.folderInput.Width = w
	}

	var cmd tea.Cmd
	switch m.step {
	case stepURLs:
		if m.mode == batchModeInput {
			m.textarea, cmd = m.textarea.Update(msg)
			m.urlCount = countURLs(m.textarea.Value())
		} else {
			m.fileInput, cmd = m.fileInput.Update(msg)
		}
	case stepOptions:
		m.folderInput, cmd = m.folderInput.Update(msg)
	}
	return m, cmd
}

func (m batchModel) updateURLStep(msg tea.KeyMsg) (batchModel, tea.Cmd) {
	switch msg.String() {
	case "ctrl+v":
		// Đọc clipboard trực tiếp — fix paste nhiều dòng trên Windows
		if m.mode == batchModeInput {
			text, err := clipboard.ReadAll()
			if err == nil && text != "" {
				existing := m.textarea.Value()
				if existing != "" && !strings.HasSuffix(existing, "\n") {
					text = "\n" + text
				}
				m.textarea.SetValue(existing + text)
				m.urlCount = countURLs(m.textarea.Value())
			}
		}
		return m, nil

	case "tab":
		if m.mode == batchModeInput {
			m.mode = batchModeFile
			m.textarea.Blur()
			m.fileInput.Focus()
			return m, textinput.Blink
		}
		m.mode = batchModeInput
		m.fileInput.Blur()
		m.textarea.Focus()
		return m, textarea.Blink

	case "ctrl+d":
		// Parse URLs and move to options step
		var urls []string
		if m.mode == batchModeInput {
			urls = parseURLs(m.textarea.Value())
		} else {
			path := strings.TrimSpace(m.fileInput.Value())
			var err error
			urls, err = readURLsFromFile(path)
			if err != nil {
				m.err = "Khong doc duoc file: " + err.Error()
				return m, nil
			}
		}
		if len(urls) == 0 {
			m.err = "Khong tim thay URL hop le"
			return m, nil
		}
		m.err = ""
		m.urls = urls
		m.step = stepOptions
		m.textarea.Blur()
		m.fileInput.Blur()
		m.folderInput.Focus()
		suggestion := "batch-" + time.Now().Format("2006-01-02")
		m.folderInput.SetValue(suggestion)
		m.folderInput.SetCursor(len(suggestion))
		return m, textinput.Blink
	}
	return m, nil
}

func (m batchModel) updateOptionsStep(msg tea.KeyMsg) (batchModel, tea.Cmd) {
	switch msg.String() {
	case "ctrl+d":
		subfolder := strings.TrimSpace(m.folderInput.Value())
		urls := m.urls
		return m, func() tea.Msg {
			return submitBatchMsg{urls: urls, subfolder: subfolder}
		}
	case "enter":
		// Only submit if folder input is not empty or user explicitly presses enter
		subfolder := strings.TrimSpace(m.folderInput.Value())
		urls := m.urls
		return m, func() tea.Msg {
			return submitBatchMsg{urls: urls, subfolder: subfolder}
		}
	case "esc":
		m.step = stepURLs
		m.folderInput.Blur()
		if m.mode == batchModeInput {
			m.textarea.Focus()
			return m, textarea.Blink
		}
		m.fileInput.Focus()
		return m, textinput.Blink
	}
	// Forward all other keys to folder input (typing, backspace, etc.)
	var cmd tea.Cmd
	m.folderInput, cmd = m.folderInput.Update(msg)
	return m, cmd
}

func (m batchModel) View() string {
	header := headingStyle.Render("Tai nhieu video") + "\n"

	if m.step == stepOptions {
		return header + m.optionsView()
	}
	return header + m.urlsView()
}

func (m batchModel) urlsView() string {
	// Mode tabs
	inputTab := tagMutedStyle.Render(" Dan URLs ")
	fileTab := tagMutedStyle.Render(" Doc tu file ")
	if m.mode == batchModeInput {
		inputTab = tagStyle.Render(" Dan URLs ")
	} else {
		fileTab = tagStyle.Render(" Doc tu file ")
	}
	tabs := inputTab + " " + fileTab + "  " + mutedStyle.Render("(tab: chuyen)") + "\n\n"

	var content string
	if m.mode == batchModeInput {
		content = activeBoxStyle.Render(m.textarea.View())
		if m.urlCount > 0 {
			content += "\n" + lipgloss.NewStyle().Foreground(colorSecondary).
				Render(itoa(m.urlCount)+" link tim thay")
		}
	} else {
		content = activeBoxStyle.Render(
			subtitleStyle.Render("Duong dan file:") + "\n\n" +
				m.fileInput.View(),
		)
	}

	if m.err != "" {
		content += "\n" + errorStyle.Render(m.err)
	}

	help := "\n" + helpStyle.Render("ctrl+v: dan  |  ctrl+d: tiep tuc  |  tab: chuyen mode  |  esc: quay lai")

	return tabs + content + help
}

func (m batchModel) optionsView() string {
	summary := lipgloss.NewStyle().Foreground(colorSecondary).Bold(true).
		Render(itoa(len(m.urls)) + " video") +
		mutedStyle.Render(" san sang tai")

	folderBox := activeBoxStyle.Render(
		subtitleStyle.Render("Ten thu muc con (de trong = khong tao):") + "\n\n" +
			m.folderInput.View(),
	)

	help := "\n" + helpStyle.Render("enter/ctrl+d: bat dau tai  |  esc: quay lai sua URLs")

	return summary + "\n\n" + folderBox + help
}

func parseURLs(text string) []string {
	var urls []string
	scanner := bufio.NewScanner(strings.NewReader(text))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if isValidURL(line) {
			urls = append(urls, line)
		}
	}
	return urls
}

func countURLs(text string) int {
	return len(parseURLs(text))
}

func readURLsFromFile(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var urls []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if isValidURL(line) {
			urls = append(urls, line)
		}
	}
	return urls, scanner.Err()
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}
