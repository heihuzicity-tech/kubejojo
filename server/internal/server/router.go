package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"

	"golang.org/x/net/websocket"
	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/gin-gonic/gin"

	"github.com/heihuzicity-tech/kubejojo/server/internal/buildinfo"
	"github.com/heihuzicity-tech/kubejojo/server/internal/jsonx"
	"github.com/heihuzicity-tech/kubejojo/server/internal/kube"
	"github.com/heihuzicity-tech/kubejojo/server/internal/ptyx"
	"github.com/heihuzicity-tech/kubejojo/server/internal/response"
	"github.com/heihuzicity-tech/kubejojo/server/internal/service"
	"github.com/heihuzicity-tech/kubejojo/server/internal/web"
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

type yamlUpdateRequest struct {
	Content string `json:"content"`
}

type websocketTextWriter struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

type execWebSocketMessage struct {
	Type string `json:"type"`
	Data string `json:"data,omitempty"`
	Cols uint16 `json:"cols,omitempty"`
	Rows uint16 `json:"rows,omitempty"`
}

func (w *websocketTextWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if err := websocket.Message.Send(w.conn, string(p)); err != nil {
		return 0, err
	}

	return len(p), nil
}

func newRouter(
	clusterFactory *kube.Factory,
	updateService *service.UpdateService,
	info buildinfo.Info,
) *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.SetTrustedProxies(nil)

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, response.Success(gin.H{
			"service": "kubejojo",
			"status":  "ok",
		}))
	})

	api := router.Group("/api/v1")
	{
		api.GET("/system/build-info", func(c *gin.Context) {
			c.JSON(http.StatusOK, response.Success(gin.H{
				"version":          info.Version,
				"commit":           info.Commit,
				"date":             info.Date,
				"buildType":        info.BuildType,
				"embeddedFrontend": web.HasEmbeddedFrontend(),
			}))
		})

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

					execCtx, cancel := context.WithCancel(c.Request.Context())
					defer cancel()

					outputWriter := &websocketTextWriter{conn: ws}

					cmd, _, err := clusterService.BuildPodExecCommand(
						execCtx,
						c.Param("namespace"),
						c.Param("name"),
						container,
						command,
						true,
					)
					if err != nil {
						_, _ = outputWriter.Write([]byte("\r\n[exec error] " + err.Error() + "\r\n"))
						return
					}

					cmd.Env = append(os.Environ(), "TERM=xterm-256color")

					ptmx, err := ptyx.StartWithSize(cmd, &ptyx.Winsize{
						Cols: 120,
						Rows: 32,
					})
					if err != nil {
						_, _ = outputWriter.Write([]byte("\r\n[exec error] " + err.Error() + "\r\n"))
						return
					}
					defer ptmx.Close()

					var closeOnce sync.Once
					closeSession := func() {
						closeOnce.Do(func() {
							cancel()
							_ = ptmx.Close()
							if cmd.Process != nil {
								_ = cmd.Process.Kill()
							}
						})
					}

					go func() {
						buffer := make([]byte, 4096)
						for {
							count, readErr := ptmx.Read(buffer)
							if count > 0 {
								if _, err := outputWriter.Write(buffer[:count]); err != nil {
									closeSession()
									return
								}
							}
							if readErr != nil {
								if execCtx.Err() == nil &&
									!errors.Is(readErr, io.EOF) &&
									!errors.Is(readErr, os.ErrClosed) &&
									!errors.Is(readErr, syscall.EIO) {
									_, _ = outputWriter.Write([]byte("\r\n[exec error] " + readErr.Error() + "\r\n"))
								}
								closeSession()
								return
							}
						}
					}()

					go func() {
						if err := cmd.Wait(); err != nil && execCtx.Err() == nil && !errors.Is(err, os.ErrClosed) {
							_, _ = outputWriter.Write([]byte("\r\n[exec exit] " + err.Error() + "\r\n"))
						}
						closeSession()
						_ = ws.Close()
					}()

					for {
						var raw string
						if err := websocket.Message.Receive(ws, &raw); err != nil {
							closeSession()
							return
						}

						var message execWebSocketMessage
						if err := json.Unmarshal([]byte(raw), &message); err != nil {
							_, _ = outputWriter.Write([]byte("\r\n[exec error] invalid websocket payload\r\n"))
							continue
						}

						switch message.Type {
						case "input":
							if message.Data == "" {
								continue
							}
							if _, err := io.WriteString(ptmx, message.Data); err != nil {
								closeSession()
								return
							}
						case "resize":
							if message.Cols == 0 || message.Rows == 0 {
								continue
							}
							if err := ptyx.Setsize(ptmx, &ptyx.Winsize{
								Cols: message.Cols,
								Rows: message.Rows,
							}); err != nil {
								_, _ = outputWriter.Write([]byte("\r\n[exec error] resize failed\r\n"))
							}
						}
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

			authorized.GET("/system/update-status", func(c *gin.Context) {
				actor := mustClusterService(c).GetAuthMe(c.Request.Context()).Name
				status, err := updateService.CheckForActor(c.Request.Context(), actor, c.Query("force") == "true")
				if err != nil {
					respondWithClusterError(c, "SYSTEM_UPDATE_STATUS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(status))
			})

			authorized.POST("/system/update", func(c *gin.Context) {
				actor := mustClusterService(c).GetAuthMe(c.Request.Context()).Name
				result, err := updateService.PerformUpdate(c.Request.Context(), actor)
				if err != nil {
					respondWithClusterError(c, "SYSTEM_UPDATE_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.POST("/system/rollback", func(c *gin.Context) {
				actor := mustClusterService(c).GetAuthMe(c.Request.Context()).Name
				result, err := updateService.Rollback(actor)
				if err != nil {
					respondWithClusterError(c, "SYSTEM_ROLLBACK_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.POST("/system/restart", func(c *gin.Context) {
				actor := mustClusterService(c).GetAuthMe(c.Request.Context()).Name
				result, err := updateService.Restart(actor)
				if err != nil {
					respondWithClusterError(c, "SYSTEM_RESTART_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.POST("/manifests", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_CREATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).CreateManifestYAML(
					c.Request.Context(),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "CREATE_MANIFEST_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
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

			authorized.GET("/pods/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetPodYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_POD_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/pods/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdatePodYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_POD_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/pods/:namespace/:name/describe", func(c *gin.Context) {
				result, err := mustClusterService(c).GetPodDescribe(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_POD_DESCRIBE_FAILED", err)
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

			registerNamespacedDeleteRoute(
				authorized,
				"/deployments/:namespace/:name",
				"DELETE_DEPLOYMENT_FAILED",
				(*service.ClusterService).DeleteDeployment,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/statefulsets/:namespace/:name",
				"DELETE_STATEFULSET_FAILED",
				(*service.ClusterService).DeleteStatefulSet,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/daemonsets/:namespace/:name",
				"DELETE_DAEMONSET_FAILED",
				(*service.ClusterService).DeleteDaemonSet,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/jobs/:namespace/:name",
				"DELETE_JOB_FAILED",
				(*service.ClusterService).DeleteJob,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/cronjobs/:namespace/:name",
				"DELETE_CRONJOB_FAILED",
				(*service.ClusterService).DeleteCronJob,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/services/:namespace/:name",
				"DELETE_SERVICE_FAILED",
				(*service.ClusterService).DeleteService,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/ingresses/:namespace/:name",
				"DELETE_INGRESS_FAILED",
				(*service.ClusterService).DeleteIngress,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/serviceaccounts/:namespace/:name",
				"DELETE_SERVICEACCOUNT_FAILED",
				(*service.ClusterService).DeleteServiceAccount,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/roles/:namespace/:name",
				"DELETE_ROLE_FAILED",
				(*service.ClusterService).DeleteRole,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/rolebindings/:namespace/:name",
				"DELETE_ROLEBINDING_FAILED",
				(*service.ClusterService).DeleteRoleBinding,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/configmaps/:namespace/:name",
				"DELETE_CONFIGMAP_FAILED",
				(*service.ClusterService).DeleteConfigMap,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/secrets/:namespace/:name",
				"DELETE_SECRET_FAILED",
				(*service.ClusterService).DeleteSecret,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/networkpolicies/:namespace/:name",
				"DELETE_NETWORKPOLICY_FAILED",
				(*service.ClusterService).DeleteNetworkPolicy,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/hpas/:namespace/:name",
				"DELETE_HPA_FAILED",
				(*service.ClusterService).DeleteHPA,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/vpas/:namespace/:name",
				"DELETE_VPA_FAILED",
				(*service.ClusterService).DeleteVPA,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/resourcequotas/:namespace/:name",
				"DELETE_RESOURCEQUOTA_FAILED",
				(*service.ClusterService).DeleteResourceQuota,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/limitranges/:namespace/:name",
				"DELETE_LIMITRANGE_FAILED",
				(*service.ClusterService).DeleteLimitRange,
			)
			registerNamespacedDeleteRoute(
				authorized,
				"/persistentvolumeclaims/:namespace/:name",
				"DELETE_PERSISTENTVOLUMECLAIM_FAILED",
				(*service.ClusterService).DeletePersistentVolumeClaim,
			)
			registerClusterDeleteRoute(
				authorized,
				"/ingressclasses/:name",
				"DELETE_INGRESSCLASS_FAILED",
				(*service.ClusterService).DeleteIngressClass,
			)
			registerClusterDeleteRoute(
				authorized,
				"/persistentvolumes/:name",
				"DELETE_PERSISTENTVOLUME_FAILED",
				(*service.ClusterService).DeletePersistentVolume,
			)
			registerClusterDeleteRoute(
				authorized,
				"/storageclasses/:name",
				"DELETE_STORAGECLASS_FAILED",
				(*service.ClusterService).DeleteStorageClass,
			)
			registerClusterDeleteRoute(
				authorized,
				"/clusterroles/:name",
				"DELETE_CLUSTERROLE_FAILED",
				(*service.ClusterService).DeleteClusterRole,
			)
			registerClusterDeleteRoute(
				authorized,
				"/clusterrolebindings/:name",
				"DELETE_CLUSTERROLEBINDING_FAILED",
				(*service.ClusterService).DeleteClusterRoleBinding,
			)

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

			authorized.GET("/deployments/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetDeploymentYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_DEPLOYMENT_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/deployments/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateDeploymentYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_DEPLOYMENT_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
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

			authorized.GET("/statefulsets/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetStatefulSetYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_STATEFULSET_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/statefulsets/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateStatefulSetYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_STATEFULSET_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
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

			authorized.GET("/jobs/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetJobYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_JOB_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/jobs/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateJobYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_JOB_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
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

			authorized.GET("/cronjobs/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetCronJobYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_CRONJOB_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/cronjobs/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateCronJobYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_CRONJOB_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
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

			authorized.GET("/replicasets/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetReplicaSetYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_REPLICASET_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/replicasets/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateReplicaSetYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_REPLICASET_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
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

			authorized.GET("/daemonsets/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetDaemonSetYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_DAEMONSET_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/daemonsets/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateDaemonSetYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_DAEMONSET_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
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

			authorized.GET("/services", func(c *gin.Context) {
				items, err := mustClusterService(c).ListServices(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_SERVICES_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/services/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetServiceYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_SERVICE_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/services/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateServiceYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_SERVICE_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/endpoints", func(c *gin.Context) {
				items, err := mustClusterService(c).ListEndpoints(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_ENDPOINTS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/endpoints/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetEndpointYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_ENDPOINT_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/endpoints/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateEndpointYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_ENDPOINT_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/ingresses", func(c *gin.Context) {
				items, err := mustClusterService(c).ListIngresses(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_INGRESSES_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/ingresses/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetIngressYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_INGRESS_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/ingresses/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateIngressYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_INGRESS_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/ingressclasses", func(c *gin.Context) {
				items, err := mustClusterService(c).ListIngressClasses(c.Request.Context())
				if err != nil {
					respondWithClusterError(c, "LIST_INGRESSCLASSES_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/ingressclasses/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetIngressClassYAML(
					c.Request.Context(),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_INGRESSCLASS_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/ingressclasses/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateIngressClassYAML(
					c.Request.Context(),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_INGRESSCLASS_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/serviceaccounts", func(c *gin.Context) {
				items, err := mustClusterService(c).ListServiceAccounts(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_SERVICEACCOUNTS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/serviceaccounts/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetServiceAccountYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_SERVICEACCOUNT_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/serviceaccounts/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateServiceAccountYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_SERVICEACCOUNT_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/roles", func(c *gin.Context) {
				items, err := mustClusterService(c).ListRoles(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_ROLES_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/roles/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetRoleYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_ROLE_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/roles/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateRoleYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_ROLE_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/clusterroles", func(c *gin.Context) {
				items, err := mustClusterService(c).ListClusterRoles(c.Request.Context())
				if err != nil {
					respondWithClusterError(c, "LIST_CLUSTERROLES_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/clusterroles/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetClusterRoleYAML(
					c.Request.Context(),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_CLUSTERROLE_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/clusterroles/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateClusterRoleYAML(
					c.Request.Context(),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_CLUSTERROLE_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/rolebindings", func(c *gin.Context) {
				items, err := mustClusterService(c).ListRoleBindings(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_ROLEBINDINGS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/rolebindings/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetRoleBindingYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_ROLEBINDING_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/rolebindings/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateRoleBindingYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_ROLEBINDING_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/clusterrolebindings", func(c *gin.Context) {
				items, err := mustClusterService(c).ListClusterRoleBindings(c.Request.Context())
				if err != nil {
					respondWithClusterError(c, "LIST_CLUSTERROLEBINDINGS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/clusterrolebindings/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetClusterRoleBindingYAML(
					c.Request.Context(),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_CLUSTERROLEBINDING_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/clusterrolebindings/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateClusterRoleBindingYAML(
					c.Request.Context(),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_CLUSTERROLEBINDING_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/configmaps", func(c *gin.Context) {
				items, err := mustClusterService(c).ListConfigMaps(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_CONFIGMAPS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/configmaps/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetConfigMapYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_CONFIGMAP_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/configmaps/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateConfigMapYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_CONFIGMAP_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/secrets", func(c *gin.Context) {
				items, err := mustClusterService(c).ListSecrets(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_SECRETS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/secrets/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetSecretYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_SECRET_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/secrets/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateSecretYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_SECRET_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/networkpolicies", func(c *gin.Context) {
				items, err := mustClusterService(c).ListNetworkPolicies(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_NETWORKPOLICIES_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/networkpolicies/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetNetworkPolicyYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_NETWORKPOLICY_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/networkpolicies/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateNetworkPolicyYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_NETWORKPOLICY_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/hpas", func(c *gin.Context) {
				items, err := mustClusterService(c).ListHPAs(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_HPAS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/hpas/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetHPAYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_HPA_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/hpas/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateHPAYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_HPA_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/vpas", func(c *gin.Context) {
				items, err := mustClusterService(c).ListVPAs(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_VPAS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/vpas/readiness", func(c *gin.Context) {
				result, err := mustClusterService(c).GetVPAClusterReadiness(c.Request.Context())
				if err != nil {
					respondWithClusterError(c, "GET_VPA_READINESS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/vpas/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetVPAYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_VPA_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/vpas/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateVPAYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_VPA_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/resourcequotas", func(c *gin.Context) {
				items, err := mustClusterService(c).ListResourceQuotas(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_RESOURCEQUOTAS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/resourcequotas/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetResourceQuotaYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_RESOURCEQUOTA_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/resourcequotas/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateResourceQuotaYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_RESOURCEQUOTA_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/limitranges", func(c *gin.Context) {
				items, err := mustClusterService(c).ListLimitRanges(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_LIMITRANGES_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/limitranges/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetLimitRangeYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_LIMITRANGE_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/limitranges/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateLimitRangeYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_LIMITRANGE_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/persistentvolumeclaims", func(c *gin.Context) {
				items, err := mustClusterService(c).ListPersistentVolumeClaims(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "LIST_PERSISTENTVOLUMECLAIMS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/persistentvolumeclaims/:namespace/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetPersistentVolumeClaimYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_PERSISTENTVOLUMECLAIM_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/persistentvolumeclaims/:namespace/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdatePersistentVolumeClaimYAML(
					c.Request.Context(),
					c.Param("namespace"),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_PERSISTENTVOLUMECLAIM_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/persistentvolumes", func(c *gin.Context) {
				items, err := mustClusterService(c).ListPersistentVolumes(c.Request.Context())
				if err != nil {
					respondWithClusterError(c, "LIST_PERSISTENTVOLUMES_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/persistentvolumes/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetPersistentVolumeYAML(
					c.Request.Context(),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_PERSISTENTVOLUME_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/persistentvolumes/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdatePersistentVolumeYAML(
					c.Request.Context(),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_PERSISTENTVOLUME_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.GET("/storageclasses", func(c *gin.Context) {
				items, err := mustClusterService(c).ListStorageClasses(c.Request.Context())
				if err != nil {
					respondWithClusterError(c, "LIST_STORAGECLASSES_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/storageclasses/:name/yaml", func(c *gin.Context) {
				result, err := mustClusterService(c).GetStorageClassYAML(
					c.Request.Context(),
					c.Param("name"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_STORAGECLASS_YAML_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(result))
			})

			authorized.PUT("/storageclasses/:name/yaml", func(c *gin.Context) {
				var req yamlUpdateRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, response.Failure("INVALID_YAML_UPDATE_REQUEST", "请求体格式不正确"))
					return
				}

				result, err := mustClusterService(c).UpdateStorageClassYAML(
					c.Request.Context(),
					c.Param("name"),
					req.Content,
				)
				if err != nil {
					respondWithClusterError(c, "UPDATE_STORAGECLASS_YAML_FAILED", err)
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

	if info.IsRelease() {
		web.RegisterReleaseRoutes(router)
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

type namespacedDeleteHandler func(
	clusterService *service.ClusterService,
	ctx context.Context,
	namespace string,
	name string,
) (service.WorkloadActionResult, error)

type clusterDeleteHandler func(
	clusterService *service.ClusterService,
	ctx context.Context,
	name string,
) (service.WorkloadActionResult, error)

func registerNamespacedDeleteRoute(
	group *gin.RouterGroup,
	path string,
	errorCode string,
	handler namespacedDeleteHandler,
) {
	group.DELETE(path, func(c *gin.Context) {
		result, err := handler(
			mustClusterService(c),
			c.Request.Context(),
			c.Param("namespace"),
			c.Param("name"),
		)
		if err != nil {
			respondWithClusterError(c, errorCode, err)
			return
		}

		c.JSON(http.StatusOK, response.Success(result))
	})
}

func registerClusterDeleteRoute(
	group *gin.RouterGroup,
	path string,
	errorCode string,
	handler clusterDeleteHandler,
) {
	group.DELETE(path, func(c *gin.Context) {
		result, err := handler(
			mustClusterService(c),
			c.Request.Context(),
			c.Param("name"),
		)
		if err != nil {
			respondWithClusterError(c, errorCode, err)
			return
		}

		c.JSON(http.StatusOK, response.Success(result))
	})
}

func respondWithClusterError(c *gin.Context, code string, err error) {
	var validationErr service.ValidationError
	var permissionErr service.PermissionError

	switch {
	case apierrors.IsUnauthorized(err):
		c.JSON(http.StatusUnauthorized, response.Failure(code, "Bearer Token 无效或已过期"))
	case apierrors.IsForbidden(err):
		c.JSON(http.StatusForbidden, response.Failure(code, "当前 Token 权限不足，无法访问所需资源"))
	case errors.As(err, &permissionErr):
		c.JSON(http.StatusForbidden, response.Failure(code, permissionErr.Error()))
	case errors.As(err, &validationErr):
		c.JSON(http.StatusBadRequest, response.Failure(code, validationErr.Error()))
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		c.JSON(http.StatusRequestTimeout, response.Failure(code, "请求已取消"))
	default:
		c.JSON(http.StatusInternalServerError, response.Failure(code, err.Error()))
	}
}
