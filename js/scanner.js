// ============================================================
// scanner.js  (build hg, 2026-11-11) — ONE shared camera barcode/QR scanner
// ------------------------------------------------------------
// The single camera-scanning subsystem for the whole app (Tools, Inventory, and any
// future module). Per the "one subsystem, never duplicate per feature" rule, every page
// that needs to scan a tag with a phone/tablet camera calls window.ProBidScan.open({onCode}).
//
// Cross-fleet by design (TCSS runs mixed iPhone + Android):
//   • Android / Chrome  → the fast native BarcodeDetector (via html5-qrcode's experimental flag)
//   • iPhone / iPad Safari → html5-qrcode's bundled ZXing (WASM) decoder — Safari has NO
//     BarcodeDetector, which is why the old Android-only paths silently did nothing on iOS.
// Formats include CODE_128 (the TCSS "TCSS -001" asset stickers), plus QR / UPC / EAN so the
// same scanner serves inventory product barcodes too.
//
// USB / Bluetooth scanners do NOT use this file — they act as a keyboard and type straight into
// each page's scan input (already working on PC and on a scanner paired to a phone/tablet). This
// is the CAMERA path only.
//
// The decoder library is lazy-loaded from the CDN on first use and then runtime-cached by the
// service worker, so after one online use the camera scanner also works offline in the field.
// ============================================================
(function(){
  'use strict';

  var LIB_URL = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
  var OVERLAY_ID = 'probid-scan-overlay';
  var READER_ID  = 'probid-scan-reader';
  var _h5 = null;          // active Html5Qrcode instance
  var _onCode = null;

  function _loadLib(){
    if (window.Html5Qrcode) return Promise.resolve();
    if (window.__h5qrLoading) return window.__h5qrLoading;
    window.__h5qrLoading = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = LIB_URL; s.async = true;
      s.onload = function(){ resolve(); };
      s.onerror = function(){ window.__h5qrLoading = null; reject(new Error('scanner library could not load (no signal?)')); };
      document.head.appendChild(s);
    });
    return window.__h5qrLoading;
  }

  function _status(msg){ var s = document.getElementById('probid-scan-status'); if (s) s.textContent = msg; }

  function _overlay(){
    var o = document.getElementById(OVERLAY_ID);
    if (!o){
      o = document.createElement('div');
      o.id = OVERLAY_ID;
      o.style.cssText = 'position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,.92);display:none;'
        + 'flex-direction:column;align-items:center;justify-content:center;padding:16px;'
        + 'padding-bottom:calc(16px + env(safe-area-inset-bottom))';
      o.innerHTML = ''
        + '<div id="probid-scan-title" style="color:#fff;font-weight:700;font-size:15px;margin-bottom:10px">📷 Scan barcode</div>'
        + '<div id="' + READER_ID + '" style="width:min(92vw,420px);border-radius:12px;overflow:hidden;background:#000"></div>'
        + '<div id="probid-scan-status" style="color:#cfd8dc;font-size:12px;margin-top:10px;text-align:center;min-height:16px;max-width:92vw">Point the camera at the tag…</div>'
        + '<button id="probid-scan-close" style="margin-top:14px;background:#fff;border:none;border-radius:8px;padding:10px 22px;font-weight:700;font-size:14px;cursor:pointer">Cancel</button>';
      document.body.appendChild(o);
      o.querySelector('#probid-scan-close').addEventListener('click', function(){ ProBidScan.stop(); });
    }
    return o;
  }

  var ProBidScan = {
    // open({ title, onCode }) — open the camera overlay; call onCode(decodedText) on the first read.
    open: function(opts){
      opts = opts || {};
      _onCode = (typeof opts.onCode === 'function') ? opts.onCode : function(){};
      var ov = _overlay();
      ov.style.display = 'flex';
      var t = document.getElementById('probid-scan-title');
      if (t && opts.title) t.textContent = opts.title;
      _status('Starting camera…');

      _loadLib().then(function(){
        var Fmt = window.Html5QrcodeSupportedFormats || {};
        var formats = [Fmt.CODE_128, Fmt.CODE_39, Fmt.CODE_93, Fmt.EAN_13, Fmt.EAN_8, Fmt.UPC_A, Fmt.UPC_E, Fmt.ITF, Fmt.QR_CODE]
          .filter(function(x){ return x != null; });
        try {
          _h5 = new window.Html5Qrcode(READER_ID, {
            formatsToSupport: formats,
            verbose: false,
            experimentalFeatures: { useBarCodeDetectorIfSupported: true }   // native fast-path on Android
          });
        } catch(e){
          _status('Scanner could not start. Use the USB scanner or type the tag.');
          return;
        }
        var config = {
          fps: 10,
          qrbox: function(vw, vh){
            // wide window — 1D barcodes (Code128) are long and short
            var w = Math.round(Math.min(vw * 0.88, 340));
            var h = Math.round(Math.min(vh * 0.55, 180));
            return { width: w, height: h };
          },
          aspectRatio: 1.3333,
          rememberLastUsedCamera: true
        };
        _h5.start(
          { facingMode: 'environment' },
          config,
          function onSuccess(decodedText){
            var val = (decodedText || '').trim();
            if (!val) return;
            var cb = _onCode;
            ProBidScan.stop();
            try { cb(val); } catch(e){}
          },
          function onScanFailure(){ /* per-frame no-read — ignore, keep scanning */ }
        ).then(function(){
          _status('Point the camera at the tag — it scans automatically.');
        }).catch(function(err){
          _status('Camera unavailable — use the USB scanner or type the tag. (' + (err && err.message || err) + ')');
        });
      }).catch(function(err){
        _status((err && err.message) || 'Scanner could not start. Use the USB scanner or type the tag.');
      });
    },

    // stop() — stop the camera and hide the overlay. Safe to call anytime.
    stop: function(){
      var ov = document.getElementById(OVERLAY_ID);
      function hide(){ if (ov) ov.style.display = 'none'; }
      if (_h5){
        var inst = _h5; _h5 = null;
        try {
          inst.stop().then(function(){ try { inst.clear(); } catch(e){} hide(); })
                     .catch(function(){ try { inst.clear(); } catch(e){} hide(); });
        } catch(e){ hide(); }
      } else {
        hide();
      }
    },

    // isOpen() — true while the camera overlay is showing.
    isOpen: function(){
      var ov = document.getElementById(OVERLAY_ID);
      return !!(ov && ov.style.display !== 'none');
    }
  };

  window.ProBidScan = ProBidScan;
})();
