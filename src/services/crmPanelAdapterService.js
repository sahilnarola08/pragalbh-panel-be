import { crmTelemetry } from "./crmTelemetryService.js";

const PANEL_BASE_URL = (process.env.CRM_PANEL_API_BASE_URL || process.env.BASE_URL || "").replace(
  /\/$/,
  ""
);

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CrmPanelError extends Error {
  constructor(message, status = 500, code = "PANEL_API_ERROR", details = null) {
    super(message);
    this.name = "CrmPanelError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const buildUrl = (path, query) => {
  if (!PANEL_BASE_URL) {
    throw new CrmPanelError(
      "CRM panel adapter is not configured. Set CRM_PANEL_API_BASE_URL.",
      500,
      "PANEL_BASE_URL_MISSING"
    );
  }
  const url = new URL(`${PANEL_BASE_URL}${path}`);
  if (query && typeof query === "object") {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.append(key, String(value));
    });
  }
  return url.toString();
};

const normalizeError = (status, payload) => {
  const message =
    payload?.message ||
    payload?.error?.message ||
    (status === 401 ? "Unauthorized request to panel API" : "Panel API request failed");
  return new CrmPanelError(message, status, "PANEL_API_ERROR", payload || null);
};

const requestPanel = async ({ method, path, panelAccessToken, body, query, headers }) => {
  let attempt = 0;
  const maxRetries = 2;
  let retried = false;
  const startedAt = Date.now();

  while (attempt <= maxRetries) {
    const mergedHeaders = {
      "Content-Type": "application/json",
      ...(headers || {}),
    };
    if (panelAccessToken) {
      mergedHeaders.Authorization = `Bearer ${panelAccessToken}`;
    }

    const response = await fetch(buildUrl(path, query), {
      method,
      headers: mergedHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = await response.json().catch(() => null);
    const isRetryable = RETRYABLE_STATUS.has(response.status);

    if (response.ok) {
      crmTelemetry.recordPanelApi({
        ok: true,
        retried,
        latencyMs: Date.now() - startedAt,
      });
      return payload;
    }

    if (isRetryable && attempt < maxRetries) {
      retried = true;
      attempt += 1;
      await sleep(150 * attempt);
      continue;
    }

    crmTelemetry.recordPanelApi({
      ok: false,
      retried,
      latencyMs: Date.now() - startedAt,
    });
    throw normalizeError(response.status, payload);
  }
};

export const crmPanelAdapter = {
  signin(payload) {
    return requestPanel({ method: "POST", path: "/auth/signin", body: payload });
  },
  verifyOtp(payload) {
    return requestPanel({ method: "POST", path: "/auth/verify-otp", body: payload });
  },
  getAuthMe(panelAccessToken) {
    return requestPanel({ method: "GET", path: "/auth/me", panelAccessToken });
  },
  getCrmContract(panelAccessToken) {
    return requestPanel({ method: "GET", path: "/crm/auth/contract", panelAccessToken });
  },
  listCustomers(panelAccessToken, query) {
    return requestPanel({
      method: "GET",
      path: "/crm/clients",
      panelAccessToken,
      query,
    });
  },
  getCustomerById(panelAccessToken, customerId) {
    return requestPanel({
      method: "GET",
      path: `/crm/clients/${encodeURIComponent(customerId)}`,
      panelAccessToken,
    });
  },
  updateCustomer(panelAccessToken, customerId, payload) {
    return requestPanel({
      method: "PATCH",
      path: `/crm/clients/${encodeURIComponent(customerId)}`,
      panelAccessToken,
      body: payload,
    });
  },
  listFollowups(panelAccessToken, customerId, query) {
    return requestPanel({
      method: "GET",
      path: `/crm/clients/${encodeURIComponent(customerId)}/followups`,
      panelAccessToken,
      query,
    });
  },
  createFollowup(panelAccessToken, customerId, payload, requestId) {
    return requestPanel({
      method: "POST",
      path: `/crm/clients/${encodeURIComponent(customerId)}/followups`,
      panelAccessToken,
      body: payload,
      headers: requestId ? { "x-idempotency-key": requestId } : undefined,
    });
  },
  updateFollowup(panelAccessToken, followupId, payload) {
    return requestPanel({
      method: "PATCH",
      path: `/crm/followups/${encodeURIComponent(followupId)}`,
      panelAccessToken,
      body: payload,
    });
  },
  CrmPanelError,
};
