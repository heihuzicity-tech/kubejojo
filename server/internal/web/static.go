package web

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
)

//go:embed dist
var distFS embed.FS

const embeddedAppRoot = "dist/app"

func HasEmbeddedFrontend() bool {
	_, err := fs.Stat(distFS, embeddedAppRoot+"/index.html")
	return err == nil
}

func RegisterReleaseRoutes(router *gin.Engine) {
	if !HasEmbeddedFrontend() {
		return
	}

	subFS, err := fs.Sub(distFS, embeddedAppRoot)
	if err != nil {
		return
	}

	fileServer := http.FileServer(http.FS(subFS))

	router.NoRoute(func(c *gin.Context) {
		if shouldBypassSPA(c.Request.URL.Path) {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}

		cleanPath := strings.TrimPrefix(path.Clean("/"+c.Request.URL.Path), "/")
		if cleanPath == "" || cleanPath == "." {
			c.Request.URL.Path = "/"
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}

		if assetExists(subFS, cleanPath) {
			c.Request.URL.Path = "/" + cleanPath
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}

		// Requests that look like static asset fetches should fail fast instead of
		// returning index.html, otherwise the browser receives HTML where JS/CSS is expected.
		if strings.Contains(path.Base(cleanPath), ".") {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}

		c.Request.URL.Path = "/"
		fileServer.ServeHTTP(c.Writer, c.Request)
	})
}

func assetExists(root fs.FS, name string) bool {
	_, err := fs.Stat(root, name)
	return err == nil
}

func shouldBypassSPA(requestPath string) bool {
	return requestPath == "/healthz" || strings.HasPrefix(requestPath, "/api/")
}
