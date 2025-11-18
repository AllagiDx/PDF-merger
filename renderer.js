// renderer.js – loaded with <script type="module">
// Uses libs exposed by preload.js

const { pdfjsDistPath, pdfjsWorkerPath, pdfLibPath } = window.libs;

// Dynamically import pdfjs-dist ESM modules
const pdfjsLib = await import(`file://${pdfjsDistPath}`);

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${pdfjsWorkerPath}`;

// Load pdf-lib from UMD bundle
let PDFLib;
try {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `file://${pdfLibPath}`;
    script.onload = () => {
      PDFLib = window.PDFLib;
      console.log('pdf-lib loaded successfully');
      console.log('PDFDocument.create available:', typeof PDFLib.PDFDocument.create);
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
} catch (err) {
  console.error('Failed to load pdf-lib:', err);
}

// UI elements
const fileElem = document.getElementById('fileElem');
const filesList = document.getElementById('filesList');
const dropArea = document.getElementById('drop-area');
const mergeBtn = document.getElementById('mergeBtn');
const mergeEditBtn = document.getElementById('mergeEditBtn');
const statusEl = document.getElementById('status');
const clearBtn = document.getElementById('clearBtn');
const countEl = document.getElementById('count');
const totalsizeEl = document.getElementById('totalsize');
const dropText = document.getElementById('dropText');
const addBtn = document.getElementById('addBtn');
const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');
const footerText = document.getElementById('footerText');
const langToggle = document.getElementById('langToggle');

const editorOverlay = document.getElementById('editorOverlay');
const pageContainer = document.getElementById('pageContainer');
const pageLabel = document.getElementById('pageLabel');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');

const toolButtons = document.querySelectorAll('.tool');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const doneBtn = document.getElementById('doneBtn');
const closeEditorBtn = document.getElementById('closeEditor');

let files = []; // { id, name, type, size, buffer:ArrayBuffer, thumbUrl }
let currentLang = 'ja'; // default Japanese
let editingPages = []; // array of { baseCanvas, annotCanvas, actions, redo, scale }
let currentPageIndex = 0;
let currentTool = 'pointer';
let strokeColor = '#ff0000';
let strokeWidth = 3;
let highlightColor = 'rgba(255,235,59,0.45)';

// --- Language strings (simple Japanese default + English)
const LANG = {
  ja: {
    add: 'ファイル追加',
    clear: '全削除',
    merge: '結合する(保存のみ)',
    mergeEdit: '結合して編集',
    drag: 'ここにドラッグ&ドロップ または「ファイル追加」',
    status_idle: 'すべてPC内で処理(アップロードなし)',
    status_loading: '読み込み中…',
    status_merging: '結合中…',
    status_exporting: 'エクスポート中…',
    saved: '保存完了:',
    files: (n) => `${n} 個のファイル`,
    footer: 'ドラッグで並び替え、×で削除できます。',
    langBtn: '🇯🇵 日本語',
    remove: '削除',
  },
  en: {
    add: 'Add files',
    clear: 'Clear All',
    merge: 'Merge files (save only)',
    mergeEdit: 'Merge & Edit',
    drag: 'Drag files here or click Add files',
    status_idle: 'All files stay on this PC – no upload.',
    status_loading: 'Processing files...',
    status_merging: 'Merging...',
    status_exporting: 'Exporting...',
    saved: 'Saved:',
    files: (n) => `${n} files`,
    footer: 'Drag to reorder, click × to remove.',
    langBtn: '🇺🇸 English',
    remove: 'Remove',
  },
};

function applyLanguage() {
  const L = LANG[currentLang];
  addBtn.innerText = L.add;
  clearBtn.innerText = L.clear;
  mergeBtn.innerText = L.merge;
  mergeEditBtn.innerText = L.mergeEdit;
  dropText.innerText = L.drag;
  statusEl.innerText = L.status_idle;
  footerText.innerText = L.footer;
  langToggle.innerText = L.langBtn;
  titleEl.innerText = currentLang === 'ja' ? 'PDF結合ツール' : 'PDF Merger';
  subtitleEl.innerText = currentLang === 'ja' ? 'ローカルで高速結合・編集' : 'Local & Fast';
  updateSummary();
}

