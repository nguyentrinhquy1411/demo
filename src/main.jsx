import {
	QueryClient,
	QueryClientProvider,
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const now = () => Date.now();

function stableHash(value) {
	const text = JSON.stringify(value, Object.keys(value).sort());
	let hash = 0;
	for (let i = 0; i < text.length; i += 1) {
		hash = (hash << 5) - hash + text.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash).toString(16).padStart(8, "0");
}

const seedListings = [
	[
		"L-1048",
		"River-glass 2BR above Thao Dien",
		"Thao Dien",
		"rent",
		1400,
		2,
		78,
		"active",
	],
	[
		"L-1047",
		"Sunlit micro-loft near Ben Thanh",
		"District 1",
		"rent",
		980,
		1,
		45,
		"active",
	],
	[
		"L-1046",
		"Garden villa lane house",
		"Binh Thanh",
		"rent",
		2200,
		3,
		160,
		"active",
	],
	["L-1045", "Quiet balcony studio", "Thao Dien", "rent", 760, 1, 38, "active"],
	[
		"L-1044",
		"Penthouse shell with city spine view",
		"District 1",
		"sale",
		540000,
		3,
		132,
		"active",
	],
	[
		"L-1043",
		"Family apartment by the canal",
		"Binh Thanh",
		"rent",
		1250,
		2,
		84,
		"active",
	],
	[
		"L-1042",
		"Owner-direct townhouse",
		"District 7",
		"sale",
		410000,
		4,
		190,
		"active",
	],
	[
		"L-1041",
		"Minimal 2BR with deep storage",
		"Thao Dien",
		"rent",
		1320,
		2,
		71,
		"active",
	],
	[
		"L-1040",
		"Top-floor serviced suite",
		"District 1",
		"rent",
		1180,
		1,
		52,
		"active",
	],
	[
		"L-1039",
		"Pool-facing 3BR compound apartment",
		"Thao Dien",
		"rent",
		2100,
		3,
		145,
		"active",
	],
	[
		"L-1038",
		"Compact office-convertible apartment",
		"Binh Thanh",
		"rent",
		890,
		1,
		49,
		"active",
	],
	[
		"L-1037",
		"Corner unit near international school",
		"District 7",
		"rent",
		1550,
		2,
		88,
		"active",
	],
	[
		"L-1036",
		"Pending review: fresh 2BR soft launch",
		"Thao Dien",
		"rent",
		1490,
		2,
		82,
		"pending_review",
	],
	[
		"L-1035",
		"Canal-edge 2BR with morning balcony",
		"Thao Dien",
		"rent",
		1460,
		2,
		80,
		"active",
	],
	[
		"L-1034",
		"Low-rise apartment beside Nguyen Van Huong",
		"Thao Dien",
		"rent",
		1520,
		2,
		86,
		"active",
	],
	[
		"L-1033",
		"Renovated walk-up near Japanese quarter",
		"District 1",
		"rent",
		1340,
		2,
		67,
		"active",
	],
	[
		"L-1032",
		"Wide-front family flat by Landmark",
		"Binh Thanh",
		"rent",
		1680,
		3,
		112,
		"active",
	],
	[
		"L-1031",
		"Soft industrial 2BR with workspace",
		"Thao Dien",
		"rent",
		1280,
		2,
		73,
		"active",
	],
	[
		"L-1030",
		"Compact 2BR near expat grocers",
		"Thao Dien",
		"rent",
		1120,
		2,
		64,
		"active",
	],
	[
		"L-1029",
		"Quiet river compound garden unit",
		"Thao Dien",
		"rent",
		1590,
		2,
		91,
		"active",
	],
	[
		"L-1028",
		"Skyline 1BR close to Nguyen Hue",
		"District 1",
		"rent",
		1040,
		1,
		51,
		"active",
	],
	[
		"L-1027",
		"Large Thu Duc townhouse with parking",
		"Thu Duc",
		"rent",
		1750,
		4,
		210,
		"active",
	],
	[
		"L-1026",
		"Phu Nhuan mid-century serviced 2BR",
		"Phu Nhuan",
		"rent",
		980,
		2,
		69,
		"active",
	],
	[
		"L-1025",
		"District 7 duplex near Crescent Mall",
		"District 7",
		"rent",
		1850,
		3,
		118,
		"active",
	],
	[
		"L-1024",
		"Binh Thanh starter condo for sale",
		"Binh Thanh",
		"sale",
		230000,
		2,
		74,
		"active",
	],
].map(
	(
		[id, title, district, listingType, price, bedrooms, area, status],
		index,
	) => ({
		id,
		title,
		district,
		city: "Ho Chi Minh City",
		listingType,
		price,
		bedrooms,
		area,
		status,
		available: true,
		owner: ["Lan Nguyen", "Minh Tran", "Saigon Nest"][index % 3],
		photo: `https://images.unsplash.com/photo-${
			[
				"1600585154340-be6161a56a0c",
				"1505693416388-ac5ce068fe85",
				"1600607687939-ce8a6c25118c",
				"1493809842364-78817add7ffb",
				"1600566753190-17f0baa2a6c3",
				"1600607687644-aac4c3eac7f4",
			][index % 6]
		}?auto=format&fit=crop&w=900&q=80`,
	}),
);

function createMockBackend() {
	let listings = [...seedListings];
	const redis = new Map();
	const events = [];
	const stats = {
		postgresReads: 0,
		redisHits: 0,
		redisMisses: 0,
		queryCount: 0,
		invalidations: 0,
	};
	const listeners = new Set();

	function emit(message, tone = "neutral") {
		events.unshift({
			id: crypto.randomUUID(),
			at: new Date().toLocaleTimeString(),
			message,
			tone,
		});
		events.splice(9);
		listeners.forEach((listener) => listener());
	}

	function notify() {
		listeners.forEach((listener) => listener());
	}

	function readRedis(key) {
		const entry = redis.get(key);
		if (!entry || entry.expiresAt < now()) {
			if (entry) redis.delete(key);
			stats.redisMisses += 1;
			emit(`Redis MISS → ${key}`, "miss");
			return null;
		}
		stats.redisHits += 1;
		emit(`Redis HIT → ${key}`, "hit");
		return entry.value;
	}

	function writeRedis(key, value, ttlSeconds) {
		redis.set(key, { value, expiresAt: now() + ttlSeconds * 1000, ttlSeconds });
		emit(`Redis SET ${ttlSeconds}s → ${key}`, "set");
	}

	function normalizeFilters(filters) {
		return {
			listingType: filters.listingType,
			district:
				filters.district === "Any" ? undefined : filters.district.toLowerCase(),
			maxPrice: Number(filters.maxPrice),
			minBedrooms: Number(filters.minBedrooms),
			onlyAvailable: true,
		};
	}

	async function searchListings({ filters, cursor = null, limit = 4 }) {
		stats.queryCount += 1;
		const normalized = normalizeFilters(filters);
		const pageKey = `search:results:${stableHash({ ...normalized, cursor, limit })}`;
		const cached = readRedis(pageKey);
		if (cached) {
			notify();
			await sleep(160);
			return { ...cached, source: "redis", cacheKey: pageKey };
		}

		await sleep(620);
		stats.postgresReads += 1;
		emit("PostgreSQL FTS read on active listings index", "db");

		const filtered = listings
			.filter((listing) => listing.status === "active" && listing.available)
			.filter((listing) => listing.listingType === normalized.listingType)
			.filter(
				(listing) =>
					!normalized.district ||
					listing.district.toLowerCase() === normalized.district,
			)
			.filter((listing) => listing.price <= normalized.maxPrice)
			.filter((listing) => listing.bedrooms >= normalized.minBedrooms)
			.sort((a, b) => b.id.localeCompare(a.id));

		const start = cursor
			? filtered.findIndex((listing) => listing.id === cursor) + 1
			: 0;
		const slice = filtered.slice(start, start + limit);
		const nextCursor =
			start + limit < filtered.length ? slice.at(-1)?.id : undefined;
		const payload = { items: slice, nextCursor, total: filtered.length };
		writeRedis(pageKey, payload, 60);
		notify();
		return { ...payload, source: "postgres", cacheKey: pageKey };
	}

	async function getListingDetail(id) {
		const key = `listing:detail:${id}`;
		const cached = readRedis(key);
		if (cached) {
			notify();
			await sleep(120);
			return { ...cached, source: "redis", cacheKey: key };
		}

		await sleep(540);
		stats.postgresReads += 1;
		const listing = listings.find((item) => item.id === id);
		emit(`PostgreSQL detail join: listings + photos + users for ${id}`, "db");
		const detail = {
			...listing,
			description:
				"A polished MVP listing detail response assembled by the NestJS API from PostgreSQL, then cached in Redis for five minutes.",
			agentPhone: "+84 90 123 4567",
			cachePolicy:
				"listing:detail:{id}, TTL 5 minutes, invalidated on edit/status/photo changes",
		};
		writeRedis(key, detail, 300);
		notify();
		return { ...detail, source: "postgres", cacheKey: key };
	}

	async function approvePendingListing() {
		await sleep(300);
		listings = listings.map((listing) =>
			listing.id === "L-1036" ? { ...listing, status: "active" } : listing,
		);
		for (const key of [...redis.keys()]) {
			if (
				key.startsWith("search:results:") ||
				key === "listing:detail:L-1036"
			) {
				redis.delete(key);
			}
		}
		stats.invalidations += 1;
		emit(
			"Moderation approved L-1036 → invalidated search result caches",
			"invalidate",
		);
		notify();
	}

	return {
		logFrontendCache(message) {
			emit(message, "fe");
		},
		searchListings,
		getListingDetail,
		approvePendingListing,
		clearRedis() {
			redis.clear();
			emit("Manual Redis flush for demo", "invalidate");
			notify();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		snapshot() {
			return {
				stats: { ...stats },
				events: [...events],
				redisKeys: [...redis.entries()].map(([key, entry]) => ({
					key,
					ttl: Math.max(0, Math.ceil((entry.expiresAt - now()) / 1000)),
				})),
			};
		},
	};
}

const backend = createMockBackend();

const listingKeys = {
	all: ["listings"],
	lists: () => [...listingKeys.all, "list"],
	list: (filters) => [...listingKeys.lists(), filters],
	detail: (id) => [...listingKeys.all, "detail", id],
};

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 25_000,
			gcTime: 5 * 60_000,
			refetchOnWindowFocus: false,
		},
	},
});

