package buildinfo

import "strings"

type Info struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	Date      string `json:"date"`
	BuildType string `json:"buildType"`
}

func New(version string, commit string, date string, buildType string) Info {
	info := Info{
		Version:   strings.TrimSpace(version),
		Commit:    strings.TrimSpace(commit),
		Date:      strings.TrimSpace(date),
		BuildType: strings.TrimSpace(buildType),
	}

	if info.Version == "" {
		info.Version = "0.0.0-dev"
	}
	if info.Commit == "" {
		info.Commit = "unknown"
	}
	if info.Date == "" {
		info.Date = "unknown"
	}
	if info.BuildType != "release" {
		info.BuildType = "source"
	}

	return info
}

func (i Info) IsRelease() bool {
	return i.BuildType == "release"
}
