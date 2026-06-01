import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const DISTRICTS = [
	"Thao Dien",
	"District 1",
	"Binh Thanh",
	"District 7",
	"Thu Duc",
	"Phu Nhuan",
	"District 3",
	"Tan Binh",
];

const DEFAULT_SIZES = [50_000, 100_000, 250_000];
const DEFAULT_ITERATIONS = 100;

const MVP_ASSUMPTIONS = {
	activeListings: 50_000,
	monthlyVisitors: 500_000,
	agentsOrOwners: 5_000,
	cityScope: "one large city first",
	growthTarget: "multi-city, millions of listings over time",
};

const REQUIREMENTS = {
	searchP95Ms: 300,
	cachedDetailP95Ms: 200,
};

function parseArgs() {
	const args = process.argv.slice(2);
	const options = {
		sizes: DEFAULT_SIZES,
		iterations: DEFAULT_ITERATIONS,
		writeReport: false,
	};

	for (let i = 0; i < args.length; i += 1) {
		if (args[i] === "--sizes") {
			const sizes = [];
			i += 1;
			while (i < args.length && !args[i].startsWith("--")) {
				sizes.push(Number(args[i]));
				i += 1;
			}
			i -= 1;
			options.sizes = sizes;
		} else if (args[i] === "--iterations") {
			options.iterations = Number(args[i + 1]);
			i += 1;
		} else if (args[i] === "--write-report") {
			options.writeReport = true;
		}
	}

	return options;
}

function stableHash(value) {
	const text = JSON.stringify(value, Object.keys(value).sort());
	let hash = 0;
	for (let i = 0; i < text.length; i += 1) {
		hash = (hash << 5) - hash + text.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash).toString(16).padStart(8, "0");
}

function percentile(samples, pct) {
	const sorted = [...samples].sort((a, b) => a - b);
	const index = Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1);
	return sorted[index];
}

function summarize(samples) {
	return {
		medianMs: Number(percentile(samples, 50).toFixed(3)),
		p95Ms: Number(percentile(samples, 95).toFixed(3)),
		minMs: Number(Math.min(...samples).toFixed(3)),
		maxMs: Number(Math.max(...samples).toFixed(3)),
	};
}

function makeListings(size) {
	return Array.from({ length: size }, (_, index) => {
		const listingType = index % 5 === 0 ? "sale" : "rent";
		const district = DISTRICTS[index % DISTRICTS.length];
		return {
			id: `B-${String(size - index).padStart(7, "0")}`,
			title: `Benchmark listing ${index}`,
			district,
			city: "Ho Chi Minh City",
			listingType,
			price:
				listingType === "rent"
					? 650 + (index % 45) * 45
					: 140_000 + (index % 200) * 4_000,
			bedrooms: 1 + (index % 4),
			area: 35 + (index % 130),
			status: index % 37 === 0 ? "pending_review" : "active",
			available: index % 13 !== 0,
			owner: ["Lan Nguyen", "Minh Tran", "Saigon Nest"][index % 3],
			photoCount: 3 + (index % 12),
		};
	});
}

class TtlMap {
	constructor() {
		this.map = new Map();
	}

	get(key) {
		const entry = this.map.get(key);
		if (!entry) return undefined;
		if (entry.expiresAt < performance.now()) {
			this.map.delete(key);
			return undefined;
		}
		return entry.value;
	}

	set(key, value, ttlMs) {
		this.map.set(key, {
			value,
			expiresAt: performance.now() + ttlMs,
		});
	}

	clear() {
		this.map.clear();
	}
}

class DemoBackend {
	constructor(listings) {
		this.listings = listings;
		this.redis = new TtlMap();
		this.detailIndex = new Map(
			listings.map((listing) => [listing.id, listing]),
		);
	}

	searchKey(filters, cursor, limit) {
		return `search:results:${stableHash({ ...filters, cursor, limit })}`;
	}

