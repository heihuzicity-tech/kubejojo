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
