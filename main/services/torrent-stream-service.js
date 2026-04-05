import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.avi', '.mov', '.webm', '.m4v']);
const DEFAULT_CACHE_LIMIT_BYTES = 8 * 1024 * 1024 * 1024;
const METADATA_TIMEOUT_MS = 120000;
const HLS_PLAYLIST_TIMEOUT_MS = 120000;
const FIRST_DATA_TIMEOUT_MS = 180000;
const DHT_WARMUP_MS = 8000;
const TORRENT_CONNECTIONS = 100;
const TORRENT_UPLOADS = 10;
const TORRENT_PORT = Number.isFinite(Number(process.env.ANIMEO_TORRENT_PORT))
    ? Number(process.env.ANIMEO_TORRENT_PORT)
    : 6881;
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
    try {
        fs.rmSync(targetPath, { recursive: true, force: true });
    } catch (err) {
        // Best effort cleanup only.
    }
}

function dirSizeBytes(root) {
    if (!fs.existsSync(root)) return 0;
    const stack = [root];
    let total = 0;
    while (stack.length) {
        const current = stack.pop();
        const stat = fs.statSync(current);
        if (stat.isDirectory()) {
            const children = fs.readdirSync(current);
            for (const child of children) {
                stack.push(path.join(current, child));
            }
        } else {
            total += stat.size;
        }
    }
    return total;
}

