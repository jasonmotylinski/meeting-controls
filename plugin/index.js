// Meeting Controls — free meeting keys for VSD Craft (Stream Dock).
// Zoom: clicks its Meeting menu (no focus steal) and shows live state.
// Teams: briefly focuses Teams, sends its Cmd+Shift shortcut, refocuses.
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
  'com.meetingcontrols.share': { cmd: 'toggle-share', kind: 'share' },
  'com.meetingcontrols.leave': { cmd: 'leave', kind: 'leave' },
  'com.meetingcontrols.status': { cmd: null, kind: 'status' },
};
const LABELS = { mic: 'Mic', cam: 'Cam', share: 'Share' };
const LEAVE_CONFIRM_MS = 2000; // Leave needs a second press within this window

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i]] = process.argv[i + 1];

const imageCache = {};
const image = (name) =>
  (imageCache[name] ??= 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(IMG, name + '.svg')).toString('base64'));

const contexts = new Map(); // context -> { kind, shown }
const ws = new WebSocket(`ws://127.0.0.1:${args['-port']}`);
const send = (msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

const NONE = { app: 'none', mic: 'unknown', cam: 'unknown', share: 'unknown', meeting: 'no' };
function run(cmd) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    execFile('osascript', [SCRIPT, cmd], { timeout: 5000 }, (err, out) => {
      if (cmd !== 'status' || Date.now() - t0 > 1000) log('timing', cmd, Date.now() - t0 + 'ms', String(out || '').trim());
      if (err) log('osascript', cmd, err.message.split('\n').pop() || err.message);
      const [app, mic, cam, share, meeting] = String(out || '').trim().split(/\s+/);
      resolve({ app: app || NONE.app, mic: mic || 'unknown', cam: cam || 'unknown', share: share || 'unknown', meeting: meeting || 'no' });
    });
  });
}

// Meeting timer: starts when a meeting is first seen, clears when it ends.
let meetingStart = null;
let leaveArmedUntil = 0;
const elapsed = () => {
  const s = Math.floor((Date.now() - meetingStart) / 1000);
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
};

function look(kind, state) {
  const inMeeting = state.meeting === 'yes';
  if (kind === 'status') {
    if (!inMeeting) return ['status', ''];
    return ['status-on', (state.app === 'zoom' ? 'Zoom ' : 'Teams ') + elapsed()];
  }
  if (kind === 'leave') {
    if (Date.now() < leaveArmedUntil) return ['leave-armed', 'Again?'];
    return ['leave', inMeeting ? 'Leave' : ''];
  }
  const v = state[kind];
  const img = v === 'on' ? `${kind}-on` : v === 'off' ? `${kind}-off` : kind;
  const title = state.app === 'none' ? '' : v === 'on' ? `${LABELS[kind]} ON` : v === 'off' ? `${LABELS[kind]} OFF` : LABELS[kind];
  return [img, title];
}

function render(state) {
  for (const [context, c] of contexts) {
    const [img, title] = look(c.kind, state);
    const shown = img + '|' + title;
    if (c.shown === shown) continue;
    c.shown = shown;
    send({ event: 'setImage', context, payload: { image: image(img), target: 0 } });
    send({ event: 'setTitle', context, payload: { title, target: 0 } });
  }
}

let last = { ...NONE };
function update(s) {
  if (s.meeting === 'yes' && !meetingStart) meetingStart = Date.now();
  if (s.meeting !== 'yes') meetingStart = null;
  if (s.app !== last.app || s.meeting !== last.meeting) log('state', s.app, 'meeting=' + s.meeting);
  last = s;
  render(s);
}

let quietUntil = 0; // skip polls briefly after a press: Zoom's menu lags the click
let polling = false;
async function poll() {
  if (polling || contexts.size === 0 || Date.now() < quietUntil) return;
  polling = true;
  try {
    const s = await run('status');
    if (Date.now() >= quietUntil) update(s);
  } finally { polling = false; }
}
const flip = (v) => (v === 'on' ? 'off' : v === 'off' ? 'on' : v);
setInterval(poll, 2000);
setInterval(() => (meetingStart || leaveArmedUntil) && render(last), 1000); // tick the timer / expire "Again?"

async function press(context, a) {
  if (!a.cmd) return; // status key is display-only
  if (a.kind === 'leave') {
    if (last.meeting !== 'yes') return send({ event: 'showAlert', context });
    if (Date.now() >= leaveArmedUntil) { leaveArmedUntil = Date.now() + LEAVE_CONFIRM_MS; return render(last); }
    leaveArmedUntil = 0;
  }
  quietUntil = Date.now() + 1500;
  if (last.app === 'zoom' && a.kind in LABELS) render({ ...last, [a.kind]: flip(last[a.kind]) }); // instant feedback
  const s = await run(a.cmd);
  quietUntil = Date.now() + 1500;
  if (s.app === 'none') send({ event: 'showAlert', context });
  // Zoom toggle output reports only the side it changed; keep the rest from last known state.
  if (s.app === 'zoom' && last.app === 'zoom') {
    for (const k of ['mic', 'cam', 'share']) if (s[k] === 'unknown') s[k] = last[k];
  }
  update(s);
}

ws.on('open', () => {
  send({ event: args['-registerEvent'], uuid: args['-pluginUUID'] });
  run('debug').then(() => {}); // logs Zoom menus / Teams windows once, for troubleshooting
});
ws.on('message', async (data) => {
  const { event, action, context } = JSON.parse(data);
  const a = ACTIONS[action];
  if (!a) return;
  if (event === 'willAppear') { contexts.set(context, { kind: a.kind }); render(last); poll(); }
  if (event === 'willDisappear') contexts.delete(context);
  if (event === 'keyDown') press(context, a);
});
ws.on('close', () => process.exit(0));
