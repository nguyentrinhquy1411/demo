# Demo Benchmark — MVP Cache Design

This benchmark qualifies the React/Vite demo against the MVP assumptions from the assignment.
It models the same flow shown in the UI:

```txt
Frontend TanStack Query cache → Redis backend cache → PostgreSQL fallback
```

Redis and PostgreSQL are simulated with in-process data structures. The goal is to
qualify the design flow and latency budgets, not measure real managed-service/network latency.

Node runtime: `v20.17.0`

## MVP assumptions qualified

| Area | Assumption | Benchmark interpretation |
|---|---:|---|
| Initial scale | 50,000 active listings | Primary benchmark row uses 50k synthetic active-listing-scale data |
| Traffic | 500,000 monthly visitors | Cache-hit scenarios show repeated popular searches/details avoid DB work |
| Supply side | 5,000 agents/owners | Dataset includes listing ownership metadata and detail assembly |
| Search latency | p95 < 300 ms | Search cold and cached paths must stay below target |
| Detail latency | p95 < 200 ms cached | Redis/frontend detail cache paths must stay below target |

## Results

| Dataset | Scenario | Median | p95 | Min | Max | Target | Pass |
|---:|---|---:|---:|---:|---:|---:|:---:|
| 50,000 | Search cold: FE miss → Redis miss → DB | 3.888 ms | 5.863 ms | 2.953 ms | 8.964 ms | < 300 ms | ✅ |
| 50,000 | Search warm: FE miss → Redis hit | 0.038 ms | 0.068 ms | 0.025 ms | 0.154 ms | < 300 ms | ✅ |
| 50,000 | Search hot: FE query cache hit | 0.016 ms | 0.034 ms | 0.01 ms | 0.117 ms | < 300 ms | ✅ |
| 50,000 | Detail cold: FE miss → Redis miss → DB | 0.007 ms | 0.016 ms | 0.006 ms | 0.177 ms | < 200 ms | ✅ |
| 50,000 | Detail warm: FE miss → Redis hit | 0.005 ms | 0.01 ms | 0.005 ms | 0.05 ms | < 200 ms | ✅ |
| 50,000 | Detail hot: FE query cache hit | 0.002 ms | 0.004 ms | 0.001 ms | 0.049 ms | < 200 ms | ✅ |
| 100,000 | Search cold: FE miss → Redis miss → DB | 10.584 ms | 14.038 ms | 7.263 ms | 21.321 ms | < 300 ms | ✅ |
| 100,000 | Search warm: FE miss → Redis hit | 0.036 ms | 0.056 ms | 0.026 ms | 0.07 ms | < 300 ms | ✅ |
| 100,000 | Search hot: FE query cache hit | 0.016 ms | 0.024 ms | 0.011 ms | 0.031 ms | < 300 ms | ✅ |
| 100,000 | Detail cold: FE miss → Redis miss → DB | 0.008 ms | 0.01 ms | 0.006 ms | 0.065 ms | < 200 ms | ✅ |
| 100,000 | Detail warm: FE miss → Redis hit | 0.002 ms | 0.004 ms | 0.002 ms | 0.011 ms | < 200 ms | ✅ |
| 100,000 | Detail hot: FE query cache hit | 0.001 ms | 0.002 ms | 0.001 ms | 0.019 ms | < 200 ms | ✅ |
| 250,000 | Search cold: FE miss → Redis miss → DB | 26.386 ms | 30.195 ms | 20.054 ms | 35.443 ms | < 300 ms | ✅ |
| 250,000 | Search warm: FE miss → Redis hit | 0.035 ms | 0.054 ms | 0.026 ms | 0.111 ms | < 300 ms | ✅ |
| 250,000 | Search hot: FE query cache hit | 0.013 ms | 0.022 ms | 0.011 ms | 0.028 ms | < 300 ms | ✅ |
| 250,000 | Detail cold: FE miss → Redis miss → DB | 0.007 ms | 0.015 ms | 0.006 ms | 0.097 ms | < 200 ms | ✅ |
| 250,000 | Detail warm: FE miss → Redis hit | 0.002 ms | 0.003 ms | 0.002 ms | 0.009 ms | < 200 ms | ✅ |
| 250,000 | Detail hot: FE query cache hit | 0.002 ms | 0.002 ms | 0.001 ms | 0.018 ms | < 200 ms | ✅ |

## How to explain this benchmark

- The 50k row corresponds to the MVP initial scale in the assignment.
- Cold search represents the worst demo path: frontend miss, Redis miss, DB fallback.
- Redis-hit scenarios clear the frontend cache before timing, proving the request still reaches the backend cache layer.
- Frontend-hit scenarios represent TanStack Query serving data from browser memory with no API/Redis/DB call.
- Real production latency will include network, database I/O, serialization, auth, and observability overhead; this benchmark qualifies the architecture pattern, not cloud infrastructure.

## Run locally

```bash
npm run benchmark
```

Custom run:

```bash
node benchmark/cache-flow-benchmark.mjs --sizes 50000 100000 250000 --iterations 100 --write-report
```