function listSessionDirs(cacheRoot) {
    if (!fs.existsSync(cacheRoot)) return [];
    return fs
        .readdirSync(cacheRoot)
        .map((name) => path.join(cacheRoot, name))
        .filter((sessionPath) => {
            try {
                return fs.statSync(sessionPath).isDirectory();
            } catch {
                return false;
            }
        })
        .sort((a, b) => {
            const aStat = fs.statSync(a);
            const bStat = fs.statSync(b);
            return aStat.mtimeMs - bStat.mtimeMs;
        });
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

function collectHlsArtifacts(outputDir) {
    const files = [];
    const stack = [outputDir];

    while (stack.length) {
        const current = stack.pop();
        if (!fs.existsSync(current)) continue;
        const stat = fs.statSync(current);
        if (stat.isDirectory()) {
            for (const child of fs.readdirSync(current)) {
                stack.push(path.join(current, child));
            }
            continue;
        }

        const rel = path.relative(outputDir, current).replace(/\\/g, '/');
        if (rel.endsWith('.m3u8') || rel.endsWith('.ts')) {
            files.push(rel);
        }
    }

    return files.sort();
}

function buildSyntheticMasterPlaylist(outputDir) {
    const variants = [
        { folder: 'v0', bandwidth: 5800000, resolution: '1920x1080' },
        { folder: 'v1080p', bandwidth: 5800000, resolution: '1920x1080' },
        { folder: 'v1', bandwidth: 3000000, resolution: '1280x720' },
        { folder: 'v720p', bandwidth: 3000000, resolution: '1280x720' },
        { folder: 'v2', bandwidth: 1400000, resolution: '854x480' },
        { folder: 'v480p', bandwidth: 1400000, resolution: '854x480' },
    ].filter((variant) => fs.existsSync(path.join(outputDir, variant.folder, 'index.m3u8')));

    if (!variants.length) return null;

    const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
    for (const variant of variants) {
        lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${variant.resolution}`);
        lines.push(`${variant.folder}/index.m3u8`);
    }

    const masterPath = path.join(outputDir, 'master.m3u8');
    fs.writeFileSync(masterPath, `${lines.join('\n')}\n`, 'utf8');
    return masterPath;
}

function playlistHasSegmentEntries(playlistPath) {
    try {
        const text = fs.readFileSync(playlistPath, 'utf8');
        return /\.(ts|m4s)(\?.*)?$/im.test(text);
    } catch {
        return false;
    }
}

async function waitForFirstDataChunk(stream, options = {}) {
    const {
        timeoutMs = FIRST_DATA_TIMEOUT_MS,
        onTick,
    } = options;

    return await new Promise((resolve, reject) => {
        let settled = false;

        const cleanup = () => {
            settled = true;
            clearTimeout(timeoutId);
            clearInterval(tickId);
            stream.removeListener('data', onData);
            stream.removeListener('error', onError);
            stream.removeListener('close', onClose);
            stream.removeListener('end', onEnd);
        };

        const onData = (chunk) => {
            if (settled) return;
            stream.pause();
            if (chunk && chunk.length) stream.unshift(chunk);
            cleanup();
            resolve(chunk);
        };

        const onError = (err) => {
            if (settled) return;
            cleanup();
            reject(err);
        };

        const onClose = () => {
            if (settled) return;
            cleanup();
            reject(new Error('Torrent file stream closed before delivering data'));
        };

        const onEnd = () => {
            if (settled) return;
            cleanup();
            reject(new Error('Torrent file stream ended before delivering data'));
        };

        const timeoutId = setTimeout(() => {
            if (settled) return;
            cleanup();
            reject(new Error('Timed out waiting for first torrent bytes'));
        }, timeoutMs);

        const tickId = typeof onTick === 'function'
            ? setInterval(() => {
                try { onTick(); } catch { /* ignore */ }
            }, 5000)
            : null;

        stream.once('error', onError);
        stream.once('close', onClose);
        stream.once('end', onEnd);
        stream.once('data', onData);

        stream.resume();
    });
}

function ensureMagnetTrackers(magnetUri, extraTrackers = []) {
    const uri = String(magnetUri || '').trim();
    if (!uri.toLowerCase().startsWith('magnet:?')) return uri;

    let parsed;
    try {
        parsed = new URL(uri);
    } catch {
        return uri;
    }

    const currentTrackers = new Set(parsed.searchParams.getAll('tr').map((t) => String(t || '').trim()).filter(Boolean));
    const enrichedTrackers = [
        ...extraTrackers,
        ...FALLBACK_TRACKERS,
    ].map((t) => String(t || '').trim()).filter(Boolean);

    for (const tracker of enrichedTrackers) {
        if (!currentTrackers.has(tracker)) {
            parsed.searchParams.append('tr', tracker);
            currentTrackers.add(tracker);
        }
    }

    if (currentTrackers.size === 0) {
        for (const tracker of FALLBACK_TRACKERS) {
            parsed.searchParams.append('tr', tracker);
        }
    }

    return parsed.toString();
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TorrentStreamService {
    constructor(options = {}) {
        this.cacheRoot = options.cacheRoot;
        this.maxCacheBytes = Number.isFinite(Number(options.maxCacheBytes))
            ? Number(options.maxCacheBytes)
            : DEFAULT_CACHE_LIMIT_BYTES;
        this.port = Number.isFinite(Number(options.port)) ? Number(options.port) : 0;

        fs.mkdirSync(this.cacheRoot, { recursive: true });

        this.sessions = new Map();
        this.server = null;
        this.serverPort = null;

        this.WebTorrent = require('webtorrent');
        this.ffmpegPath = require('ffmpeg-static');

        const ffprobeStatic = require('ffprobe-static');
        this.ffprobePath = ffprobeStatic?.path || null;

        this.ffmpeg = require('fluent-ffmpeg');
        if (this.ffmpegPath) this.ffmpeg.setFfmpegPath(this.ffmpegPath);
        if (this.ffprobePath) this.ffmpeg.setFfprobePath(this.ffprobePath);
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
            if (parts.length < 3 || parts[0] !== 'hls') {
                res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
                res.end('Not found');
                return;
            }

            const sessionId = sanitizeFileNameSegment(parts[1]);
            const session = this.sessions.get(sessionId);
            if (!session) {
                res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
                res.end('Session not found');
                return;
            }

            const relativePath = decodeURIComponent(parts.slice(2).join('/'));
            const normalizedRel = path.normalize(relativePath).replace(/^\.+[\\/]/, '');
            const absolutePath = path.resolve(session.outputDir, normalizedRel);
            const outputRoot = path.resolve(session.outputDir);

            if (!absolutePath.startsWith(outputRoot)) {
                res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
                res.end('Invalid path');
                return;
            }

            if (!fs.existsSync(absolutePath)) {
                res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
                res.end('Segment not ready');
                return;
            }

            const ext = path.extname(absolutePath).toLowerCase();
            const contentType =
                ext === '.m3u8'
                    ? 'application/vnd.apple.mpegurl'
                    : ext === '.ts'
                        ? 'video/mp2t'
                        : 'application/octet-stream';

            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=10',
                'Access-Control-Allow-Origin': '*',
            });
            fs.createReadStream(absolutePath).pipe(res);
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

    getSessionStatus(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error('Stream session not found');

        const torrent = session.torrent;
        const peers = safeNumber(torrent?.numPeers);
        const downloadSpeed = safeNumber(torrent?.downloadSpeed);
        const uploadSpeed = safeNumber(torrent?.uploadSpeed);
        const progressPercent = safeNumber(torrent?.downloaded) > 0 && safeNumber(torrent?.length) > 0
            ? (safeNumber(torrent?.downloaded) / safeNumber(torrent?.length)) * 100
            : 0;
        const now = Date.now();

        return {
            sessionId,
            status: session.status,
            playlistReady: this.resolveMasterPlaylistPath(session) !== null,
            masterPlaylistUrl: this.getMasterPlaylistUrl(sessionId),
            durationSeconds: Number.isFinite(session.durationSeconds) ? session.durationSeconds : null,
            message: session.message || null,
            startedAt: session.startedAt,
            uptimeMs: now - session.startedAt,
            sourceTitle: session.sourceTitle,
            fileName: session.fileName,
            metrics: {
                peers: safeNumber(peers),
                progress: safeNumber(progressPercent),
                downloadSpeed: safeNumber(downloadSpeed),
                uploadSpeed: safeNumber(uploadSpeed),
            },
            renditions: [
                { label: '1080p', bandwidth: 5800000, resolution: '1920x1080' },
                { label: '720p', bandwidth: 3000000, resolution: '1280x720' },
                { label: '480p', bandwidth: 1400000, resolution: '854x480' },
            ],
        };
    }

    resolveMasterPlaylistPath(session) {
        if (!session) return null;

        const preferredRelative = session.masterPlaylistRelative || 'master.m3u8';
        const preferredAbsolute = path.join(session.outputDir, preferredRelative);
        if (fs.existsSync(preferredAbsolute)) return preferredAbsolute;

        const candidates = [
            path.join(session.outputDir, 'master.m3u8'),
            path.join(session.outputDir, 'v0', 'master.m3u8'),
            path.join(session.outputDir, 'v1080p', 'master.m3u8'),
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) return candidate;
        }

        return null;
    }

    getMasterPlaylistUrl(sessionId) {
        if (!this.serverPort) return null;
        const session = this.sessions.get(sessionId);
        const relativePath = session?.masterPlaylistRelative || 'master.m3u8';
        return `http://127.0.0.1:${this.serverPort}/hls/${sessionId}/${relativePath}`;
    }

    logSession(session, message, level = 'log') {
        const prefix = `[stream:${session?.id || 'unknown'}]`;
        const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
        logger(`${prefix} ${message}`);
    }

    async startSession({ magnetUri, preferredFileIndex = null, preferredFileName = null, trackers = [], sourceTitle = 'Unknown Source' }) {
        const WebTorrent = this.WebTorrent;
        const cleanMagnet = ensureMagnetTrackers(magnetUri, trackers);
        if (!String(cleanMagnet || '').toLowerCase().startsWith('magnet:?')) {
            throw new Error('Invalid magnet URI');
        }

        const sessionId = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
        const sessionDir = path.join(this.cacheRoot, sanitizeFileNameSegment(sessionId));
        const outputDir = path.join(sessionDir, 'hls');
        fs.mkdirSync(outputDir, { recursive: true });

        await this.ensureServer();

        const session = {
            id: sessionId,
            status: 'initializing',
            startedAt: Date.now(),
            sourceTitle,
            outputDir,
            sessionDir,
            client: null,
            torrent: null,
            ffmpegProcess: null,
            fileName: null,
            masterPlaylistRelative: null,
            bytesFromTorrent: 0,
            durationSeconds: null,
            message: 'Waiting for torrent metadata',
            seenPeers: new Set(),
            peerLogLimitReached: false,
        };

        this.sessions.set(sessionId, session);
        this.logSession(session, `Starting session for source "${sourceTitle}"`);
        this.logSession(session, `Magnet hash: ${parseMagnetHash(cleanMagnet) || 'unknown'} | trackers: ${new URL(cleanMagnet).searchParams.getAll('tr').length}`);

        const createClient = (profile = 'hybrid') => {
            const useTrackerOnlyTcp = profile === 'tracker-tcp';
            return new WebTorrent({
                dht: !useTrackerOnlyTcp,
                tracker: true,
                utp: false,
                maxConns: TORRENT_CONNECTIONS,
                torrentPort: TORRENT_PORT,
                dhtPort: TORRENT_PORT + 1,
            });
        };

        const attachTorrentDiagnostics = (torrentRef) => {
            if (!torrentRef || torrentRef.__animeoDiagnosticsAttached) return;
            torrentRef.__animeoDiagnosticsAttached = true;

            torrentRef.on('wire', (wire) => {
                const peer = wire?.remoteAddress || wire?.peerAddress || 'unknown-peer';
                if (session.seenPeers.has(peer)) return;
                session.seenPeers.add(peer);

                const maxPeerLogs = 30;
                if (session.seenPeers.size <= maxPeerLogs) {
                    this.logSession(session, `New peer connected: ${peer}`);
                    return;
                }

                if (!session.peerLogLimitReached) {
                    session.peerLogLimitReached = true;
                    this.logSession(session, `Peer log limit reached (${maxPeerLogs}). Further peer logs are suppressed.`);
                }
            });
        };

        const waitForTorrentReady = async (torrent) => {
            return await new Promise((resolve, reject) => {
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
        };

        let torrent = null;
        let client = null;
        let lastEngineError = null;
        const networkProfiles = ['hybrid', 'tracker-tcp'];

        for (let attempt = 1; attempt <= networkProfiles.length; attempt++) {
            const profile = networkProfiles[attempt - 1];
            client = createClient(profile);
            const announce = Array.from(new Set([...trackers, ...FALLBACK_TRACKERS]));
            torrent = client.add(cleanMagnet, {
                path: sessionDir,
                announce,
            });
            session.client = client;
            session.torrent = torrent;
            attachTorrentDiagnostics(torrent);
            try {
                session.message = attempt === 1
                    ? 'Discovering torrent metadata'
                    : 'Retrying torrent metadata discovery';
                this.logSession(session, `${session.message} (attempt ${attempt}/${networkProfiles.length}, profile=${profile})`);
                await waitForTorrentReady(torrent);
                lastEngineError = null;
                this.logSession(session, `Metadata ready. Files discovered: ${Array.isArray(torrent.files) ? torrent.files.length : 0}`);

                const initialPeers = safeNumber(torrent?.numPeers);
                if (initialPeers === 0) {
                    this.logSession(session, 'No peers yet, waiting for DHT bootstrap...');
                    await wait(DHT_WARMUP_MS);
                    const peersAfterWarmup = safeNumber(torrent?.numPeers);
                    this.logSession(session, `Peers after warm-up: ${peersAfterWarmup}`);

                    if (peersAfterWarmup === 0 && attempt < networkProfiles.length) {
                        this.logSession(session, `No peers on profile=${profile}, switching to next network profile`, 'warn');
                        await new Promise((resolve) => client.destroy(() => resolve()));
                        session.client = null;
                        session.torrent = null;
                        continue;
                    }
                }
                break;
            } catch (err) {
                lastEngineError = err;
                this.logSession(session, `Metadata attempt ${attempt} failed: ${err?.message || err}`, 'warn');
                await new Promise((resolve) => client.destroy(() => resolve()));
                session.client = null;
                session.torrent = null;
            }
        }

        if (lastEngineError) {
            throw lastEngineError;
        }

        session.status = 'buffering';

        const playableFile = pickPlayableFile(torrent.files, preferredFileIndex, preferredFileName);
        if (!playableFile) {
            await this.stopSession(sessionId);
            throw new Error('No playable video file found in torrent');
        }

        if (typeof playableFile.select === 'function') {
            playableFile.select();
        }

        session.fileName = playableFile.name;
        session.message = 'Preparing adaptive stream';
        this.logSession(session, `Selected file: ${playableFile.name} (index hint: ${preferredFileIndex ?? 'none'}, name hint: ${preferredFileName || 'none'})`);
        this.logSession(session, 'Transcode profile: libx264 high, pix_fmt yuv420p, ABR ladder 1080/720/480');

        const input = playableFile.createReadStream({ start: 0, highWaterMark: 1024 * 1024 });

        this.logSession(session, 'Waiting for first torrent bytes before starting transcoder');
        try {
            const firstChunk = await waitForFirstDataChunk(input, {
                timeoutMs: FIRST_DATA_TIMEOUT_MS,
                onTick: () => {
                    const peers = safeNumber(session.torrent?.numPeers);
                    const downloadSpeed = safeNumber(session.torrent?.downloadSpeed);
                    this.logSession(session, `Waiting for data... peers=${peers}, dl=${Math.round((safeNumber(downloadSpeed) * 8) / 1000)} kbps`);
                },
            });
            this.logSession(session, `First torrent bytes ready (${firstChunk?.length || 0} bytes)`);
        } catch (err) {
            session.status = 'error';
            session.message = err?.message || 'No torrent data available';
            throw new Error(`${session.message}. Peers: ${safeNumber(session.torrent?.numPeers)}. Tip: set ANIMEO_TORRENT_PORT to an allowed outbound port if your network is restricted.`);
        }

        const ffmpegArgs = [
            '-hide_banner',
            '-loglevel',
            'warning',
            '-analyzeduration',
            '200M',
            '-probesize',
            '200M',
            '-fflags',
            '+genpts+discardcorrupt',
            '-i',
            'pipe:0',
            '-filter_complex',
            '[0:v]split=3[v0][v1][v2];' +
            '[v0]scale=1920:1080:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v0o];' +
            '[v1]scale=1280:720:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v1o];' +
            '[v2]scale=854:480:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v2o]',
            '-map',
            '[v0o]',
            '-map',
            '0:a:0?',
            '-map',
            '[v1o]',
            '-map',
            '0:a:0?',
            '-map',
            '[v2o]',
            '-map',
            '0:a:0?',
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-profile:v',
            'high',
            '-pix_fmt',
            'yuv420p',
            '-crf',
            '21',
            '-g',
            '48',
            '-keyint_min',
            '48',
            '-sc_threshold',
            '0',
            '-c:a',
            'aac',
            '-ac',
            '2',
            '-ar',
            '48000',
            '-b:a:0',
            '160k',
            '-b:a:1',
            '128k',
            '-b:a:2',
            '96k',
            '-maxrate:v:0',
            '6200k',
            '-bufsize:v:0',
            '9300k',
            '-b:v:0',
            '5600k',
            '-maxrate:v:1',
            '3200k',
            '-bufsize:v:1',
            '4800k',
            '-b:v:1',
            '2800k',
            '-maxrate:v:2',
            '1600k',
            '-bufsize:v:2',
            '2400k',
            '-b:v:2',
            '1300k',
            '-f',
            'hls',
            '-hls_time',
            '4',
            '-hls_list_size',
            '12',
            '-hls_flags',
            'independent_segments+append_list+temp_file',
            '-hls_segment_filename',
            path.join(outputDir, 'v%v', 'seg_%06d.ts'),
            '-master_pl_name',
            'master.m3u8',
            '-var_stream_map',
            'v:0,a:0,name:1080p v:1,a:1,name:720p v:2,a:2,name:480p',
            path.join(outputDir, 'v%v', 'index.m3u8'),
        ];

        fs.mkdirSync(path.join(outputDir, 'v0'), { recursive: true });
        fs.mkdirSync(path.join(outputDir, 'v1'), { recursive: true });
        fs.mkdirSync(path.join(outputDir, 'v2'), { recursive: true });

        const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
            windowsHide: true,
            stdio: ['pipe', 'ignore', 'pipe'],
        });

        session.ffmpegProcess = ffmpegProcess;
        this.logSession(session, `Spawned ffmpeg pid=${ffmpegProcess.pid || 'unknown'}`);

        input.pipe(ffmpegProcess.stdin);

        ffmpegProcess.stdin.on('error', (err) => {
            const code = String(err?.code || '').toUpperCase();
            if (code === 'EPIPE' || /write\s+eof/i.test(String(err?.message || ''))) return;
            this.logSession(session, `ffmpeg stdin error: ${err?.message || err}`, 'warn');
        });

        input.on('error', (err) => {
            session.status = 'error';
            session.message = err?.message || 'Torrent file stream failed';
            this.logSession(session, `Input stream error: ${session.message}`, 'error');
        });

        input.on('data', (chunk) => {
            session.bytesFromTorrent += chunk?.length || 0;
        });

        ffmpegProcess.stderr.on('data', (chunk) => {
            const line = String(chunk || '').trim();
            if (!line) return;
            session.message = line;
            this.logSession(session, `ffmpeg: ${line}`, 'warn');

            if (!session.durationSeconds) {
                const match = line.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
                if (match) {
                    const [, h, m, s] = match;
                    session.durationSeconds = parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
                    this.logSession(session, `Duration parsed: ${session.durationSeconds}s`);
                }
            }
        });

        ffmpegProcess.on('spawn', () => {
            session.status = 'transcoding';
            session.message = 'Transcoding and generating HLS variants';
            this.logSession(session, session.message);
        });

        ffmpegProcess.on('close', (code) => {
            if (session.status === 'stopped') return;
            session.status = code === 0 ? 'completed' : 'error';
            session.message = code === 0 ? 'Transcoder exited' : `Transcoder exited with code ${code}`;
            this.logSession(session, session.message, code === 0 ? 'log' : 'error');
        });

        ffmpegProcess.on('error', (err) => {
            session.status = 'error';
            session.message = err?.message || 'Failed to start transcoder';
            this.logSession(session, session.message, 'error');
        });

        const masterPlaylistRelative = await this.waitForPlaylist(sessionId, HLS_PLAYLIST_TIMEOUT_MS);
        session.masterPlaylistRelative = masterPlaylistRelative;
        session.status = 'ready';
        session.message = 'Adaptive stream ready';
        this.logSession(session, `Playlist ready at ${masterPlaylistRelative}`);

        this.enforceCacheLimit();

        return {
            sessionId,
            infoHash: parseMagnetHash(cleanMagnet),
            masterPlaylistUrl: this.getMasterPlaylistUrl(sessionId),
            status: session.status,
            fileName: playableFile.name,
            renditions: [
                { label: '1080p', bandwidth: 5800000, resolution: '1920x1080' },
                { label: '720p', bandwidth: 3000000, resolution: '1280x720' },
                { label: '480p', bandwidth: 1400000, resolution: '854x480' },
            ],
        };
    }

    async waitForPlaylist(sessionId, timeoutMs) {
        const start = Date.now();
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Stream session not found while waiting for playlist');
        }

        const variantCandidates = [
            path.join(session.outputDir, 'v0', 'index.m3u8'),
            path.join(session.outputDir, 'v1', 'index.m3u8'),
            path.join(session.outputDir, 'v2', 'index.m3u8'),
            path.join(session.outputDir, 'v1080p', 'index.m3u8'),
            path.join(session.outputDir, 'v720p', 'index.m3u8'),
            path.join(session.outputDir, 'v480p', 'index.m3u8'),
        ];

        const playlistCandidates = [
            { relative: 'master.m3u8', absolute: path.join(session.outputDir, 'master.m3u8') },
            { relative: path.join('v0', 'master.m3u8'), absolute: path.join(session.outputDir, 'v0', 'master.m3u8') },
        ];

        while (Date.now() - start < timeoutMs) {
            const hasPlayableVariant = variantCandidates.some((variantPath) => fs.existsSync(variantPath) && playlistHasSegmentEntries(variantPath));

            for (const candidate of playlistCandidates) {
                if (fs.existsSync(candidate.absolute) && hasPlayableVariant) {
                    return candidate.relative.replace(/\\/g, '/');
                }
            }

            const syntheticMaster = buildSyntheticMasterPlaylist(session.outputDir);
            if (syntheticMaster) {
                this.logSession(session, 'Generated synthetic master playlist from variant indexes', 'warn');
                return 'master.m3u8';
            }

            if (session.status === 'error' || session.status === 'stopped') {
                throw new Error(`Stream failed before playlist was ready: ${session.message || session.status}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 350));
        }

        const artifacts = collectHlsArtifacts(session.outputDir);
        throw new Error(`Timed out waiting for HLS playlist to be generated (status=${session.status}, ffmpegPid=${session.ffmpegProcess?.pid || 'none'}, bytes=${session.bytesFromTorrent}, artifacts=${artifacts.join(', ') || 'none'})`);
    }

    async stopSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return { sessionId, stopped: false };

        session.status = 'stopped';

        try {
            if (session.ffmpegProcess && !session.ffmpegProcess.killed) {
                session.ffmpegProcess.kill('SIGTERM');
            }
        } catch {
            // No-op.
        }

        try {
            if (session.torrent) {
                await new Promise((resolve) => session.torrent.destroy(() => resolve()));
            }
        } catch {
            // No-op.
        }

        try {
            if (session.client) {
                await new Promise((resolve) => session.client.destroy(() => resolve()));
            }
        } catch {
            // No-op.
        }

        this.sessions.delete(sessionId);

        return { sessionId, stopped: true };
    }

    enforceCacheLimit() {
        const sessionDirs = listSessionDirs(this.cacheRoot);
        let total = sessionDirs.reduce((sum, current) => sum + dirSizeBytes(current), 0);

        for (const sessionDir of sessionDirs) {
            if (total <= this.maxCacheBytes) break;
            total -= dirSizeBytes(sessionDir);
            rmrf(sessionDir);
        }
    }

    async dispose() {
        const allSessionIds = Array.from(this.sessions.keys());
        for (const id of allSessionIds) {
            await this.stopSession(id);
        }

        if (this.server) {
            await new Promise((resolve) => this.server.close(() => resolve()));
            this.server = null;
            this.serverPort = null;
        }
    }
}
