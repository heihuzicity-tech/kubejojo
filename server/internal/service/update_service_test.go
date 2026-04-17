package service

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
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

func TestCheckForActorMarksPendingRestartFromInstalledVersion(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	managedPath := filepath.Join(tempDir, "kubejojo")
	backupPath := managedPath + ".backup"
	writeVersionScript(t, managedPath, "0.1.4")
	writeVersionScript(t, backupPath, "0.1.3")

	service := NewUpdateService(
		buildinfo.New("0.1.3", "commit", "date", "release"),
		config.UpdateConfig{
			Enabled:         true,
			Repository:      "example/project",
			AllowedSubjects: []string{"tester"},
			TargetPath:      managedPath,
		},
		true,
	)
	service.httpClient.Transport = releaseRoundTripper(t, githubRelease{
		TagName:     "v0.1.4",
		Name:        "v0.1.4",
		PublishedAt: "2026-04-17T00:00:00Z",
		HTMLURL:     "https://github.com/example/project/releases/tag/v0.1.4",
	})

	status, err := service.CheckForActor(context.Background(), "tester", true)
	if err != nil {
		t.Fatalf("CheckForActor() returned error: %v", err)
	}

	if status.RunningVersion != "0.1.3" {
		t.Fatalf("RunningVersion = %q, want %q", status.RunningVersion, "0.1.3")
	}
	if status.InstalledVersion != "0.1.4" {
		t.Fatalf("InstalledVersion = %q, want %q", status.InstalledVersion, "0.1.4")
	}
	if status.LatestVersion != "0.1.4" {
		t.Fatalf("LatestVersion = %q, want %q", status.LatestVersion, "0.1.4")
	}
	if !status.PendingRestart {
		t.Fatal("expected PendingRestart to be true")
	}
	if status.HasUpdate {
		t.Fatal("expected HasUpdate to be false after latest version is already installed")
	}
	if status.PrimaryState != "restart_required" {
		t.Fatalf("PrimaryState = %q, want %q", status.PrimaryState, "restart_required")
	}
	if status.CanInstall {
		t.Fatal("expected CanInstall to be false while restart is pending")
	}
	if runtime.GOOS == "linux" {
		if !status.CanRestart {
			t.Fatal("expected CanRestart to be true while restart is pending on Linux")
		}
	} else if status.CanRestart {
		t.Fatal("expected CanRestart to be false on non-Linux hosts")
	}
	if !status.CanRollback {
		t.Fatal("expected CanRollback to be true with a meaningful backup")
	}
	if status.BackupVersion != "0.1.3" {
		t.Fatalf("BackupVersion = %q, want %q", status.BackupVersion, "0.1.3")
	}
}

func TestCheckForActorIgnoresBackupWhenVersionMatchesInstalled(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	managedPath := filepath.Join(tempDir, "kubejojo")
	backupPath := managedPath + ".backup"
	writeVersionScript(t, managedPath, "0.1.4")
	writeVersionScript(t, backupPath, "0.1.4")

	service := NewUpdateService(
		buildinfo.New("0.1.4", "commit", "date", "release"),
		config.UpdateConfig{
			Enabled:         true,
			Repository:      "example/project",
			AllowedSubjects: []string{"tester"},
			TargetPath:      managedPath,
		},
		true,
	)
	service.httpClient.Transport = releaseRoundTripper(t, githubRelease{
		TagName: "v0.1.4",
		Name:    "v0.1.4",
	})

	status, err := service.CheckForActor(context.Background(), "tester", true)
	if err != nil {
		t.Fatalf("CheckForActor() returned error: %v", err)
	}

	if status.BackupAvailable {
		t.Fatal("expected BackupAvailable to be false when backup matches installed version")
	}
	if status.CanRollback {
		t.Fatal("expected CanRollback to be false when backup matches installed version")
	}
	if status.PrimaryState != "up_to_date" {
		t.Fatalf("PrimaryState = %q, want %q", status.PrimaryState, "up_to_date")
	}
}

func TestPerformUpdateUsesConfiguredTargetPathAndStagesRestart(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	managedPath := filepath.Join(tempDir, "kubejojo")
	writeVersionScript(t, managedPath, "0.1.3")

	archiveName := "kubejojo_0.1.4_" + runtime.GOOS + "_" + runtime.GOARCH + ".tar.gz"
	archivePath := filepath.Join(tempDir, archiveName)
	createReleaseArchive(t, archivePath, "0.1.4")
	checksum := fileSHA256(t, archivePath)
	checksumBody := fmt.Sprintf("%s  %s\n", checksum, archiveName)

	service := NewUpdateService(
		buildinfo.New("0.1.3", "commit", "date", "release"),
		config.UpdateConfig{
			Enabled:         true,
			Repository:      "example/project",
			AllowedSubjects: []string{"tester"},
			TargetPath:      managedPath,
		},
		true,
	)
	service.httpClient.Transport = updateRoundTripper(t, archiveName, archivePath, checksumBody)

	result, err := service.PerformUpdate(context.Background(), "tester")
	if err != nil {
		t.Fatalf("PerformUpdate() returned error: %v", err)
	}

	if !result.NeedRestart {
		t.Fatal("expected NeedRestart to be true")
	}
	assertBinaryVersion(t, managedPath, "0.1.4")
	assertBinaryVersion(t, managedPath+".backup", "0.1.3")
}

