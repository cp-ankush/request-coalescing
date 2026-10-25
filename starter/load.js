// Run: k6 run load.js
import http from "k6/http";
import { Counter, Rate } from "k6/metrics";

const target = __ENV.TARGET || "http://127.0.0.1:3000/work";
const metricsUrl = target.match(/^https?:\/\/[^/]+/)[0] + "/__metrics";
const concurrency = 20;
const requests = new Counter("work_requests");
const ok = new Counter("status_200");
const networkErrors = new Counter("network_errors");
const groups = new Counter("request_groups");
const reads = new Counter("backing_reads");
const passedGroups = new Counter("passed_groups");
const failedGroups = new Counter("failed_groups");
const coalescing = new Rate("coalescing_checks");

// One coordinator sends parallel batches. The next batch waits for this one.
export const options = {
  vus: 1,
  duration: "20s",
  batch: concurrency,
  batchPerHost: concurrency,
  gracefulStop: "30s",
  thresholds: { coalescing_checks: ["rate==1"] },
};

function readCount() {
  const response = http.get(metricsUrl, { timeout: "5s" });
  if (response.status !== 200) throw new Error("Cannot read /__metrics");
  const count = response.json("domain.reads");
  if (!Number.isFinite(count)) throw new Error("Missing DB read count");
  return count;
}

export default function () {
  groups.add(1);
  let passed = false;

  try {
    const before = readCount();
    const responses = http.batch(Array.from({ length: concurrency }, () => ({
      method: "GET", url: target, params: { timeout: "10s", redirects: 0 },
    })));
    const statuses = {};
    for (const response of responses) {
      requests.add(1);
      ok.add(response.status === 200 ? 1 : 0);
      networkErrors.add(response.status === 0 ? 1 : 0);
      statuses[response.status] = (statuses[response.status] || 0) + 1;
    }

    const backingReads = readCount() - before;
    reads.add(Math.max(0, backingReads));
    passed = backingReads === 1 && statuses[200] === concurrency;
    console.log(
      `Group ${__ITER + 1}: ${passed ? "PASS" : "FAIL"} | ` +
      `${responses.length} requests | ${backingReads} DB reads | ` +
      `200: ${statuses[200] || 0} | network errors: ${statuses[0] || 0}` +
      (passed ? "" : ` | statuses: ${JSON.stringify(statuses)}`),
    );
  } catch (error) {
    console.log(`Group ${__ITER + 1}: FAIL | ${error.message}`);
  }

  passedGroups.add(passed ? 1 : 0);
  failedGroups.add(passed ? 0 : 1);
  coalescing.add(passed);
}

export function handleSummary(data) {
  const count = (name) => data.metrics[name]?.values.count || 0;
  const groupCount = count("request_groups");
  const summary = {
    result: groupCount > 0 && count("failed_groups") === 0 ? "PASS" : "FAIL",
    duration: "20s (plus time to finish the last batch)",
    target,
    totalRequests: count("work_requests"),
    status200: count("status_200"),
    differentConcurrentRequestsGroups: groupCount,
    "DB-reads": count("backing_reads"),
    passedGroups: count("passed_groups"),
    failedGroups: count("failed_groups"),
    droppedOrNetworkErrors: count("network_errors"),
  };
  return { stdout: "\nFINAL LOAD SUMMARY\n" + JSON.stringify(summary, null, 2) + "\n" };
}
