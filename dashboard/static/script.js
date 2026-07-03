const connections = document.getElementById("connections");
const cpu = document.getElementById("cpu");
const ram = document.getElementById("ram");
const workers = document.getElementById("workers");
const users = document.getElementById("users");
const hashrate = document.getElementById("hashrate");
const poolName = document.getElementById("pool-name");
const poolMotdText = document.getElementById("pool-motd-text");
const workersTable = document.getElementById("workers-table");
const uptimeEl = document.getElementById("uptime");
const acceptRateEl = document.getElementById("accept-rate");
const lastSyncEl = document.getElementById("last-sync");
const syncCountEl = document.getElementById("sync-count");
const lastUpdatedEl = document.getElementById("last-updated");
const historyRangeEl = document.getElementById("history-range");
const statsErrorEl = document.getElementById("stats-error");
const workersErrorEl = document.getElementById("workers-error");
const workersCountEl = document.getElementById("workers-count");
const workerSearch = document.getElementById("worker-search");
const workerSort = document.getElementById("worker-sort");

let connectionsChart = null;
let hashrateChart = null;
let workersChart = null;
let systemChart = null;
let searchTimeout = null;

function formatHashrate(h) {
    if (h >= 1e6) return (h / 1e6).toFixed(2) + " MH/s";
    if (h >= 1e3) return (h / 1e3).toFixed(1) + " kH/s";
    return Math.round(h) + " H/s";
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${seconds % 60}s`;
}

function formatTime(ts) {
    if (!ts) return "-";
    return new Date(ts).toLocaleTimeString();
}

function formatSpan(hours) {
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

function historyLabels(history, meta) {
    const showDate = meta && meta.spanHours >= 24;
    return history.map((p) => {
        const d = new Date(p.t);
        return showDate
            ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : d.toLocaleTimeString();
    });
}

function chartOptions(extraY) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        scales: {
            x: {
                ticks: { maxTicksLimit: 6, color: "#b5b5b5", maxRotation: 0 },
                grid: { color: "rgba(255,255,255,0.08)" },
            },
            y: {
                beginAtZero: true,
                ticks: { color: "#b5b5b5", ...extraY },
                grid: { color: "rgba(255,255,255,0.08)" },
            },
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    title: (items) => {
                        if (!items.length) return "";
                        const idx = items[0].dataIndex;
                        return new Date(items[0].chart.data.timestamps[idx]).toLocaleString();
                    },
                },
            },
        },
    };
}

function setCell(row, text) {
    const td = document.createElement("td");
    td.textContent = text;
    row.appendChild(td);
}

function initCharts() {
    connectionsChart = new Chart(document.getElementById("connections-chart"), {
        type: "line",
        data: { labels: [], timestamps: [], datasets: [{
            data: [], borderColor: "#ffb86c", backgroundColor: "rgba(255,184,108,0.1)",
            fill: true, tension: 0.3, pointRadius: 0,
        }]},
        options: chartOptions(),
    });

    hashrateChart = new Chart(document.getElementById("hashrate-chart"), {
        type: "line",
        data: { labels: [], timestamps: [], datasets: [{
            data: [], borderColor: "#8be9fd", backgroundColor: "rgba(139,233,253,0.1)",
            fill: true, tension: 0.3, pointRadius: 0,
        }]},
        options: chartOptions({
            callback: (v) => formatHashrate(v),
        }),
    });

    workersChart = new Chart(document.getElementById("workers-chart"), {
        type: "line",
        data: { labels: [], timestamps: [], datasets: [{
            data: [], borderColor: "#50fa7b", backgroundColor: "rgba(80,250,123,0.1)",
            fill: true, tension: 0.3, pointRadius: 0,
        }]},
        options: chartOptions(),
    });

    systemChart = new Chart(document.getElementById("system-chart"), {
        type: "line",
        data: { labels: [], timestamps: [], datasets: [
            {
                label: "CPU",
                data: [], borderColor: "#ff79c6", backgroundColor: "rgba(255,121,198,0.05)",
                fill: true, tension: 0.3, pointRadius: 0,
            },
            {
                label: "RAM",
                data: [], borderColor: "#bd93f9", backgroundColor: "rgba(189,147,249,0.05)",
                fill: true, tension: 0.3, pointRadius: 0,
            },
        ]},
        options: {
            ...chartOptions({ callback: (v) => v + "%" }),
            plugins: {
                legend: { display: true, labels: { color: "#b5b5b5", boxWidth: 12 } },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            if (!items.length) return "";
                            const idx = items[0].dataIndex;
                            return new Date(items[0].chart.data.timestamps[idx]).toLocaleString();
                        },
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`,
                    },
                },
            },
        },
    });
}