	searchListings({ filters, cursor = null, limit = 20 }) {
		const cacheKey = this.searchKey(filters, cursor, limit);
		const cached = this.redis.get(cacheKey);
		if (cached) return { ...cached, source: "redis" };

		const normalizedDistrict =
			filters.district === "Any" ? undefined : filters.district.toLowerCase();
		const filtered = this.listings
			.filter((listing) => listing.status === "active" && listing.available)
			.filter((listing) => listing.listingType === filters.listingType)
			.filter(
				(listing) =>
					!normalizedDistrict ||
					listing.district.toLowerCase() === normalizedDistrict,
			)
			.filter((listing) => listing.price <= filters.maxPrice)
			.filter((listing) => listing.bedrooms >= filters.minBedrooms)
			.sort((a, b) => b.id.localeCompare(a.id));

		const start = cursor
			? filtered.findIndex((listing) => listing.id === cursor) + 1
			: 0;
		const items = filtered.slice(start, start + limit).map((listing) => ({
			id: listing.id,
			title: listing.title,
			district: listing.district,
			price: listing.price,
			bedrooms: listing.bedrooms,
			area: listing.area,
		}));
		const nextCursor =
			start + limit < filtered.length ? items.at(-1)?.id : undefined;
		const payload = { items, nextCursor, total: filtered.length };
		this.redis.set(cacheKey, payload, 60_000);
		return { ...payload, source: "db" };
	}

	getListingDetail(id) {
		const cacheKey = `listing:detail:${id}`;
		const cached = this.redis.get(cacheKey);
		if (cached) return { ...cached, source: "redis" };

		const listing = this.detailIndex.get(id);
		if (!listing) throw new Error(`Unknown listing: ${id}`);

		const detail = {
			...listing,
			photos: Array.from({ length: listing.photoCount }, (_, index) => ({
				url: `https://cdn.example.com/listings/${listing.id}/${index}.webp`,
				isPrimary: index === 0,
			})),
			owner: {
				name: listing.owner,
				phone: "+84 90 123 4567",
			},
			description: `Detail response for ${listing.title}`,
		};
		this.redis.set(cacheKey, detail, 300_000);
		return { ...detail, source: "db" };
	}

	clearRedis() {
		this.redis.clear();
	}
}

class FrontendQueryCache {
	constructor() {
		this.cache = new TtlMap();
	}

	key(parts) {
		return JSON.stringify(parts);
	}

	get(parts) {
		return this.cache.get(this.key(parts));
	}

	set(parts, value, ttlMs) {
		this.cache.set(this.key(parts), value, ttlMs);
	}

	clear() {
		this.cache.clear();
	}
}

function createHarness(size) {
	const listings = makeListings(size);
	const backend = new DemoBackend(listings);
	const frontend = new FrontendQueryCache();
	const filters = {
		listingType: "rent",
		district: "Thao Dien",
		maxPrice: 1_700,
		minBedrooms: 2,
		onlyAvailable: true,
	};
	const activeListings = listings.filter(
		(listing) => listing.status === "active" && listing.available,
	);
	const firstActiveListing = activeListings.find(
		(listing) => listing.listingType === "rent",
	);

	return { backend, frontend, filters, detailId: firstActiveListing.id };
}

function frontendSearch({ backend, frontend, filters, cursor = null }) {
	const queryKey = ["listings", "list", filters, cursor];
	const cached = frontend.get(queryKey);
	if (cached) return { ...cached, source: "frontend" };

	const response = backend.searchListings({ filters, cursor });
	frontend.set(queryKey, response, 25_000);
	return response;
}

function frontendDetail({ backend, frontend, detailId }) {
	const queryKey = ["listings", "detail", detailId];
	const cached = frontend.get(queryKey);
	if (cached) return { ...cached, source: "frontend" };

	const response = backend.getListingDetail(detailId);
	frontend.set(queryKey, response, 60_000);
	return response;
}

function measure(iterations, setup, run) {
	const samples = [];
	for (let i = 0; i < iterations; i += 1) {
		const context = setup(i);
		const start = performance.now();
		const response = run(context, i);
		const elapsed = performance.now() - start;
		if (!response) throw new Error("Benchmark function returned no response");
		samples.push(elapsed);
	}
	return summarize(samples);
}

function listingIdFor(size, iteration) {
	return `B-${String(size - 1 - (iteration % Math.min(size - 1, 500))).padStart(7, "0")}`;
}