langToggle.addEventListener('click', () => {
  currentLang = currentLang === 'ja' ? 'en' : 'ja';
  applyLanguage();
});

applyLanguage();

// ---------- file utilities ----------
function humanSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return Math.round(bytes / (1024 * 1024)) + ' MB';
}

function updateSummary() {
  const L = LANG[currentLang];
  countEl.innerText = L.files(files.length);
  const total = files.reduce((s, f) => s + (f.size || 0), 0);
  totalsizeEl.innerText = humanSize(total);
}

// render file cards
function renderFiles() {
  filesList.innerHTML = '';
  files.forEach((f, idx) => {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.draggable = true;

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (f.thumbUrl) {
      const img = document.createElement('img');
      img.src = f.thumbUrl;
      thumb.appendChild(img);
    } else {
      const s = document.createElement('div');
      s.style.fontSize = '22px';
      s.innerText = '📄';
      thumb.appendChild(s);
    }

    const meta = document.createElement('div');
    meta.className = 'file-meta';
    const nameEl = document.createElement('div');
    nameEl.className = 'fname';
    nameEl.innerText = f.name;
    const infoEl = document.createElement('div');
    infoEl.className = 'fmeta';
    infoEl.innerText = `${f.type} • ${humanSize(f.size)}`;
    meta.appendChild(nameEl);
    meta.appendChild(infoEl);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerText = '×';
    removeBtn.title = LANG[currentLang].remove;
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      URL.revokeObjectURL(f.thumbUrl || '');
      files.splice(idx, 1);
      renderFiles();
      updateSummary();
    };

    // drag handlers for reorder
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(idx));
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (e) => e.preventDefault());
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const src = Number(e.dataTransfer.getData('text/plain'));
      const dest = idx;
      if (!isNaN(src) && src !== dest) {
        const moved = files.splice(src, 1)[0];
        files.splice(dest, 0, moved);
        renderFiles();
        updateSummary();
      }
    });

    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(removeBtn);
    filesList.appendChild(card);
  });
}

// -------- image downscale & read --------
const MAX_IMAGE_WIDTH = 1600;
const JPEG_QUALITY = 0.8;

async function resizeImageFileToJpegArrayBuffer(file, maxWidth = MAX_IMAGE_WIDTH, quality = JPEG_QUALITY) {
  try {
    const imageBitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxWidth / imageBitmap.width);
    const tw = Math.round(imageBitmap.width * ratio);
    const th = Math.round(imageBitmap.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0, tw, th);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return await blob.arrayBuffer();
  } catch (e) {
    console.error('Image resize error:', e);
    return await file.arrayBuffer();
  }
}

async function handleFileList(fileList) {
  statusEl.innerText = LANG[currentLang].status_loading;
  const inputFiles = Array.from(fileList);
  for (const file of inputFiles) {
    if (!/\.(pdf|png|jpe?g|jpg)$/i.test(file.name)) continue;
    const lower = file.name.toLowerCase();
    if (/\.(png|jpe?g|jpg)$/i.test(lower)) {
      const ab = await resizeImageFileToJpegArrayBuffer(file);
      files.push({
        id: Math.random().toString(36).slice(2, 9),
        name: file.name,
        type: 'image/jpeg',
        size: ab.byteLength,
        buffer: ab,
        thumbUrl: URL.createObjectURL(file),
      });
    } else if (/\.(pdf)$/i.test(lower)) {
      const ab = await file.arrayBuffer();
      files.push({
        id: Math.random().toString(36).slice(2, 9),
        name: file.name,
        type: 'application/pdf',
        size: ab.byteLength,
        buffer: ab,
        thumbUrl: null,
      });
    }
  }
  renderFiles();
  updateSummary();
  statusEl.innerText = LANG[currentLang].status_idle;
}

