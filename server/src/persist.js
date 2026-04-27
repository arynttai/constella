const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStore() {
  try {
    ensureDir();
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveStore(payload) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), "utf8");
}

module.exports = { loadStore, saveStore, DATA_FILE };

