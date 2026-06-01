# Real Estate MVP Cache Demo

A React + Vite demo for explaining the Part 2 MVP architecture in an interview.

## What it demonstrates

- Infinite loading for `GET /api/v1/listings` using TanStack Query `useInfiniteQuery`.
- Cursor-style pagination using the last listing ID as `nextCursor`.
- Frontend query cache hits when filters/query keys repeat.
- Backend Redis search-result cache using `search:results:{hash}` with a 60-second TTL.
- Backend Redis listing-detail cache using `listing:detail:{id}` with a 5-minute TTL.
- PostgreSQL fallback on Redis cache miss.
- Cache invalidation when moderation approves a pending listing.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL and use the controls on the page.

## Benchmark MVP assumptions

Run the benchmark for the cache design:

```bash
npm run benchmark
```

This writes:

```txt
benchmark/cache-flow-report.md
```

The benchmark qualifies the MVP assumptions from the assignment:

| Area | MVP assumption | Demo benchmark |
|---|---:|---|
| Initial scale | 50,000 active listings | Primary benchmark row uses 50k synthetic listings |
| Traffic | 500,000 monthly visitors | Repeated popular searches/details should be served by FE or Redis cache |
| Supply side | 5,000 agents/owners | Synthetic listing detail includes owner metadata |
| Search latency | p95 < 300 ms | Measures FE miss → Redis miss → DB and cached paths |
| Detail latency | p95 < 200 ms cached | Measures FE miss → Redis detail hit and FE cache hit |

Latest local 50k-listing result on Node `v20.17.0`:

| Scenario | p95 |
|---|---:|
| Search cold: FE miss → Redis miss → DB | 5.863 ms |
| Search warm: FE miss → Redis hit | 0.068 ms |
| Search hot: FE query cache hit | 0.034 ms |
| Detail cold: FE miss → Redis miss → DB | 0.016 ms |
| Detail warm: FE miss → Redis hit | 0.01 ms |
| Detail hot: FE query cache hit | 0.004 ms |

Full report: `benchmark/cache-flow-report.md`.

## How Redis is demoed in this repo

There is no real Redis server in this demo. Instead, `src/main.jsx` includes a mock
NestJS-style backend that uses an in-memory `Map` to simulate Redis behavior:

```js
const redis = new Map()
```

Each Redis entry stores:

- `value` — the cached API response
- `expiresAt` — a timestamp used to simulate TTL expiry
- `ttlSeconds` — the original TTL for display/debugging

The important behavior is the same as the MVP design:

### 1. Search result cache

When the UI searches listings, the mock backend builds a deterministic cache key:

```txt
search:results:{hash(filters + cursor + limit)}
```

Flow:

1. React Query calls `backend.searchListings({ filters, cursor })`.
2. Backend checks the Redis map for `search:results:{hash}`.
3. If found and not expired, it returns quickly and logs `Redis HIT`.
4. If missing/expired, it simulates a slower PostgreSQL read.
5. The response is cached for 60 seconds.

This mirrors the MVP doc where popular searches such as “2BR rent in Thao Dien
under $1500” are cached briefly to avoid repeated PostgreSQL FTS queries.

### 2. Listing detail cache

The listing detail page is cached at **two layers**:

```txt
Frontend query cache → Redis listing detail cache → PostgreSQL
```

When clicking a listing, the React app first checks the TanStack Query cache for:

```txt
['listings', 'detail', listing_id]
```

If the frontend query cache misses or is stale, the mock API checks Redis:

```txt
listing:detail:{listing_id}
```

Flow:

1. Click a listing for the first time.
2. Frontend query cache misses, so React Query calls the API layer.
3. API checks Redis for `listing:detail:{id}`.
4. If Redis misses, backend simulates a PostgreSQL join: `listings + listing_photos + users`.
5. Backend stores the serialized detail response in Redis for 5 minutes.
6. React Query stores the detail response in browser memory for 60 seconds.
7. Re-clicking the same listing can be served by frontend cache without Redis/DB.
8. Clearing only frontend cache and re-clicking can show Redis serving the detail response without DB.

This matches the MVP design because listing detail pages are expensive reads and
are safe to cache with invalidation on listing/photo/status changes.

### 3. Invalidation demo

Click **Approve pending listing** to simulate moderation approving `L-1036`.
The backend changes its status from `pending_review` to `active`, then deletes
search cache entries:

```txt
search:results:*
listing:detail:L-1036
```

That demonstrates the write-path rule from the MVP cache strategy:

> Invalidate cached reads when writes change the data.

### 4. Frontend cache vs Redis cache

The demo intentionally separates the two layers:

| Layer | In demo | Real MVP equivalent |
|---|---|---|
| Frontend cache | TanStack Query cache | Browser memory cache for query results |
| Backend cache | In-memory Redis simulation | ElastiCache/Redis used by NestJS |
| Database | Simulated slower array filter | PostgreSQL + indexes / FTS |

Use these buttons to explain the difference:

- **Clear frontend query cache**: removes TanStack Query entries only.
- **Clear Redis cache**: removes backend cache entries only.

## Interview talking track

1. Start with the top architecture strip: `React SPA → TanStack Query → NestJS API → Redis → PostgreSQL`.
2. Explain that this is a frontend demo with a mock backend in the same file, but the request/cache behavior mirrors the MVP architecture.
3. Click **Load more via cursor** several times to show infinite loading and multiple cached pages.
4. Watch the **Redis backend cache** panel fill with `search:results:{hash}` keys and TTLs.
5. Click **Replay same search** to show a Redis hit for the same normalized query.
6. Click a listing to show the detail-page chain: frontend cache miss → Redis miss → DB.
7. Click the same listing again to show frontend query cache hit: no Redis/DB call.
8. Click **Clear frontend query cache**, then re-click that listing to show Redis detail cache hit.
9. Click **Clear Redis cache**, then re-click after clearing frontend cache to show DB fallback again.
10. Click **Approve pending listing** to show write-path invalidation.
11. Compare **Frontend query cache** vs **Redis backend cache** panels to explain why both exist.