function benchmarkSize(size, iterations) {
	const searchColdHarness = createHarness(size);
	const searchCold = measure(
		iterations,
		(iteration) => {
			searchColdHarness.backend.clearRedis();
			searchColdHarness.frontend.clear();
			return {
				...searchColdHarness,
				filters: {
					...searchColdHarness.filters,
					maxPrice: searchColdHarness.filters.maxPrice + (iteration % 5),
				},
			};
		},
		({ backend, frontend, filters }) =>
			frontendSearch({ backend, frontend, filters }),
	);

	const searchRedisHarness = createHarness(size);
	const searchRedisHit = measure(
		iterations,
		(iteration) => {
			searchRedisHarness.backend.clearRedis();
			searchRedisHarness.frontend.clear();
			const filters = {
				...searchRedisHarness.filters,
				maxPrice: searchRedisHarness.filters.maxPrice + (iteration % 5),
			};
			frontendSearch({
				backend: searchRedisHarness.backend,
				frontend: searchRedisHarness.frontend,
				filters,
			});
			searchRedisHarness.frontend.clear();
			return { ...searchRedisHarness, filters };
		},
		({ backend, frontend, filters }) =>
			frontendSearch({ backend, frontend, filters }),
	);

	const searchFrontendHarness = createHarness(size);
	const searchFrontendHit = measure(
		iterations,
		(iteration) => {
			searchFrontendHarness.backend.clearRedis();
			searchFrontendHarness.frontend.clear();
			const filters = {
				...searchFrontendHarness.filters,
				maxPrice: searchFrontendHarness.filters.maxPrice + (iteration % 5),
			};
			frontendSearch({
				backend: searchFrontendHarness.backend,
				frontend: searchFrontendHarness.frontend,
				filters,
			});
			return { ...searchFrontendHarness, filters };
		},
		({ backend, frontend, filters }) =>
			frontendSearch({ backend, frontend, filters }),
	);

	const detailColdHarness = createHarness(size);
	const detailCold = measure(
		iterations,
		(iteration) => {
			detailColdHarness.backend.clearRedis();
			detailColdHarness.frontend.clear();
			const id = listingIdFor(size, iteration);
			return {
				...detailColdHarness,
				detailId: detailColdHarness.backend.detailIndex.has(id)
					? id
					: detailColdHarness.detailId,
			};
		},
		({ backend, frontend, detailId }) =>
			frontendDetail({ backend, frontend, detailId }),
	);

	const detailRedisHarness = createHarness(size);
	const detailRedisHit = measure(
		iterations,
		(iteration) => {
			detailRedisHarness.backend.clearRedis();
			detailRedisHarness.frontend.clear();
			const id = listingIdFor(size, iteration);
			const detailId = detailRedisHarness.backend.detailIndex.has(id)
				? id
				: detailRedisHarness.detailId;
			frontendDetail({
				backend: detailRedisHarness.backend,
				frontend: detailRedisHarness.frontend,
				detailId,
			});
			detailRedisHarness.frontend.clear();
			return { ...detailRedisHarness, detailId };
		},
		({ backend, frontend, detailId }) =>
			frontendDetail({ backend, frontend, detailId }),
	);

	const detailFrontendHarness = createHarness(size);
	const detailFrontendHit = measure(
		iterations,
		(iteration) => {
			detailFrontendHarness.backend.clearRedis();
			detailFrontendHarness.frontend.clear();
			const id = listingIdFor(size, iteration);
			const detailId = detailFrontendHarness.backend.detailIndex.has(id)
				? id
				: detailFrontendHarness.detailId;
			frontendDetail({
				backend: detailFrontendHarness.backend,
				frontend: detailFrontendHarness.frontend,
				detailId,
			});
			return { ...detailFrontendHarness, detailId };
		},
		({ backend, frontend, detailId }) =>
			frontendDetail({ backend, frontend, detailId }),
	);

	return {
		size,
		iterations,
		searchCold,
		searchRedisHit,
		searchFrontendHit,
		detailCold,
		detailRedisHit,
		detailFrontendHit,
		requirements: {
			searchColdP95Under300ms: searchCold.p95Ms < REQUIREMENTS.searchP95Ms,
			searchRedisP95Under300ms: searchRedisHit.p95Ms < REQUIREMENTS.searchP95Ms,
			detailRedisP95Under200ms:
				detailRedisHit.p95Ms < REQUIREMENTS.cachedDetailP95Ms,
			detailFrontendP95Under200ms:
				detailFrontendHit.p95Ms < REQUIREMENTS.cachedDetailP95Ms,
		},
	};
}

function resultRow(sizeResult, metricKey, label, targetMs) {
	const metric = sizeResult[metricKey];
	const pass = metric.p95Ms < targetMs ? "✅" : "❌";
	return `| ${sizeResult.size.toLocaleString()} | ${label} | ${metric.medianMs} ms | ${metric.p95Ms} ms | ${metric.minMs} ms | ${metric.maxMs} ms | < ${targetMs} ms | ${pass} |`;
}