fileElem.addEventListener('change', async (e) => {
  await handleFileList(e.target.files);
  fileElem.value = null;
});

// drag-drop area
['dragenter', 'dragover'].forEach((evt) =>
  dropArea.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.add('drag-over');
  })
);

['dragleave', 'drop'].forEach((evt) =>
  dropArea.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.remove('drag-over');
  })
);

dropArea.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
    await handleFileList(e.dataTransfer.files);
  }
});

// clear
clearBtn.addEventListener('click', () => {
  files.forEach((f) => {
    if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
  });
  files = [];
  renderFiles();
  updateSummary();
});

// ---------- Merge-only (save) ----------
mergeBtn.addEventListener('click', async () => {
  if (files.length < 1) {
    statusEl.innerText = LANG[currentLang].status_idle;
    return;
  }
  statusEl.innerText = LANG[currentLang].status_merging;
  mergeBtn.disabled = true;
  try {
    const toSend = files.map((f) => ({ name: f.name, type: f.type, buffer: f.buffer }));
    const res = await window.electronAPI.mergeFiles(toSend);
    if (!res.success) throw new Error(res.message || 'merge failed');
    const bytes = Uint8Array.from(res.bytes);
    const saveRes = await window.electronAPI.saveBytes('merged.pdf', bytes);
    if (saveRes.success) statusEl.innerText = `${LANG[currentLang].saved} ${saveRes.path}`;
    else statusEl.innerText = 'Save canceled';
  } catch (err) {
    console.error(err);
    statusEl.innerText = 'Error: ' + (err.message || String(err));
  } finally {
    mergeBtn.disabled = false;
  }
});

// ---------- Merge & Edit workflow ----------
mergeEditBtn.addEventListener('click', async () => {
  if (files.length < 1) {
    statusEl.innerText = LANG[currentLang].status_idle;
    return;
  }
  statusEl.innerText = LANG[currentLang].status_merging;
  try {
    const toSend = files.map((f) => ({ name: f.name, type: f.type, buffer: f.buffer }));
    const res = await window.electronAPI.mergeFiles(toSend);
    if (!res.success) throw new Error(res.message || 'merge failed');
    const mergedBytes = Uint8Array.from(res.bytes);
    await openEditorWithPdf(mergedBytes);
  } catch (err) {
    console.error(err);
    statusEl.innerText = 'Error: ' + (err.message || String(err));
  } finally {
    statusEl.innerText = LANG[currentLang].status_idle;
  }
});

// ---------- Editor: render merged PDF pages ----------
async function openEditorWithPdf(pdfBytesUint8) {
  editingPages = [];
  pageContainer.innerHTML = '';
  editorOverlay.classList.remove('hidden');

  const loadingTask = pdfjsLib.getDocument({ data: pdfBytesUint8 });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.className = 'base-canvas';
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    const annot = document.createElement('canvas');
    annot.className = 'annot-canvas';
    annot.width = canvas.width;
    annot.height = canvas.height;

    const wrap = document.createElement('div');
    wrap.className = 'page-wrap';
    wrap.style.margin = '12px';
    wrap.appendChild(canvas);
    wrap.style.position = 'relative';
    annot.style.position = 'absolute';
    annot.style.left = '10px';
    annot.style.top = '10px';
    annot.style.pointerEvents = 'auto';
    wrap.appendChild(annot);

    pageContainer.appendChild(wrap);

    const pageObj = {
      baseCanvas: canvas,
      annotCanvas: annot,
      actions: [],
      redo: [],
      scale: 1.5,
    };

    editingPages.push(pageObj);
    initAnnotCanvas(annot, pageObj);
  }

  currentPageIndex = 0;
  showPage(currentPageIndex);
  updatePageLabel();
}

function showPage(index) {
  const wraps = Array.from(document.querySelectorAll('.page-wrap'));
  wraps.forEach((w, i) => {
    w.style.display = i === index ? 'block' : 'none';
  });
}

