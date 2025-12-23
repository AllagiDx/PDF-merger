// features/pdf-split/feature.js
// PDF Split Feature - Restructured to match PDF Rotate UX

import * as utils from "../../core/utils.js";
import eventBus from "../../core/event-bus.js";

// Load pdf.js from the main app's libs
const pdfjsLib =
  window.pdfjsLib || (await import(`file://${window.libs.pdfjsDistPath}`));
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${window.libs.pdfjsWorkerPath}`;
}

// ==================== CONSTANTS ====================
const CANVAS_SCALE = 2.0;
const THUMBNAIL_MAX_WIDTH = 350;
const THUMBNAIL_MAX_HEIGHT = 495;

// ==================== STATE ====================
let state = {
  container: null,
  currentLang: "ja",
  pdfFile: null,
  pdfDoc: null,
  pdfBytes: null,
  totalPages: 0,
  splitMode: "custom",
  splitResults: [],
  renderedPages: [],
  customRanges: [],
  fixedRange: { pagesPerSplit: 4 },
  includeRemainingPages: false,
  originalPdfForSplit: null,
  processing: false,
};

// ==================== LANGUAGE TRANSLATIONS ====================
const LANG = {
  ja: {
    back: "戻る",
    uploadTitle: "PDF分割",
    uploadPrompt: "PDFファイルをドラッグ&ドロップ",
    uploadSubtext: "または",
    selectBtn: "ファイルを選択",
    uploadHint: "1つのPDFファイルを選択",
    splitTitle: "PDF分割",
    addMore: "別のPDF",
    resetAll: "リセット",
    totalPages: "総ページ数:",
    fileSize: "ファイルサイズ:",
    modeTitle: "分割モード",
    customMode: "カスタム範囲",
    fixedMode: "固定範囲",
    from: "開始",
    to: "終了",
    addRange: "範囲を追加",
    customHelp: "複数の範囲を追加できます。重複しない範囲を指定してください。",
    pagesPerSplit: "ページ数ごとに分割",
    fixedHelp: "指定したページ数ごとにファイルを分割します",
    previewTitle: "分割プレビュー",
    saveSplit: "分割したPDFを保存",
    loadingFiles: "ファイルを読み込み中...",
    loadingPdf: "PDFを読み込み中...",
    renderingPages: "ページをレンダリング中...",
    splitting: "PDF分割中...",
    saving: "ファイルを保存中...",
    successTitle: "保存完了!",
    successMessage: "PDFファイルが分割・保存されました",
    splitMore: "もっと分割",
    goHome: "ホームに戻る",
    errorInvalidPdf: "無効なPDFファイルです",
    errorLoading: "PDFの読み込みに失敗しました",
    errorSplitting: "分割に失敗しました",
    errorSaving: "保存に失敗しました",
    fileSelected: "ファイルが選択されました",
    pdfLoaded: "PDF読み込み完了",
    splitPrepared: "PDF分割準備完了",
    file: "ファイル",
    page: "ページ",
    pages: "ページ",
    remainingPages: "残りのページ",
    remainingPagesQuestion:
      "指定した範囲に含まれないページがあります。これらのページを保存しますか?",
    dontSave: "保存しない",
    saveThem: "保存する",
    aboutRemaining: "残りのページについて",
    chooseRemaining: "分割時に選択できます",
  },
  en: {
    back: "Back",
    uploadTitle: "PDF Split",
    uploadPrompt: "Drag & drop PDF file",
    uploadSubtext: "or",
    selectBtn: "Select File",
    uploadHint: "Select a single PDF file",
    splitTitle: "PDF Split",
    addMore: "Another PDF",
    resetAll: "Reset",
    totalPages: "Total Pages:",
    fileSize: "File Size:",
    modeTitle: "Split Mode",
    customMode: "Custom Range",
    fixedMode: "Fixed Range",
    from: "From",
    to: "To",
    addRange: "Add Range",
    customHelp: "You can add multiple ranges. Ensure ranges don't overlap.",
    pagesPerSplit: "Pages per Split",
    fixedHelp: "Split into files with specified page count",
    previewTitle: "Split Preview",
    saveSplit: "Save Split PDFs",
    loadingFiles: "Loading files...",
    loadingPdf: "Loading PDF...",
    renderingPages: "Rendering pages...",
    splitting: "Splitting PDF...",
    saving: "Saving files...",
    successTitle: "Save Complete!",
    successMessage: "PDF files have been split and saved",
    splitMore: "Split More",
    goHome: "Go Home",
    errorInvalidPdf: "Invalid PDF file",
    errorLoading: "Failed to load PDF",
    errorSplitting: "Failed to split",
    errorSaving: "Failed to save",
    fileSelected: "File selected",
    pdfLoaded: "PDF loaded successfully",
    splitPrepared: "Split prepared",
    file: "File",
    page: "Page",
    pages: "pages",
    remainingPages: "Remaining Pages",
    remainingPagesQuestion:
      "There are pages not included in your selected ranges. Would you like to save these pages?",
    dontSave: "Don't Save",
    saveThem: "Save Them",
    aboutRemaining: "About Remaining Pages",
    chooseRemaining: "You can choose during split",
  },
};

// ==================== INITIALIZATION ====================

/**
 * Initialize the PDF Split feature
 */
export async function init(container, params = {}) {
  console.log("🚀 Initializing PDF Split feature", params);

  state.container = container;
  state.currentLang = params.lang || "ja";

  // Reset state
  state.pdfFile = null;
  state.pdfDoc = null;
  state.pdfBytes = null;
  state.totalPages = 0;
  state.splitMode = "custom";
  state.splitResults = [];
  state.renderedPages = [];
  state.customRanges = [];
  state.fixedRange = { pagesPerSplit: 4 };
  state.includeRemainingPages = false;
  state.originalPdfForSplit = null;
  state.processing = false;

  // Setup event listeners
  setupEventListeners();

  // Apply language
  applyLanguage();

  // Listen for language changes
  eventBus.on(
    "language-changed",
    (lang) => {
      state.currentLang = lang;
      applyLanguage();
    },
    "pdf-split"
  );

  // Ensure we start on upload stage
  showUploadStage();

  console.log("✅ PDF Split feature initialized");
  return state;
}

/**
 * Cleanup when feature is deactivated
 */
export async function cleanup(instance) {
  console.log("🧹 Cleaning up PDF Split feature");

  try {
    // Revoke object URLs
    if (state.pdfFile) {
      URL.revokeObjectURL(state.pdfFile);
    }

    // Cleanup PDF document
    if (state.pdfDoc) {
      try {
        await state.pdfDoc.cleanup();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    // Clear rendered canvases
    state.renderedPages.forEach(({ element }) => {
      const canvas = element?.querySelector("canvas");
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    });

    // Clear event listeners
    eventBus.off("language-changed");

    // Clear state
    state.pdfDoc = null;
    state.pdfBytes = null;
    state.splitResults = [];
    state.renderedPages = [];
    state.pdfFile = null;
    state.totalPages = 0;
    state.originalPdfForSplit = null;

    console.log("✅ PDF Split cleanup complete");
  } catch (error) {
    console.error("❌ Cleanup error:", error);
  }
}

// ==================== UI FUNCTIONS ====================

/**
 * Apply language to all UI elements
 */
function applyLanguage() {
  const L = LANG[state.currentLang];

  const elements = {
    backText: L.back,
    uploadTitle: L.uploadTitle,
    uploadPrompt: L.uploadPrompt,
    uploadSubtext: L.uploadSubtext,
    selectBtnText: L.selectBtn,
    uploadHint: L.uploadHint,
    backSplitText: L.back,
    splitTitle: L.splitTitle,
    addMoreText: L.addMore,
    resetAllText: L.resetAll,
    infoLabel: L.totalPages,
    sizeLabel: L.fileSize,
    modeTitle: L.modeTitle,
    customModeText: L.customMode,
    fixedModeText: L.fixedMode,
    addRangeText: L.addRange,
    customHelpText: L.customHelp,
    pagesPerSplitLabel: L.pagesPerSplit,
    fixedHelpText: L.fixedHelp,
    previewTitle: L.previewTitle,
    saveSplitText: L.saveSplit,
    successTitle: L.successTitle,
    successMessage: L.successMessage,
    splitMoreText: L.splitMore,
    goHomeText: L.goHome,
  };

  Object.entries(elements).forEach(([id, text]) => {
    const el = state.container.querySelector(`#${id}`);
    if (el) el.textContent = text;
  });
}

