package main

import (
	_ "embed"
	"flag"
	"fmt"
	"log"
	"strings"

	"github.com/heihuzicity-tech/kubejojo/server/internal/buildinfo"
	"github.com/heihuzicity-tech/kubejojo/server/internal/server"
)

//go:embed VERSION
var embeddedVersion string

var (
	Version   = ""
	Commit    = "unknown"
	Date      = "unknown"
	BuildType = "source"
)

func init() {
	if strings.TrimSpace(Version) != "" {
		return
	}

	Version = strings.TrimSpace(embeddedVersion)
	if Version == "" {
		Version = "0.0.0-dev"
	}
}

func main() {
	showVersion := flag.Bool("version", false, "Show version information")
	flag.Parse()

	info := buildinfo.New(Version, Commit, Date, BuildType)
	if *showVersion {
		fmt.Printf(
			"kubejojo %s (commit: %s, built: %s, type: %s)\n",
			info.Version,
			info.Commit,
			info.Date,
			info.BuildType,
		)
		return
	}

	if err := server.Run(info); err != nil {
		log.Fatal(err)
	}
}