function updateChart(chart, history, meta, valueFn) {
    chart.data.labels = historyLabels(history, meta);
    chart.data.timestamps = history.map((p) => p.t);
    chart.data.datasets[0].data = history.map(valueFn);
    chart.update();
}

function updateCharts(history, meta) {
    if (!history || !history.length) return;

    updateChart(connectionsChart, history, meta, (p) => p.connections);
    updateChart(hashrateChart, history, meta, (p) => p.hashrate);
    updateChart(workersChart, history, meta, (p) => p.workers);

    systemChart.data.labels = historyLabels(history, meta);
    systemChart.data.timestamps = history.map((p) => p.t);
    systemChart.data.datasets[0].data = history.map((p) => p.cpu != null ? p.cpu : null);
    systemChart.data.datasets[1].data = history.map((p) => p.ram != null ? p.ram : null);
    systemChart.update();
}

function updateHistoryRange(meta) {
    if (!meta || !meta.points) {
        historyRangeEl.textContent = "No history yet";
        return;
    }
    historyRangeEl.textContent = `Last ${formatSpan(meta.spanHours)} · ${meta.points} points`;
}

function fetch_statistics() {
    fetch("/statistics")
        .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then((data) => {
            statsErrorEl.classList.add("is-hidden");
            connections.textContent = data.connections;
            cpu.textContent = data.cpu.toFixed(1) + "%";
            ram.textContent = data.ram.toFixed(1) + "%";
            workers.textContent = data.workers;
            users.textContent = data.users;
            hashrate.textContent = formatHashrate(data.hashrate);
            uptimeEl.textContent = formatUptime(data.uptime || 0);
            acceptRateEl.textContent = data.acceptRate.toFixed(1) + "%";
            lastSyncEl.textContent = formatTime(data.lastSyncAt);
            syncCountEl.textContent = data.syncCount;

            if (data.poolName) poolName.textContent = data.poolName;
            if (data.motd) poolMotdText.textContent = data.motd;

            updateCharts(data.history, data.historyMeta);
            updateHistoryRange(data.historyMeta);
            lastUpdatedEl.textContent = "Updated " + new Date().toLocaleTimeString();
        })
        .catch((err) => {
            statsErrorEl.textContent = "Failed to load statistics: " + err.message;
            statsErrorEl.classList.remove("is-hidden");
        });
}

function getWorkerQuery() {
    const [sort, order] = workerSort.value.split(":");
    const params = new URLSearchParams({ sort, order });
    const search = workerSearch.value.trim();
    if (search) params.set("search", search);
    return params.toString();
}

function fetch_workers() {
    fetch("/workers?" + getWorkerQuery())
        .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then((rows) => {
            workersErrorEl.classList.add("is-hidden");
            workersTable.innerHTML = "";

            rows.forEach((row) => {
                const tr = document.createElement("tr");
                setCell(tr, row.username || "-");
                setCell(tr, formatHashrate(row.hashrate || 0));
                setCell(tr, row.miner || "-");
                setCell(tr, row.rig || "-");
                setCell(tr, row.difficulty != null ? String(row.difficulty) : "-");
                setCell(tr, row.ping != null ? row.ping.toFixed(2) + "s" : "-");
                setCell(tr, String(row.accepted || 0));
                setCell(tr, String(row.rejected || 0));
                workersTable.appendChild(tr);
            });

            workersCountEl.textContent = `Showing ${rows.length} worker${rows.length === 1 ? "" : "s"}`;
        })
        .catch((err) => {
            workersErrorEl.textContent = "Failed to load workers: " + err.message;
            workersErrorEl.classList.remove("is-hidden");
        });
}

workerSearch.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(fetch_workers, 300);
});

workerSort.addEventListener("change", fetch_workers);

initCharts();
fetch_statistics();
fetch_workers();

setInterval(fetch_statistics, 5000);
setInterval(fetch_workers, 15000);