function showUploadStage() {
  const uploadStage = state.container.querySelector("#uploadStage");
  const splitStage = state.container.querySelector("#splitStage");

  if (uploadStage) uploadStage.classList.add("active");
  if (splitStage) splitStage.classList.remove("active");
}

function showSplitStage() {
  const uploadStage = state.container.querySelector("#uploadStage");
  const splitStage = state.container.querySelector("#splitStage");

  if (uploadStage) uploadStage.classList.remove("active");
  if (splitStage) splitStage.classList.add("active");
}

/**
 * Show success modal
 */
function showSuccessModal(path) {
  const modal = state.container.querySelector("#successModal");
  const pathEl = state.container.querySelector("#successPath");

  if (!modal) {
    console.error("❌ Success modal element not found!");
    return;
  }

  console.log(`🎉 [SHOW SUCCESS MODAL] Path: ${path}`);

  if (pathEl && path) {
    pathEl.textContent = path;
  }

  modal.classList.add("active");
}

/**
 * Hide success modal
 */
function hideSuccessModal() {
  const modal = state.container.querySelector("#successModal");
  if (!modal) {
    console.warn("⚠️ Success modal not found when trying to hide");
    return;
  }

  console.log("🔄 [HIDE SUCCESS MODAL]");
  modal.classList.remove("active");
}

