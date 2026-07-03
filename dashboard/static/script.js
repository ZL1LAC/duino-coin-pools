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
const statsErrorEl = document.getElementById("stats-error");
const workersErrorEl = document.getElementById("workers-error");
const workersCountEl = document.getElementById("workers-count");
const workerSearch = document.getElementById("worker-search");
const workerSort = document.getElementById("worker-sort");

let connectionsChart = null;
let hashrateChart = null;
let searchTimeout = null;

const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
        x: {
            ticks: { maxTicksLimit: 6, color: "#b5b5b5" },
            grid: { color: "rgba(255,255,255,0.08)" },
        },
        y: {
            beginAtZero: true,
            ticks: { color: "#b5b5b5" },
            grid: { color: "rgba(255,255,255,0.08)" },
        },
    },
    plugins: { legend: { display: false } },
};

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

function setCell(row, text) {
    const td = document.createElement("td");
    td.textContent = text;
    row.appendChild(td);
}

function initCharts() {
    const connCtx = document.getElementById("connections-chart");
    const hrCtx = document.getElementById("hashrate-chart");

    connectionsChart = new Chart(connCtx, {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: "#ffb86c",
                backgroundColor: "rgba(255,184,108,0.1)",
                fill: true,
                tension: 0.3,
                pointRadius: 0,
            }],
        },
        options: chartDefaults,
    });

    hashrateChart = new Chart(hrCtx, {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: "#8be9fd",
                backgroundColor: "rgba(139,233,253,0.1)",
                fill: true,
                tension: 0.3,
                pointRadius: 0,
            }],
        },
        options: {
            ...chartDefaults,
            scales: {
                ...chartDefaults.scales,
                y: {
                    ...chartDefaults.scales.y,
                    ticks: {
                        color: "#b5b5b5",
                        callback: (v) => formatHashrate(v),
                    },
                },
            },
        },
    });
}

function updateCharts(history) {
    if (!connectionsChart || !hashrateChart || !history) return;

    const labels = history.map((p) => new Date(p.t).toLocaleTimeString());
    const connData = history.map((p) => p.connections);
    const hrData = history.map((p) => p.hashrate);

    connectionsChart.data.labels = labels;
    connectionsChart.data.datasets[0].data = connData;
    connectionsChart.update();

    hashrateChart.data.labels = labels;
    hashrateChart.data.datasets[0].data = hrData;
    hashrateChart.update();
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

            updateCharts(data.history);
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
