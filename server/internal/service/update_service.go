package service

import (
	"archive/tar"
	"bufio"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/heihuzicity-tech/kubejojo/server/internal/buildinfo"
	"github.com/heihuzicity-tech/kubejojo/server/internal/config"
)

const (
	updateCacheTTL   = 20 * time.Minute
	maxDownloadSize  = 256 * 1024 * 1024
	restartDelay     = 500 * time.Millisecond
	defaultUserAgent = "kubejojo-update-client"
)

var allowedUpdateHosts = map[string]struct{}{
	"api.github.com":                       {},
	"github.com":                           {},
	"objects.githubusercontent.com":        {},
	"release-assets.githubusercontent.com": {},
}

type PermissionError struct {
	message string
}

func (e PermissionError) Error() string {
	return e.message
}

type UpdateReleaseInfo struct {
	Name        string `json:"name"`
	Body        string `json:"body"`
	PublishedAt string `json:"publishedAt"`
	HTMLURL     string `json:"htmlUrl"`
}

type UpdateStatus struct {
	CurrentVersion   string             `json:"currentVersion"`
	LatestVersion    string             `json:"latestVersion"`
	HasUpdate        bool               `json:"hasUpdate"`
	Cached           bool               `json:"cached"`
	Warning          string             `json:"warning,omitempty"`
	BuildType        string             `json:"buildType"`
	Repository       string             `json:"repository"`
	UpdateEnabled    bool               `json:"updateEnabled"`
	Authorized       bool               `json:"authorized"`
	CanInstall       bool               `json:"canInstall"`
	CanRollback      bool               `json:"canRollback"`
	CanRestart       bool               `json:"canRestart"`
	Message          string             `json:"message"`
	CurrentActor     string             `json:"currentActor"`
	AllowedSubjects  []string           `json:"allowedSubjects,omitempty"`
	ReleaseInfo      *UpdateReleaseInfo `json:"releaseInfo,omitempty"`
	EmbeddedFrontend bool               `json:"embeddedFrontend"`
	BackupAvailable  bool               `json:"backupAvailable"`
}

type UpdateActionResult struct {
	Message     string `json:"message"`
	NeedRestart bool   `json:"needRestart,omitempty"`
}

type UpdateService struct {
	httpClient       *http.Client
	info             buildinfo.Info
	cfg              config.UpdateConfig
	embeddedFrontend bool
	opMu             sync.Mutex
	busy             bool
	cacheMu          sync.Mutex
	cacheValue       *UpdateStatus
	cacheExpiresAt   time.Time
}

type githubRelease struct {
	TagName     string               `json:"tag_name"`
	Name        string               `json:"name"`
	Body        string               `json:"body"`
	PublishedAt string               `json:"published_at"`
	HTMLURL     string               `json:"html_url"`
	Assets      []githubReleaseAsset `json:"assets"`
}

type githubReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

func NewUpdateService(info buildinfo.Info, cfg config.UpdateConfig, embeddedFrontend bool) *UpdateService {
	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > 10 {
				return fmt.Errorf("too many redirects while downloading release asset")
			}
			if err := validateUpdateURL(req.URL); err != nil {
				return err
			}
			return nil
		},
	}

	return &UpdateService{
		httpClient:       client,
		info:             info,
		cfg:              cfg,
		embeddedFrontend: embeddedFrontend,
	}
}

func (s *UpdateService) BuildInfo() buildinfo.Info {
	return s.info
}

func (s *UpdateService) CheckForActor(ctx context.Context, actor string, force bool) (*UpdateStatus, error) {
	status, err := s.checkUpdate(ctx, force)
	if err != nil {
		return nil, err
	}

	return s.decoratePermissions(status, actor), nil
}

