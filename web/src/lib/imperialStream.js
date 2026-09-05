// Official /ws and /ws/market protocols. Public wallet-scoped reads only: no JWT in URLs/frames.
export function openImperialStream({ url, subscriptions, onMessage, onStatus = () => {}, WebSocketImpl = WebSocket, timers = globalThis }) {
  let socket, stopped = false, retry, heartbeat, watchdog, attempt = 0, lastMessage = 0, sequence = -1;
  const connect = () => {
    if (stopped) return;
    sequence = -1;
    onStatus('connecting');
    try { socket = new WebSocketImpl(url); }
    catch {
      onStatus('reconnecting');
      retry = timers.setTimeout(connect, Math.min(30000,1000 * 2 ** Math.min(attempt++,5)));
      return;
    }
    const current = socket;
    current.onopen = () => {
      if (stopped || socket !== current) { current.close(); return; }
      lastMessage = Date.now();
      for (const message of subscriptions) socket.send(JSON.stringify(message));
      heartbeat = timers.setInterval(() => { if (socket.readyState === 1) socket.send(JSON.stringify({type:'ping'})); }, 20000);
      watchdog = timers.setInterval(() => { if (Date.now() - lastMessage > 45000) socket.close(); }, 10000);
    };
    current.onmessage = event => {
      if (stopped || socket !== current) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'error') { onStatus('reconnecting'); current.close(); return; }
      lastMessage = Date.now(); attempt = 0;
      if (message.type === 'position_state') {
        if (!Number.isSafeInteger(message.seq) || message.seq <= sequence) return;
        sequence = message.seq;
      }
      if (message.type !== 'pong') onMessage(message);
      if (message.type !== 'error') onStatus('live');
    };
    current.onerror = () => current.close();
    current.onclose = () => {
      if (socket !== current) return;
      timers.clearInterval(heartbeat); timers.clearInterval(watchdog);
      if (stopped) return;
      current.onmessage = null; current.onopen = null; current.onerror = null; current.onclose = null;
      onStatus('reconnecting');
      retry = timers.setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)));
    };
  };
  connect();
  return () => {
    stopped = true; timers.clearTimeout(retry); timers.clearInterval(heartbeat); timers.clearInterval(watchdog);
    if (socket) { socket.onclose = null; socket.onerror = null; socket.close(); }
  };
}