function useBackendSnapshot() {
	const [snapshot, setSnapshot] = useState(backend.snapshot());
	useEffect(() => backend.subscribe(() => setSnapshot(backend.snapshot())), []);
	useEffect(() => {
		const timer = setInterval(() => setSnapshot(backend.snapshot()), 1000);
		return () => clearInterval(timer);
	}, []);
	return snapshot;
}

function useQueryCacheSnapshot() {
	const client = useQueryClient();
	const [queries, setQueries] = useState([]);
	useEffect(() => {
		const update = () => {
			setQueries(
				client
					.getQueryCache()
					.getAll()
					.map((query) => ({
						hash: query.queryHash,
						state: query.state.status,
						fetchStatus: query.state.fetchStatus,
						stale: query.isStale(),
						observers: query.getObserversCount(),
					})),
			);
		};
		update();
		return client.getQueryCache().subscribe(update);
	}, [client]);
	return queries;
}

function App() {
	const [filters, setFilters] = useState({
		listingType: "rent",
		district: "Thao Dien",
		maxPrice: 1600,
		minBedrooms: 2,
	});
	const [selectedId, setSelectedId] = useState(null);
	const [replayNonce, setReplayNonce] = useState(0);
	const queryClient = useQueryClient();
	const backendSnapshot = useBackendSnapshot();
	const querySnapshot = useQueryCacheSnapshot();

	const infiniteQuery = useInfiniteQuery({
		queryKey: listingKeys.list(filters),
		queryFn: ({ pageParam }) => {
			backend.logFrontendCache(
				`FE Query MISS/stale → API search request, cursor ${pageParam ?? "first-page"}`,
			);
			return backend.searchListings({ filters, cursor: pageParam });
		},
		initialPageParam: null,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});

	const detailQuery = useQuery({
		queryKey: selectedId
			? listingKeys.detail(selectedId)
			: ["listings", "detail", "idle"],
		queryFn: () => {
			backend.logFrontendCache(
				`FE Query MISS/stale → API detail request for ${selectedId}`,
			);
			return backend.getListingDetail(selectedId);
		},
		enabled: Boolean(selectedId),
		staleTime: 60_000,
	});

	const listings = useMemo(
		() => infiniteQuery.data?.pages.flatMap((page) => page.items) ?? [],
		[infiniteQuery.data],
	);

	async function approveListing() {
		await backend.approvePendingListing();
		await queryClient.invalidateQueries({ queryKey: listingKeys.lists() });
	}

	function replaySameSearch() {
		setReplayNonce((value) => value + 1);
		backend.logFrontendCache(
			"FE Query invalidated manually → next search request can hit Redis",
		);
		queryClient.invalidateQueries({ queryKey: listingKeys.list(filters) });
	}

	function clearFrontendCache() {
		queryClient.clear();
		setSelectedId(null);
		backend.logFrontendCache(
			"FE Query cache cleared → next detail/search read must call the API layer",
		);
	}

	function openListingDetail(listingId) {
		const detailKey = listingKeys.detail(listingId);
		const cachedDetail = queryClient.getQueryData(detailKey);
		backend.logFrontendCache(
			cachedDetail
				? `FE Query HIT → detail ${listingId} served from browser memory, no Redis/DB call`
				: `FE Query MISS → detail ${listingId} will check Redis next`,
		);
		setSelectedId(listingId);
	}

	useEffect(() => {
		if (replayNonce > 0) {
			backendSnapshot.events;
		}
	}, [replayNonce, backendSnapshot.events]);

	return (
		<main className="shell">
			<section className="hero">
				<div>
					<p className="eyebrow">Part 2 MVP interviewer demo</p>
					<h1>
						Infinite search, Redis cache, and React query cache in one flow.
					</h1>
					<p className="lede">
						This simulates the MVP path from the design: React + TanStack Query
						calls a NestJS-style API, the API checks Redis first, then falls
						back to PostgreSQL FTS and caches the response.
					</p>
				</div>
				<div className="architecture-card" aria-label="Architecture flow">
					{[
						"React SPA",
						"TanStack Query",
						"NestJS API",
						"Redis",
						"PostgreSQL",
					].map((item, index) => (
						<React.Fragment key={item}>
							<span>{item}</span>
							{index < 4 && <b>→</b>}
						</React.Fragment>
					))}
				</div>
			</section>

			<section className="redis-explainer panel">
				<div>
					<p className="eyebrow">How this repo demos Redis</p>
					<h2>
						Redis is mocked as an in-memory TTL map, but the behavior matches
						the MVP design.
					</h2>
				</div>
				<ol>
					<li>
						<strong>Search request:</strong> React Query calls the mock API with
						filters and cursor.
					</li>
					<li>
						<strong>Redis lookup:</strong> API checks{" "}
						<code>search:results:&#123;hash&#125;</code> before touching
						PostgreSQL.
					</li>
					<li>
						<strong>Miss path:</strong> simulated PostgreSQL query waits longer,
						returns rows, then sets Redis TTL 60s.
					</li>
					<li>
						<strong>Hit path:</strong> same filters/cursor return quickly from
						Redis and increment Redis hits.
					</li>
					<li>
						<strong>Write path:</strong> approving a listing invalidates search
						caches, like moderation would in NestJS.
					</li>
				</ol>
			</section>

			<section className="panel controls">
				<div>
					<label>District</label>
					<select
						value={filters.district}
						onChange={(event) =>
							setFilters({ ...filters, district: event.target.value })
						}
					>
						{[
							"Any",
							"Thao Dien",
							"District 1",
							"Binh Thanh",
							"District 7",
							"Thu Duc",
							"Phu Nhuan",
						].map((district) => (
							<option key={district}>{district}</option>
						))}
					</select>
				</div>
				<div>
					<label>Max price</label>
					<input
						type="range"
						min="800"
						max="4500"
						step="100"
						value={filters.maxPrice}
						onChange={(event) =>
							setFilters({ ...filters, maxPrice: Number(event.target.value) })
						}
					/>
					<strong>${filters.maxPrice}</strong>
				</div>
				<div>
					<label>Bedrooms</label>
					<select
						value={filters.minBedrooms}
						onChange={(event) =>
							setFilters({
								...filters,
								minBedrooms: Number(event.target.value),
							})
						}
					>
						{[1, 2, 3].map((bedroom) => (
							<option key={bedroom} value={bedroom}>
								{bedroom}+
							</option>
						))}
					</select>
				</div>
				<button onClick={replaySameSearch}>Replay same search</button>
				<button onClick={clearFrontendCache} className="ghost">
					Clear frontend query cache
				</button>
				<button onClick={backend.clearRedis} className="ghost">
					Clear Redis cache
				</button>
				<button onClick={approveListing} className="accent">
					Approve pending listing
				</button>
			</section>

			<section className="grid">
				<div className="panel listings-panel">
					<div className="section-title">
						<div>
							<p className="eyebrow">GET /api/v1/listings</p>
							<h2>Infinite listing search</h2>
						</div>
						<StatusBadge query={infiniteQuery} />
					</div>

					<div className="cards">
						{listings.map((listing) => (
							<button
								key={listing.id}
								className={`listing-card ${selectedId === listing.id ? "selected" : ""}`}
								onClick={() => openListingDetail(listing.id)}
							>
								<img src={listing.photo} alt="" />
								<span className="price">
									${listing.price.toLocaleString()}/mo
								</span>
								<h3>{listing.title}</h3>
								<p>
									{listing.district} · {listing.bedrooms}BR · {listing.area}sqm
								</p>
							</button>
						))}
						{infiniteQuery.isFetching && <SkeletonCards />}
					</div>

					<button
						className="load-more"
						disabled={
							!infiniteQuery.hasNextPage || infiniteQuery.isFetchingNextPage
						}
						onClick={() => infiniteQuery.fetchNextPage()}
					>
						{infiniteQuery.hasNextPage
							? "Load more via cursor"
							: "No more pages"}
					</button>
				</div>

				<aside className="panel detail-panel">
					<p className="eyebrow">GET /api/v1/listings/:id</p>
					<h2>Listing detail cache</h2>
					{!selectedId && (
						<p className="muted">
							Click a listing to show the page-detail cache chain: FE query
							cache first, then Redis <code>listing:detail:&#123;id&#125;</code>
							, then DB on miss.
						</p>
					)}
					{detailQuery.isFetching && (
						<div className="detail-loading">Assembling detail response…</div>
					)}
					{detailQuery.data && (
						<div className="detail">
							<img src={detailQuery.data.photo} alt="" />
							<strong>{detailQuery.data.title}</strong>
							<p>{detailQuery.data.description}</p>
							<code>{detailQuery.data.cacheKey}</code>
							<span className={`source ${detailQuery.data.source}`}>
								served from {detailQuery.data.source}
							</span>
						</div>
					)}
				</aside>
			</section>

			<section className="telemetry">
				<Metric
					label="Postgres reads"
					value={backendSnapshot.stats.postgresReads}
				/>
				<Metric
					label="Redis hits"
					value={backendSnapshot.stats.redisHits}
					tone="good"
				/>
				<Metric
					label="Redis misses"
					value={backendSnapshot.stats.redisMisses}
					tone="warn"
				/>
				<Metric
					label="Invalidations"
					value={backendSnapshot.stats.invalidations}
				/>
			</section>

			<section className="grid bottom-grid">
				<CachePanel
					title="Redis backend cache"
					items={backendSnapshot.redisKeys.map(
						(item) => `${item.key} · TTL ${item.ttl}s`,
					)}
					empty="Redis is empty — next read will hit PostgreSQL."
				/>
				<CachePanel
					title="Frontend query cache"
					items={querySnapshot.map(
						(item) =>
							`${item.hash} · ${item.state}/${item.fetchStatus} · ${item.stale ? "stale" : "fresh"}`,
					)}
					empty="No React Query entries yet."
				/>
				<EventLog events={backendSnapshot.events} />
			</section>
		</main>
	);
}