func (s *UpdateService) PerformUpdate(ctx context.Context, actor string) (*UpdateActionResult, error) {
	if err := s.ensureActorCanInstall(actor); err != nil {
		return nil, err
	}

	if err := s.acquireOperation(); err != nil {
		return nil, err
	}
	defer s.releaseOperation()

	status, err := s.checkUpdate(ctx, true)
	if err != nil {
		return nil, err
	}
	if !status.HasUpdate {
		return nil, newValidationError("current version is already up to date")
	}
	if status.ReleaseInfo == nil {
		return nil, newValidationError("latest release metadata is unavailable")
	}

	archiveURL := ""
	checksumURL := ""
	expectedArchiveName := s.expectedArchiveName(status.LatestVersion)

	release, err := s.fetchLatestRelease(ctx)
	if err != nil {
		return nil, err
	}
	for _, asset := range release.Assets {
		if asset.Name == expectedArchiveName {
			archiveURL = asset.BrowserDownloadURL
		}
		if asset.Name == "checksums.txt" {
			checksumURL = asset.BrowserDownloadURL
		}
	}

	if archiveURL == "" {
		return nil, newValidationError("no compatible release asset found for %s/%s", runtime.GOOS, runtime.GOARCH)
	}
	if checksumURL == "" {
		return nil, newValidationError("checksums.txt is missing from the release assets")
	}

	exePath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve executable path: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return nil, fmt.Errorf("resolve executable symlink: %w", err)
	}

	exeDir := filepath.Dir(exePath)
	tempDir, err := os.MkdirTemp(exeDir, ".kubejojo-update-*")
	if err != nil {
		return nil, fmt.Errorf("create update temp dir: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	archivePath := filepath.Join(tempDir, expectedArchiveName)
	if err := s.downloadFile(ctx, archiveURL, archivePath); err != nil {
		return nil, err
	}
	if err := s.verifyChecksum(ctx, archivePath, checksumURL); err != nil {
		return nil, err
	}

	newBinaryPath := filepath.Join(tempDir, "kubejojo")
	if err := extractBinaryFromArchive(archivePath, newBinaryPath); err != nil {
		return nil, err
	}
	if err := os.Chmod(newBinaryPath, 0o755); err != nil {
		return nil, fmt.Errorf("chmod new binary: %w", err)
	}

	backupPath := exePath + ".backup"
	_ = os.Remove(backupPath)

	if err := os.Rename(exePath, backupPath); err != nil {
		return nil, fmt.Errorf("backup current binary: %w", err)
	}

	if err := os.Rename(newBinaryPath, exePath); err != nil {
		_ = os.Rename(backupPath, exePath)
		return nil, fmt.Errorf("replace executable: %w", err)
	}

	s.invalidateCache()

	return &UpdateActionResult{
		Message:     "Update completed. Restart the service to activate the new version.",
		NeedRestart: true,
	}, nil
}

func (s *UpdateService) Rollback(actor string) (*UpdateActionResult, error) {
	if err := s.ensureActorCanOperate(actor); err != nil {
		return nil, err
	}

	if err := s.acquireOperation(); err != nil {
		return nil, err
	}
	defer s.releaseOperation()

	exePath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve executable path: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return nil, fmt.Errorf("resolve executable symlink: %w", err)
	}

	backupPath := exePath + ".backup"
	if _, err := os.Stat(backupPath); err != nil {
		if os.IsNotExist(err) {
			return nil, newValidationError("no backup binary is available for rollback")
		}
		return nil, fmt.Errorf("stat backup binary: %w", err)
	}

	tempPath := exePath + ".rollback-current"
	_ = os.Remove(tempPath)

	if err := os.Rename(exePath, tempPath); err != nil {
		return nil, fmt.Errorf("move current binary before rollback: %w", err)
	}
	if err := os.Rename(backupPath, exePath); err != nil {
		_ = os.Rename(tempPath, exePath)
		return nil, fmt.Errorf("restore backup binary: %w", err)
	}
	_ = os.Remove(tempPath)

	s.invalidateCache()

	return &UpdateActionResult{
		Message:     "Rollback completed. Restart the service to switch back to the previous version.",
		NeedRestart: true,
	}, nil
}