func TestRollbackSwapsManagedAndBackupVersions(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	managedPath := filepath.Join(tempDir, "kubejojo")
	backupPath := managedPath + ".backup"
	writeVersionScript(t, managedPath, "0.1.4")
	writeVersionScript(t, backupPath, "0.1.3")

	service := NewUpdateService(
		buildinfo.New("0.1.3", "commit", "date", "release"),
		config.UpdateConfig{
			AllowedSubjects: []string{"tester"},
			TargetPath:      managedPath,
		},
		true,
	)

	result, err := service.Rollback("tester")
	if err != nil {
		t.Fatalf("Rollback() returned error: %v", err)
	}
	if !result.NeedRestart {
		t.Fatal("expected NeedRestart to be true")
	}

	assertBinaryVersion(t, managedPath, "0.1.3")
	assertBinaryVersion(t, backupPath, "0.1.4")
}

func TestNormalizeManagedBinaryPathStripsLegacyBackupSuffixes(t *testing.T) {
	t.Parallel()

	actual := normalizeManagedBinaryPath("/opt/kubejojo/kubejojo.backup.backup")
	if actual != "/opt/kubejojo/kubejojo" {
		t.Fatalf("normalizeManagedBinaryPath() = %q, want %q", actual, "/opt/kubejojo/kubejojo")
	}
}

func writeVersionScript(t *testing.T, path string, version string) {
	t.Helper()

	content := fmt.Sprintf(
		"#!/bin/sh\nif [ \"$1\" = \"-version\" ]; then\n  echo 'kubejojo %s (commit: test, built: test, type: release)'\n  exit 0\nfi\nexit 0\n",
		version,
	)
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("write version script %s: %v", path, err)
	}
}

func assertBinaryVersion(t *testing.T, path string, want string) {
	t.Helper()

	version, err := NewUpdateService(buildinfo.Info{}, config.UpdateConfig{}, false).readOptionalBinaryVersion(path)
	if err != nil {
		t.Fatalf("readOptionalBinaryVersion(%s) returned error: %v", path, err)
	}
	if version != want {
		t.Fatalf("binary %s version = %q, want %q", path, version, want)
	}
}

func releaseRoundTripper(t *testing.T, release githubRelease) roundTripperFunc {
	t.Helper()

	return roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Host != "api.github.com" {
			return nil, fmt.Errorf("unexpected request host %s", req.URL.Host)
		}

		body, err := json.Marshal(release)
		if err != nil {
			t.Fatalf("marshal release: %v", err)
		}

		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(bytes.NewReader(body)),
		}, nil
	})
}

func updateRoundTripper(t *testing.T, archiveName string, archivePath string, checksumBody string) roundTripperFunc {
	t.Helper()

	release := githubRelease{
		TagName: "v0.1.4",
		Name:    "v0.1.4",
		Assets: []githubReleaseAsset{
			{
				Name:               archiveName,
				BrowserDownloadURL: "https://github.com/example/project/releases/download/v0.1.4/" + archiveName,
			},
			{
				Name:               "checksums.txt",
				BrowserDownloadURL: "https://github.com/example/project/releases/download/v0.1.4/checksums.txt",
			},
		},
	}
	releaseBody, err := json.Marshal(release)
	if err != nil {
		t.Fatalf("marshal release: %v", err)
	}

	archiveBytes, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatalf("read archive %s: %v", archivePath, err)
	}

	return roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		switch {
		case req.URL.Host == "api.github.com" && req.URL.Path == "/repos/example/project/releases/latest":
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(bytes.NewReader(releaseBody)),
			}, nil
		case req.URL.Host == "github.com" && strings.HasSuffix(req.URL.Path, "/"+archiveName):
			return &http.Response{
				StatusCode:    http.StatusOK,
				ContentLength: int64(len(archiveBytes)),
				Header:        make(http.Header),
				Body:          io.NopCloser(bytes.NewReader(archiveBytes)),
			}, nil
		case req.URL.Host == "github.com" && strings.HasSuffix(req.URL.Path, "/checksums.txt"):
			return &http.Response{
				StatusCode:    http.StatusOK,
				ContentLength: int64(len(checksumBody)),
				Header:        make(http.Header),
				Body:          io.NopCloser(bytes.NewBufferString(checksumBody)),
			}, nil
		default:
			return nil, fmt.Errorf("unexpected request %s", req.URL.String())
		}
	})
}

func createReleaseArchive(t *testing.T, archivePath string, version string) {
	t.Helper()

	file, err := os.Create(archivePath)
	if err != nil {
		t.Fatalf("create archive %s: %v", archivePath, err)
	}
	defer func() { _ = file.Close() }()

	gzipWriter := gzip.NewWriter(file)
	defer gzipWriter.Close()

	tarWriter := tar.NewWriter(gzipWriter)
	defer tarWriter.Close()

	content := fmt.Sprintf(
		"#!/bin/sh\nif [ \"$1\" = \"-version\" ]; then\n  echo 'kubejojo %s (commit: test, built: test, type: release)'\n  exit 0\nfi\nexit 0\n",
		version,
	)

	header := &tar.Header{
		Name: "kubejojo",
		Mode: 0o755,
		Size: int64(len(content)),
	}
	if err := tarWriter.WriteHeader(header); err != nil {
		t.Fatalf("write archive header: %v", err)
	}
	if _, err := tarWriter.Write([]byte(content)); err != nil {
		t.Fatalf("write archive body: %v", err)
	}
}

func fileSHA256(t *testing.T, path string) string {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file %s: %v", path, err)
	}
	hash := sha256.Sum256(content)
	return hex.EncodeToString(hash[:])
}
