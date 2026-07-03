/* Duino-Coin Pool dashboard
For documention about these functions see
https://github.com/revoxhere/duino-coin/blob/useful-tools
2019-2024 Duino-Coin community */

const path = require("path");
const express = require("express");
const log = require("./logging");
const poolStats = require("./poolStats");
const { getHistoryMeta } = poolStats;
const mining = require("./mining");
const {
    dashboard_port,
    poolName,
    motd,
    port: poolPort,
} = require("../config/config.json");

const app = express();
const staticDir = path.join(__dirname, "../dashboard/static");

const SORT_FIELDS = {
    hashrate: (w) => w.hashrate,
    username: (w) => (w.username || "").toLowerCase(),
    accepted: (w) => w.accepted,
    rejected: (w) => w.rejected,
};

app.use(express.static(staticDir));

app.get("/ping", (req, res) => {
    res.json({ result: "Pong!", success: true });
});

app.get("/statistics", (req, res) => {
    const workers = Object.values(mining.stats.minersStats);
    const users = new Set(workers.map((w) => w.u));
    const hashrate = workers.reduce((sum, w) => sum + (w.h || 0), 0);
    const acceptedShares = workers.reduce((sum, w) => sum + (w.a || 0), 0);
    const rejectedShares = workers.reduce((sum, w) => sum + (w.r || 0), 0);
    const totalShares = acceptedShares + rejectedShares;
    const acceptRate = totalShares > 0 ? (acceptedShares / totalShares) * 100 : 100;
    const uptime = poolStats.startedAt
        ? Math.floor((Date.now() - poolStats.startedAt) / 1000)
        : 0;

    res.json({
        poolName,
        motd,
        poolPort,
        connections: poolStats.connections,
        cpu: poolStats.cpu,
        ram: poolStats.ram,
        workers: workers.length,
        users: users.size,
        hashrate,
        syncCount: poolStats.syncCount,
        lastSyncAt: poolStats.lastSyncAt,
        uptime,
        acceptRate,
        acceptedShares,
        rejectedShares,
        history: poolStats.history,
        historyMeta: getHistoryMeta(),
    });
});

app.get("/history", (req, res) => {
    res.json({
        meta: getHistoryMeta(),
        points: poolStats.history,
    });
});

app.get("/workers", (req, res) => {
    const search = (req.query.search || "").toLowerCase().trim();
    const sort = SORT_FIELDS[req.query.sort] ? req.query.sort : "hashrate";
    const order = req.query.order === "asc" ? "asc" : "desc";

    let workers = Object.values(mining.stats.minersStats).map((w) => ({
        username: w.u,
        hashrate: w.h,
        sharetime: w.s,
        accepted: w.a,
        rejected: w.r,
        difficulty: w.d,
        miner: w.sft,
        rig: w.id,
        algorithm: w.al,
        lastSeen: w.t,
        ping: w.pg,
        reward: w.rw,
    }));

    if (search) {
        workers = workers.filter(
            (w) =>
                (w.username && w.username.toLowerCase().includes(search)) ||
                (w.miner && w.miner.toLowerCase().includes(search)) ||
                (w.rig && w.rig.toLowerCase().includes(search))
        );
    }

    const sortFn = SORT_FIELDS[sort];
    workers.sort((a, b) => {
        const av = sortFn(a);
        const bv = sortFn(b);
        if (av < bv) return order === "asc" ? -1 : 1;
        if (av > bv) return order === "asc" ? 1 : -1;
        return 0;
    });

    res.json(workers);
});

app.get("/rewards", (req, res) => {
    res.json(mining.stats.balancesToUpdate);
});

app.get("/", (req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
});

app.listen(dashboard_port, "0.0.0.0").on("error", (err) => {
    log.warning(`Dashboard listener failed (${err})`);
});

log.info(`Dashboard listening on port ${dashboard_port}`);
