package server

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"golang.org/x/net/websocket"
	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/gin-gonic/gin"

	"github.com/zhangya/k8s-admin/server/internal/jsonx"
	"github.com/zhangya/k8s-admin/server/internal/kube"
	"github.com/zhangya/k8s-admin/server/internal/response"
	"github.com/zhangya/k8s-admin/server/internal/service"
)

const clusterServiceContextKey = "clusterService"

type loginRequest struct {
	Token string `json:"token"`
}

type loginResponse struct {
	Name             string              `json:"name"`
	AuthMode         string              `json:"authMode"`
	CurrentContext   string              `json:"currentContext"`
	KubeconfigPath   string              `json:"kubeconfigPath"`
	Namespaces       jsonx.Slice[string] `json:"namespaces"`
	DefaultNamespace string              `json:"defaultNamespace"`
}

type scaleDeploymentRequest struct {
	Replicas int32 `json:"replicas"`
}

type suspendRequest struct {
	Suspend bool `json:"suspend"`
}

type websocketTextWriter struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (w *websocketTextWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if err := websocket.Message.Send(w.conn, string(p)); err != nil {
		return 0, err
	}

	return len(p), nil
}

func newRouter(clusterFactory *kube.Factory) *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.SetTrustedProxies(nil)

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, response.Success(gin.H{
			"service": "k8s-admin",
			"status":  "ok",
		}))
	})

	api := router.Group("/api/v1")
	{
		api.POST("/auth/login", func(c *gin.Context) {
			var req loginRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, response.Failure("INVALID_LOGIN_REQUEST", "请求体格式不正确"))
				return
			}

			clusterService, err := clusterServiceFromToken(clusterFactory, req.Token)
			if err != nil {
				c.JSON(http.StatusBadRequest, response.Failure("INVALID_TOKEN", "Bearer Token 不能为空"))
				return
			}

			auth := clusterService.GetAuthMe(c.Request.Context())
			namespaces, err := clusterService.ListNamespaces(c.Request.Context())
			if err != nil {
				respondWithClusterError(c, "TOKEN_LOGIN_FAILED", err)
				return
			}

			c.JSON(http.StatusOK, response.Success(loginResponse{
				Name:             auth.Name,
				AuthMode:         auth.AuthMode,
				CurrentContext:   auth.CurrentContext,
				KubeconfigPath:   auth.KubeconfigPath,
				Namespaces:       jsonx.Slice[string](namespaces),
				DefaultNamespace: defaultNamespace(namespaces),
			}))
		})

		api.GET("/pods/:namespace/:name/exec/ws", func(c *gin.Context) {
			clusterService, err := clusterServiceFromRequest(clusterFactory, c)
			if err != nil {
				c.JSON(http.StatusUnauthorized, response.Failure("UNAUTHORIZED", "缺少有效的 Bearer Token"))
				return
			}

			websocket.Server{
				Handshake: func(*websocket.Config, *http.Request) error {
					return nil
				},
				Handler: func(ws *websocket.Conn) {
					defer ws.Close()

					container := strings.TrimSpace(c.Query("container"))
					command := strings.TrimSpace(c.Query("command"))
					if command == "" {
						command = "/bin/sh"
					}

					stdinReader, stdinWriter := io.Pipe()
					defer stdinReader.Close()

					outputWriter := &websocketTextWriter{conn: ws}

					go func() {
						defer stdinWriter.Close()
						for {
							var input string
							if err := websocket.Message.Receive(ws, &input); err != nil {
								_ = stdinWriter.CloseWithError(err)
								return
							}
							if input == "" {
								continue
							}
							if _, err := stdinWriter.Write([]byte(input)); err != nil {
								return
							}
						}
					}()

					if err := clusterService.ExecPod(
						c.Request.Context(),
						c.Param("namespace"),
						c.Param("name"),
						container,
						command,
						stdinReader,
						outputWriter,
						outputWriter,
						false,
					); err != nil {
						_, _ = outputWriter.Write([]byte("\r\n[exec error] " + err.Error() + "\r\n"))
					}
				},
			}.ServeHTTP(c.Writer, c.Request)
		})

		authorized := api.Group("/")
		authorized.Use(clusterServiceMiddleware(clusterFactory))
		{
			authorized.GET("/auth/me", func(c *gin.Context) {
				c.JSON(http.StatusOK, response.Success(mustClusterService(c).GetAuthMe(c.Request.Context())))
			})

			authorized.GET("/namespaces", func(c *gin.Context) {
				items, err := mustClusterService(c).ListNamespaces(c.Request.Context())
				if err != nil {
					respondWithClusterError(c, "LIST_NAMESPACES_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/namespaces/items", func(c *gin.Context) {
				items, err := mustClusterService(c).ListNamespaceItems(c.Request.Context())
				if err != nil {
					respondWithClusterError(c, "LIST_NAMESPACE_ITEMS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/overview/summary", func(c *gin.Context) {
				summary, err := mustClusterService(c).GetOverviewSummary(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_OVERVIEW_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(summary))
			})

			authorized.GET("/overview/events/warnings", func(c *gin.Context) {
				items, err := mustClusterService(c).ListWarningEvents(
					c.Request.Context(),
					c.Query("namespace"),
					10,
				)
				if err != nil {
					respondWithClusterError(c, "LIST_WARNING_EVENTS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/overview/namespaces/pod-top", func(c *gin.Context) {
				items, err := mustClusterService(c).ListNamespacePodTop(
					c.Request.Context(),
					c.Query("namespace"),
					5,
				)
				if err != nil {
					respondWithClusterError(c, "LIST_NAMESPACE_POD_TOP_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/nodes", func(c *gin.Context) {
				items, err := mustClusterService(c).ListNodes(c.Request.Context())
				if err != nil {
					respondWithClusterError(c, "LIST_NODES_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/pods", func(c *gin.Context) {
				items, err := mustClusterService(c).ListPods(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_PODS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/pods/:namespace/:name/events", func(c *gin.Context) {
				items, err := mustClusterService(c).ListPodEvents(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_POD_EVENTS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/pods/:namespace/:name/logs", func(c *gin.Context) {
				tailLines := int64(200)
				if rawTailLines := strings.TrimSpace(c.Query("tailLines")); rawTailLines != "" {
					value, err := strconv.ParseInt(rawTailLines, 10, 64)
					if err != nil || value < 0 {
						c.JSON(http.StatusBadRequest, response.Failure("INVALID_TAIL_LINES", "tailLines 必须为非负整数"))
						return
					}
					tailLines = value
				}

				result, err := mustClusterService(c).GetPodLogs(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					c.Query("container"),
					tailLines,
				)
				if err != nil {
					respondWithClusterError(c, "GET_POD_LOGS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.DELETE("/pods/:namespace/:name", func(c *gin.Context) {
				result, err := mustClusterService(c).DeletePod(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "DELETE_POD_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/deployments", func(c *gin.Context) {
				items, err := mustClusterService(c).ListDeployments(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_DEPLOYMENTS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.POST("/deployments/:namespace/:name/scale", func(c *gin.Context) {
				var req scaleDeploymentRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_SCALE_REQUEST", "请求体格式不正确"))
					return
				}
				if req.Replicas < 0 {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_REPLICAS", "副本数不能小于 0"))
					return
				}

				result, err := mustClusterService(c).ScaleDeployment(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Replicas,
				)
				if err != nil {
					respondWithClusterError(c, "SCALE_DEPLOYMENT_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.POST("/deployments/:namespace/:name/restart", func(c *gin.Context) {
				result, err := mustClusterService(c).RestartDeployment(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "RESTART_DEPLOYMENT_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/statefulsets", func(c *gin.Context) {
				items, err := mustClusterService(c).ListStatefulSets(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_STATEFULSETS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.POST("/statefulsets/:namespace/:name/scale", func(c *gin.Context) {
				var req scaleDeploymentRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_SCALE_REQUEST", "请求体格式不正确"))
					return
				}
				if req.Replicas < 0 {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_REPLICAS", "副本数不能小于 0"))
					return
				}

				result, err := mustClusterService(c).ScaleStatefulSet(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Replicas,
				)
				if err != nil {
					respondWithClusterError(c, "SCALE_STATEFULSET_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.POST("/statefulsets/:namespace/:name/restart", func(c *gin.Context) {
				result, err := mustClusterService(c).RestartStatefulSet(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "RESTART_STATEFULSET_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/jobs", func(c *gin.Context) {
				items, err := mustClusterService(c).ListJobs(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_JOBS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.POST("/jobs/:namespace/:name/suspend", func(c *gin.Context) {
				var req suspendRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_SUSPEND_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).SetJobSuspend(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Suspend,
				)
				if err != nil {
					respondWithClusterError(c, "SET_JOB_SUSPEND_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/cronjobs", func(c *gin.Context) {
				items, err := mustClusterService(c).ListCronJobs(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_CRONJOBS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.POST("/cronjobs/:namespace/:name/suspend", func(c *gin.Context) {
				var req suspendRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_SUSPEND_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).SetCronJobSuspend(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Suspend,
				)
				if err != nil {
					respondWithClusterError(c, "SET_CRONJOB_SUSPEND_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/replicasets", func(c *gin.Context) {
				items, err := mustClusterService(c).ListReplicaSets(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_REPLICASETS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.POST("/replicasets/:namespace/:name/scale", func(c *gin.Context) {
				var req scaleDeploymentRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_SCALE_REQUEST", "请求体格式不正确"))
					return
				}
				if req.Replicas < 0 {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_REPLICAS", "副本数不能小于 0"))
					return
				}

				result, err := mustClusterService(c).ScaleReplicaSet(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Replicas,
				)
				if err != nil {
					respondWithClusterError(c, "SCALE_REPLICASET_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/daemonsets", func(c *gin.Context) {
				items, err := mustClusterService(c).ListDaemonSets(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_DAEMONSETS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.POST("/daemonsets/:namespace/:name/restart", func(c *gin.Context) {
				result, err := mustClusterService(c).RestartDaemonSet(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "RESTART_DAEMONSET_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/topology/graph", func(c *gin.Context) {
				graph, err := mustClusterService(c).GetTopologyGraph(
					c.Request.Context(),
					c.Query("namespace"),
					strings.Split(c.Query("sources"), ","),
				)
				if err != nil {
					respondWithClusterError(c, "GET_TOPOLOGY_GRAPH_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(graph))
			})
		}
	}

	return router
}

func clusterServiceMiddleware(clusterFactory *kube.Factory) gin.HandlerFunc {
	return func(c *gin.Context) {
		clusterService, err := clusterServiceFromRequest(clusterFactory, c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, response.Failure("UNAUTHORIZED", "缺少有效的 Bearer Token"))
			c.Abort()
			return
		}

		c.Set(clusterServiceContextKey, clusterService)
		c.Next()
	}
}

func clusterServiceFromRequest(clusterFactory *kube.Factory, c *gin.Context) (*service.ClusterService, error) {
	token := bearerTokenFromHeader(c.GetHeader("Authorization"))
	if token == "" {
		token = strings.TrimSpace(c.Query("token"))
	}

	return clusterServiceFromToken(clusterFactory, token)
}

func clusterServiceFromToken(clusterFactory *kube.Factory, token string) (*service.ClusterService, error) {
	client, err := clusterFactory.NewClientForToken(token)
	if err != nil {
		return nil, err
	}

	return service.NewClusterService(client), nil
}

func mustClusterService(c *gin.Context) *service.ClusterService {
	value, ok := c.Get(clusterServiceContextKey)
	if !ok {
		panic("cluster service missing from context")
	}

	clusterService, ok := value.(*service.ClusterService)
	if !ok {
		panic("invalid cluster service type")
	}

	return clusterService
}

func bearerTokenFromHeader(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	if strings.HasPrefix(strings.ToLower(value), "bearer ") {
		return strings.TrimSpace(value[7:])
	}

	return ""
}

func defaultNamespace(items []string) string {
	for _, item := range items {
		if item == "default" {
			return item
		}
	}

	if len(items) > 0 {
		return items[0]
	}

	return "default"
}

func respondWithClusterError(c *gin.Context, code string, err error) {
	switch {
	case apierrors.IsUnauthorized(err):
		c.JSON(http.StatusUnauthorized, response.Failure(code, "Bearer Token 无效或已过期"))
	case apierrors.IsForbidden(err):
		c.JSON(http.StatusForbidden, response.Failure(code, "当前 Token 权限不足，无法访问所需资源"))
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		c.JSON(http.StatusRequestTimeout, response.Failure(code, "请求已取消"))
	default:
		c.JSON(http.StatusInternalServerError, response.Failure(code, err.Error()))
	}
}
