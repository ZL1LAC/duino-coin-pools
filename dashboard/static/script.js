/* Pool dashboard frontend — self-hosted, no CDN dependencies.
   Data comes from /statistics, /workers and /rewards; search, sort and
   the leaderboard are computed client-side from one workers fetch. */

const $ = (id) => document.getElementById(id);

const els = {
    statusDot: $("status-dot"),
    poolName: $("pool-name"),
    poolMotd: $("pool-motd"),
    poolPort: $("pool-port"),
    uptime: $("uptime"),
    hashrate: $("hashrate"),
    hashrateSub: $("hashrate-sub"),
    connections: $("connections"),
    workers: $("workers"),
    users: $("users"),
    acceptRate: $("accept-rate"),
    sharesSub: $("shares-sub"),
    cpu: $("cpu"),
    ram: $("ram"),
    historyRange: $("history-range"),
    syncInfo: $("sync-info"),
    lastUpdated: $("last-updated"),
    statsError: $("stats-error"),
    workersError: $("workers-error"),
    workersCount: $("workers-count"),
    workersTable: $("workers-table"),
    workerSearch: $("worker-search"),
    workerSort: $("worker-sort"),
    leaderboard: $("leaderboard-table"),
    rewardsSummary: $("rewards-summary"),
};

const RENDER_CAP = 400;
const LEADERBOARD_SIZE = 10;

const state = {
    history: [],
    historyMeta: null,
    rangeMs: null,
    workers: [],
    rewards: {},
    searchTimeout: null,
};

const charts = { hashrate: null, conn: null, system: null };

/* ---------- formatting ---------- */

function formatHashrate(h) {
    if (h >= 1e9) return (h / 1e9).toFixed(2) + " GH/s";
    if (h >= 1e6) return (h / 1e6).toFixed(2) + " MH/s";
    if (h >= 1e3) return (h / 1e3).toFixed(1) + " kH/s";
    return Math.round(h) + " H/s";
}

function formatCount(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return String(n);
}

