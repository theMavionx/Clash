import { useEffect, useRef, useState } from 'react';
import { usePlayer, useSend } from './useGodot';
import { addClientBreadcrumb } from '../lib/clientLogger';

const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const AGENT_ACTIONS_ENABLED = false;

function agentWsUrl() {
  const base = GAME_API.startsWith('http')
    ? new URL(GAME_API)
    : new URL(GAME_API, window.location.origin);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = '/ws';
  base.search = '';
  base.hash = '';
  return base.toString();
}

export function useAgentActions() {
  const player = usePlayer();
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
  const { sendToGodot } = useSend();
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const keyCheckRef = useRef(null);
  const seenEventsRef = useRef(new Set());
  const pendingGodotEventsRef = useRef([]);
  const godotFlushRef = useRef(null);
  const pendingPollRef = useRef(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshNonce((n) => n + 1);
    window.addEventListener('clash-ai-keys-changed', refresh);
    return () => window.removeEventListener('clash-ai-keys-changed', refresh);
  }, []);

  useEffect(() => {
    if (!AGENT_ACTIONS_ENABLED) return undefined;
    if (!token) return;
    let cancelled = false;
    let wsRetryMs = 1000;
    let keyRetryMs = 1000;

    const clearTimer = (timerRef) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const clearGodotFlush = () => {
      if (godotFlushRef.current) {
        clearInterval(godotFlushRef.current);
        godotFlushRef.current = null;
      }
    };

    const clearPendingPoll = () => {
      if (pendingPollRef.current) {
        clearInterval(pendingPollRef.current);
        pendingPollRef.current = null;
      }
    };

    const flushPendingGodotEvents = () => {
      if (cancelled || !window.godotBridge) return;
      const queued = pendingGodotEventsRef.current.splice(0);
      queued.forEach((data) => sendToGodot('agent_action', data));
      if (pendingGodotEventsRef.current.length === 0) clearGodotFlush();
    };

    const scheduleGodotFlush = () => {
      if (cancelled || godotFlushRef.current) return;
      godotFlushRef.current = setInterval(flushPendingGodotEvents, 250);
    };

    const deliverAgentAction = (data) => {
      if (window.godotBridge) {
        sendToGodot('agent_action', data);
        return;
      }
      pendingGodotEventsRef.current.push(data);
      scheduleGodotFlush();
    };

    const handleAgentActionMessage = (msg) => {
      if (msg?.type !== 'agent_action' || !msg.data) return;
      const eventId = msg.data.event_id || msg.data.payload?.battle_session_id || `${msg.data.action}:${msg.data.at || ''}`;
      if (seenEventsRef.current.has(eventId)) return;
      seenEventsRef.current.add(eventId);
      if (seenEventsRef.current.size > 50) {
        seenEventsRef.current.delete(seenEventsRef.current.values().next().value);
      }
      addClientBreadcrumb('agent.action', {
        action: msg.data.action,
        event_id: eventId,
        key: msg.data.key?.id || null,
      });
      deliverAgentAction(msg.data);
    };

    const pollPendingEvents = () => {
      if (cancelled) return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) return;
      fetch(`${GAME_API}/agent-events/pending`, { headers: { 'x-token': token } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('pending agent events failed'))))
        .then((data) => {
          if (cancelled) return;
          (data.events || []).forEach(handleAgentActionMessage);
        })
        .catch(() => {});
    };

    const startPendingPoll = () => {
      if (cancelled || pendingPollRef.current) return;
      pollPendingEvents();
      pendingPollRef.current = setInterval(pollPendingEvents, 10000);
    };

    const closeSocket = () => {
      clearTimer(reconnectRef);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };

    const scheduleWsReconnect = (connect) => {
      if (cancelled || reconnectRef.current) return;
      reconnectRef.current = setTimeout(() => {
        reconnectRef.current = null;
        connect();
      }, wsRetryMs);
      wsRetryMs = Math.min(wsRetryMs * 2, 15000);
    };

    const connect = () => {
      if (cancelled) return;
      const current = wsRef.current;
      if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) return;

      const ws = new WebSocket(agentWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        wsRetryMs = 1000;
        ws.send(JSON.stringify({ type: 'auth', token }));
      };

      ws.onmessage = (event) => {
        let msg = null;
        try { msg = JSON.parse(event.data); } catch { return; }
        handleAgentActionMessage(msg);
      };

      ws.onerror = () => {
        if (wsRef.current === ws) {
          try { ws.close(); } catch {}
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (cancelled) return;
        scheduleWsReconnect(connect);
      };
    };

    const scheduleKeyCheck = (checkForAgent) => {
      if (cancelled || keyCheckRef.current) return;
      keyCheckRef.current = setTimeout(() => {
        keyCheckRef.current = null;
        checkForAgent();
      }, keyRetryMs);
      keyRetryMs = Math.min(keyRetryMs * 2, 15000);
    };

    const checkForAgent = () => {
      fetch(`${GAME_API}/players/ai-keys`, { headers: { 'x-token': token } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('ai key check failed'))))
        .then((data) => {
          if (cancelled) return;
          keyRetryMs = 5000;
          const hasActiveAgent = (data.keys || []).some((key) => !key.revoked_at);
          if (hasActiveAgent) {
            connect();
            startPendingPoll();
          } else {
            clearPendingPoll();
            closeSocket();
            scheduleKeyCheck(checkForAgent);
          }
        })
        .catch(() => {
          scheduleKeyCheck(checkForAgent);
        });
    };

    checkForAgent();

    return () => {
      cancelled = true;
      clearTimer(keyCheckRef);
      clearPendingPoll();
      clearGodotFlush();
      pendingGodotEventsRef.current = [];
      closeSocket();
    };
  }, [refreshNonce, sendToGodot, token]);
}
