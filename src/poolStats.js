/* Live pool statistics shared between sync, index, and dashboard */

const fs = require("fs");
const path = require("path");
const log = require("./logging");

const DEFAULT_MAX_POINTS = 480;
const DEFAULT_MAX_AGE_HOURS = 24;

const poolStats = {
    connections: 0,
    cpu: 0,
    ram: 0,
    syncCount: 0,
    startedAt: null,
    lastSyncAt: null,
    history: [],
    historyMaxPoints: DEFAULT_MAX_POINTS,
    historyMaxAgeHours: DEFAULT_MAX_AGE_HOURS,
};

let historyFilePath = null;

const isValidPoint = (p) =>
    p &&
    typeof p.t === "number" &&
    typeof p.connections === "number" &&
    typeof p.hashrate === "number" &&
    typeof p.workers === "number";

const trimHistory = () => {
    const maxAgeMs = poolStats.historyMaxAgeHours * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAgeMs;
    poolStats.history = poolStats.history.filter((p) => p.t >= cutoff);
    while (poolStats.history.length > poolStats.historyMaxPoints) {
        poolStats.history.shift();
    }
};

const saveHistory = () => {
    if (!historyFilePath) return;
    try {
        fs.writeFileSync(
            historyFilePath,
            JSON.stringify(poolStats.history),
            "utf8"
        );
    } catch (err) {
        log.warning(`Failed to save history: ${err}`);
    }
};

const loadHistory = () => {
    if (!historyFilePath || !fs.existsSync(historyFilePath)) return;
    try {
        const raw = JSON.parse(fs.readFileSync(historyFilePath, "utf8"));
        if (!Array.isArray(raw)) throw new Error("not an array");
        poolStats.history = raw.filter(isValidPoint);
        trimHistory();
        log.info(`Loaded ${poolStats.history.length} history points`);
    } catch (err) {
        log.warning(`Failed to load history: ${err}`);
        poolStats.history = [];
    }
};

const initHistory = (folder, poolName, maxPoints, maxAgeHours) => {
    poolStats.historyMaxPoints = maxPoints || DEFAULT_MAX_POINTS;
    poolStats.historyMaxAgeHours = maxAgeHours || DEFAULT_MAX_AGE_HOURS;
    historyFilePath = path.join(folder, `history_${poolName}.json`);
    loadHistory();
};

const pushHistory = (sample) => {
    if (!isValidPoint(sample)) return;
    poolStats.history.push(sample);
    trimHistory();
    saveHistory();
};

const getHistoryMeta = () => {
    const points = poolStats.history.length;
    if (points === 0) {
        return { oldest: null, newest: null, points: 0, spanHours: 0 };
    }
    const oldest = poolStats.history[0].t;
    const newest = poolStats.history[points - 1].t;
    const spanHours = (newest - oldest) / (1000 * 60 * 60);
    return { oldest, newest, points, spanHours };
};

module.exports = poolStats;
module.exports.initHistory = initHistory;
module.exports.pushHistory = pushHistory;
module.exports.getHistoryMeta = getHistoryMeta;
module.exports.DEFAULT_MAX_POINTS = DEFAULT_MAX_POINTS;
module.exports.DEFAULT_MAX_AGE_HOURS = DEFAULT_MAX_AGE_HOURS;
