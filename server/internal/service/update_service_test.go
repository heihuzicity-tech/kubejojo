package service

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/heihuzicity-tech/kubejojo/server/internal/buildinfo"
	"github.com/heihuzicity-tech/kubejojo/server/internal/config"
)

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (fn roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestCompareVersions(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name     string
		left     string
		right    string
		expected int
	}{
		{
			name:     "equal stable versions",
			left:     "0.1.0",
			right:    "0.1.0",
			expected: 0,
		},
		{
			name:     "higher patch version wins",
			left:     "0.1.1",
			right:    "0.1.0",
			expected: 1,
		},
		{
			name:     "lower patch version loses",
			left:     "0.1.0",
			right:    "0.1.1",
			expected: -1,
		},
		{
			name:     "stable version beats prerelease",
			left:     "0.1.0",
			right:    "0.1.0-dev",
			expected: 1,
		},
		{
			name:     "prerelease loses to stable",
			left:     "0.1.0-dev",
			right:    "0.1.0",
			expected: -1,
		},
		{
			name:     "leading v prefix is ignored",
			left:     "v0.2.0",
			right:    "0.1.9",
			expected: 1,
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			result := compareVersions(testCase.left, testCase.right)
			if result != testCase.expected {
				t.Fatalf("compareVersions(%q, %q) = %d, want %d", testCase.left, testCase.right, result, testCase.expected)
			}
		})
	}
}

func TestSelectNewestRelease(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name        string
		releases    []githubRelease
		expectedTag string
		expectError bool
	}{
		{
			name: "selects newest prerelease when it is ahead of stable",
			releases: []githubRelease{
				{TagName: "v0.1.0"},
				{TagName: "v0.2.0-rc.1"},
			},
			expectedTag: "v0.2.0-rc.1",
		},
		{
			name: "ignores draft releases",
			releases: []githubRelease{
				{TagName: "v0.3.0-rc.1", Draft: true},
				{TagName: "v0.2.1"},
			},
			expectedTag: "v0.2.1",
		},
		{
			name:        "errors when no published releases are usable",
			releases:    []githubRelease{{TagName: "", Draft: true}},
			expectError: true,
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			release, err := selectNewestRelease(testCase.releases)
			if testCase.expectError {
				if err == nil {
					t.Fatal("expected an error but got nil")
				}
				return
			}

			if err != nil {
				t.Fatalf("selectNewestRelease() returned error: %v", err)
			}
			if release == nil {
				t.Fatal("selectNewestRelease() returned nil release")
			}
			if release.TagName != testCase.expectedTag {
				t.Fatalf("selectNewestRelease() = %q, want %q", release.TagName, testCase.expectedTag)
			}
		})
	}
}

func TestSelectNewestStableRelease(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name        string
		releases    []githubRelease
		expectedTag string
		expectError bool
	}{
		{
			name: "selects newest stable release",
			releases: []githubRelease{
				{TagName: "v0.2.0-rc.1", Prerelease: true},
				{TagName: "v0.1.0"},
				{TagName: "v0.2.0"},
			},
			expectedTag: "v0.2.0",
		},
		{
			name: "ignores drafts and prereleases",
			releases: []githubRelease{
				{TagName: "v0.3.0", Draft: true},
				{TagName: "v0.4.0-rc.1", Prerelease: true},
				{TagName: "v0.2.1"},
			},
			expectedTag: "v0.2.1",
		},
		{
			name: "errors when only prereleases exist",
			releases: []githubRelease{
				{TagName: "v0.3.0-rc.1", Prerelease: true},
			},
			expectError: true,
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			release, err := selectNewestStableRelease(testCase.releases)
			if testCase.expectError {
				if err == nil {
					t.Fatal("expected an error but got nil")
				}
				return
			}

			if err != nil {
				t.Fatalf("selectNewestStableRelease() returned error: %v", err)
			}
			if release == nil {
				t.Fatal("selectNewestStableRelease() returned nil release")
			}
			if release.TagName != testCase.expectedTag {
				t.Fatalf("selectNewestStableRelease() = %q, want %q", release.TagName, testCase.expectedTag)
			}
		})
	}
}

