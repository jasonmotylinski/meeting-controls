// Meeting Controls — free mic/camera toggle keys for VSD Craft (Stream Dock).
// Zoom: clicks its Meeting menu (no focus steal) and shows live state.
// Teams: briefly focuses Teams, sends Cmd+Shift+M / Cmd+Shift+O, refocuses.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const LOGFILE = path.join(__dirname, '..', 'plugin.log');
const log = (...a) => fs.appendFileSync(LOGFILE, new Date().toISOString() + ' ' + a.join(' ') + '\n');
process.on('uncaughtException', (e) => { log('CRASH', e.stack); process.exit(1); });
log('start', process.argv.slice(2, 6).join(' '));
const WebSocket = require('ws');

// Precompiled at install (osacompile); falls back to the source if missing.
const COMPILED = path.join(__dirname, 'meeting.scpt');
const SCRIPT = fs.existsSync(COMPILED) ? COMPILED : path.join(__dirname, 'meeting.applescript');
const IMG = path.join(__dirname, '..', 'images');
const ACTIONS = {
  'com.meetingcontrols.mic': { cmd: 'toggle-mic', kind: 'mic' },
  'com.meetingcontrols.cam': { cmd: 'toggle-cam', kind: 'cam' },
};

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i]] = process.argv[i + 1];

const imageCache = {};
const image = (name) =>
  (imageCache[name] ??= 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(IMG, name + '.svg')).toString('base64'));

const contexts = new Map(); // context -> { kind, shown }
const ws = new WebSocket(`ws://127.0.0.1:${args['-port']}`);
const send = (msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

function run(cmd) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    execFile('osascript', [SCRIPT, cmd], { timeout: 5000 }, (err, out) => {
      if (cmd !== 'status' || Date.now() - t0 > 1000) log('timing', cmd, Date.now() - t0 + 'ms', String(out || '').trim());
      if (err) log('osascript', cmd, err.message.split('\n').pop() || err.message);
      const [app = 'none', mic = 'unknown', cam = 'unknown'] = String(out || '').trim().split(/\s+/);
      resolve({ app, mic, cam });
    });
  });
}

function render(state) {
  for (const [context, c] of contexts) {
    const v = state[c.kind];
    const img = v === 'on' ? `${c.kind}-on` : v === 'off' ? `${c.kind}-off` : c.kind;
    const label = c.kind === 'mic' ? 'Mic' : 'Cam';
    const title = state.app === 'none' ? '' : v === 'on' ? `${label} ON` : v === 'off' ? `${label} OFF` : label;
    const shown = img + '|' + title;
    if (c.shown === shown) continue;
    c.shown = shown;
    send({ event: 'setImage', context, payload: { image: image(img), target: 0 } });
    send({ event: 'setTitle', context, payload: { title, target: 0 } });
  }
}

let last = { app: 'none', mic: 'unknown', cam: 'unknown' };
let quietUntil = 0; // skip polls briefly after a press: Zoom's menu lags the click
let polling = false;
async function poll() {
  if (polling || contexts.size === 0 || Date.now() < quietUntil) return;
  polling = true;
  try {
    const s = await run('status');
    if (Date.now() >= quietUntil) { last = s; render(s); }
  } finally { polling = false; }
}
const flip = (v) => (v === 'on' ? 'off' : v === 'off' ? 'on' : v);
setInterval(poll, 2000);

ws.on('open', () => send({ event: args['-registerEvent'], uuid: args['-pluginUUID'] }));
ws.on('message', async (data) => {
  const { event, action, context } = JSON.parse(data);
  const a = ACTIONS[action];
  if (!a) return;
  if (event === 'willAppear') { contexts.set(context, { kind: a.kind }); poll(); }
  if (event === 'willDisappear') contexts.delete(context);
  if (event === 'keyDown') {
    quietUntil = Date.now() + 1500;
    if (last.app === 'zoom') render({ ...last, [a.kind]: flip(last[a.kind]) }); // instant feedback
    const s = await run(a.cmd);
    quietUntil = Date.now() + 1500;
    if (s.app === 'none') send({ event: 'showAlert', context });
    // Toggle output reports only the side it changed; keep the rest from last known state.
    last = { app: s.app, mic: s.mic !== 'unknown' ? s.mic : last.mic, cam: s.cam !== 'unknown' ? s.cam : last.cam };
    if (s.app !== 'zoom') last = s;
    render(last);
  }
});
ws.on('close', () => process.exit(0));
