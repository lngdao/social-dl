APP_NAME := social-dl
BUILD_DIR := dist
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")

.PHONY: build run clean test release-snapshot

build:
	CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$(VERSION)" -o $(BUILD_DIR)/$(APP_NAME) ./cmd/social-dl

run:
	go run ./cmd/social-dl

test:
	go test ./... -v

clean:
	rm -rf $(BUILD_DIR)

release-snapshot:
	goreleaser release --snapshot --clean