func TestHasUsablePrerelease(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name     string
		releases []githubRelease
		expected bool
	}{
		{
			name: "finds published prerelease",
			releases: []githubRelease{
				{TagName: "v0.2.0-rc.1", Prerelease: true},
			},
			expected: true,
		},
		{
			name: "ignores draft prerelease",
			releases: []githubRelease{
				{TagName: "v0.2.0-rc.1", Prerelease: true, Draft: true},
			},
			expected: false,
		},
		{
			name: "ignores stable release",
			releases: []githubRelease{
				{TagName: "v0.2.0"},
			},
			expected: false,
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			if actual := hasUsablePrerelease(testCase.releases); actual != testCase.expected {
				t.Fatalf("hasUsablePrerelease() = %v, want %v", actual, testCase.expected)
			}
		})
	}
}

func TestGitHubReleaseAssetDownloadURL(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name     string
		asset    githubReleaseAsset
		expected string
	}{
		{
			name: "prefers api asset url when present",
			asset: githubReleaseAsset{
				APIURL:             "https://api.github.com/repos/example/releases/assets/1",
				BrowserDownloadURL: "https://github.com/example/releases/download/v1.0.0/app.tar.gz",
			},
			expected: "https://api.github.com/repos/example/releases/assets/1",
		},
		{
			name: "falls back to browser download url",
			asset: githubReleaseAsset{
				BrowserDownloadURL: "https://github.com/example/releases/download/v1.0.0/app.tar.gz",
			},
			expected: "https://github.com/example/releases/download/v1.0.0/app.tar.gz",
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			if actual := testCase.asset.DownloadURL(); actual != testCase.expected {
				t.Fatalf("DownloadURL() = %q, want %q", actual, testCase.expected)
			}
		})
	}
}

func TestNewUpdateServiceDoesNotSetGlobalHTTPTimeout(t *testing.T) {
	t.Parallel()

	service := NewUpdateService(buildinfo.Info{}, config.UpdateConfig{}, false)
	if service.httpClient == nil {
		t.Fatal("expected HTTP client to be initialized")
	}
	if service.httpClient.Timeout != 0 {
		t.Fatalf("expected shared HTTP client timeout to be unset, got %s", service.httpClient.Timeout)
	}
}

func TestDoGitHubJSONRequestAppliesGitHubAPITimeout(t *testing.T) {
	t.Parallel()

	service := NewUpdateService(buildinfo.Info{}, config.UpdateConfig{}, false)

	var (
		capturedDeadline time.Time
		capturedAt       time.Time
		hasDeadline      bool
	)

	service.httpClient.Transport = roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		capturedAt = time.Now()
		capturedDeadline, hasDeadline = req.Context().Deadline()
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(bytes.NewBufferString("[]")),
		}, nil
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	resp, err := service.doGitHubJSONRequest(ctx, "https://api.github.com/repos/example/project/releases?per_page=20")
	if err != nil {
		t.Fatalf("doGitHubJSONRequest() returned error: %v", err)
	}
	resp.Body.Close()

	if !hasDeadline {
		t.Fatal("expected GitHub API request context to have a deadline")
	}

	ttl := capturedDeadline.Sub(capturedAt)
	if ttl < 28*time.Second || ttl > 31*time.Second {
		t.Fatalf("expected GitHub API request deadline near %s, got %s", gitHubAPIRequestTTL, ttl)
	}
}

func TestDownloadFileUsesCallerContextWithoutInjectedDeadline(t *testing.T) {
	t.Parallel()

	service := NewUpdateService(buildinfo.Info{}, config.UpdateConfig{}, false)
	tempDir := t.TempDir()
	destPath := tempDir + "/kubejojo.tar.gz"

	var hasDeadline bool
	service.httpClient.Transport = roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		_, hasDeadline = req.Context().Deadline()
		return &http.Response{
			StatusCode:    http.StatusOK,
			ContentLength: 7,
			Header:        make(http.Header),
			Body:          io.NopCloser(bytes.NewBufferString("payload")),
		}, nil
	})

	if err := service.downloadFile(context.Background(), "https://github.com/example/project/releases/download/v1.0.0/kubejojo.tar.gz", destPath); err != nil {
		t.Fatalf("downloadFile() returned error: %v", err)
	}

	if hasDeadline {
		t.Fatal("expected download request to rely on caller context without an injected deadline")
	}

	content, err := os.ReadFile(destPath)
	if err != nil {
		t.Fatalf("read downloaded file: %v", err)
	}
	if string(content) != "payload" {
		t.Fatalf("downloaded file = %q, want %q", string(content), "payload")
	}
}
