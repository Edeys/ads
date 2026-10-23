#!/usr/bin/env node
/**
 * AdSync MCP stdio-to-HTTP Bridge
 * Dành cho các agent / AI clients chỉ hỗ trợ stdio MCP server (stdin/stdout).
 * Tự động forward các request JSON-RPC đến https://mcp.done.vn/mcp kèm Session ID và Auth header.
 */
import readline from 'readline';

const MCP_URL = 'https://mcp.done.vn/mcp';
const MCP_TOKEN = process.env.ADSYNC_MCP_TOKEN || 'mcp_5vInGNWFcpO7opAzIfNNLWpg2CEhbFg9VHe8Ea-efM0';

let sessionId = null;

async function sendRequest(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${MCP_TOKEN}`,
  };
  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
  });

  const newSessionId = res.headers.get('mcp-session-id');
  if (newSessionId) {
    sessionId = newSessionId;
  }

  return await res.json();
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', async (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    const resp = await sendRequest(req);
    process.stdout.write(JSON.stringify(resp) + '\n');
  } catch (err) {
    process.stderr.write(`Bridge error: ${err.message}\n`);
  }
});
