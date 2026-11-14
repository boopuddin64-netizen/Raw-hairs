export function buildDashboardSnapshot(results) {
  const data = {};
  const unavailable = {};

  for (const result of results || []) {
    if (!result?.key || !result?.table) continue;
    if (result.error) {
      data[result.key] = [];
      unavailable[result.key] = result.table;
    } else {
      data[result.key] = Array.isArray(result.data) ? result.data : [];
    }
  }

  return { data, unavailable };
}