func (s *UpdateService) Restart(actor string) (*UpdateActionResult, error) {
	if err := s.ensureActorCanOperate(actor); err != nil {
		return nil, err
	}
	if runtime.GOOS != "linux" {
		return nil, newValidationError("automatic restart is only supported on Linux hosts managed by systemd")
	}

	if err := s.acquireOperation(); err != nil {
		return nil, err
	}

	go func() {
		time.Sleep(restartDelay)
		s.releaseOperation()
		if runtime.GOOS == "linux" {
			os.Exit(0)
		}
	}()

	return &UpdateActionResult{
		Message: "Service restart initiated. Wait for /healthz to recover and then reload the page.",
	}, nil
}

func (s *UpdateService) checkUpdate(ctx context.Context, force bool) (*UpdateStatus, error) {
	if !force {
		if cached := s.getCached(); cached != nil {
			copied := *cached
			copied.Cached = true
			return &copied, nil
		}
	}

	status := &UpdateStatus{
		CurrentVersion:   s.info.Version,
		LatestVersion:    s.info.Version,
		BuildType:        s.info.BuildType,
		Repository:       s.cfg.Repository,
		UpdateEnabled:    s.cfg.Enabled,
		EmbeddedFrontend: s.embeddedFrontend,
		BackupAvailable:  s.backupAvailable(),
	}

	release, err := s.fetchLatestRelease(ctx)
	if err != nil {
		status.Warning = err.Error()
		status.Message = s.baseMessage()
		s.setCached(status)
		return status, nil
	}

	latestVersion := strings.TrimPrefix(strings.TrimSpace(release.TagName), "v")
	if latestVersion == "" {
		latestVersion = status.CurrentVersion
	}

	status.LatestVersion = latestVersion
	status.HasUpdate = compareVersions(status.CurrentVersion, latestVersion) < 0
	status.ReleaseInfo = &UpdateReleaseInfo{
		Name:        release.Name,
		Body:        release.Body,
		PublishedAt: release.PublishedAt,
		HTMLURL:     release.HTMLURL,
	}
	status.Message = s.baseMessage()

	s.setCached(status)
	return status, nil
}

func (s *UpdateService) fetchLatestRelease(ctx context.Context) (*githubRelease, error) {
	repo := strings.TrimSpace(s.cfg.Repository)
	if repo == "" {
		return nil, newValidationError("update repository is not configured")
	}

	releaseURL := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repo)
	parsedURL, err := url.Parse(releaseURL)
	if err != nil {
		return nil, fmt.Errorf("build release url: %w", err)
	}
	if err := validateUpdateURL(parsedURL); err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, releaseURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build release request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", defaultUserAgent)
	if token := strings.TrimSpace(s.cfg.GitHubToken); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch latest release: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("fetch latest release failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("decode latest release: %w", err)
	}

	return &release, nil
}

func (s *UpdateService) downloadFile(ctx context.Context, sourceURL string, destPath string) error {
	parsedURL, err := url.Parse(sourceURL)
	if err != nil {
		return fmt.Errorf("parse download url: %w", err)
	}
	if err := validateUpdateURL(parsedURL); err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return fmt.Errorf("build download request: %w", err)
	}
	req.Header.Set("User-Agent", defaultUserAgent)
	if token := strings.TrimSpace(s.cfg.GitHubToken); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("download release asset: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download release asset failed with status %d", resp.StatusCode)
	}

	if resp.ContentLength > maxDownloadSize {
		return fmt.Errorf("release asset exceeds maximum allowed size")
	}

	file, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("create destination file: %w", err)
	}
	defer file.Close()

	limited := io.LimitReader(resp.Body, maxDownloadSize+1)
	written, err := io.Copy(file, limited)
	if err != nil {
		return fmt.Errorf("write downloaded asset: %w", err)
	}
	if written > maxDownloadSize {
		return fmt.Errorf("release asset exceeds maximum allowed size")
	}

	return nil
}

