/**
 * JSON file persistence for events and participations (MVP).
 * - ensureDir, readJson, writeJsonAtomic
 * - Serialized writes via queue to avoid concurrent file writes
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(process.cwd(), process.env.SCHOOL_DATA_DIR || './data');
const EVENTS_FILE = (() => {
  const v = process.env.SCHOOL_EVENTS_FILE;
  if (!v) return path.join(DATA_DIR, 'events.json');
  return path.isAbsolute(v) ? v : path.join(DATA_DIR, v);
})();
const PARTICIPATIONS_FILE = (() => {
  const v = process.env.SCHOOL_PARTICIPATIONS_FILE;
  if (!v) return path.join(DATA_DIR, 'participations.json');
  return path.isAbsolute(v) ? v : path.join(DATA_DIR, v);
})();

function ensureDir(dir) {
  const d = path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  const p = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(p)) return fallback;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    return data;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  const p = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const dir = path.dirname(p);
  ensureDir(dir);
  const tmp = p + '.tmp.' + process.pid + '.' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

function createWriteQueue() {
  let tail = Promise.resolve();
  return function enqueue(fn) {
    const next = tail.then(fn).catch((err) => {
      if (process.env.NODE_ENV !== 'production') console.error('[storage] write error', err);
    });
    tail = next;
    return next;
  };
}

const writeQueue = createWriteQueue();

function loadEvents() {
  ensureDir(DATA_DIR);
  const list = readJson(EVENTS_FILE, []);
  return Array.isArray(list) ? list : [];
}

function saveEvents(events) {
  const list = Array.isArray(events) ? events : Array.from(events.values ? events.values() : []);
  return writeQueue(() => {
    writeJsonAtomic(EVENTS_FILE, list);
    if (process.env.NODE_ENV !== 'production') console.log('[storage] saved events');
  });
}

function loadParticipations() {
  ensureDir(DATA_DIR);
  const list = readJson(PARTICIPATIONS_FILE, []);
  return Array.isArray(list) ? list : [];
}

function saveParticipations(list) {
  const arr = Array.isArray(list) ? list : [];
  return writeQueue(() => {
    writeJsonAtomic(PARTICIPATIONS_FILE, arr);
    if (process.env.NODE_ENV !== 'production') console.log('[storage] saved participations');
  });
}

module.exports = {
  ensureDir,
  readJson,
  writeJsonAtomic,
  loadEvents,
  saveEvents,
  loadParticipations,
  saveParticipations,
  DATA_DIR,
  EVENTS_FILE,
  PARTICIPATIONS_FILE,
};
