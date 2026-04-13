import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.avi', '.mov', '.webm', '.m4v']);

const DEFAULT_CACHE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
const DEFAULT_MAX_CACHE_TORRENTS = 25;
const DEFAULT_CACHE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_IDLE_TIMEOUT_MS = 60 * 60 * 1000;

const METADATA_TIMEOUT_MS = 120000;
const DHT_WARMUP_MS = 8000;
const TORRENT_CONNECTIONS = 100;
const TORRENT_PORT = Number.isFinite(Number(process.env.ANIMEO_TORRENT_PORT))
    ? Number(process.env.ANIMEO_TORRENT_PORT)
    : 6881;

const WARM_LEADING_BYTES = 5 * 1024 * 1024;
const WARM_TRAILING_BYTES = 5 * 1024 * 1024;
const KEEP_HEAD_BYTES = 100 * 1024 * 1024;
const SEEK_BEHIND_BYTES = 8 * 1024 * 1024;
const SEEK_AHEAD_BYTES = 60 * 1024 * 1024;

const FALLBACK_TRACKERS = [
    'wss://tracker.btorrent.xyz',
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.webtorrent.dev',
    'https://tracker.opentrackr.org:443/announce',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://tracker.openbittorrent.com:6969/announce',
];

function sanitizeFileNameSegment(input) {
    return String(input || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function rmrf(targetPath) {
    try { fs.rmSync(targetPath, { recursive: true, force: true }); } catch { /* best-effort */ }
}

function dirSizeBytes(root) {
    if (!fs.existsSync(root)) return 0;
    const stack = [root];
    let total = 0;
    while (stack.length) {
        const current = stack.pop();
        const stat = fs.statSync(current);
        if (stat.isDirectory()) {
            for (const child of fs.readdirSync(current)) stack.push(path.join(current, child));
        } else {
            total += stat.size;
        }
    }
    return total;
}

function parseMagnetHash(magnetUri = '') {
    const match = String(magnetUri).match(/btih:([a-z0-9]+)/i);
    return match?.[1]?.toUpperCase() || null;
}

function normalizeName(value = '') {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickPlayableFile(files, preferredIndex, preferredFileName) {
    if (!Array.isArray(files) || files.length === 0) return null;

    const normalizedPreferred = normalizeName(preferredFileName);
    if (normalizedPreferred) {
        const byName = files.find((file) => {
            const ext = path.extname(file?.name || '').toLowerCase();
            if (!VIDEO_EXTENSIONS.has(ext)) return false;
            return normalizeName(file?.name).includes(normalizedPreferred);
        });
        if (byName) return byName;
    }

    if (Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < files.length) {
        const target = files[preferredIndex];
        const ext = path.extname(target.name || '').toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) return target;
    }

    const videoFiles = files.filter((file) => VIDEO_EXTENSIONS.has(path.extname(file.name || '').toLowerCase()));
    if (!videoFiles.length) return null;
    return videoFiles.sort((a, b) => (b.length || 0) - (a.length || 0))[0];
}

function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function ensureMagnetTrackers(magnetUri, extraTrackers = []) {
    const uri = String(magnetUri || '').trim();
    if (!uri.toLowerCase().startsWith('magnet:?')) return uri;

    let parsed;
    try { parsed = new URL(uri); } catch { return uri; }

    const currentTrackers = new Set(
        parsed.searchParams.getAll('tr').map((t) => String(t || '').trim()).filter(Boolean)
    );
    const enrichedTrackers = [...extraTrackers, ...FALLBACK_TRACKERS]
        .map((t) => String(t || '').trim()).filter(Boolean);

    for (const tracker of enrichedTrackers) {
        if (!currentTrackers.has(tracker)) {
            parsed.searchParams.append('tr', tracker);
            currentTrackers.add(tracker);
        }
    }
    return parsed.toString();
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileSelect(file, start, end, priority = 0) {
    try { file.select(start, end, priority); } catch { /* ignore */ }
}

function fileDeselect(file, start, end) {
    try { file.deselect(start, end, true); } catch { /* ignore */ }
}

export class TorrentStreamService {
    constructor(options = {}) {
        this.cacheRoot = options.cacheRoot;
        this.maxCacheBytes = Number.isFinite(Number(options.maxCacheBytes))
            ? Number(options.maxCacheBytes)
            : DEFAULT_CACHE_LIMIT_BYTES;
        this.maxCacheTorrents = Number.isFinite(Number(options.maxCacheTorrents))
            ? Number(options.maxCacheTorrents)
            : DEFAULT_MAX_CACHE_TORRENTS;
        this.cacheMaxAgeMs = Number.isFinite(Number(options.cacheMaxAgeMs))
            ? Number(options.cacheMaxAgeMs)
            : DEFAULT_CACHE_MAX_AGE_MS;
        this.idleTimeoutMs = Number.isFinite(Number(options.idleTimeoutMs))
            ? Number(options.idleTimeoutMs)
            : DEFAULT_IDLE_TIMEOUT_MS;

        this.port = Number.isFinite(Number(options.port)) ? Number(options.port) : 0;

        fs.mkdirSync(this.cacheRoot, { recursive: true });

        this.sessions = new Map();
        this.torrentPool = new Map(); // infoHash -> { torrent, lastAccess }

        this.server = null;
        this.serverPort = null;

        this.cacheIndexPath = path.join(this.cacheRoot, 'index.json');
        this.cacheIndex = this._loadCacheIndex();

        this.WebTorrent = require('webtorrent');
        this.client = new this.WebTorrent({
            dht: true,
            tracker: true,
            utp: false,
            maxConns: TORRENT_CONNECTIONS,
            torrentPort: TORRENT_PORT,
            dhtPort: TORRENT_PORT + 1,
        });

        const ffprobeStatic = require('ffprobe-static');
        this.ffprobePath = ffprobeStatic?.path || null;

        this._idleSweepTimer = setInterval(() => {
            this._cleanupIdleTorrents().catch(() => { /* ignore */ });
        }, 5 * 60 * 1000);
    }

    _loadCacheIndex() {
        try {
            if (!fs.existsSync(this.cacheIndexPath)) return {};
            const parsed = JSON.parse(fs.readFileSync(this.cacheIndexPath, 'utf8'));
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    _saveCacheIndex() {
        try {
            fs.writeFileSync(this.cacheIndexPath, JSON.stringify(this.cacheIndex, null, 2), 'utf8');
        } catch {
            // best effort
        }
    }

    _touchCacheEntry(infoHash, explicitSize) {
        const key = String(infoHash || '').toUpperCase();
        if (!key) return;
        const torrentPath = path.join(this.cacheRoot, key);
        const size = Number.isFinite(Number(explicitSize)) ? Number(explicitSize) : dirSizeBytes(torrentPath);
        this.cacheIndex[key] = {
            lastAccess: Date.now(),
            size: Math.max(0, size),
        };
        this._saveCacheIndex();
    }

    _dropCacheEntry(infoHash) {
        const key = String(infoHash || '').toUpperCase();
        if (!key) return;
        delete this.cacheIndex[key];
        this._saveCacheIndex();
    }

    _activeInfoHashes() {
        const set = new Set();
        for (const session of this.sessions.values()) {
            if (session?.infoHash) set.add(String(session.infoHash).toUpperCase());
        }
        return set;
    }

    async _removeTorrentCache(infoHash) {
        const key = String(infoHash || '').toUpperCase();
        if (!key) return;

        const active = this._activeInfoHashes();
        if (active.has(key)) return;

        const pooled = this.torrentPool.get(key);
        if (pooled?.torrent) {
            await new Promise((resolve) => {
                try {
                    this.client.remove(pooled.torrent, { destroyStore: true }, () => resolve());
                } catch {
                    resolve();
                }
            });
            this.torrentPool.delete(key);
        }

        rmrf(path.join(this.cacheRoot, key));
        this._dropCacheEntry(key);
    }

    async _cleanupIdleTorrents() {
        const now = Date.now();
        const active = this._activeInfoHashes();

        for (const [infoHash, entry] of this.torrentPool.entries()) {
            if (active.has(infoHash)) continue;
            if (!entry?.lastAccess) continue;
            if (now - entry.lastAccess < this.idleTimeoutMs) continue;

            await new Promise((resolve) => {
                try {
                    this.client.remove(entry.torrent, { destroyStore: false }, () => resolve());
                } catch {
                    resolve();
                }
            });
            this.torrentPool.delete(infoHash);
        }
    }

    async _enforceCacheLimits() {
        const active = this._activeInfoHashes();
        const now = Date.now();

        for (const infoHash of Object.keys(this.cacheIndex)) {
            const key = String(infoHash).toUpperCase();
            const torrentPath = path.join(this.cacheRoot, key);
            if (!fs.existsSync(torrentPath)) {
                delete this.cacheIndex[key];
                continue;
            }

            const entry = this.cacheIndex[key] || {};
            entry.size = dirSizeBytes(torrentPath);
            entry.lastAccess = Number.isFinite(Number(entry.lastAccess)) ? Number(entry.lastAccess) : now;
            this.cacheIndex[key] = entry;
        }

        const keys = Object.keys(this.cacheIndex)
            .map((k) => String(k).toUpperCase())
            .sort((a, b) => (this.cacheIndex[a].lastAccess || 0) - (this.cacheIndex[b].lastAccess || 0));

        for (const key of keys) {
            if (active.has(key)) continue;
            const ageMs = now - (this.cacheIndex[key]?.lastAccess || 0);
            if (ageMs > this.cacheMaxAgeMs) {
                await this._removeTorrentCache(key);
            }
        }

        let remaining = Object.keys(this.cacheIndex)
            .map((k) => String(k).toUpperCase())
            .filter((k) => !active.has(k))
            .sort((a, b) => (this.cacheIndex[a].lastAccess || 0) - (this.cacheIndex[b].lastAccess || 0));

        while (remaining.length > this.maxCacheTorrents) {
            const oldest = remaining.shift();
            await this._removeTorrentCache(oldest);
            remaining = Object.keys(this.cacheIndex)
                .map((k) => String(k).toUpperCase())
                .filter((k) => !active.has(k))
                .sort((a, b) => (this.cacheIndex[a].lastAccess || 0) - (this.cacheIndex[b].lastAccess || 0));
        }

        let totalSize = Object.values(this.cacheIndex)
            .reduce((sum, entry) => sum + safeNumber(entry?.size), 0);

        remaining = Object.keys(this.cacheIndex)
            .map((k) => String(k).toUpperCase())
            .filter((k) => !active.has(k))
            .sort((a, b) => (this.cacheIndex[a].lastAccess || 0) - (this.cacheIndex[b].lastAccess || 0));

        while (totalSize > this.maxCacheBytes && remaining.length) {
            const oldest = remaining.shift();
            totalSize -= safeNumber(this.cacheIndex[oldest]?.size);
            await this._removeTorrentCache(oldest);
        }

        this._saveCacheIndex();
    }

    async ensureServer() {
        if (this.server && this.serverPort) return this.serverPort;

        this.server = http.createServer((req, res) => {
            const url = new URL(req.url || '/', 'http://127.0.0.1');

            if (url.pathname === '/health') {
                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                });
                res.end(JSON.stringify({ ok: true }));
                return;
            }

            const parts = url.pathname.split('/').filter(Boolean);
            const routeType = parts[0];

            if (routeType === 'raw' && parts.length === 2) {
                const sessionId = sanitizeFileNameSegment(parts[1]);
                const session = this.sessions.get(sessionId);
                if (!session?.torrentFile) {
                    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
                    res.end('Raw file not available');
                    return;
                }

                const torrentFile = session.torrentFile;
                const totalSize = session.fileSize;
                const ext = path.extname(torrentFile.name || '').toLowerCase();
                const mimeMap = {
                    '.mkv': 'video/x-matroska',
                    '.mp4': 'video/mp4',
                    '.avi': 'video/x-msvideo',
                    '.mov': 'video/quicktime',
                    '.webm': 'video/webm',
                    '.m4v': 'video/mp4',
                };
                const contentType = mimeMap[ext] || 'application/octet-stream';

                const rangeHeader = req.headers['range'];
                if (rangeHeader) {
                    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
                    if (!match) {
                        res.writeHead(416, {
                            'Content-Range': `bytes */${totalSize}`,
                            'Access-Control-Allow-Origin': '*',
                        });
                        res.end();
                        return;
                    }

                    const start = parseInt(match[1], 10);
                    const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
                    if (start >= totalSize || end >= totalSize || start > end) {
                        res.writeHead(416, {
                            'Content-Range': `bytes */${totalSize}`,
                            'Access-Control-Allow-Origin': '*',
                        });
                        res.end();
                        return;
                    }

                    this._prioritizeWindow(session, start, end);

                    const chunkSize = end - start + 1;
                    res.writeHead(206, {
                        'Content-Type': contentType,
                        'Content-Length': chunkSize,
                        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                        'Accept-Ranges': 'bytes',
                        'Access-Control-Allow-Origin': '*',
                    });

                    const stream = torrentFile.createReadStream({ start, end });
                    stream.on('error', () => {
                        if (!res.headersSent) res.writeHead(500);
                        res.end();
                    });
                    stream.pipe(res);
                } else {
                    const start = session.lastReadOffset || 0;
                    const end = Math.min(totalSize - 1, start + SEEK_AHEAD_BYTES);
                    this._prioritizeWindow(session, start, end);

                    res.writeHead(200, {
                        'Content-Type': contentType,
                        'Content-Length': totalSize,
                        'Accept-Ranges': 'bytes',
                        'Access-Control-Allow-Origin': '*',
                    });
                    const stream = torrentFile.createReadStream();
                    stream.on('error', () => res.end());
                    stream.pipe(res);
                }
                return;
            }

            if (routeType === 'seek' && parts.length === 2 && req.method === 'POST') {
                const sessionId = sanitizeFileNameSegment(parts[1]);
                const targetSeconds = parseFloat(url.searchParams.get('t') || '0');
                this.seekSession(sessionId, targetSeconds)
                    .then((result) => {
                        res.writeHead(200, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*',
                        });
                        res.end(JSON.stringify(result));
                    })
                    .catch((err) => {
                        res.writeHead(500, { 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ error: err.message }));
                    });
                return;
            }


            res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
            res.end('Not found');
        });

        await new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(this.port, '127.0.0.1', () => {
                this.serverPort = this.server.address()?.port;
                resolve();
            });
        });

        return this.serverPort;
    }

    async probeDuration(rawUrl) {
        if (!this.ffprobePath) return null;
        return new Promise((resolve) => {
            const args = [
                '-v', 'error',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                '-analyzeduration', '100M',
                '-probesize', '100M',
                '-rw_timeout', '15000000',
                '-seekable', '1',
                rawUrl,
            ];
            const proc = spawn(this.ffprobePath, args, {
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'ignore'],
            });

            let output = '';
            proc.stdout.on('data', (chunk) => { output += chunk.toString(); });

            const timeoutId = setTimeout(() => {
                try { proc.kill(); } catch { /* ignore */ }
                resolve(null);
            }, 60000);

            proc.on('close', () => {
                clearTimeout(timeoutId);
                try {
                    const json = JSON.parse(output);
                    const dur = parseFloat(json?.format?.duration);
                    resolve(Number.isFinite(dur) && dur > 0 ? dur : null);
                } catch {
                    resolve(null);
                }
            });

            proc.on('error', () => {
                clearTimeout(timeoutId);
                resolve(null);
            });
        });
    }

    async probeFromTorrentFile(file) {
        return new Promise((resolve) => {
            if (!this.ffprobePath) return resolve(null);

            const proc = spawn(this.ffprobePath, [
                '-v', 'error',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                '-'
            ], {
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'ignore'],
            });

            const maxBytes = Math.min(Math.max(0, Number(file.length) || 0), 50 * 1024 * 1024);
            const stream = file.createReadStream({ start: 0, end: Math.max(0, maxBytes - 1) });

            let output = '';
            let settled = false;

            const tidy = (result) => {
                if (settled) return;
                settled = true;
                try { stream.unpipe(proc.stdin); } catch { /* ignore */ }
                try { proc.stdin.end(); } catch { /* ignore */ }
                try { stream.destroy(); } catch { /* ignore */ }
                resolve(result);
            };

            const timeout = setTimeout(() => {
                try { proc.kill(); } catch { /* ignore */ }
                tidy(null);
            }, 30000);

            proc.stdout.on('data', (d) => { output += d.toString(); });

            proc.on('error', (err) => {
                clearTimeout(timeout);
                tidy(null);
            });

            proc.on('close', () => {
                clearTimeout(timeout);
                try {
                    const json = JSON.parse(output || '{}');
                    tidy(Object.keys(json).length ? json : null);
                } catch {
                    tidy(null);
                }
            });

            // Protect against write errors when ffprobe exits early
            proc.stdin.on('error', () => { /* ignore write errors */ });

            stream.on('error', () => {
                clearTimeout(timeout);
                tidy(null);
            });

            stream.on('end', () => {
                try { proc.stdin.end(); } catch { /* ignore */ }
            });

            // Start piping; pipe errors on stream will be handled above
            try {
                stream.pipe(proc.stdin);
            } catch (e) {
                clearTimeout(timeout);
                tidy(null);
            }
        });
    }

    getStreamingUrl(sessionId) {
        if (!this.serverPort) return null;
        return `http://127.0.0.1:${this.serverPort}/raw/${sessionId}`;
    }

    logSession(session, message, level = 'log') {
        const prefix = `[stream:${session?.id || 'unknown'}]`;
        (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(`${prefix} ${message}`);
    }

    _prioritizeWindow(session, startByte, endByte) {
        const file = session?.torrentFile;
        if (!file || typeof file.select !== 'function' || !session.fileSize) return;

        const boundedStart = Math.max(0, Math.floor(startByte));
        const boundedEnd = Math.min(session.fileSize - 1, Math.floor(endByte));

        const dynamicStart = Math.max(0, boundedStart - SEEK_BEHIND_BYTES);
        const dynamicEnd = Math.min(session.fileSize - 1, boundedEnd + SEEK_AHEAD_BYTES);

        fileSelect(file, 0, Math.min(session.fileSize - 1, KEEP_HEAD_BYTES - 1), 1);

        if (session.dynamicWindow) {
            fileDeselect(file, session.dynamicWindow.start, session.dynamicWindow.end);
        }

        fileSelect(file, dynamicStart, dynamicEnd, 10);
        session.dynamicWindow = { start: dynamicStart, end: dynamicEnd };
        session.lastReadOffset = boundedStart;

        if (session.infoHash) {
            const poolEntry = this.torrentPool.get(session.infoHash);
            if (poolEntry) poolEntry.lastAccess = Date.now();
            this._touchCacheEntry(session.infoHash);
        }
    }

    async _warmLeadingPieces(session, warmBytes = WARM_LEADING_BYTES) {
        const file = session.torrentFile;
        if (!file || typeof file.createReadStream !== 'function' || !session.fileSize) return;

        const end = Math.min(warmBytes - 1, session.fileSize - 1);
        this._prioritizeWindow(session, 0, end);

        this.logSession(session, `Warming first ${Math.round(warmBytes / 1024 / 1024)}MB of torrent pieces (bytes 0-${end})...`);

        return new Promise((resolve) => {
            const stream = file.createReadStream({ start: 0, end });
            const timeout = setTimeout(() => {
                this.logSession(session, 'Piece warm-up timed out, proceeding', 'warn');
                stream.destroy();
                resolve();
            }, 20000);

            let received = 0;
            stream.on('data', (chunk) => { received += chunk.length; });
            stream.on('end', () => {
                clearTimeout(timeout);
                this.logSession(session, `Piece warm-up complete (${Math.round(received / 1024)}KB received)`);
                resolve();
            });
            stream.on('error', (err) => {
                clearTimeout(timeout);
                this.logSession(session, `Piece warm-up error: ${err.message}`, 'warn');
                resolve();
            });
        });
    }

    async _warmTrailingPieces(session, warmBytes = WARM_TRAILING_BYTES) {
        const file = session.torrentFile;
        if (!file || !session.fileSize) return;

        const start = Math.max(0, session.fileSize - warmBytes);
        const end = session.fileSize - 1;

        this._prioritizeWindow(session, start, end);

        this.logSession(session, `Warming trailing bytes ${Math.round(warmBytes / 1024 / 1024)}MB...`);

        return new Promise((resolve) => {
            const stream = file.createReadStream({ start, end });

            const timeout = setTimeout(() => {
                stream.destroy();
                resolve();
            }, 15000);

            stream.on('end', () => {
                clearTimeout(timeout);
                resolve();
            });

            stream.on('error', () => {
                clearTimeout(timeout);
                resolve();
            });
        })
    }

    async _getOrCreateTorrent(cleanMagnet, infoHashHint, trackers, sourceTitle) {
        const key = String(infoHashHint || '').toUpperCase();

        if (key) {
            const pooled = this.torrentPool.get(key);
            if (pooled?.torrent) {
                pooled.lastAccess = Date.now();
                return pooled.torrent;
            }

            const existing = this.client.get(key);
            if (existing) {
                this.torrentPool.set(key, { torrent: existing, lastAccess: Date.now() });
                return existing;
            }
        }

        const announce = Array.from(new Set([...(Array.isArray(trackers) ? trackers : []), ...FALLBACK_TRACKERS]));
        const torrentPath = path.join(this.cacheRoot, key || `pending_${Date.now()}`);
        fs.mkdirSync(torrentPath, { recursive: true });

        const torrent = this.client.add(cleanMagnet, {
            path: torrentPath,
            announce,
        });

        const waitForReady = new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => reject(new Error('Timed out waiting for torrent metadata')), METADATA_TIMEOUT_MS);
            const onReady = () => {
                clearTimeout(timeoutId);
                torrent.removeListener('error', onError);
                resolve();
            };
            const onError = (err) => {
                clearTimeout(timeoutId);
                torrent.removeListener('ready', onReady);
                reject(err);
            };
            torrent.once('ready', onReady);
            torrent.once('error', onError);
        });

        await waitForReady;

        const infoHash = String(torrent.infoHash || key || '').toUpperCase();
        const finalPath = path.join(this.cacheRoot, infoHash);
        if (!fs.existsSync(finalPath)) {
            fs.mkdirSync(finalPath, { recursive: true });
        }

        this.torrentPool.set(infoHash, {
            torrent,
            lastAccess: Date.now(),
        });

        this._touchCacheEntry(infoHash);
        this.logSession({ id: infoHash }, `Torrent cache key ready for source "${sourceTitle}"`);

        return torrent;
    }

    async startSession({ magnetUri, preferredFileIndex = null, preferredFileName = null, trackers = [], sourceTitle = 'Unknown Source' }) {
        const cleanMagnet = ensureMagnetTrackers(magnetUri, trackers);
        if (!String(cleanMagnet || '').toLowerCase().startsWith('magnet:?')) {
            throw new Error('Invalid magnet URI');
        }

        await this.ensureServer();

        const sessionId = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
        const session = {
            id: sessionId,
            status: 'initializing',
            startedAt: Date.now(),
            sourceTitle,
            torrent: null,
            torrentFile: null,
            fileSize: 0,
            fileName: null,
            durationSeconds: null,
            message: 'Waiting for torrent metadata',
            seenPeers: new Set(),
            peerLogLimitReached: false,
            dynamicWindow: null,
            lastReadOffset: 0,
            infoHash: parseMagnetHash(cleanMagnet),
            wireListener: null,
        };

        this.sessions.set(sessionId, session);
        this.logSession(session, `Starting session for source "${sourceTitle}"`);
        this.logSession(session, `Magnet hash: ${session.infoHash || 'unknown'}`);

        const torrent = await this._getOrCreateTorrent(cleanMagnet, session.infoHash, trackers, sourceTitle);
        session.torrent = torrent;
        session.infoHash = String(torrent.infoHash || session.infoHash || '').toUpperCase();

        session.wireListener = (wire) => {
            const peer = wire?.remoteAddress || wire?.peerAddress || 'unknown-peer';
            if (session.seenPeers.has(peer)) return;
            session.seenPeers.add(peer);

            const maxPeerLogs = 30;
            if (session.seenPeers.size <= maxPeerLogs) {
                this.logSession(session, `New peer connected: ${peer}`);
            } else if (!session.peerLogLimitReached) {
                session.peerLogLimitReached = true;
                this.logSession(session, `Peer log limit reached (${maxPeerLogs}). Further logs suppressed.`);
            }
        };
        torrent.on('wire', session.wireListener);

        if (safeNumber(torrent?.numPeers) === 0) {
            this.logSession(session, 'No peers yet, waiting for DHT bootstrap...');
            await wait(DHT_WARMUP_MS);
            this.logSession(session, `Peers after warm-up: ${safeNumber(torrent?.numPeers)}`);
        }

        session.status = 'buffering';

        const playableFile = pickPlayableFile(torrent.files, preferredFileIndex, preferredFileName);
        if (!playableFile) {
            await this.stopSession(sessionId);
            throw new Error('No playable video file found in torrent');
        }

        session.torrentFile = playableFile;
        session.fileSize = safeNumber(playableFile.length, 0);
        session.fileName = playableFile.name;
        session.message = 'Preparing stream';
        this.logSession(session, `Selected file: ${playableFile.name} (${session.fileSize} bytes)`);

        await this._warmLeadingPieces(session);

        const rawUrl = this.getStreamingUrl(sessionId);
        let probedDuration = null;

        if (this.ffprobePath) {
            this.logSession(session, 'Probing duration from torrent file via ffprobe stdin...');
            try {
                const json = await this.probeFromTorrentFile(playableFile);
                const dur = parseFloat(json?.format?.duration);
                if (Number.isFinite(dur) && dur > 0) probedDuration = dur;
            } catch (e) {
                this.logSession(session, `probeFromTorrentFile error: ${e?.message || String(e)}`, 'warn');
            }
        }

        if (!probedDuration) {
            this.logSession(session, 'Probing duration via streaming URL as fallback...');
            try {
                const d = await this.probeDuration(rawUrl);
                if (d) probedDuration = d;
            } catch (e) {
                this.logSession(session, `probeDuration error: ${e?.message || String(e)}`, 'warn');
            }
        }

        if (probedDuration) {
            session.durationSeconds = probedDuration;
            this.logSession(session, `Duration: ${probedDuration.toFixed(2)}s`);
        } else {
            this.logSession(session, 'Could not determine duration', 'warn');
        }

        this._touchCacheEntry(session.infoHash, session.fileSize);

        session.status = 'ready';
        session.message = 'Raw stream ready';
        this.logSession(session, 'Stream ready');

        await this._enforceCacheLimits();

        return {
            sessionId,
            infoHash: session.infoHash,
            streamingUrl: rawUrl,
            status: session.status,
            fileName: playableFile.name,
            durationSeconds: session.durationSeconds,
        };
    }

    getSessionStatus(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error('Stream session not found');

        const torrent = session.torrent;
        const peers = safeNumber(torrent?.numPeers);
        const downloadSpeed = safeNumber(torrent?.downloadSpeed);
        const uploadSpeed = safeNumber(torrent?.uploadSpeed);
        const progressPercent = safeNumber(torrent?.downloaded) > 0 && safeNumber(session.fileSize) > 0
            ? (safeNumber(torrent?.downloaded) / safeNumber(session.fileSize)) * 100
            : 0;

        if (session.infoHash) this._touchCacheEntry(session.infoHash, session.fileSize);

        return {
            sessionId,
            status: session.status,
            streamingReady: Boolean(session.torrentFile),
            streamingUrl: this.getStreamingUrl(sessionId),
            durationSeconds: Number.isFinite(session.durationSeconds) ? session.durationSeconds : null,
            message: session.message || null,
            startedAt: session.startedAt,
            uptimeMs: Date.now() - session.startedAt,
            sourceTitle: session.sourceTitle,
            fileName: session.fileName,
            metrics: {
                peers: safeNumber(peers),
                progress: safeNumber(progressPercent),
                downloadSpeed: safeNumber(downloadSpeed),
                uploadSpeed: safeNumber(uploadSpeed),
            },
        };
    }

    async seekSession(sessionId, targetSeconds) {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error('Session not found');

        const safeTarget = Number.isFinite(Number(targetSeconds)) ? Math.max(0, Number(targetSeconds)) : 0;

        if (session.torrentFile && typeof session.torrentFile.select === 'function' && session.durationSeconds > 0) {
            const estimatedByteOffset = Math.floor((safeTarget / session.durationSeconds) * session.fileSize);
            const endOffset = Math.min(session.fileSize - 1, estimatedByteOffset + (2 * 1024 * 1024));
            this._prioritizeWindow(session, estimatedByteOffset, endOffset);
            this.logSession(session, `Seek prioritization: target=${safeTarget.toFixed(2)}s`);
            return {
                seeked: true,
                targetSeconds: safeTarget,
                byteOffset: estimatedByteOffset,
            };
        }

        return { seeked: false, targetSeconds: safeTarget, reason: 'duration_unavailable' };
    }

    async stopSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return { sessionId, stopped: false };

        session.status = 'stopped';

        if (session.torrent && session.wireListener) {
            try { session.torrent.removeListener('wire', session.wireListener); } catch { /* ignore */ }
        }

        if (session.torrentFile && session.dynamicWindow) {
            fileDeselect(session.torrentFile, session.dynamicWindow.start, session.dynamicWindow.end);
        }

        if (session.infoHash) {
            const poolEntry = this.torrentPool.get(session.infoHash);
            if (poolEntry) poolEntry.lastAccess = Date.now();
            this._touchCacheEntry(session.infoHash, session.fileSize);
        }

        this.sessions.delete(sessionId);
        await this._enforceCacheLimits();
        return { sessionId, stopped: true };
    }

    async dispose() {
        if (this._idleSweepTimer) {
            clearInterval(this._idleSweepTimer);
            this._idleSweepTimer = null;
        }

        for (const id of Array.from(this.sessions.keys())) {
            await this.stopSession(id);
        }

        for (const [infoHash, entry] of this.torrentPool.entries()) {
            await new Promise((resolve) => {
                try {
                    this.client.remove(entry.torrent, { destroyStore: false }, () => resolve());
                } catch {
                    resolve();
                }
            });
            this.torrentPool.delete(infoHash);
        }

        if (this.client) {
            await new Promise((resolve) => {
                try { this.client.destroy(() => resolve()); } catch { resolve(); }
            });
        }

        if (this.server) {
            await new Promise((resolve) => this.server.close(() => resolve()));
            this.server = null;
            this.serverPort = null;
        }
    }
}