func (s *UpdateService) verifyChecksum(ctx context.Context, archivePath string, checksumURL string) error {
	parsedURL, err := url.Parse(checksumURL)
	if err != nil {
		return fmt.Errorf("parse checksum url: %w", err)
	}
	if err := validateUpdateURL(parsedURL); err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, checksumURL, nil)
	if err != nil {
		return fmt.Errorf("build checksum request: %w", err)
	}
	req.Header.Set("User-Agent", defaultUserAgent)
	if token := strings.TrimSpace(s.cfg.GitHubToken); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("download checksums: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download checksums failed with status %d", resp.StatusCode)
	}

	expected, err := readExpectedChecksum(resp.Body, filepath.Base(archivePath))
	if err != nil {
		return err
	}

	file, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open archive for checksum validation: %w", err)
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return fmt.Errorf("calculate archive checksum: %w", err)
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if actual != expected {
		return fmt.Errorf("checksum mismatch for %s", filepath.Base(archivePath))
	}

	return nil
}

func readExpectedChecksum(reader io.Reader, archiveName string) (string, error) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		filename := strings.TrimPrefix(fields[len(fields)-1], "*")
		if filename == archiveName {
			return strings.TrimSpace(fields[0]), nil
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("read checksums: %w", err)
	}

	return "", fmt.Errorf("checksum entry for %s not found", archiveName)
}

func extractBinaryFromArchive(archivePath string, destPath string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer file.Close()

	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return fmt.Errorf("create gzip reader: %w", err)
	}
	defer gzipReader.Close()

	tarReader := tar.NewReader(gzipReader)
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("read archive entry: %w", err)
		}

		if header.FileInfo().IsDir() {
			continue
		}
		if filepath.Base(header.Name) != "kubejojo" {
			continue
		}

		outFile, err := os.Create(destPath)
		if err != nil {
			return fmt.Errorf("create extracted binary: %w", err)
		}
		if _, err := io.Copy(outFile, tarReader); err != nil {
			outFile.Close()
			return fmt.Errorf("write extracted binary: %w", err)
		}
		if err := outFile.Close(); err != nil {
			return fmt.Errorf("close extracted binary: %w", err)
		}
		return nil
	}

	return fmt.Errorf("binary kubejojo not found in archive")
}

func validateUpdateURL(value *url.URL) error {
	host := strings.TrimSpace(strings.ToLower(value.Hostname()))
	if _, ok := allowedUpdateHosts[host]; !ok {
		return fmt.Errorf("host %s is not allowed for update operations", host)
	}
	return nil
}

func (s *UpdateService) decoratePermissions(status *UpdateStatus, actor string) *UpdateStatus {
	copied := *status
	copied.CurrentActor = actor
	copied.AllowedSubjects = append([]string(nil), s.cfg.AllowedSubjects...)

	authorized, authMessage := s.actorAuthorization(actor)
	copied.Authorized = authorized
	copied.CanRestart = s.info.IsRelease() && authorized && runtime.GOOS == "linux"
	copied.CanRollback = s.info.IsRelease() && authorized && copied.BackupAvailable
	copied.CanInstall = s.info.IsRelease() && s.cfg.Enabled && authorized

	switch {
	case !s.info.IsRelease():
		copied.Message = "Online update is only available in release builds."
	case !s.embeddedFrontend:
		copied.Message = "Release mode requires embedded frontend assets."
	case !s.cfg.Enabled:
		copied.Message = "Online update is disabled by server configuration."
	case !authorized:
		copied.Message = authMessage
	case runtime.GOOS != "linux":
		copied.Message = "Update is available, but automatic restart currently requires a Linux host managed by systemd."
	default:
		copied.Message = "System update is ready."
	}

	return &copied
}

func (s *UpdateService) actorAuthorization(actor string) (bool, string) {
	if len(s.cfg.AllowedSubjects) == 0 {
		return false, "No update subjects are configured on the server."
	}
	for _, item := range s.cfg.AllowedSubjects {
		if item == "*" || strings.EqualFold(item, actor) {
			return true, ""
		}
	}
	return false, "Current Kubernetes identity is not allowed to operate system updates."
}