/**
 * Render PDF grid preview
 */
function renderPdfGrid() {
  const grid = state.container.querySelector("#pdfGrid");
  if (!grid) return;

  grid.innerHTML = "";

  if (state.totalPages === 0) {
    grid.innerHTML = `
      <div style="padding: 60px 40px; text-align: center; color: #6b7280; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
        <div style="font-size: 64px; margin-bottom: 20px;">📄</div>
        <h3 style="margin: 0 0 12px 0; font-size: 22px; color: #2c2c2c; font-weight: 600;">
          ${
            state.currentLang === "ja"
              ? "PDFを読み込んでください"
              : "Please load a PDF"
          }
        </h3>
      </div>
    `;
    return;
  }

  // Show page count for large PDFs
  if (state.totalPages > 50) {
    grid.innerHTML = `
      <div style="padding: 60px 40px; text-align: center; color: #6b7280; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); max-width: 500px; margin: 0 auto;">
        <div style="font-size: 64px; margin-bottom: 20px;">📄</div>
        <h3 style="margin: 0 0 12px 0; font-size: 22px; color: #2c2c2c; font-weight: 600;">
          ${
            state.currentLang === "ja"
              ? "PDF読み込み完了"
              : "PDF Loaded Successfully"
          }
        </h3>
        <div style="display: inline-block; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 24px; margin: 16px 0;">
          <p style="margin: 0; font-size: 18px; color: #166534; font-weight: 600;">
            ${state.totalPages} ${
      state.currentLang === "ja" ? "ページ" : "pages"
    }
          </p>
        </div>
        <p style="margin: 20px 0 0 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
          ${
            state.currentLang === "ja"
              ? "ページプレビューは表示されませんが、<br>分割設定は正常に機能します。<br><br>下の設定パネルで分割方法を選択してください。"
              : "Page previews are hidden for performance,<br>but split functionality works normally.<br><br>Configure split settings in the panel below."
          }
        </p>
      </div>
    `;
    grid.style.gridTemplateColumns = "1fr";
    grid.style.placeItems = "center";
  } else {
    // Render thumbnails for smaller PDFs
    grid.style.gridTemplateColumns = "";
    grid.style.placeItems = "";

    state.renderedPages.forEach(({ element }) => {
      if (element) {
        grid.appendChild(element);
      }
    });
  }

  console.log(`🎨 Rendered PDF grid with ${state.totalPages} pages`);
}

/**
 * Update split preview
 */