function renderReport(results, nodeVersion) {
	const lines = [
		"# Demo Benchmark — MVP Cache Design",
		"",
		"This benchmark qualifies the React/Vite demo against the MVP assumptions from the assignment.",
		"It models the same flow shown in the UI:",
		"",
		"```txt",
		"Frontend TanStack Query cache → Redis backend cache → PostgreSQL fallback",
		"```",
		"",
		"Redis and PostgreSQL are simulated with in-process data structures. The goal is to",
		"qualify the design flow and latency budgets, not measure real managed-service/network latency.",
		"",
		`Node runtime: \`${nodeVersion}\``,
		"",
		"## MVP assumptions qualified",
		"",
		"| Area | Assumption | Benchmark interpretation |",
		"|---|---:|---|",
		`| Initial scale | ${MVP_ASSUMPTIONS.activeListings.toLocaleString()} active listings | Primary benchmark row uses 50k synthetic active-listing-scale data |`,
		`| Traffic | ${MVP_ASSUMPTIONS.monthlyVisitors.toLocaleString()} monthly visitors | Cache-hit scenarios show repeated popular searches/details avoid DB work |`,
		`| Supply side | ${MVP_ASSUMPTIONS.agentsOrOwners.toLocaleString()} agents/owners | Dataset includes listing ownership metadata and detail assembly |`,
		"| Search latency | p95 < 300 ms | Search cold and cached paths must stay below target |",
		"| Detail latency | p95 < 200 ms cached | Redis/frontend detail cache paths must stay below target |",
		"",
		"## Results",
		"",
		"| Dataset | Scenario | Median | p95 | Min | Max | Target | Pass |",
		"|---:|---|---:|---:|---:|---:|---:|:---:|",
	];

	for (const result of results) {
		lines.push(
			resultRow(
				result,
				"searchCold",
				"Search cold: FE miss → Redis miss → DB",
				REQUIREMENTS.searchP95Ms,
			),
		);
		lines.push(
			resultRow(
				result,
				"searchRedisHit",
				"Search warm: FE miss → Redis hit",
				REQUIREMENTS.searchP95Ms,
			),
		);
		lines.push(
			resultRow(
				result,
				"searchFrontendHit",
				"Search hot: FE query cache hit",
				REQUIREMENTS.searchP95Ms,
			),
		);
		lines.push(
			resultRow(
				result,
				"detailCold",
				"Detail cold: FE miss → Redis miss → DB",
				REQUIREMENTS.cachedDetailP95Ms,
			),
		);
		lines.push(
			resultRow(
				result,
				"detailRedisHit",
				"Detail warm: FE miss → Redis hit",
				REQUIREMENTS.cachedDetailP95Ms,
			),
		);
		lines.push(
			resultRow(
				result,
				"detailFrontendHit",
				"Detail hot: FE query cache hit",
				REQUIREMENTS.cachedDetailP95Ms,
			),
		);
	}

	lines.push(
		"",
		"## How to explain this benchmark",
		"",
		"- The 50k row corresponds to the MVP initial scale in the assignment.",
		"- Cold search represents the worst demo path: frontend miss, Redis miss, DB fallback.",
		"- Redis-hit scenarios clear the frontend cache before timing, proving the request still reaches the backend cache layer.",
		"- Frontend-hit scenarios represent TanStack Query serving data from browser memory with no API/Redis/DB call.",
		"- Real production latency will include network, database I/O, serialization, auth, and observability overhead; this benchmark qualifies the architecture pattern, not cloud infrastructure.",
		"",
		"## Run locally",
		"",
		"```bash",
		"npm run benchmark",
		"```",
		"",
		"Custom run:",
		"",
		"```bash",
		"node benchmark/cache-flow-benchmark.mjs --sizes 50000 100000 250000 --iterations 100 --write-report",
		"```",
		"",
	);

	return `${lines.join("\n")}\n`;
}

function main() {
	const options = parseArgs();
	const results = options.sizes.map((size) =>
		benchmarkSize(size, options.iterations),
	);
	const output = {
		node: process.version,
		mvpAssumptions: MVP_ASSUMPTIONS,
		requirements: REQUIREMENTS,
		results,
	};

	console.log(JSON.stringify(output, null, 2));

	if (options.writeReport) {
		const report = renderReport(results, process.version);
		const reportPath = join(process.cwd(), "benchmark", "cache-flow-report.md");
		writeFileSync(reportPath, report, "utf8");
		console.log(`Wrote ${reportPath}`);
	}
}

main();
