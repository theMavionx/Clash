const WebSocket = require('ws');
const db = require('./db');

const clients = new Map(); // clientId -> { ws, playerId, playerName, token }
const pendingAgentEvents = new Map(); // playerId -> [{ event, queuedAt }]
const PENDING_AGENT_EVENT_TTL_MS = 2 * 60 * 1000;
const MAX_PENDING_AGENT_EVENTS = 10;
let nextClientId = 1;

function pendingEventIdentity(event) {
  return event?.data?.event_id || event?.data?.payload?.battle_session_id || null;
}

function shouldQueuePendingAgentEvent(event) {
  // AI attack replays are a live spectating experience. If the player was
  // offline when the agent attacked, do not auto-start an old replay when
  // they open the browser later.
  return event?.data?.action !== 'ai_attack_replay';
}

function prunePendingAgentEvents(playerId) {
  const now = Date.now();
  const events = pendingAgentEvents.get(playerId) || [];
  const fresh = events.filter((entry) => (
    shouldQueuePendingAgentEvent(entry.event)
    && now - entry.queuedAt <= PENDING_AGENT_EVENT_TTL_MS
  ));
  if (fresh.length > 0) {
    pendingAgentEvents.set(playerId, fresh.slice(-MAX_PENDING_AGENT_EVENTS));
  } else {
    pendingAgentEvents.delete(playerId);
  }
  return pendingAgentEvents.get(playerId) || [];
}

function queuePendingAgentEvent(playerId, event) {
  const events = prunePendingAgentEvents(playerId);
  events.push({ event, queuedAt: Date.now() });
  pendingAgentEvents.set(playerId, events.slice(-MAX_PENDING_AGENT_EVENTS));
}

function removePendingAgentEvent(playerId, event) {
  const id = pendingEventIdentity(event);
  if (!id) return;
  const events = prunePendingAgentEvents(playerId);
  const remaining = events.filter((entry) => pendingEventIdentity(entry.event) !== id);
  if (remaining.length > 0) pendingAgentEvents.set(playerId, remaining);
  else pendingAgentEvents.delete(playerId);
}

function flushPendingAgentEvents(playerId, ws, { log = true } = {}) {
  if (ws.readyState !== WebSocket.OPEN) return 0;
  const events = prunePendingAgentEvents(playerId);
  let sent = 0;
  const remaining = [];
  for (const entry of events) {
    try {
      ws.send(JSON.stringify(entry.event));
      sent++;
    } catch {
      remaining.push(entry);
    }
  }
  if (remaining.length > 0) {
    pendingAgentEvents.set(playerId, remaining);
  } else if (sent > 0) {
    pendingAgentEvents.delete(playerId);
  }
  if (log && sent > 0) {
    console.log(`\x1b[35mWS\x1b[0m flushed ${sent} pending agent event(s) \x1b[90m${playerId.slice(0,8)}\x1b[0m`);
  }
  return sent;
}

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const clientId = nextClientId++;
    let playerId = null;
    let playerToken = null;

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      // First message must be auth
      if (!playerId) {
        if (msg.type !== 'auth') {
          ws.send(JSON.stringify({ error: 'Must authenticate first. Send: { type: "auth", token: "..." }' }));
          return;
        }
        const player = db.authenticatePlayer(msg.token);
        if (!player) {
          ws.send(JSON.stringify({ error: 'Invalid token' }));
          ws.close();
          return;
        }
        playerId = player.id;
        playerToken = msg.token;
        clients.set(clientId, { ws, playerId: player.id, playerName: player.name, token: playerToken });
        console.log(`\x1b[35mWS\x1b[0m auth \x1b[90m${player.name} (${player.id.slice(0,8)})\x1b[0m`);

        ws.send(JSON.stringify({
          type: 'auth_ok',
          player: db.getFullPlayerState(player.id),
        }));
        flushPendingAgentEvents(player.id, ws);

        // Notify others
        broadcast({
          type: 'player_online',
          player_id: player.id,
          name: player.name,
        }, playerToken);
        return;
      }

      // Handle game messages
      console.log(`\x1b[35mWS\x1b[0m ${msg.type} \x1b[90m${playerId.slice(0,8)}\x1b[0m`);
      handleMessage(ws, playerId, msg);
    });

    ws.on('close', () => {
      if (playerToken) {
        const info = clients.get(clientId);
        clients.delete(clientId);
        if (info) {
          console.log(`\x1b[35mWS\x1b[0m disconnect \x1b[90m${info.playerName}\x1b[0m`);
          broadcast({
            type: 'player_offline',
            player_id: info.playerId,
            name: info.playerName,
          });
        }
      }
    });
  });

  const pendingFlushTimer = setInterval(() => {
    for (const client of clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        flushPendingAgentEvents(client.playerId, client.ws, { log: false });
      }
    }
  }, 2000);
  pendingFlushTimer.unref?.();

  wss.on('close', () => clearInterval(pendingFlushTimer));

  return wss;
}