function StatusBadge({ query }) {
	const lastPage = query.data?.pages.at(-1);
	const source = lastPage?.source;
	return (
		<span className={`status ${source ?? "idle"}`}>
			{query.isFetching ? "fetching" : source ? `last: ${source}` : "idle"}
		</span>
	);
}

function SkeletonCards() {
	return Array.from({ length: 2 }).map((_, index) => (
		<div className="skeleton-card" key={index} />
	));
}

function Metric({ label, value, tone = "neutral" }) {
	return (
		<div className={`metric ${tone}`}>
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function CachePanel({ title, items, empty }) {
	return (
		<div className="panel cache-panel">
			<h2>{title}</h2>
			{items.length === 0 ? (
				<p className="muted">{empty}</p>
			) : (
				items.map((item) => <code key={item}>{item}</code>)
			)}
		</div>
	);
}

function EventLog({ events }) {
	return (
		<div className="panel cache-panel event-log">
			<h2>Request timeline</h2>
			{events.length === 0 ? (
				<p className="muted">Interact with the demo to generate events.</p>
			) : (
				events.map((event) => (
					<p key={event.id} className={event.tone}>
						<span>{event.at}</span>
						{event.message}
					</p>
				))
			)}
		</div>
	);
}

createRoot(document.getElementById("root")).render(
	<QueryClientProvider client={queryClient}>
		<App />
	</QueryClientProvider>,
);
