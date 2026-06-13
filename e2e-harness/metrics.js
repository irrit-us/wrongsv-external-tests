function parseLabels(raw) {
  if (!raw) return {};
  const labels = {};
  for (const part of raw.split(/,(?=[a-zA-Z_]+=)/)) {
    const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)="(.*)"$/);
    if (!match) continue;
    labels[match[1]] = match[2]
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return labels;
}

function parsePrometheus(text) {
  const points = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([^{\s]+)(?:\{([^}]*)\})?\s+([0-9.eE+-]+)$/);
    if (!match) continue;
    points.push({
      name: match[1],
      labels: parseLabels(match[2]),
      value: Number(match[3]),
    });
  }
  return points;
}

class WrongsvMetricsClient {
  constructor(options) {
    this.url = options.url;
  }

  async scrape() {
    const response = await fetch(this.url);
    if (!response.ok) {
      throw new Error(`Metrics scrape failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  async snapshot() {
    const rawText = await this.scrape();
    const points = parsePrometheus(rawText);
    const users = {};
    const scalar = {};

    for (const point of points) {
      const email = point.labels.email;
      if (email) {
        if (!users[email]) {
          users[email] = {
            bytesIn: 0,
            bytesOut: 0,
            activeConnections: 0,
            totalConnections: 0,
          };
        }
        switch (point.name) {
          case "wrongsv_user_bytes_in":
            users[email].bytesIn = point.value;
            break;
          case "wrongsv_user_bytes_out":
            users[email].bytesOut = point.value;
            break;
          case "wrongsv_user_active_connections":
            users[email].activeConnections = point.value;
            break;
          case "wrongsv_user_total_connections":
            users[email].totalConnections = point.value;
            break;
          default:
            break;
        }
        continue;
      }
      scalar[point.name] = point.value;
    }

    return {
      uptimeSeconds: scalar.wrongsv_uptime_seconds || 0,
      totalBytesIn: scalar.wrongsv_total_bytes_in || 0,
      totalBytesOut: scalar.wrongsv_total_bytes_out || 0,
      totalConnections: scalar.wrongsv_total_connections || 0,
      users,
      rawText,
    };
  }

  static delta(before, after) {
    if (!before || !after) return null;
    const emails = new Set([
      ...Object.keys(before.users || {}),
      ...Object.keys(after.users || {}),
    ]);
    const users = {};
    for (const email of emails) {
      const prev = before.users[email] || {};
      const next = after.users[email] || {};
      users[email] = {
        bytesIn: (next.bytesIn || 0) - (prev.bytesIn || 0),
        bytesOut: (next.bytesOut || 0) - (prev.bytesOut || 0),
        activeConnections: next.activeConnections || 0,
        totalConnections: (next.totalConnections || 0) - (prev.totalConnections || 0),
      };
    }

    return {
      totalBytesIn: after.totalBytesIn - before.totalBytesIn,
      totalBytesOut: after.totalBytesOut - before.totalBytesOut,
      totalConnections: after.totalConnections - before.totalConnections,
      users,
    };
  }
}

module.exports = {
  WrongsvMetricsClient,
};
