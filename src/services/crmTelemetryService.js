const metrics = {
  refresh: { success: 0, failed: 0, reuseDetected: 0 },
  scope: { denied: 0 },
  panelApi: { total: 0, failed: 0, retried: 0, latencyMsTotal: 0 },
};

export const crmTelemetry = {
  recordRefresh(success) {
    if (success) metrics.refresh.success += 1;
    else metrics.refresh.failed += 1;
  },
  recordRefreshReuse() {
    metrics.refresh.reuseDetected += 1;
  },
  recordScopeDenied() {
    metrics.scope.denied += 1;
  },
  recordPanelApi({ ok, retried, latencyMs }) {
    metrics.panelApi.total += 1;
    if (!ok) metrics.panelApi.failed += 1;
    if (retried) metrics.panelApi.retried += 1;
    metrics.panelApi.latencyMsTotal += latencyMs || 0;
  },
  snapshot() {
    const avgLatency =
      metrics.panelApi.total > 0
        ? Number((metrics.panelApi.latencyMsTotal / metrics.panelApi.total).toFixed(2))
        : 0;
    return {
      refresh: {
        ...metrics.refresh,
        failureRate:
          metrics.refresh.success + metrics.refresh.failed > 0
            ? Number(
                (
                  metrics.refresh.failed /
                  (metrics.refresh.success + metrics.refresh.failed)
                ).toFixed(4)
              )
            : 0,
      },
      scope: { ...metrics.scope },
      panelApi: {
        total: metrics.panelApi.total,
        failed: metrics.panelApi.failed,
        retried: metrics.panelApi.retried,
        avgLatencyMs: avgLatency,
        errorRate:
          metrics.panelApi.total > 0
            ? Number((metrics.panelApi.failed / metrics.panelApi.total).toFixed(4))
            : 0,
      },
    };
  },
};