function handleMessage(ws, playerId, msg) {
  let result;

  switch (msg.type) {
    case 'get_state':
      result = db.getFullPlayerState(playerId);
      ws.send(JSON.stringify({ type: 'state', data: result }));
      break;

    case 'get_resources':
      result = db.getResources(playerId);
      ws.send(JSON.stringify({ type: 'resources', data: result }));
      break;

    case 'add_resources':
      result = db.addResources(playerId, Number(msg.gold) || 0, Number(msg.wood) || 0, Number(msg.ore) || 0);
      ws.send(JSON.stringify({ type: 'resources', data: result }));
      break;

    case 'subtract_resources':
      result = db.subtractResources(playerId, Number(msg.gold) || 0, Number(msg.wood) || 0, Number(msg.ore) || 0);
      ws.send(JSON.stringify({ type: 'resources', data: result }));
      break;

    case 'place_building':
      result = db.placeBuilding(playerId, msg.building_type, msg.grid_x, msg.grid_z, msg.grid_index || 0);
      ws.send(JSON.stringify({ type: 'building_placed', data: result }));
      break;

    case 'upgrade_building':
      result = db.upgradeBuilding(playerId, msg.building_id);
      ws.send(JSON.stringify({ type: 'building_upgraded', data: result }));
      break;

    case 'remove_building':
      result = db.removeBuilding(playerId, msg.building_id);
      ws.send(JSON.stringify({ type: 'building_removed', data: result }));
      break;

    case 'get_buildings':
      result = db.getPlayerBuildings(playerId);
      ws.send(JSON.stringify({ type: 'buildings', data: result }));
      break;

    case 'upgrade_troop':
      result = db.upgradeTroop(playerId, msg.troop_type);
      ws.send(JSON.stringify({ type: 'troop_upgraded', data: result }));
      break;

    case 'get_troops':
      result = db.getTroopLevels(playerId);
      ws.send(JSON.stringify({ type: 'troops', data: result }));
      break;

    case 'get_trophies':
      result = db.getTrophies(playerId);
      ws.send(JSON.stringify({ type: 'trophies', data: { trophies: result } }));
      break;

    case 'recalculate_trophies':
      result = db.recalculateTrophies(playerId);
      ws.send(JSON.stringify({ type: 'trophies', data: result }));
      break;

    default:
      ws.send(JSON.stringify({ error: `Unknown message type: ${msg.type}` }));
  }
}

function broadcast(data, excludeToken = null) {
  const payload = JSON.stringify(data);
  for (const client of clients.values()) {
    if (client.token !== excludeToken && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function broadcastToPlayer(playerId, data) {
  const payload = JSON.stringify(data);
  let sent = 0;
  for (const client of clients.values()) {
    if (client.playerId === playerId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
      sent++;
    }
  }
  if (data?.type === 'agent_action') {
    if (sent === 0 && shouldQueuePendingAgentEvent(data)) queuePendingAgentEvent(playerId, data);
    else removePendingAgentEvent(playerId, data);
  }
  return sent;
}

function getPendingAgentEvents(playerId) {
  return prunePendingAgentEvents(playerId).map((entry) => entry.event);
}

function consumePendingAgentEvents(playerId) {
  const events = prunePendingAgentEvents(playerId).map((entry) => entry.event);
  pendingAgentEvents.delete(playerId);
  return events;
}

function getOnlinePlayers() {
  const seen = new Set();
  const rows = [];
  for (const c of clients.values()) {
    if (seen.has(c.playerId)) continue;
    seen.add(c.playerId);
    rows.push({ player_id: c.playerId, name: c.playerName });
  }
  return rows;
}

module.exports = { setupWebSocket, broadcast, broadcastToPlayer, getPendingAgentEvents, consumePendingAgentEvents, getOnlinePlayers };