function updateSplitPreview() {
  const previewContent = state.container.querySelector("#previewContent");
  const previewStats = state.container.querySelector("#previewStats");
  const totalFilesInfo = state.container.querySelector("#totalFilesInfo");
  const totalSplitPagesInfo = state.container.querySelector(
    "#totalSplitPagesInfo"
  );

  if (!previewContent) return;

  const L = LANG[state.currentLang];

  if (state.splitMode === "custom") {
    const ranges = getCustomRanges();

    if (ranges.length === 0) {
      previewContent.className = "preview-grid empty";
      previewContent.innerHTML = `
        <div class="preview-empty">
          <div class="preview-empty-icon">📋</div>
          <div class="preview-empty-text">
            ${L.addRange}
          </div>
        </div>
      `;
      if (totalFilesInfo) totalFilesInfo.textContent = `0 ${L.file}`;
      if (totalSplitPagesInfo) totalSplitPagesInfo.textContent = `0 ${L.pages}`;
      return;
    }

    const validation = validateRanges(ranges);

    if (!validation.valid) {
      previewContent.className = "preview-grid empty";
      previewContent.innerHTML = `
        <div class="preview-empty">
          <div class="preview-empty-icon">⚠️</div>
          <div class="preview-empty-text" style="color: #ff5c5c; font-weight: 600;">
            ${validation.error}
          </div>
        </div>
      `;
      return;
    }

    const remainingPages = getRemainingPages(ranges);
    const totalPages = ranges.reduce((sum, r) => sum + (r.to - r.from + 1), 0);
    const totalFiles = ranges.length + (remainingPages.length > 0 ? 1 : 0);

    previewContent.className = "preview-grid";
    previewContent.innerHTML =
      ranges
        .map((range, i) => {
          const pageCount = range.to - range.from + 1;
          return `
          <div class="preview-item">
            <div class="preview-item-header">
              <div class="preview-item-title">
                ${L.file} ${i + 1}
              </div>
              <div class="preview-item-badge">${pageCount} ${L.pages}</div>
            </div>
            <div class="preview-item-details">
              <strong>${L.page}:</strong> ${range.from} - ${range.to}
            </div>
          </div>
        `;
        })
        .join("") +
      (remainingPages.length > 0
        ? `
        <div class="preview-item remaining">
          <div class="preview-item-header">
            <div class="preview-item-title">
              ${L.remainingPages}
            </div>
            <div class="preview-item-badge">${remainingPages.length} ${L.pages}</div>
          </div>
          <div class="preview-item-details">
            ${L.chooseRemaining}
          </div>
        </div>
      `
        : "");

    if (totalFilesInfo)
      totalFilesInfo.textContent = `${totalFiles} ${L.file}${
        totalFiles > 1 ? "s" : ""
      }`;
    if (totalSplitPagesInfo)
      totalSplitPagesInfo.textContent = `${
        totalPages + remainingPages.length
      } ${L.pages}`;
  } else {
    // Fixed mode
    const pagesPerSplit = state.fixedRange.pagesPerSplit;

    if (pagesPerSplit < 1 || state.totalPages === 0) {
      previewContent.className = "preview-grid empty";
      previewContent.innerHTML = `
        <div class="preview-empty">
          <div class="preview-empty-icon">📋</div>
          <div class="preview-empty-text">
            ${L.fixedHelp}
          </div>
        </div>
      `;
      if (totalFilesInfo) totalFilesInfo.textContent = `0 ${L.file}`;
      if (totalSplitPagesInfo) totalSplitPagesInfo.textContent = `0 ${L.pages}`;
      return;
    }

    const splits = [];
    let currentPage = 1;
    let fileIndex = 1;

    while (currentPage <= state.totalPages) {
      const endPage = Math.min(
        currentPage + pagesPerSplit - 1,
        state.totalPages
      );
      splits.push({ start: currentPage, end: endPage, index: fileIndex });
      currentPage = endPage + 1;
      fileIndex++;
    }

    previewContent.className = "preview-grid";
    previewContent.innerHTML = splits
      .map((split) => {
        const pageCount = split.end - split.start + 1;
        return `
          <div class="preview-item">
            <div class="preview-item-header">
              <div class="preview-item-title">
                ${L.file} ${split.index}
              </div>
              <div class="preview-item-badge">${pageCount} ${L.pages}</div>
            </div>
            <div class="preview-item-details">
              <strong>${L.page}:</strong> ${split.start} - ${split.end}
            </div>
          </div>
        `;
      })
      .join("");

    if (totalFilesInfo)
      totalFilesInfo.textContent = `${splits.length} ${L.file}${
        splits.length > 1 ? "s" : ""
      }`;
    if (totalSplitPagesInfo)
      totalSplitPagesInfo.textContent = `${state.totalPages} ${L.pages}`;
  }
}

// ==================== EVENT LISTENERS ====================

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Back buttons
  const backToHome = state.container.querySelector("#backToHome");
  const backToUpload = state.container.querySelector("#backToUpload");

  backToHome?.addEventListener("click", () => {
    if (window.featureManager) {
      window.featureManager.deactivateAll();
    }
  });

  backToUpload?.addEventListener("click", () => {
    clearFile();
    showUploadStage();
  });

  // File upload
  const uploadArea = state.container.querySelector("#uploadArea");
  const pdfFileInput = state.container.querySelector("#pdfFileInput");
  const selectFileBtn = state.container.querySelector("#selectFileBtn");

  uploadArea?.addEventListener("click", () => pdfFileInput?.click());
  selectFileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    pdfFileInput?.click();
  });
  pdfFileInput?.addEventListener("change", handleFileSelect);

  // Drag and drop
  uploadArea?.addEventListener("dragover", handleDragOver);
  uploadArea?.addEventListener("dragleave", handleDragLeave);
  uploadArea?.addEventListener("drop", handleDrop);

  // Add more / Reset buttons
  const addMoreBtn = state.container.querySelector("#addMoreBtn");
  const resetAllBtn = state.container.querySelector("#resetAllBtn");

  addMoreBtn?.addEventListener("click", () => {
    clearFile();
    showUploadStage();
  });

  resetAllBtn?.addEventListener("click", resetAllRanges);

  // Mode selection
  const customModeBtn = state.container.querySelector("#customModeBtn");
  const fixedModeBtn = state.container.querySelector("#fixedModeBtn");

  customModeBtn?.addEventListener("click", () => switchMode("custom"));
  fixedModeBtn?.addEventListener("click", () => switchMode("fixed"));

  // Add range button
  const addRangeBtn = state.container.querySelector("#addRangeBtn");
  addRangeBtn?.addEventListener("click", addNewRange);

  // Fixed range input
  const pagesPerSplit = state.container.querySelector("#pagesPerSplit");
  pagesPerSplit?.addEventListener("input", (e) => {
    state.fixedRange.pagesPerSplit = parseInt(e.target.value) || 1;
    updateSplitPreview();
  });

  // Execute split button
  const executeSplitBtn = state.container.querySelector("#executeSplitBtn");
  executeSplitBtn?.addEventListener("click", executeSplit);

  // Success modal buttons
  const splitMoreBtn = state.container.querySelector("#splitMoreBtn");
  const goHomeBtn = state.container.querySelector("#goHomeBtn");

  splitMoreBtn?.addEventListener("click", () => {
    hideSuccessModal();
    clearFile();
    showUploadStage();
  });

  goHomeBtn?.addEventListener("click", () => {
    if (window.featureManager) {
      window.featureManager.deactivateAll();
    }
  });
}

