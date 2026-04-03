const WebSocket = require('ws');
const db = require('./db');
const { CombatManager } = require('./combat_manager');

const clients = new Map(); // token -> { ws, playerId, playerName }
let combatManager = null;

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });
  combatManager = new CombatManager(db);

  wss.on('connection', (ws, req) => {
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
        clients.set(playerToken, { ws, playerId: player.id, playerName: player.name });
        console.log(`\x1b[35mWS\x1b[0m auth \x1b[90m${player.name} (${player.id.slice(0,8)})\x1b[0m`);

        ws.send(JSON.stringify({
          type: 'auth_ok',
          player: db.getFullPlayerState(player.id),
        }));

        // Register combat sender
        combatManager.registerSender(player.id, (data) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
        });

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
        const info = clients.get(playerToken);
        clients.delete(playerToken);
        if (info) {
          console.log(`\x1b[35mWS\x1b[0m disconnect \x1b[90m${info.playerName}\x1b[0m`);
          combatManager.unregisterSender(info.playerId);
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
      result = db.addResources(playerId, msg.gold || 0, msg.wood || 0, msg.ore || 0);
      ws.send(JSON.stringify({ type: 'resources', data: result }));
      break;

    case 'subtract_resources':
      result = db.subtractResources(playerId, msg.gold || 0, msg.wood || 0, msg.ore || 0);
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

    // ── Combat Messages ──
    case 'attack_start': {
      const res = combatManager.createSession(playerId, msg.defender_id);
      if (res.error) {
        ws.send(JSON.stringify({ type: 'attack_session_error', error: res.error }));
      } else {
        ws.send(JSON.stringify({ type: 'attack_session_created', ...res }));
      }
      break;
    }
    case 'place_ship': {
      const res = combatManager.placeShip(playerId, msg.session_id, msg.x, msg.z, msg.troop_type);
      if (res.error) {
        ws.send(JSON.stringify({ type: 'ship_rejected', reason: res.error }));
      } else {
        ws.send(JSON.stringify({ type: 'ship_placed', ...res }));
      }
      break;
    }
    case 'attack_end':
      combatManager.endSession(playerId, 'abandoned');
      break;

    default:
      ws.send(JSON.stringify({ error: `Unknown message type: ${msg.type}` }));
  }
}

function broadcast(data, excludeToken = null) {
  const payload = JSON.stringify(data);
  for (const [token, client] of clients) {
    if (token !== excludeToken && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function getOnlinePlayers() {
  return Array.from(clients.values()).map(c => ({
    player_id: c.playerId,
    name: c.playerName,
  }));
}

module.exports = { setupWebSocket, broadcast, getOnlinePlayers };