function updatePageLabel() {
  pageLabel.innerText = `${currentPageIndex + 1} / ${editingPages.length}`;
}

prevPageBtn && prevPageBtn.addEventListener('click', () => {
  if (currentPageIndex > 0) {
    currentPageIndex--;
    showPage(currentPageIndex);
    updatePageLabel();
  }
});

nextPageBtn && nextPageBtn.addEventListener('click', () => {
  if (currentPageIndex < editingPages.length - 1) {
    currentPageIndex++;
    showPage(currentPageIndex);
    updatePageLabel();
  }
});

// ---------- annotation engine ----------
function initAnnotCanvas(canvas, pageObj) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let startX = 0, startY = 0;
  let currentPath = null;

  function pushAction(action) {
    pageObj.actions.push(action);
    pageObj.redo = [];
  }

  function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const a of pageObj.actions) {
      drawAction(ctx, a);
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    drawing = true;
    startX = x;
    startY = y;

    if (currentTool === 'pen') {
      currentPath = { type: 'pen', color: strokeColor, width: strokeWidth, points: [{ x, y }] };
    } else if (currentTool === 'rect' || currentTool === 'highlight' || currentTool === 'arrow') {
      currentPath = {
        type: currentTool,
        color: currentTool === 'highlight' ? highlightColor : strokeColor,
        width: strokeWidth,
        x1: x, y1: y, x2: x, y2: y,
      };
    } else if (currentTool === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = currentLang === 'ja' ? 'テキスト' : 'Text';
      input.style.position = 'absolute';
      input.style.left = (canvas.offsetLeft + x) + 'px';
      input.style.top = (canvas.offsetTop + y) + 'px';
      input.style.zIndex = 9999;
      input.style.fontSize = '16px';
      input.style.padding = '4px 8px';
      input.style.border = '2px solid #0b5fff';
      input.style.borderRadius = '4px';
      input.onkeydown = (ev) => {
        if (ev.key === 'Enter') {
          const val = input.value.trim();
          if (val) {
            const textAction = { type: 'text', text: val, x, y, color: strokeColor, size: 16 };
            pushAction(textAction);
            redrawAll();
          }
          input.remove();
        } else if (ev.key === 'Escape') {
          input.remove();
        }
      };
      canvas.parentElement.appendChild(input);
      input.focus();
      drawing = false;
      currentPath = null;
    } else {
      drawing = false;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drawing || !currentPath) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    if (currentPath.type === 'pen') {
      currentPath.points.push({ x, y });
    } else {
      currentPath.x2 = x;
      currentPath.y2 = y;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const a of pageObj.actions) drawAction(ctx, a);
    drawAction(ctx, currentPath);
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!drawing) return;
    drawing = false;
    if (currentPath) {
      pushAction(currentPath);
      currentPath = null;
      redrawAll();
    }
  });

  canvas._redrawAll = redrawAll;
  canvas._pushAction = pushAction;
}