// ==================== FILE HANDLING ====================

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const uploadArea = state.container.querySelector("#uploadArea");
  uploadArea?.classList.add("drag-over");
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const uploadArea = state.container.querySelector("#uploadArea");
  uploadArea?.classList.remove("drag-over");
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const uploadArea = state.container.querySelector("#uploadArea");
  uploadArea?.classList.remove("drag-over");

  const file = e.dataTransfer?.files?.[0];
  if (!file) return;

  await processFile(file);
}

async function handleFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  await processFile(file);
}

async function processFile(file) {
  const validation = utils.validatePdfFile(file);
  if (!validation.valid) {
    utils.showToast(validation.error, "error");
    return;
  }

  state.pdfFile = file;

  const L = LANG[state.currentLang];
  const loading = utils.createLoadingOverlay(L.loadingPdf);
  loading.show();

  try {
    // Read file
    state.pdfBytes = await utils.readFileAsArrayBuffer(state.pdfFile);

    // Load PDF
    const loadingTask = pdfjsLib.getDocument({
      data: state.pdfBytes,
      verbosity: 0,
    });

    state.pdfDoc = await loadingTask.promise;
    state.totalPages = state.pdfDoc.numPages;

    // Initialize ranges
    state.customRanges = [];
    state.fixedRange = { pagesPerSplit: 4 };

    // Update UI
    const totalPagesInfo = state.container.querySelector("#totalPagesInfo");
    const fileSizeInfo = state.container.querySelector("#fileSizeInfo");

    if (totalPagesInfo) totalPagesInfo.textContent = state.totalPages;
    if (fileSizeInfo)
      fileSizeInfo.textContent = utils.formatFileSize(state.pdfFile.size);

    // Show split stage
    showSplitStage();

    // Add initial range for custom mode
    const rangesList = state.container.querySelector("#rangesList");
    if (rangesList) {
      rangesList.innerHTML = "";
      addNewRange();
    }

    // Render preview
    if (state.totalPages <= 50) {
      loading.updateMessage(L.renderingPages);
      await renderAllPages();
    }

    renderPdfGrid();
    updateSplitPreview();

    loading.hide();
    utils.showToast(L.pdfLoaded, "success");
  } catch (error) {
    console.error("Failed to load PDF:", error);
    loading.hide();
    utils.showToast(L.errorLoading, "error");
  }
}

function clearFile() {
  state.pdfFile = null;
  state.pdfDoc = null;
  state.pdfBytes = null;
  state.totalPages = 0;
  state.renderedPages = [];
  state.splitResults = [];
  state.originalPdfForSplit = null;

  const pdfFileInput = state.container.querySelector("#pdfFileInput");
  if (pdfFileInput) pdfFileInput.value = "";
}

// ==================== RENDERING ====================

