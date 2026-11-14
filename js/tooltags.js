// ============================================================
// tooltags.js  (build hh, 2026-11-11) — PRINT / REPRINT tool asset tags
// ------------------------------------------------------------
// Generates a printable asset-tag label for a tool: a CODE128 barcode of the tool's asset tag
// (so the r126 camera/USB scanner reads it identically) + the human tag number + "PROPERTY OF"
// branding pulled from company settings.
//
// THE POINT (Joe, 2026-11-11): reprint-the-SAME-number. A tool keeps its asset tag for life; its
// full history is keyed to the internal record, never the sticker. When a sticker is defaced or
// pulled off, you REPRINT the identical number and stick it back on — no reassigning, no burning
// through sequential numbers off a pre-printed roll. Printing always uses the tool's stored tag,
// so a reprint is byte-for-byte the same label.
//
// Multi-tenant: company name / short code / phone come from DB.settings (cname, tagShort, cphone),
// never hardcoded — each licensed company's tags carry their own branding.
//
// The barcode generator (JsBarcode) is lazy-loaded from the CDN on first use and runtime-cached by
// the service worker, so after one online use tags render offline too. Barcodes are rasterized to
// PNG in the app, then embedded as static <img> in the print window — so the print view needs no
// scripts and prints reliably on a label printer (one label per page) or a normal printer.
// ============================================================
(function(){
  'use strict';

  var LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js';

  // Physical label size. Default ~2.25in x 1.0in asset label. Override per company via
  // DB.settings.tagLabelW / tagLabelH (CSS sizes, e.g. "2.25in"), so a tenant can match their stock.
  function _labelW(){ return (window.DB&&DB.settings&&DB.settings.tagLabelW) || '2.25in'; }
  function _labelH(){ return (window.DB&&DB.settings&&DB.settings.tagLabelH) || '1in'; }

  function _esc(s){ return (typeof escHtml==='function') ? escHtml(s==null?'':String(s)) : String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function _toast(m,t){ if(typeof showToast==='function') showToast(m,t||'info',3000); }
  function _sett(k){ return (window.DB&&DB.settings&&DB.settings[k]) || ''; }

  // Branding for the "PROPERTY OF" line. Short code (tagShort) falls back to the full company name.
  function _brandShort(){ return _sett('tagShort') || _sett('cname') || 'Property'; }
  function _brandPhone(){ return _sett('cphone') || ''; }

  function _loadLib(){
    if (window.JsBarcode) return Promise.resolve();
    if (window.__jsbarcodeLoading) return window.__jsbarcodeLoading;
    window.__jsbarcodeLoading = new Promise(function(resolve, reject){
      var s=document.createElement('script'); s.src=LIB_URL; s.async=true;
      s.onload=function(){ resolve(); };
      s.onerror=function(){ window.__jsbarcodeLoading=null; reject(new Error('barcode generator could not load (no signal?)')); };
      document.head.appendChild(s);
    });
    return window.__jsbarcodeLoading;
  }

  // Rasterize a CODE128 barcode of `value` to a PNG data URL (crisp: rendered large, scaled by CSS).
  function _barcodePng(value){
    var canvas=document.createElement('canvas');
    try {
      window.JsBarcode(canvas, String(value), {
        format:'CODE128',
        width:2,            // module width (px) — generous for reliable scanning
        height:70,
        displayValue:true,  // prints the human tag under the bars (matches the existing stickers)
        fontSize:18,
        font:'monospace',
        textMargin:2,
        margin:8,
        background:'#ffffff',
        lineColor:'#000000'
      });
      return canvas.toDataURL('image/png');
    } catch(e){
      return null;   // bad value for CODE128 — caller shows text-only
    }
  }

  // One label's HTML (branding + barcode image). pngOrNull from _barcodePng.
  function _labelHTML(tool, pngOrNull){
    var tag=_esc(tool.tag||tool.id||'');
    var brand=_esc(_brandShort()), phone=_esc(_brandPhone());
    var bc = pngOrNull
      ? '<img class="bc" src="'+pngOrNull+'" alt="'+tag+'">'
      : '<div class="bc-fallback">'+tag+'</div>';   // no barcode (bad value/offline) — tag still prints
    return ''
      + '<div class="tag-label">'
      +   '<div class="brand"><span class="po">PROPERTY OF</span> '+brand+(phone?' &middot; &#9742; '+phone:'')+'</div>'
      +   bc
      + '</div>';
  }

  // Shared print-window writer (mirrors the PO/quote print pattern).
  function _openPrint(bodyHtml, title){
    var W=_labelW(), H=_labelH();
    var html=''
      + '<!doctype html><html><head><meta charset="utf-8"><title>'+_esc(title||'Asset Tags')+'</title><style>'
      + '*{box-sizing:border-box} body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#eceff1}'
      + '.bar{padding:12px 16px;background:#fff;border-bottom:1px solid #ddd}'
      + '.bar button{background:#1565c0;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer}'
      + '.bar button.sec{background:#fff;color:#333;border:1px solid #ccc}'
      + '.sheet{padding:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}'
      + '.tag-label{width:'+W+';height:'+H+';background:#fff;border:1px solid #cfd8dc;border-radius:4px;'
      +   'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 6px;overflow:hidden}'
      + '.tag-label .brand{font-size:8pt;font-weight:700;color:#0d47a1;text-align:center;line-height:1.1;margin-bottom:2px;white-space:nowrap;overflow:hidden;max-width:100%;text-overflow:ellipsis}'
      + '.tag-label .brand .po{color:#37474f;letter-spacing:.5px}'
      + '.tag-label .bc{max-width:100%;max-height:72%;object-fit:contain}'
      + '.tag-label .bc-fallback{font-family:monospace;font-size:16pt;font-weight:700}'
      + '@media screen{.tag-label{box-shadow:0 1px 4px rgba(0,0,0,.15)}}'
      + '@media print{@page{size:'+W+' '+H+';margin:0} body{background:#fff} .bar{display:none!important}'
      +   '.sheet{padding:0;gap:0;display:block} .tag-label{border:none;border-radius:0;page-break-after:always;width:'+W+';height:'+H+'}}'
      + '</style></head><body>'
      + '<div class="bar"><button onclick="window.print()">&#128424; Print</button> '
      +   '<button class="sec" onclick="window.close()">Close</button> '
      +   '<span style="margin-left:12px;color:#607d8b;font-size:12px">Label size '+W+' &times; '+H+' — set your printer to this label stock. One tag per label.</span></div>'
      + '<div class="sheet">'+bodyHtml+'</div>'
      + '</body></html>';
    var win=window.open('','_blank','width=760,height=620');
    if(!win){ _toast('Allow pop-ups to print tags','warning'); return; }
    win.document.write(html); win.document.close();
    setTimeout(function(){ try{ win.focus(); win.print(); }catch(e){} }, 400);
  }

  // Print / reprint ONE tool's tag (the defaced-sticker case).
  window.printToolTag = function printToolTag(toolId){
    if (typeof hasPermission==='function' && !hasPermission('tool.edit')) { _toast('You do not have permission to print tags','error'); return; }
    var tool=(window.DB&&DB.tools||[]).find(function(t){ return t.id==toolId; });
    if(!tool){ _toast('Tool not found','error'); return; }
    if(!(tool.tag||'').trim()){ _toast('This tool has no asset tag to print — add one first (Edit).','warning'); return; }
    _toast('Preparing tag…');
    _loadLib().then(function(){
      var png=_barcodePng(tool.tag);
      _openPrint(_labelHTML(tool, png), 'Tag '+(tool.tag||''));
    }).catch(function(err){ _toast(err.message||'Could not load the barcode generator','error'); });
  };

  // Batch: print tags for every active tool that has a tag (initial labeling / a fresh roll).
  window.printAllToolTags = function printAllToolTags(){
    if (typeof hasPermission==='function' && !hasPermission('tool.edit')) { _toast('You do not have permission to print tags','error'); return; }
    var tools=(window.DB&&DB.tools||[]).filter(function(t){ return (t.tag||'').trim(); });
    if(!tools.length){ _toast('No tools with asset tags to print','warning'); return; }
    _toast('Preparing '+tools.length+' tag'+(tools.length>1?'s':'')+'…');
    _loadLib().then(function(){
      var body=tools.map(function(t){ return _labelHTML(t, _barcodePng(t.tag)); }).join('');
      _openPrint(body, 'Asset Tags ('+tools.length+')');
    }).catch(function(err){ _toast(err.message||'Could not load the barcode generator','error'); });
  };

  // Expose internals for tests.
  window.ProBidTags = { _barcodePng:_barcodePng, _labelHTML:_labelHTML };
})();