function drawAction(ctx, a) {
  if (!a) return;

  ctx.save();

  if (a.type === 'pen') {
    ctx.beginPath();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = a.color || '#ff0000';
    ctx.lineWidth = a.width || 3;
    ctx.globalAlpha = 1.0;
    ctx.setLineDash([]);
    const pts = a.points;
    if (pts && pts.length) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  } else if (a.type === 'rect') {
    ctx.beginPath();
    ctx.lineWidth = a.width || 3;
    ctx.strokeStyle = a.color || '#ff0000';
    ctx.globalAlpha = 1.0;
    ctx.setLineDash([]);
    const w = a.x2 - a.x1;
    const h = a.y2 - a.y1;
    ctx.strokeRect(a.x1, a.y1, w, h);
  } else if (a.type === 'highlight') {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = a.color || 'yellow';
    const w = a.x2 - a.x1;
    const h = a.y2 - a.y1;
    ctx.fillRect(a.x1, a.y1, w, h);
  } else if (a.type === 'arrow') {
    const x1 = a.x1, y1 = a.y1, x2 = a.x2, y2 = a.y2;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.strokeStyle = a.color || '#ff0000';
    ctx.lineWidth = a.width || 3;
    ctx.globalAlpha = 1.0;
    ctx.setLineDash([]);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const headlen = 15;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headlen * Math.cos(ang - Math.PI / 6), y2 - headlen * Math.sin(ang - Math.PI / 6));
    ctx.lineTo(x2 - headlen * Math.cos(ang + Math.PI / 6), y2 - headlen * Math.sin(ang + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = a.color || '#ff0000';
    ctx.fill();
  } else if (a.type === 'text') {
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = a.color || '#000';
    ctx.font = `bold ${a.size || 16}px sans-serif`;
    ctx.fillText(a.text, a.x, a.y);
  }

  ctx.restore();
}

toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const t = btn.getAttribute('data-tool');
    if (t) {
      currentTool = t;
    }
    toolButtons.forEach((b) => {
      b.style.background = 'transparent';
      b.style.fontWeight = 'normal';
      b.style.border = '1px solid rgba(0,0,0,0.06)';
    });
    btn.style.background = '#e6f0ff';
    btn.style.fontWeight = 'bold';
    btn.style.border = '2px solid #0b5fff';
  });
});

undoBtn && undoBtn.addEventListener('click', () => {
  const page = editingPages[currentPageIndex];
  if (!page) return;
  if (page.actions.length === 0) return;
  const a = page.actions.pop();
  page.redo.push(a);
  page.annotCanvas._redrawAll();
});

redoBtn && redoBtn.addEventListener('click', () => {
  const page = editingPages[currentPageIndex];
  if (!page) return;
  if (page.redo.length === 0) return;
  const a = page.redo.pop();
  page.actions.push(a);
  page.annotCanvas._redrawAll();
});

closeEditorBtn && closeEditorBtn.addEventListener('click', () => {
  editorOverlay.classList.add('hidden');
  pageContainer.innerHTML = '';
  editingPages = [];
});

// ---------- Flatten and export edited PDF ----------
async function exportEditedPdfAndSave() {
  try {
    statusEl.innerText = LANG[currentLang].status_exporting;

    // Use the globally loaded PDFLib
    const outPdf = await PDFLib.PDFDocument.create();

    for (let i = 0; i < editingPages.length; i++) {
      const pageObj = editingPages[i];
      const base = pageObj.baseCanvas;

      // Create offscreen canvas to merge base + annotations
      const offscreen = document.createElement('canvas');
      offscreen.width = base.width;
      offscreen.height = base.height;
      const offCtx = offscreen.getContext('2d', { alpha: false });

      // Fill white background first
      offCtx.fillStyle = '#ffffff';
      offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

      // Draw base PDF page
      offCtx.drawImage(base, 0, 0);

      // Draw all annotations
      for (const action of pageObj.actions) {
        drawAction(offCtx, action);
      }

      // Convert to PNG
      const dataUrl = offscreen.toDataURL('image/png');
      const binary = atob(dataUrl.split(',')[1]);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let j = 0; j < len; j++) bytes[j] = binary.charCodeAt(j);

      // Embed in PDF
      const img = await outPdf.embedPng(bytes);
      const { width, height } = img.scale(1);
      outPdf.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
    }

    const finalBytes = await outPdf.save();
    const saveRes = await window.electronAPI.saveBytes('edited.pdf', finalBytes);
    if (saveRes.success) {
      statusEl.innerText = LANG[currentLang].saved + ' ' + saveRes.path;
      editorOverlay.classList.add('hidden');
    } else {
      statusEl.innerText = 'Save canceled';
    }
  } catch (err) {
    console.error('Export error', err);
    statusEl.innerText = 'Export error: ' + (err.message || String(err));
  } finally {
    setTimeout(() => {
      statusEl.innerText = LANG[currentLang].status_idle;
    }, 2000);
  }
}

doneBtn && doneBtn.addEventListener('click', exportEditedPdfAndSave);

// initial render
renderFiles();
updateSummary();
