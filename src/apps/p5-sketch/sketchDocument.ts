/** Runs inside the sandboxed iframe, after p5 and before the user's code. The iframe has an opaque origin, so
 *  it can't be reached from the page; everything crosses by postMessage:
 *    out: ready, size, frame (an ImageBitmap, only while streaming), picked, error, log
 *    in:  stream { on }, params, pick { x, y, id } */
const BRIDGE = `
(function () {
  var streaming = false;
  var pending = false;
  var lastW = 0;
  var lastH = 0;

  function post(message, transfer) { parent.postMessage(message, '*', transfer || []); }

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
    } else if (data.type === 'params') {
      // GUI sketches read their numbers from a global P, so dials change them without a restart.
      window.P = data.params;
    } else if (data.type === 'pick') {
      // GUI sketches record where each shape was drawn in HITS; the last hit is the one on top.
      var hits = window.HITS || [];
      var found = -1;
      for (var j = hits.length - 1; j >= 0; j--) {
        var dx = data.x - hits[j].x;
        var dy = data.y - hits[j].y;
        if (dx * dx + dy * dy <= hits[j].r * hits[j].r) { found = hits[j].k; break; }
      }
      post({ type: 'picked', id: data.id, shape: found });
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