async function renderAllPages() {
  const BATCH_SIZE = 3;

  for (let i = 1; i <= state.totalPages; i += BATCH_SIZE) {
    const batch = [];
    const end = Math.min(i + BATCH_SIZE - 1, state.totalPages);

    for (let pageNum = i; pageNum <= end; pageNum++) {
      batch.push(renderPageThumbnail(pageNum));
    }

    const results = await Promise.all(batch);
    results.forEach((element) => {
      if (element) {
        state.renderedPages.push({ pageNum: i, element });
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function renderPageThumbnail(pageNum) {
  try {
    const page = await state.pdfDoc.getPage(pageNum);

    const scale = 0.3;
    const viewport = page.getViewport({ scale });

    const MAX_THUMB_SIZE = 300;
    const scaleFactor = Math.min(
      1,
      MAX_THUMB_SIZE / Math.max(viewport.width, viewport.height)
    );

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width * scaleFactor);
    canvas.height = Math.round(viewport.height * scaleFactor);

    const ctx = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
    });

    await page.render({
      canvasContext: ctx,
      viewport: page.getViewport({ scale: scale * scaleFactor }),
    }).promise;

    const wrapper = document.createElement("div");
    wrapper.className = "pdf-card";

    const thumbnailWrapper = document.createElement("div");
    thumbnailWrapper.className = "pdf-thumbnail-wrapper";
    thumbnailWrapper.appendChild(canvas);

    const info = document.createElement("div");
    info.className = "pdf-info";

    const label = document.createElement("div");
    label.className = "pdf-page-label";
    label.textContent = `${LANG[state.currentLang].page} ${pageNum}`;

    info.appendChild(label);
    wrapper.appendChild(thumbnailWrapper);
    wrapper.appendChild(info);

    return wrapper;
  } catch (error) {
    console.error(`Failed to render page ${pageNum}:`, error);
    return null;
  }
}

// ==================== SPLIT LOGIC ====================

function switchMode(mode) {
  state.splitMode = mode;

  const customModeBtn = state.container.querySelector("#customModeBtn");
  const fixedModeBtn = state.container.querySelector("#fixedModeBtn");
  const customSettings = state.container.querySelector("#customRangeSettings");
  const fixedSettings = state.container.querySelector("#fixedRangeSettings");

  if (mode === "custom") {
    customModeBtn?.classList.add("active");
    fixedModeBtn?.classList.remove("active");
    customSettings?.classList.add("active");
    fixedSettings?.classList.remove("active");

    const rangesList = state.container.querySelector("#rangesList");
    if (rangesList && rangesList.children.length === 0) {
      addNewRange();
    }
  } else {
    customModeBtn?.classList.remove("active");
    fixedModeBtn?.classList.add("active");
    customSettings?.classList.remove("active");
    fixedSettings?.classList.add("active");
  }

  updateSplitPreview();
}

function addNewRange() {
  const rangesList = state.container.querySelector("#rangesList");
  if (!rangesList) return;

  const L = LANG[state.currentLang];
  const rangeId = `range-${Date.now()}`;
  const rangeItem = document.createElement("div");
  rangeItem.className = "range-item";
  rangeItem.dataset.rangeId = rangeId;

  rangeItem.innerHTML = `
    <div class="setting-group">
      <label>${L.from}</label>
      <input
        type="number"
        class="page-input range-from"
        min="1"
        max="${state.totalPages}"
        value="1"
        placeholder="1"
      />
    </div>
    <div class="setting-group">
      <label>${L.to}</label>
      <input
        type="number"
        class="page-input range-to"
        min="1"
        max="${state.totalPages}"
        value="1"
        placeholder="1"
      />
    </div>
    <button class="remove-range-btn" data-range-id="${rangeId}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>
  `;

  rangesList.appendChild(rangeItem);

  const fromInput = rangeItem.querySelector(".range-from");
  const toInput = rangeItem.querySelector(".range-to");
  const removeBtn = rangeItem.querySelector(".remove-range-btn");

  fromInput?.addEventListener("input", updateSplitPreview);
  toInput?.addEventListener("input", updateSplitPreview);
  removeBtn?.addEventListener("click", () => removeRange(rangeId));

  updateSplitPreview();
}

function removeRange(rangeId) {
  const rangeItem = state.container.querySelector(
    `[data-range-id="${rangeId}"]`
  );
  if (rangeItem) {
    rangeItem.remove();
    updateSplitPreview();
  }
}

function getCustomRanges() {
  const ranges = [];
  const rangeItems = state.container.querySelectorAll(".range-item");

  rangeItems.forEach((item) => {
    const from = parseInt(item.querySelector(".range-from")?.value) || 1;
    const to = parseInt(item.querySelector(".range-to")?.value) || 1;
    ranges.push({ from, to });
  });

  return ranges;
}

function validateRanges(ranges) {
  const L = LANG[state.currentLang];

  if (ranges.length === 0) {
    return {
      valid: false,
      error: L.addRange,
    };
  }

  for (const range of ranges) {
    const validation = utils.validatePageRange(
      range.from,
      range.to,
      state.totalPages
    );
    if (!validation.valid) {
      return validation;
    }
  }

  ranges.sort((a, b) => a.from - b.from);

  for (let i = 0; i < ranges.length - 1; i++) {
    if (ranges[i].to >= ranges[i + 1].from) {
      return {
        valid: false,
        error: `${L.file} ${i + 1} and ${i + 2} overlap`,
      };
    }
  }

  return { valid: true, error: null };
}

function getRemainingPages(ranges) {
  const allPages = new Set(
    Array.from({ length: state.totalPages }, (_, i) => i + 1)
  );

  ranges.forEach((range) => {
    for (let p = range.from; p <= range.to; p++) {
      allPages.delete(p);
    }
  });

  return Array.from(allPages).sort((a, b) => a - b);
}

function resetAllRanges() {
  state.customRanges = [];
  state.fixedRange = { pagesPerSplit: 4 };

  const rangesList = state.container.querySelector("#rangesList");
  if (rangesList) {
    rangesList.innerHTML = "";
    addNewRange();
  }

  const pagesPerSplit = state.container.querySelector("#pagesPerSplit");
  if (pagesPerSplit) {
    pagesPerSplit.value = "4";
  }

  updateSplitPreview();
  utils.showToast(LANG[state.currentLang].resetAll, "success");
}

function showRemainingPagesDialog(remainingPages) {
  return new Promise((resolve) => {
    if (remainingPages.length === 0) {
      resolve(false);
      return;
    }

    const L = LANG[state.currentLang];
    const overlay = document.createElement("div");
    overlay.className = "confirmation-overlay";

    const formatPages = (pages) => {
      if (pages.length <= 10) return pages.join(", ");
      return (
        pages.slice(0, 10).join(", ") + `, ... (${pages.length - 10} more)`
      );
    };

    overlay.innerHTML = `
      <div class="confirmation-dialog">
        <h3>${L.aboutRemaining}</h3>
        <p>${L.remainingPagesQuestion}</p>
        <div class="remaining-pages">
          <strong>${L.remainingPages}:</strong><br>
          ${formatPages(remainingPages)}
        </div>
        <div class="btn-group">
          <button class="btn secondary" id="excludeBtn">
            <span>${L.dontSave}</span>
          </button>
          <button class="btn primary" id="includeBtn">
            <span>${L.saveThem}</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector("#includeBtn")?.addEventListener("click", () => {
      overlay.remove();
      resolve(true);
    });

    overlay.querySelector("#excludeBtn")?.addEventListener("click", () => {
      overlay.remove();
      resolve(false);
    });
  });
}

// ==================== SPLIT EXECUTION ====================

async function executeSplit() {
  if (!state.pdfFile || !state.pdfDoc || state.processing) {
    utils.showToast(LANG[state.currentLang].errorLoading, "error");
    return;
  }

  const L = LANG[state.currentLang];
  const loading = utils.createLoadingOverlay(L.splitting);
  loading.show();

  state.processing = true;

  try {
    await ensurePdfLib();
    const PDFLib = window.PDFLib;

    if (!PDFLib) {
      throw new Error("pdf-lib not available");
    }

    loading.updateMessage(L.loadingPdf);

    const freshPdfBytes = await utils.readFileAsArrayBuffer(state.pdfFile);
    const originalPdf = await PDFLib.PDFDocument.load(freshPdfBytes);

    state.splitResults = [];

    if (state.splitMode === "custom") {
      const ranges = getCustomRanges();
      const validation = validateRanges(ranges);

      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const remainingPages = getRemainingPages(ranges);

      loading.hide();
      state.includeRemainingPages = await showRemainingPagesDialog(
        remainingPages
      );
      loading.show();

      await splitCustomRangeMetadata(ranges, remainingPages);
    } else {
      await splitFixedRangeMetadata();
    }

    state.originalPdfForSplit = originalPdf;

    loading.hide();

    await downloadSplitFiles();
  } catch (error) {
    console.error("Split failed:", error);
    loading.hide();
    utils.showToast(L.errorSplitting, "error");
  } finally {
    state.processing = false;
  }
}

async function splitCustomRangeMetadata(ranges, remainingPages) {
  const L = LANG[state.currentLang];

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    state.splitResults.push({
      name: `split_${i + 1}_pages_${range.from}-${range.to}.pdf`,
      pageRange: `${range.from}-${range.to}`,
      pageCount: range.to - range.from + 1,
      rangeType: "custom",
      rangeData: range,
      bytes: null,
    });
  }

  if (state.includeRemainingPages && remainingPages.length > 0) {
    state.splitResults.push({
      name: `remaining_pages.pdf`,
      pageRange: remainingPages.join(", "),
      pageCount: remainingPages.length,
      rangeType: "remaining",
      rangeData: { pages: remainingPages },
      bytes: null,
    });
  }
}

async function splitFixedRangeMetadata() {
  const pagesPerSplit = state.fixedRange.pagesPerSplit;

  if (pagesPerSplit < 1) {
    throw new Error("Invalid pages per split value");
  }

  let currentPage = 1;
  let fileIndex = 1;

  while (currentPage <= state.totalPages) {
    const endPage = Math.min(currentPage + pagesPerSplit - 1, state.totalPages);
    const pageCount = endPage - currentPage + 1;

    state.splitResults.push({
      name: `split_${fileIndex}.pdf`,
      pageRange: `${currentPage}-${endPage}`,
      pageCount: pageCount,
      rangeType: "fixed",
      rangeData: { from: currentPage, to: endPage },
      bytes: null,
    });

    currentPage = endPage + 1;
    fileIndex++;
  }
}

async function downloadSplitFiles() {
  if (state.splitResults.length === 0) {
    utils.showToast(LANG[state.currentLang].errorSaving, "error");
    return;
  }

  if (!state.originalPdfForSplit) {
    utils.showToast(LANG[state.currentLang].errorLoading, "error");
    return;
  }

  const L = LANG[state.currentLang];
  const loading = utils.createLoadingOverlay(L.saving);
  loading.show();

  try {
    const PDFLib = window.PDFLib;
    let folderPath = null;
    const CHUNK_SIZE = 512 * 1024;

    for (let i = 0; i < state.splitResults.length; i++) {
      const fileInfo = state.splitResults[i];

      loading.updateMessage(
        `${L.saving} ${i + 1}/${state.splitResults.length}\n${fileInfo.name}`
      );

      const splitDoc = await PDFLib.PDFDocument.create();

      let pageIndices = [];
      if (fileInfo.rangeType === "custom" || fileInfo.rangeType === "fixed") {
        const { from, to } = fileInfo.rangeData;
        pageIndices = Array.from(
          { length: to - from + 1 },
          (_, j) => from - 1 + j
        );
      } else if (fileInfo.rangeType === "remaining") {
        pageIndices = fileInfo.rangeData.pages.map((p) => p - 1);
      }

      const pages = await splitDoc.copyPages(
        state.originalPdfForSplit,
        pageIndices
      );
      pages.forEach((page) => splitDoc.addPage(page));

      const pdfBytes = await splitDoc.save({
        useObjectStreams: false,
        addDefaultPage: false,
      });

      const fileSizeMB = pdfBytes.length / (1024 * 1024);

      if (fileSizeMB < 50) {
        const result = await window.electronAPI.saveSplitFolderBatch(
          [{ name: fileInfo.name, bytes: Array.from(pdfBytes) }],
          folderPath
        );

        if (result.success) {
          if (!folderPath) folderPath = result.path;
        } else if (result.message === "canceled") {
          loading.hide();
          return;
        } else {
          throw new Error(result.message);
        }
      } else {
        const totalChunks = Math.ceil(pdfBytes.length / CHUNK_SIZE);

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, pdfBytes.length);
          const chunk = pdfBytes.slice(start, end);

          const blob = new Blob([chunk]);
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.readAsDataURL(blob);
          });

          const isFirst = chunkIndex === 0;
          const isLast = chunkIndex === totalChunks - 1;

          const result = await window.electronAPI.saveSplitFileDirect(
            fileInfo.name,
            base64,
            isFirst,
            isLast,
            folderPath
          );

          if (result.success) {
            if (!folderPath) folderPath = result.path;
          } else if (result.message === "canceled") {
            loading.hide();
            return;
          } else {
            throw new Error(result.message);
          }

          if (chunkIndex % 5 === 0) {
            const chunkProgress = Math.round((chunkIndex / totalChunks) * 100);
            loading.updateMessage(
              `${L.saving} ${chunkProgress}% (${Math.round(fileSizeMB)}MB)\n${
                fileInfo.name
              }`
            );
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    loading.hide();

    if (folderPath) {
      showSuccessModal(folderPath);
    }
  } catch (error) {
    console.error("Download failed:", error);
    loading.hide();
    utils.showToast(L.errorSaving, "error");
  }
}

// ==================== UTILITIES ====================

async function ensurePdfLib() {
  if (window.PDFLib) return;

  const pdfLibPath = window.libs?.pdfLibPath;
  if (!pdfLibPath) throw new Error("pdf-lib path not available");

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `file://${pdfLibPath}`;
    script.onload = () => {
      if (window.PDFLib) {
        resolve(window.PDFLib);
      } else {
        reject(new Error("PDFLib not loaded"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load pdf-lib"));
    document.head.appendChild(script);
  });
}

export default { init, cleanup };
