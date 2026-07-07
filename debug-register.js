import { spawn } from 'child_process';
import path from 'path';
import http from 'http';

const projectPath = path.resolve('c:/Users/pavan/Documents/app_gattandco');
const server = spawn('node', ['server.js'], {
  cwd: projectPath,
  env: { ...process.env, NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

server.stdout.on('data', (chunk) => {
  process.stdout.write(`[SERVER STDOUT] ${chunk}`);
});
server.stderr.on('data', (chunk) => {
  process.stderr.write(`[SERVER STDERR] ${chunk}`);
});

server.on('error', (error) => {
  console.error('[SERVER ERROR]', error);
  process.exit(1);
});

server.on('close', (code, signal) => {
  console.log(`[SERVER CLOSED] code=${code} signal=${signal}`);
  process.exit(code || 0);
});

function sendRequest() {
  const body = JSON.stringify({ name: 'Test User X', email: 'test-x10@example.com', phone: '1234567890', password: 'Password123!' });
  const req = http.request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        console.log('[CLIENT RESPONSE]', res.statusCode, data);
        server.kill();
      });
    }
  );

  req.on('error', (error) => {
    console.error('[CLIENT ERROR]', error);
    server.kill();
  });

  req.write(body);
  req.end();
}

let started = false;
server.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  if (!started && text.includes('Server listening on http://localhost:5000')) {
    started = true;
    setTimeout(sendRequest, 1000);
  }
});