func (s *UpdateService) ensureActorCanInstall(actor string) error {
	if !s.info.IsRelease() {
		return newValidationError("online update is only available in release builds")
	}
	if !s.embeddedFrontend {
		return newValidationError("embedded frontend assets are required for release updates")
	}
	if !s.cfg.Enabled {
		return newValidationError("online update is disabled by server configuration")
	}
	if authorized, message := s.actorAuthorization(actor); !authorized {
		return PermissionError{message: message}
	}
	return nil
}

func (s *UpdateService) ensureActorCanOperate(actor string) error {
	if !s.info.IsRelease() {
		return newValidationError("system restart is only available in release builds")
	}
	if authorized, message := s.actorAuthorization(actor); !authorized {
		return PermissionError{message: message}
	}
	return nil
}

func (s *UpdateService) acquireOperation() error {
	s.opMu.Lock()
	defer s.opMu.Unlock()
	if s.busy {
		return newValidationError("another system operation is already in progress")
	}
	s.busy = true
	return nil
}

func (s *UpdateService) releaseOperation() {
	s.opMu.Lock()
	s.busy = false
	s.opMu.Unlock()
}

func (s *UpdateService) getCached() *UpdateStatus {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	if s.cacheValue == nil || time.Now().After(s.cacheExpiresAt) {
		return nil
	}
	copied := *s.cacheValue
	return &copied
}

func (s *UpdateService) setCached(status *UpdateStatus) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	copied := *status
	copied.Cached = false
	s.cacheValue = &copied
	s.cacheExpiresAt = time.Now().Add(updateCacheTTL)
}

func (s *UpdateService) invalidateCache() {
	s.cacheMu.Lock()
	s.cacheValue = nil
	s.cacheExpiresAt = time.Time{}
	s.cacheMu.Unlock()
}

func (s *UpdateService) expectedArchiveName(version string) string {
	return fmt.Sprintf("kubejojo_%s_%s_%s.tar.gz", version, runtime.GOOS, runtime.GOARCH)
}

func (s *UpdateService) backupAvailable() bool {
	exePath, err := os.Executable()
	if err != nil {
		return false
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return false
	}
	_, err = os.Stat(exePath + ".backup")
	return err == nil
}

func (s *UpdateService) baseMessage() string {
	switch {
	case !s.info.IsRelease():
		return "Current instance is running in source mode. Version checks are available, but online update is disabled."
	case !s.embeddedFrontend:
		return "Release mode requires embedded frontend assets before online update can be enabled."
	case !s.cfg.Enabled:
		return "Online update is disabled by server configuration."
	default:
		return "Version check completed."
	}
}

func compareVersions(left string, right string) int {
	leftCore, leftPre := normalizeVersion(left)
	rightCore, rightPre := normalizeVersion(right)

	maxLen := len(leftCore)
	if len(rightCore) > maxLen {
		maxLen = len(rightCore)
	}

	for index := 0; index < maxLen; index++ {
		leftValue := 0
		rightValue := 0
		if index < len(leftCore) {
			leftValue = leftCore[index]
		}
		if index < len(rightCore) {
			rightValue = rightCore[index]
		}

		switch {
		case leftValue < rightValue:
			return -1
		case leftValue > rightValue:
			return 1
		}
	}

	switch {
	case leftPre == "" && rightPre != "":
		return 1
	case leftPre != "" && rightPre == "":
		return -1
	case leftPre < rightPre:
		return -1
	case leftPre > rightPre:
		return 1
	default:
		return 0
	}
}

func normalizeVersion(value string) ([]int, string) {
	trimmed := strings.TrimPrefix(strings.TrimSpace(value), "v")
	parts := strings.SplitN(trimmed, "-", 2)
	coreParts := strings.Split(parts[0], ".")
	result := make([]int, 0, len(coreParts))
	for _, item := range coreParts {
		number := 0
		for _, ch := range item {
			if ch < '0' || ch > '9' {
				break
			}
			number = number*10 + int(ch-'0')
		}
		result = append(result, number)
	}

	preRelease := ""
	if len(parts) == 2 {
		preRelease = parts[1]
	}

	return result, preRelease
}
