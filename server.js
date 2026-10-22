/**
 * Mobile-Ready Web Server for Cinematic Glasses Blast WebAR
 * 
 * Features:
 * - Pure Node.js (zero external dependencies required)
 * - HTTP Range request support for smooth audio streaming on mobile (iOS Safari / Android)
 * - Automatic Local Network IP detection (for Wi-Fi mobile testing)
 * - Optional HTTPS Tunnel via localtunnel for instant secure camera access on mobile
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 8000;
const PUBLIC_DIR = path.resolve(__dirname);

// MIME types mapping
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
  '.task': 'application/octet-stream'
};

// Get local IPv4 addresses
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// Create HTTP Server
const server = http.createServer((req, res) => {
  // Normalize URL and prevent directory traversal
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  // Check if file exists within PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const totalSize = stats.size;

    // Enable CORS and Cross-Origin headers for WebAssembly & MediaPipe vision models
    const defaultHeaders = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, defaultHeaders);
      res.end();
      return;
    }

    // Range request support (crucial for mobile audio streaming in iOS Safari)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize || start > end) {
        res.writeHead(416, {
          'Content-Range': `bytes */${totalSize}`,
          'Access-Control-Allow-Origin': '*'
        });
        res.end();
        return;
      }

      const chunkSize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        ...defaultHeaders,
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize
      });

      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        ...defaultHeaders,
        'Accept-Ranges': 'bytes',
        'Content-Length': totalSize
      });

      fs.createReadStream(filePath).pipe(res);
    }
  });
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  const localIps = getLocalIpAddresses();
  const primaryIp = localIps[0] || 'localhost';

  console.log('================================================================');
  console.log('  CINEMATIC GLASSES BLAST // WebAR Server Running               ');
  console.log('================================================================');
  console.log(`  > Local PC:       http://localhost:${PORT}`);
  console.log(`  > Mobile (Wi-Fi): http://${primaryIp}:${PORT}`);
  console.log('----------------------------------------------------------------');
  console.log('  MOBILE CAMERA REQUIREMENT:');
  console.log('  Mobile browsers (iOS Safari & Android Chrome) require HTTPS');
  console.log('  or localhost to access the camera.');
  console.log('================================================================');

  // If --tunnel flag is passed or by default, launch localtunnel for HTTPS mobile access
  const enableTunnel = process.argv.includes('--tunnel') || process.argv.includes('-t') || true;
  if (enableTunnel) {
    console.log('  Starting secure HTTPS tunnel for mobile device access...');
    
    // Spawn localtunnel
    const lt = spawn('npx', ['--yes', 'localtunnel', '--port', String(PORT)], {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    lt.stdout.on('data', (data) => {
      const msg = data.toString();
      const match = msg.match(/your url is:\s*(https:\/\/[^\s]+)/i);
      if (match) {
        const tunnelUrl = match[1];
        console.log('\n================================================================');
        console.log('  SECURE HTTPS MOBILE URL (Recommended for Phones):');
        console.log(`  ${tunnelUrl}`);
        console.log('----------------------------------------------------------------');
        console.log('  How to open on iPhone or Android:');
        console.log(`  1. Open ${tunnelUrl} on your mobile browser.`);
        console.log('  2. If localtunnel asks for a password, enter your public IP.');
        console.log('  3. Tap "START AR EXPERIENCE" and allow camera access!');
        console.log('================================================================\n');
      }
    });

    lt.stderr.on('data', (data) => {
      // Ignore warnings or errors
    });

    process.on('SIGINT', () => {
      lt.kill();
      process.exit();
    });
  }
});
