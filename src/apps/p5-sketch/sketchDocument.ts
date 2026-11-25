/** Runs inside the sandboxed iframe, after p5 and before the user's code. The iframe has an opaque origin, so
 *  it can't be reached from the page; everything crosses by postMessage:
 *    out: ready, size, time { t }, frame (an ImageBitmap, only while streaming), error, log
 *    in:  stream { on }, params, time { playing, t? } */
const BRIDGE = `
(function () {
  var streaming = false;
  var pending = false;
  var lastW = 0;
  var lastH = 0;

  function post(message, transfer) { parent.postMessage(message, '*', transfer || []); }

  // A clock the page can pause and move. millis() reads it, so generated scenes (which take their time from millis())
  // and hand-written sketches both follow it. It has to be in place before p5 starts, which is after this script runs.
  var clock = { playing: true, offset: 0, since: performance.now() };
  function nowMs() { return clock.playing ? clock.offset + (performance.now() - clock.since) : clock.offset; }
  p5.prototype.millis = function () { return nowMs(); };

  // Paused also stops the draw loop (so frameCount-driven code freezes too); playing starts it again.
  function syncLoop() {
    var sketch = p5.instance;
    if (!sketch) return;
    if (clock.playing && !sketch.isLooping()) sketch.loop();
    else if (!clock.playing && sketch.isLooping()) sketch.noLoop();
  }

  function sendFrame() {
    var canvas = document.querySelector('canvas');
    if (!canvas || pending) return;
    pending = true;
    createImageBitmap(canvas).then(
      function (bitmap) { pending = false; post({ type: 'frame', bitmap: bitmap }, [bitmap]); },
      function () { pending = false; }
    );
  }

  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data) return;
    if (data.type === 'stream') {
      streaming = !!data.on;
      // A sketch that isn't redrawing (noLoop) would otherwise never produce a frame for the new listener.
      if (streaming) sendFrame();
    } else if (data.type === 'time') {
      var seeking = typeof data.t === 'number';
      var ms = seeking ? data.t * 1000 : nowMs();
      clock.offset = ms;
      clock.since = performance.now();
      clock.playing = !!data.playing;
      syncLoop();
      // A paused sketch isn't drawing, so a jump needs one frame drawn to show it; a playing one picks it up by itself.
      if (seeking && !clock.playing && p5.instance) p5.instance.redraw();
    } else if (data.type === 'params') {
      // GUI sketches read their numbers from a global P, so dials change them without a restart.
      window.P = data.params;
      // A paused sketch isn't drawing, so a changed dial would not show; draw one frame (a playing one picks it up by itself).
      if (!clock.playing && p5.instance) p5.instance.redraw();
    }
  });

  window.addEventListener('error', function (e) { post({ type: 'error', message: e.message, line: e.lineno }); });
  window.addEventListener('unhandledrejection', function (e) {
    post({ type: 'error', message: String((e.reason && e.reason.message) || e.reason), line: 0 });
  });

  ['log', 'info', 'warn', 'error'].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      var text = Array.prototype.map.call(arguments, function (a) {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch (_) { return String(a); }
      }).join(' ');
      post({ type: 'log', level: level, text: text });
      original.apply(console, arguments);
    };
  });

  p5.prototype.registerMethod('post', function () {
    var canvas = document.querySelector('canvas');
    if (!canvas) return;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (w !== lastW || h !== lastH) { lastW = w; lastH = h; post({ type: 'size', width: w, height: h }); }
    // The first frame can run before the page has said it's paused, so pausing is also checked after each frame.
    syncLoop();
    post({ type: 'time', t: nowMs() / 1000 });
    if (streaming) sendFrame();
  });

  post({ type: 'ready' });
})();
`

/** Keeps text from closing its own <script> tag. In JS source `<\/script` is the same string. */
function escapeScript(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script')
}

export interface SketchDocument {
  html: string
  /** Lines before the user's code, to subtract from error line numbers. */
  lineOffset: number
}

export function buildDocument(p5Source: string, code: string): SketchDocument {
  const head =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<style>html,body{margin:0;overflow:hidden;background:transparent}canvas{display:block}</style>' +
    `</head><body><script>${escapeScript(p5Source)}</script><script>${BRIDGE}</script><script>\n`
  return {
    html: `${head}${escapeScript(code)}\n</script></body></html>`,
    lineOffset: head.split('\n').length - 1,
  }
}
