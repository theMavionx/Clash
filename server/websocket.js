const WebSocket = require('ws');
const db = require('./db');

const clients = new Map(); // clientId -> { ws, playerId, playerName, token }
let nextClientId = 1;

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
  return sent;
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

module.exports = { setupWebSocket, broadcast, broadcastToPlayer, getOnlinePlayers };
