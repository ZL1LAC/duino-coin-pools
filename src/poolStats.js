/* Live pool statistics shared between sync, index, and dashboard */

const HISTORY_MAX = 60;

const poolStats = {
    connections: 0,
    cpu: 0,
    ram: 0,
    syncCount: 0,
    startedAt: null,
    lastSyncAt: null,
    history: [],
};

const pushHistory = (sample) => {
    poolStats.history.push(sample);
    if (poolStats.history.length > HISTORY_MAX) {
        poolStats.history.shift();
    }
};

module.exports = poolStats;
module.exports.pushHistory = pushHistory;
module.exports.HISTORY_MAX = HISTORY_MAX;
