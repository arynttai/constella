function createStore() {
  let dataset = { participants: [], edges: [] };
  let matchingConfig = {
    teamSize: 5,
    strategy: "experimental",
    tuning: {
      stability: 0.5, // 0..1
      novelty: 0.7, // 0..1
      balance: 0.6, // 0..1
      bridges: null, // override bridges count (1..2), null=по стратегии
    },
  };
  let lastResult = null;
  let constraints = {
    avoidPairs: [], // [{a,b}]
    excludeIds: [], // [id]
  };

  return {
    getDataset() {
      return dataset;
    },
    setDataset(next) {
      dataset = next;
    },
    getMatchingConfig() {
      return matchingConfig;
    },
    setMatchingConfig(next) {
      matchingConfig = { ...matchingConfig, ...next };
    },
    getLastResult() {
      return lastResult;
    },
    setLastResult(next) {
      lastResult = next;
    },
    getConstraints() {
      return constraints;
    },
    setConstraints(next) {
      constraints = { ...constraints, ...next };
    },
  };
}

module.exports = { createStore };

