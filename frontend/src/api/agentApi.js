/**
 * Client for Scripts/api_agent.php (the MySQL-backed backend).
 *
 * Configure the endpoint with VITE_API_BASE_URL in the project-root .env
 * (vite.config.js points Vite at that file) and start it with `npm run api`.
 */

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/Scripts/api_agent.php";

export const API_UNAVAILABLE_MESSAGE =
  "Agent backend unreachable - start it with `npm run api` (needs MySQL + the indexer).";

async function call(action, { method = "GET", body } = {}) {
  const url = `${API_BASE}?action=${encodeURIComponent(action)}`;
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Backend returned ${response.status}: ${text.slice(0, 120)}`);
  }

  if (data.status === "error") throw new Error(data.message || "Backend error");
  return data;
}

export const getAgentStatus = () => call("get_status");

export const setAgentConfig = (config) => call("set_config", { method: "POST", body: config });

export const getMarket = () => call("get_market");

export const getDecisions = (limit = 20) => call(`get_decisions&limit=${limit}`);

/** True when the error came from the backend being down/unreachable. */
export const isUnreachable = (error) =>
  /Failed to fetch|NetworkError|unreachable|ERR_CONNECTION|ECONNREFUSED/i.test(
    error?.message ?? ""
  );
