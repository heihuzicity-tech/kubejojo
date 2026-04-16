package service

import "testing"

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
