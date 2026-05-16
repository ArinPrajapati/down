# Pokemon Showdown Bot Loop

This note shows how to structure a complete Pokemon Showdown bot client into small functions that can be called from anywhere in your code.

## Goal

Build the bot around these steps:

1. connect websocket
2. wait for challstr
3. POST `/api/login`
4. send `|/trn ...`
5. send `|/join room`
6. parse incoming lines
7. react by sending commands/messages

## Recommended structure

Use one main `ShowdownBot` object or module with reusable functions:

- `connect()`
- `waitForChallstr()`
- `loginWithPassword()`
- `sendTrn()`
- `joinRoom(roomId)`
- `parseMessage(raw)`
- `handleMessage(msg)`
- `send(roomId, text)`
- `sendCommand(text)`
- `start()`

## Function design

### `connect()`

Responsibility:

- open the WebSocket connection to the server
- register listeners for `open`, `message`, `close`, and `error`

Example:

```js
async function connect(url) {
  const ws = new WebSocket(url);

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  return ws;
}
```

### `waitForChallstr()`

Responsibility:

- wait until the server sends `|challstr|`
- extract the full challstr value

Example:

```js
function waitForChallstr(ws) {
  return new Promise((resolve) => {
    const onMessage = (buf) => {
      const raw = buf.toString();
      const match = raw.match(/\|challstr\|([^\n]+)/);
      if (!match) return;

      ws.off('message', onMessage);
      resolve(match[1]);
    };

    ws.on('message', onMessage);
  });
}
```

### `loginWithPassword()`

Responsibility:

- send HTTP POST to `https://play.pokemonshowdown.com/api/login`
- parse the returned JSON payload
- return `assertion`

Example:

```js
async function loginWithPassword({username, password, challstr}) {
  const res = await fetch('https://play.pokemonshowdown.com/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      name: username,
      pass: password,
      challstr,
    }),
  });

  const text = await res.text();
  const data = JSON.parse(text.startsWith(']') ? text.slice(1) : text);
  return data.assertion;
}
```

### `sendTrn()`

Responsibility:

- complete the login over the WebSocket

Example:

```js
function sendTrn(ws, username, assertion) {
  ws.send(`|/trn ${username},0,${assertion}`);
}
```

### `joinRoom(roomId)`

Responsibility:

- send a join command for a room

Example:

```js
function joinRoom(ws, roomId) {
  ws.send(`|/join ${roomId}`);
}
```

### `send(roomId, text)`

Responsibility:

- send a normal message or room command
- keep the protocol format in one place

Example:

```js
function send(ws, roomId, text) {
  ws.send(`${roomId}|${text}`);
}
```

### `sendCommand(text)`

Responsibility:

- send a global command not tied to one room

Example:

```js
function sendCommand(ws, text) {
  ws.send(`|${text}`);
}
```

### `parseMessage(raw)`

Responsibility:

- split server payloads into room context and lines
- convert raw text into a shape the rest of your code can use

Example:

```js
function parseMessage(raw) {
  let roomId = '';
  let body = raw;

  if (raw.startsWith('>')) {
    const nl = raw.indexOf('\n');
    roomId = raw.slice(1, nl);
    body = raw.slice(nl + 1);
  }

  const lines = body.split('\n').filter(Boolean);
  return {roomId, lines, raw};
}
```

### `handleMessage(msg)`

Responsibility:

- inspect parsed lines
- detect PMs, chat, battle events, challstr, updateuser, and commands
- dispatch to other functions

Example:

```js
function handleMessage(ws, msg) {
  for (const line of msg.lines) {
    if (line.startsWith('|pm|')) {
      console.log('PM:', line);
      continue;
    }

    if (line.startsWith('|c|') || line.startsWith('|chat|')) {
      console.log('CHAT:', msg.roomId, line);
      continue;
    }
  }
}
```

## Complete bot loop

This is the clean startup flow:

```js
async function startBot(config) {
  const ws = await connect(config.websocketUrl);
  const challstr = await waitForChallstr(ws);
  const assertion = await loginWithPassword({
    username: config.username,
    password: config.password,
    challstr,
  });

  sendTrn(ws, config.username, assertion);

  for (const roomId of config.rooms) {
    joinRoom(ws, roomId);
  }

  ws.on('message', (buf) => {
    const msg = parseMessage(buf.toString());
    handleMessage(ws, msg);
  });

  return ws;
}
```

## Turning it into a reusable module

Instead of keeping everything in one file, export the functions:

```js
export {
  connect,
  waitForChallstr,
  loginWithPassword,
  sendTrn,
  joinRoom,
  send,
  sendCommand,
  parseMessage,
  handleMessage,
  startBot,
};
```

Then any other file can call them:

```js
import {startBot, send, joinRoom} from './showdown-bot.js';

const ws = await startBot({
  websocketUrl: 'wss://sim3.psim.us/showdown/websocket',
  username: 'YourBot',
  password: 'secret',
  rooms: ['lobby'],
});

send(ws, 'lobby', 'hello');
joinRoom(ws, 'help');
```

## Better long-term design

For a larger bot, wrap the functions in a class:

```js
class ShowdownBot {
  constructor(config) {
    this.config = config;
    this.ws = null;
  }

  async start() {}
  async connect() {}
  async waitForChallstr() {}
  async loginWithPassword() {}
  sendTrn() {}
  joinRoom(roomId) {}
  send(roomId, text) {}
  sendCommand(text) {}
  parseMessage(raw) {}
  handleMessage(msg) {}
}
```

This is usually better because:

- the websocket instance stays in one place
- config stays in one place
- handlers can access shared bot state
- commands can be called from any part of the program through the same instance

## Suggested rule

Keep protocol details in only two places:

- sending helpers like `send()` and `sendCommand()`
- parsing helpers like `parseMessage()`

That way the rest of the bot works with clean function calls instead of raw protocol strings everywhere.