function formatDuco(v) {
    if (v >= 1) return v.toFixed(2);
    if (v >= 0.001) return v.toFixed(4);
    return v.toFixed(6);
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function formatSpan(ms) {
    const hours = ms / 3.6e6;
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    const d = Math.floor(hours / 24);
    const h = Math.round(hours % 24);
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

/* ---------- theme & chart chrome ---------- */

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function chartChrome() {
    return {
        ink2: cssVar("--ink-2"),
        muted: cssVar("--muted"),
        grid: cssVar("--grid"),
        axis: cssVar("--axis"),
        surface: cssVar("--surface"),
        border: cssVar("--border"),
        page: cssVar("--page"),
    };
}

const crosshairPlugin = {
    id: "crosshair",
    afterDatasetsDraw(chart) {
        const active = chart.tooltip && chart.tooltip.getActiveElements();
        if (!active || !active.length) return;
        const x = active[0].element.x;
        const { top, bottom } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = cssVar("--axis");
        ctx.stroke();
        ctx.restore();
    },
};

function makeChart(canvasId, seriesDefs, yTickFormat, yMax) {
    const c = chartChrome();
    return new Chart($(canvasId), {
        type: "line",
        plugins: [crosshairPlugin],
        data: {
            labels: [],
            timestamps: [],
            datasets: seriesDefs.map((s) => ({
                label: s.label,
                data: [],
                borderColor: cssVar(s.colorVar),
                backgroundColor: cssVar(s.colorVar) + "1a",
                borderWidth: 2,
                borderJoinStyle: "round",
                borderCapStyle: "round",
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                pointHitRadius: 12,
                format: s.format,
            })),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: "index", intersect: false },
            scales: {
                x: {
                    ticks: { maxTicksLimit: 5, color: c.muted, maxRotation: 0, font: { size: 11 } },
                    grid: { display: false },
                    border: { color: c.axis },
                },
                y: {
                    beginAtZero: true,
                    max: yMax,
                    ticks: { maxTicksLimit: 5, color: c.muted, font: { size: 11 }, callback: yTickFormat },
                    grid: { color: c.grid, lineWidth: 1 },
                    border: { display: false },
                },
            },
            plugins: {
                legend: {
                    display: seriesDefs.length > 1,
                    labels: { color: c.ink2, boxWidth: 14, boxHeight: 2, font: { size: 11 } },
                },
                tooltip: {
                    backgroundColor: c.surface,
                    titleColor: c.muted,
                    bodyColor: cssVar("--ink"),
                    borderColor: c.axis,
                    borderWidth: 1,
                    padding: 10,
                    boxWidth: 12,
                    boxHeight: 2,
                    boxPadding: 4,
                    callbacks: {
                        title(items) {
                            if (!items.length) return "";
                            const ts = items[0].chart.data.timestamps;
                            const t = ts && ts[items[0].dataIndex];
                            return t ? new Date(t).toLocaleString() : items[0].label || "";
                        },
                        label(ctx) {
                            const fmt = ctx.dataset.format || ((v) => v);
                            const value = ctx.parsed.y == null ? "—" : fmt(ctx.parsed.y);
                            return seriesDefs.length > 1
                                ? ` ${value}  ${ctx.dataset.label}`
                                : ` ${value}`;
                        },
                    },
                },
            },
        },
    });
}

function initCharts() {
    if (typeof Chart === "undefined") return;
    charts.hashrate = makeChart(
        "hashrate-chart",
        [{ label: "Hashrate", colorVar: "--s1", format: formatHashrate }],
        (v) => formatHashrate(v)
    );
    charts.conn = makeChart(
        "conn-chart",
        [
            { label: "Connections", colorVar: "--s2", format: (v) => v.toLocaleString() },
            { label: "Workers", colorVar: "--s3", format: (v) => v.toLocaleString() },
        ],
        (v) => (v >= 1000 ? formatCount(v) : v)
    );
    charts.system = makeChart(
        "system-chart",
        [
            { label: "CPU", colorVar: "--s4", format: (v) => v.toFixed(1) + "%" },
            { label: "RAM", colorVar: "--s5", format: (v) => v.toFixed(1) + "%" },
        ],
        (v) => v + "%",
        100
    );
}

function destroyCharts() {
    for (const key of Object.keys(charts)) {
        if (charts[key]) charts[key].destroy();
        charts[key] = null;
    }
}

function visibleHistory() {
    if (!state.rangeMs || !state.history.length) return state.history;
    const cutoff = state.history[state.history.length - 1].t - state.rangeMs;
    return state.history.filter((p) => p.t >= cutoff);
}

function historyLabels(points, spanMs) {
    const showDate = spanMs >= 24 * 3.6e6;
    return points.map((p) => {
        const d = new Date(p.t);
        return showDate
            ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    });
}

function setSeries(chart, points, labels, valueFns) {
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.timestamps = points.map((p) => p.t);
    valueFns.forEach((fn, i) => {
        chart.data.datasets[i].data = points.map(fn);
    });
    chart.update("none");
}

function updateCharts() {
    const points = visibleHistory();
    if (!points.length) return;
    const spanMs = points[points.length - 1].t - points[0].t;
    const labels = historyLabels(points, spanMs);

    setSeries(charts.hashrate, points, labels, [(p) => p.hashrate]);
    setSeries(charts.conn, points, labels, [(p) => p.connections, (p) => p.workers]);
    setSeries(charts.system, points, labels, [
        (p) => (p.cpu != null ? p.cpu : null),
        (p) => (p.ram != null ? p.ram : null),
    ]);

    els.historyRange.textContent = `${points.length} points · ${formatSpan(spanMs)}`;
}

/* ---------- statistics ---------- */

function fetchStatistics() {
    fetch("/statistics")
        .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then((data) => {
            els.statsError.hidden = true;
            els.statusDot.classList.remove("is-down");

            if (data.poolName) {
                els.poolName.textContent = data.poolName;
                document.title = `${data.poolName} · Pool Dashboard`;
            }
            if (data.motd) els.poolMotd.textContent = data.motd;
            els.poolPort.textContent = `port ${data.poolPort}`;
            els.uptime.textContent = `up ${formatUptime(data.uptime || 0)}`;

            els.hashrate.textContent = formatHashrate(data.hashrate);
            els.hashrateSub.textContent =
                `${data.users} users · ${data.workers.toLocaleString()} workers`;
            els.connections.textContent = data.connections.toLocaleString();
            els.workers.textContent = data.workers.toLocaleString();
            els.users.textContent = data.users.toLocaleString();
            els.acceptRate.textContent = data.acceptRate.toFixed(2) + "%";
            els.sharesSub.textContent =
                `${formatCount(data.acceptedShares)} ok · ${formatCount(data.rejectedShares)} bad`;
            els.cpu.textContent = data.cpu.toFixed(1) + "%";
            els.ram.textContent = data.ram.toFixed(1) + "%";

            els.syncInfo.textContent = data.lastSyncAt
                ? `sync #${data.syncCount} at ${new Date(data.lastSyncAt).toLocaleTimeString()}`
                : "not synced yet";
            els.lastUpdated.textContent = "updated " + new Date().toLocaleTimeString();

            state.history = data.history || [];
            state.historyMeta = data.historyMeta;
            updateCharts();
        })
        .catch((err) => {
            els.statsError.textContent = "Failed to load statistics: " + err.message;
            els.statsError.hidden = false;
            els.statusDot.classList.add("is-down");
        });
}

/* ---------- workers table & leaderboard ---------- */

const SORT_FIELDS = {
    hashrate: (w) => w.hashrate || 0,
    username: (w) => (w.username || "").toLowerCase(),
    accepted: (w) => w.accepted || 0,
    rejected: (w) => w.rejected || 0,
};

function td(row, text, className) {
    const cell = document.createElement("td");
    cell.textContent = text;
    if (className) cell.className = className;
    row.appendChild(cell);
}

function renderWorkers() {
    const search = els.workerSearch.value.toLowerCase().trim();
    const [sortKey, order] = els.workerSort.value.split(":");
    const sortFn = SORT_FIELDS[sortKey] || SORT_FIELDS.hashrate;

    let rows = state.workers;
    if (search) {
        rows = rows.filter(
            (w) =>
                (w.username && w.username.toLowerCase().includes(search)) ||
                (w.miner && w.miner.toLowerCase().includes(search)) ||
                (w.rig && w.rig.toLowerCase().includes(search))
        );
    }

    rows = rows.slice().sort((a, b) => {
        const av = sortFn(a);
        const bv = sortFn(b);
        if (av < bv) return order === "asc" ? -1 : 1;
        if (av > bv) return order === "asc" ? 1 : -1;
        return 0;
    });

    const shown = rows.slice(0, RENDER_CAP);
    const frag = document.createDocumentFragment();
    for (const w of shown) {
        const tr = document.createElement("tr");
        td(tr, w.username || "—", "user");
        td(tr, formatHashrate(w.hashrate || 0), "num");
        td(tr, w.miner || "—");
        td(tr, w.rig || "—");
        td(tr, w.difficulty != null ? w.difficulty.toLocaleString() : "—", "num");
        td(tr, w.ping != null ? Math.round(w.ping * 1000) + " ms" : "—", "num");
        td(tr, (w.accepted || 0).toLocaleString(), "num");
        td(tr, (w.rejected || 0).toLocaleString(), "num");
        frag.appendChild(tr);
    }
    els.workersTable.replaceChildren(frag);

    els.workersCount.textContent =
        shown.length < rows.length
            ? `showing ${shown.length} of ${rows.length.toLocaleString()} — refine search to see more`
            : `${rows.length.toLocaleString()} worker${rows.length === 1 ? "" : "s"}`;
}

function renderLeaderboard() {
    const byUser = new Map();
    for (const w of state.workers) {
        if (!w.username) continue;
        let u = byUser.get(w.username);
        if (!u) {
            u = { username: w.username, rigs: 0, hashrate: 0, accepted: 0, rejected: 0 };
            byUser.set(w.username, u);
        }
        u.rigs += 1;
        u.hashrate += w.hashrate || 0;
        u.accepted += w.accepted || 0;
        u.rejected += w.rejected || 0;
    }

    const top = [...byUser.values()]
        .sort((a, b) => b.hashrate - a.hashrate)
        .slice(0, LEADERBOARD_SIZE);

    const frag = document.createDocumentFragment();
    top.forEach((u, i) => {
        const tr = document.createElement("tr");
        tr.dataset.username = u.username;
        tr.title = `Show ${u.username}'s workers`;
        const total = u.accepted + u.rejected;
        const pending = state.rewards[u.username];
        td(tr, String(i + 1), "num");
        td(tr, u.username, "user");
        td(tr, u.rigs.toLocaleString(), "num");
        td(tr, formatHashrate(u.hashrate), "num");
        td(tr, total > 0 ? ((u.accepted / total) * 100).toFixed(1) + "%" : "—", "num");
        td(tr, pending != null ? formatDuco(pending) : "—", "num");
        frag.appendChild(tr);
    });
    els.leaderboard.replaceChildren(frag);
}

function fetchWorkers() {
    fetch("/workers")
        .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then((rows) => {
            els.workersError.hidden = true;
            state.workers = rows;
            renderWorkers();
            renderLeaderboard();
        })
        .catch((err) => {
            els.workersError.textContent = "Failed to load workers: " + err.message;
            els.workersError.hidden = false;
        });
}

function fetchRewards() {
    fetch("/rewards")
        .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then((rewards) => {
            state.rewards = rewards || {};
            const balances = Object.values(state.rewards).filter((v) => v > 0);
            const total = balances.reduce((sum, v) => sum + v, 0);
            els.rewardsSummary.textContent =
                `${formatDuco(total)} DUCO pending across ${balances.length} users`;
            renderLeaderboard();
        })
        .catch(() => {
            els.rewardsSummary.textContent = "rewards unavailable";
        });
}

/* ---------- events ---------- */

els.workerSearch.addEventListener("input", () => {
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(renderWorkers, 200);
});

els.workerSort.addEventListener("change", renderWorkers);

els.leaderboard.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-username]");
    if (!tr) return;
    els.workerSearch.value = tr.dataset.username;
    renderWorkers();
    $("workers-card").scrollIntoView({ behavior: "smooth", block: "start" });
});

for (const btn of document.querySelectorAll(".range-btn")) {
    btn.addEventListener("click", () => {
        document.querySelector(".range-btn.is-selected").classList.remove("is-selected");
        btn.classList.add("is-selected");
        state.rangeMs = btn.dataset.range ? Number(btn.dataset.range) : null;
        updateCharts();
    });
}

$("theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    destroyCharts();
    initCharts();
    updateCharts();
});

/* ---------- boot ---------- */

initCharts();
fetchStatistics();
fetchWorkers();
fetchRewards();

setInterval(fetchStatistics, 5000);
setInterval(fetchWorkers, 15000);
setInterval(fetchRewards, 60000);
