// features/pdf-organizer/feature.js
// PDF Page Organizer Feature - FIXED Part 1: Setup & Rendering System

import * as utils from "../../core/utils.js";
import eventBus from "../../core/event-bus.js";

// ==================== PDF.JS SETUP ====================
const pdfjsLib =
  window.pdfjsLib || (await import(`file://${window.libs.pdfjsDistPath}`));
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${window.libs.pdfjsWorkerPath}`;
}

// ==================== LANGUAGE TRANSLATIONS ====================
const LANG = {
  ja: {
    back: "戻る",
    uploadTitle: "PDFページ整理",
    uploadPrompt: "PDFファイルをドラッグ&ドロップ",
    uploadSubtext: "または",
    selectBtn: "ファイルを選択",
    uploadHint: "PDFファイルを選択してページを整理",
    organizeTitle: "ページを整理",
    addMore: "ファイルを追加",
    clearAll: "全削除",
    hoverInfo: "ページにカーソルを合わせて挿入ボタンを表示",
    fileInfoTitle: "ファイル情報",
    totalPages: "総ページ数",
    fileSize: "ファイルサイズ",
    sortTitle: "並び替え",
    sortAsc: "昇順",
    sortDesc: "降順",
    resetOrder: "リセット",
    actionsTitle: "アクション",
    savePdf: "PDFを保存",
    loadingFiles: "ファイルを読み込み中...",
    loadingPages: "ページを準備中...",
    processingPdf: "PDF処理中...",
    savingFiles: "ファイルを保存中...",
    successTitle: "保存完了!",
    successMessage: "PDFファイルが整理・保存されました",
    organizeMore: "もっと整理",
    goHome: "ホームに戻る",
    errorInvalidPdf: "無効なPDFファイルです",
    errorLoading: "PDFの読み込みに失敗しました",
    errorSaving: "保存に失敗しました",
    insertModalTitle: "挿入オプション",
    insertFile: "ファイルを挿入",
    insertBlank: "白紙ページを挿入",
    cancel: "キャンセル",
    fileSelected: "ファイルが選択されました",
    pageRemoved: "ページを削除しました",
    pdfLoaded: "PDF読み込み完了",
    sortedAsc: "昇順に並び替えました",
    sortedDesc: "降順に並び替えました",
    orderReset: "元の順序にリセットしました",
    allPagesCleared: "すべてのページを削除しました",
    blankPageInserted: "白紙ページを挿入しました",
    pagesInserted: "ページを挿入しました",
    noValidFiles: "有効なファイルがありません",
    insertingBlank: "白紙ページを挿入中...",
    insertingFiles: "ファイルを挿入中...",
    noPages: "ページがありません",
    confirmClearAll: "すべてのページを削除しますか?",
  },
  en: {
    back: "Back",
    uploadTitle: "PDF Page Organizer",
    uploadPrompt: "Drag & drop PDF files",
    uploadSubtext: "or",
    selectBtn: "Select Files",
    uploadHint: "Select PDF file to organize pages",
    organizeTitle: "Organize Pages",
    addMore: "Add More",
    clearAll: "Clear All",
    hoverInfo: "Hover over pages to see insert buttons",
    fileInfoTitle: "File Info",
    totalPages: "Total Pages",
    fileSize: "File Size",
    sortTitle: "Sort",
    sortAsc: "Ascending",
    sortDesc: "Descending",
    resetOrder: "Reset",
    actionsTitle: "Actions",
    savePdf: "Save PDF",
    loadingFiles: "Loading files...",
    loadingPages: "Preparing pages...",
    processingPdf: "Processing PDF...",
    savingFiles: "Saving files...",
    successTitle: "Save Complete!",
    successMessage: "PDF file has been organized and saved",
    organizeMore: "Organize More",
    goHome: "Go Home",
    errorInvalidPdf: "Invalid PDF file",
    errorLoading: "Failed to load PDF",
    errorSaving: "Failed to save",
    insertModalTitle: "Insert Options",
    insertFile: "Insert File",
    insertBlank: "Insert Blank Page",
    cancel: "Cancel",
    fileSelected: "File selected",
    pageRemoved: "Page removed",
    pdfLoaded: "PDF loaded successfully",
    sortedAsc: "Sorted ascending",
    sortedDesc: "Sorted descending",
    orderReset: "Reset to original order",
    allPagesCleared: "All pages cleared",
    blankPageInserted: "Blank page inserted",
    pagesInserted: "Pages inserted",
    noValidFiles: "No valid files to insert",
    insertingBlank: "Inserting blank page...",
    insertingFiles: "Inserting files...",
    noPages: "No pages to save",
    confirmClearAll: "Are you sure you want to clear all pages?",
  },
};

// ==================== STATE ====================
let insertPosition = null;

const state = {
  container: null,
  currentLang: "ja",
  pages: [],
  pdfBytes: null,
  pdfDoc: null,
  totalPages: 0,
  draggedElement: null,
  draggedIndex: null,
  dragOffsetX: 0,
  dragOffsetY: 0,
  draggedElementHeight: 0,
};

// ==================== INITIALIZATION ====================
export async function init(container, params = {}) {
  console.log("📄 Initializing PDF Organizer feature", params);

  state.container = container;
  state.currentLang = params.lang || "ja";

  setupEventListeners();
  applyLanguage();

  eventBus.on(
    "language-changed",
    (lang) => {
      state.currentLang = lang;
      applyLanguage();
    },
    "pdf-organizer"
  );

  showUploadStage();

  return state;
}

// ==================== CLEANUP ====================
export async function cleanup(instance) {
  console.log("🧹 Cleaning up PDF Organizer feature");
  eventBus.off("language-changed");

  stopAutoScroll();

  state.pages = [];
  state.pdfDoc = null;
  state.pdfBytes = null;
}

// ==================== LANGUAGE FUNCTIONS ====================
function applyLanguage() {
  const L = LANG[state.currentLang];

  const elements = {
    backText: L.back,
    uploadTitle: L.uploadTitle,
    uploadPrompt: L.uploadPrompt,
    uploadSubtext: L.uploadSubtext,
    selectBtnText: L.selectBtn,
    uploadHint: L.uploadHint,
    backOrganizeText: L.back,
    organizeTitle: L.organizeTitle,
    addMoreText: L.addMore,
    clearAllText: L.clearAll,
    hoverInfoText: L.hoverInfo,
    fileInfoTitle: L.fileInfoTitle,
    totalPagesLabel: L.totalPages + ":",
    fileSizeLabel: L.fileSize + ":",
    sortTitle: L.sortTitle,
    sortAscText: L.sortAsc,
    sortDescText: L.sortDesc,
    resetOrderText: L.resetOrder,
    actionsTitle: L.actionsTitle,
    savePdfText: L.savePdf,
    insertModalTitle: L.insertModalTitle,
    insertFileBtnText: L.insertFile,
    insertBlankBtnText: L.insertBlank,
    cancelInsertText: L.cancel,
    successTitle: L.successTitle,
    successMessage: L.successMessage,
    organizeMoreText: L.organizeMore,
    goHomeText: L.goHome,
  };

  Object.entries(elements).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

// ==================== STAGE MANAGEMENT ====================
function showUploadStage() {
  const uploadStage = document.getElementById("uploadStage");
  const organizeStage = document.getElementById("organizeStage");

  if (uploadStage) uploadStage.classList.add("active");
  if (organizeStage) organizeStage.classList.remove("active");
}

function showOrganizeStage() {
  const uploadStage = document.getElementById("uploadStage");
  const organizeStage = document.getElementById("organizeStage");

  if (uploadStage) uploadStage.classList.remove("active");
  if (organizeStage) organizeStage.classList.add("active");
}

// ==================== IMPROVED PAGE RENDERING ====================
/**
 * Create a complete page card with proper thumbnail rendering
 * NO re-rendering of existing pages - only creates NEW cards
 */
function createPageCard(pageData) {
  const pageCard = document.createElement("div");
  pageCard.className = "page-card";
  pageCard.draggable = true;
  pageCard.dataset.pageId = pageData.id;
  pageCard.dataset.pageIndex = pageData.currentIndex;

  const thumbnail = document.createElement("div");
  thumbnail.className = "page-thumbnail";

  // ✅ Check if page already has a rendered canvas
  if (pageData.canvas && pageData.rendered) {
    // Use existing canvas directly
    thumbnail.appendChild(pageData.canvas.cloneNode(false));

    // Copy canvas content
    const newCanvas = thumbnail.querySelector("canvas");
    const sourceCtx = pageData.canvas.getContext("2d");
    const destCtx = newCanvas.getContext("2d");
    newCanvas.width = pageData.canvas.width;
    newCanvas.height = pageData.canvas.height;
    destCtx.drawImage(pageData.canvas, 0, 0);
  } else {
    // Show loading placeholder
    thumbnail.classList.add("loading");
    thumbnail.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #94a3b8;">
        <div style="font-size: 32px; margin-bottom: 8px;">📄</div>
        <div style="font-size: 11px;">Loading...</div>
      </div>
    `;

    // Queue for rendering if needed
    if (!pageData.rendered && pageData.originalPageNumber > 0) {
      renderPageThumbnail(pageData, thumbnail);
    }
  }

  const removeBtn = document.createElement("button");
  removeBtn.className = "page-remove";
  removeBtn.innerHTML = "×";
  removeBtn.onclick = (e) => {
    e.stopPropagation();
    removePage(pageData.id);
  };

  const pageInfo = document.createElement("div");
  pageInfo.className = "page-info";

  const pageNumber = document.createElement("div");
  pageNumber.className = "page-number";
  const badge = document.createElement("span");
  badge.className = "page-badge";

  const L = LANG[state.currentLang];

  if (pageData.isBlank) {
    badge.textContent = state.currentLang === "ja" ? "白紙" : "BLANK";
    badge.style.background = "#6b7280";
  } else if (pageData.isImage) {
    badge.textContent = "IMG";
    badge.style.background = "#8b5cf6";
  } else {
    badge.textContent =
      pageData.originalPageNumber || pageData.currentIndex + 1;
  }
  pageNumber.appendChild(badge);
  pageInfo.appendChild(pageNumber);

  const insertLeftBtn = document.createElement("button");
  insertLeftBtn.className = "insert-btn-left";
  insertLeftBtn.innerHTML = "+";
  insertLeftBtn.title =
    state.currentLang === "ja" ? "この前に挿入" : "Insert Before";
  insertLeftBtn.onclick = (e) => {
    e.stopPropagation();
    insertPageAt(pageData.id, "left");
  };

  const insertRightBtn = document.createElement("button");
  insertRightBtn.className = "insert-btn-right";
  insertRightBtn.innerHTML = "+";
  insertRightBtn.title =
    state.currentLang === "ja" ? "この後に挿入" : "Insert After";
  insertRightBtn.onclick = (e) => {
    e.stopPropagation();
    insertPageAt(pageData.id, "right");
  };

  pageCard.appendChild(thumbnail);
  pageCard.appendChild(removeBtn);
  pageCard.appendChild(pageInfo);
  pageCard.appendChild(insertLeftBtn);
  pageCard.appendChild(insertRightBtn);

  setupPageDragEvents(pageCard, pageData);

  return pageCard;
}

/**
 * Render thumbnail for a single page (async, non-blocking)
 */
async function renderPageThumbnail(pageData, thumbnailElement) {
  if (!state.pdfDoc || !pageData.originalPageNumber) return;
  if (pageData.rendered) return;

  try {
    const page = await state.pdfDoc.getPage(pageData.originalPageNumber);
    const scale = 1.0; // ✅ HIGHER QUALITY (was 0.3)
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
    });

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    // ✅ Store rendered canvas
    pageData.canvas = canvas;
    pageData.rendered = true;

    // ✅ Update thumbnail
    if (thumbnailElement) {
      thumbnailElement.className = "page-thumbnail";
      thumbnailElement.innerHTML = "";
      thumbnailElement.appendChild(canvas);
    }
  } catch (error) {
    console.error(
      `Failed to render page ${pageData.originalPageNumber}:`,
      error
    );
  }
}

// Export
export default { init, cleanup };
// features/pdf-organizer/feature.js
// PDF Page Organizer Feature - FIXED Part 2: Event Listeners & File Handling

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  const backToHome = document.getElementById("backToHome");
  const backToUpload = document.getElementById("backToUpload");

  backToHome?.addEventListener("click", goBackToMain);
  backToUpload?.addEventListener("click", () => {
    showUploadStage();
    clearFile();
  });

  const uploadArea = document.getElementById("uploadArea");
  const pdfFileInput = document.getElementById("pdfFileInput");
  const selectFileBtn = document.getElementById("selectFileBtn");

  uploadArea?.addEventListener("click", () => pdfFileInput?.click());
  selectFileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    pdfFileInput?.click();
  });
  pdfFileInput?.addEventListener("change", handleFileSelect);

  uploadArea?.addEventListener("dragover", handleDragOver);
  uploadArea?.addEventListener("dragleave", handleDragLeave);
  uploadArea?.addEventListener("drop", handleDrop);

  const sortAscBtn = document.getElementById("sortAscBtn");
  const sortDescBtn = document.getElementById("sortDescBtn");
  const resetOrderBtn = document.getElementById("resetOrderBtn");

  sortAscBtn?.addEventListener("click", () => sortPages("asc"));
  sortDescBtn?.addEventListener("click", () => sortPages("desc"));
  resetOrderBtn?.addEventListener("click", () => resetPageOrder());

  const addMoreBtn = document.getElementById("addMoreBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const savePdfBtn = document.getElementById("savePdfBtn");

  addMoreBtn?.addEventListener("click", addMoreFiles);
  clearAllBtn?.addEventListener("click", clearAllPages);
  savePdfBtn?.addEventListener("click", savePdf);

  const addMoreFileInput = document.getElementById("addMoreFileInput");
  addMoreFileInput?.addEventListener("change", handleAddMoreFiles);

  const insertFileInput = document.getElementById("insertFileInput");
  insertFileInput?.addEventListener("change", handleInsertFiles);

  const insertFileBtn = document.getElementById("insertFileBtn");
  const insertBlankBtn = document.getElementById("insertBlankBtn");
  const cancelInsertBtn = document.getElementById("cancelInsertBtn");

  insertFileBtn?.addEventListener("click", () => {
    hideInsertModal();
    insertFileInput?.click();
  });

  insertBlankBtn?.addEventListener("click", () => {
    insertBlankPage();
  });

  cancelInsertBtn?.addEventListener("click", () => {
    hideInsertModal();
  });

  const insertModal = document.getElementById("insertModal");
  insertModal?.addEventListener("click", (e) => {
    if (e.target === insertModal) {
      hideInsertModal();
    }
  });

  const organizeMoreBtn = document.getElementById("organizeMoreBtn");
  const goHomeBtn = document.getElementById("goHomeBtn");

  organizeMoreBtn?.addEventListener("click", () => {
    hideSuccessModal();
    showUploadStage();
    clearFile();
  });

  goHomeBtn?.addEventListener("click", () => {
    if (window.featureManager) {
      window.featureManager.deactivateAll();
    }
  });

  setupAutoScroll();
}

function goBackToMain() {
  if (window.featureManager) {
    window.featureManager.deactivateAll();
  }
}

// ==================== FILE HANDLING ====================
async function handleFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  await processFile(file);
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const uploadArea = document.getElementById("uploadArea");
  uploadArea?.classList.add("drag-over");
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const uploadArea = document.getElementById("uploadArea");
  uploadArea?.classList.remove("drag-over");
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const uploadArea = document.getElementById("uploadArea");
  uploadArea?.classList.remove("drag-over");

  const file = e.dataTransfer?.files?.[0];
  if (!file) return;

  await processFile(file);
}

async function processFile(file) {
  const validation = utils.validatePdfFile(file);
  if (!validation.valid) {
    utils.showToast(validation.error, "error");
    return;
  }

  const L = LANG[state.currentLang];

  const arrayBuffer = await utils.readFileAsArrayBuffer(file);
  state.pdfBytes = arrayBuffer.slice(0);

  utils.showToast(L.fileSelected, "success");

  await loadPdfForOrganizing();
}

function clearFile() {
  state.pdfBytes = null;
  state.pdfDoc = null;
  state.totalPages = 0;
  state.pages = [];

  const pdfFileInput = document.getElementById("pdfFileInput");
  if (pdfFileInput) pdfFileInput.value = "";
}

// ==================== PDF LOADING ====================
async function loadPdfForOrganizing() {
  if (!state.pdfBytes) return;

  const L = LANG[state.currentLang];
  const loading = utils.createLoadingOverlay(L.loadingFiles);
  loading.show();

  try {
    const pdfBytesCopy = state.pdfBytes.slice(0);

    const loadingTask = pdfjsLib.getDocument({
      data: pdfBytesCopy,
      verbosity: 0,
    });

    state.pdfDoc = await loadingTask.promise;
    state.totalPages = state.pdfDoc.numPages;

    loading.updateMessage?.(L.loadingPages);

    state.pages = [];
    for (let i = 1; i <= state.totalPages; i++) {
      state.pages.push({
        id: `page-${Date.now()}-${i}-${Math.random()}`,
        originalPageNumber: i,
        currentIndex: i - 1,
        rendered: false,
        canvas: null,
      });
    }

    updateFileInfo();
    showOrganizeStage();

    // ✅ Render pages WITHOUT progress tracking (faster)
    await renderAllPages();

    loading.hide();

    utils.showToast(
      `${L.pdfLoaded} (${state.totalPages}${
        state.currentLang === "ja" ? "ページ" : " pages"
      })`,
      "success"
    );
  } catch (error) {
    console.error("Failed to load PDF:", error);
    loading.hide();
    utils.showToast(L.errorLoading, "error");
  }
}

function updateFileInfo() {
  const totalPages = document.getElementById("totalPages");
  const fileInfoSize = document.getElementById("fileInfoSize");

  if (totalPages) totalPages.textContent = state.totalPages;
  if (fileInfoSize)
    fileInfoSize.textContent = utils.formatFileSize(state.pdfBytes.byteLength);
}

// ==================== IMPROVED RENDERING ====================
/**
 * Render all pages efficiently - only renders what's needed
 * NO full re-render, just appends new pages
 */
async function renderAllPages() {
  const pagesGrid = document.getElementById("pagesGrid");
  if (!pagesGrid) return;

  pagesGrid.innerHTML = "";

  const fragment = document.createDocumentFragment();

  // ✅ Render first 20 pages immediately for instant feedback
  const visibleBatch = state.pages.slice(0, 20);
  const remainingPages = state.pages.slice(20);

  // Render visible batch
  for (const pageData of visibleBatch) {
    if (!pageData.rendered && pageData.originalPageNumber > 0) {
      await renderPageData(pageData);
    }
    const pageCard = createPageCard(pageData);
    if (pageCard) {
      fragment.appendChild(pageCard);
    }
  }

  pagesGrid.appendChild(fragment);

  // ✅ Render remaining pages in background (non-blocking)
  if (remainingPages.length > 0) {
    setTimeout(() => renderRemainingPages(remainingPages), 100);
  }
}

/**
 * Render remaining pages in batches (background, non-blocking)
 */
async function renderRemainingPages(pages) {
  const pagesGrid = document.getElementById("pagesGrid");
  if (!pagesGrid) return;

  const BATCH_SIZE = 10;

  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    const batch = pages.slice(i, i + BATCH_SIZE);

    for (const pageData of batch) {
      if (!pageData.rendered && pageData.originalPageNumber > 0) {
        await renderPageData(pageData);
      }
      const pageCard = createPageCard(pageData);
      if (pageCard) {
        pagesGrid.appendChild(pageCard);
      }
    }

    // Breathe between batches
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Render a single page's canvas data
 */
async function renderPageData(pageData) {
  if (!state.pdfDoc || !pageData.originalPageNumber) return;
  if (pageData.rendered) return;

  try {
    const page = await state.pdfDoc.getPage(pageData.originalPageNumber);
    const scale = 1.0; // ✅ HIGH QUALITY
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
    });

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    pageData.canvas = canvas;
    pageData.rendered = true;
  } catch (error) {
    console.error(
      `Failed to render page ${pageData.originalPageNumber}:`,
      error
    );
  }
}

// ==================== MODAL FUNCTIONS ====================
function hideInsertModal() {
  const modal = document.getElementById("insertModal");
  if (modal) {
    modal.style.display = "none";
  }
}

function showSuccessModal(path) {
  const modal = document.getElementById("successModal");
  const pathEl = document.getElementById("successPath");

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

function hideSuccessModal() {
  const modal = document.getElementById("successModal");
  if (!modal) return;

  console.log("🔄 [HIDE SUCCESS MODAL]");
  modal.classList.remove("active");
}
// features/pdf-organizer/feature.js
// PDF Page Organizer Feature - FIXED Part 3: Insert & Page Management

// ==================== PAGE MANAGEMENT ====================
function removePage(pageId) {
  const index = state.pages.findIndex((p) => p.id === pageId);
  if (index === -1) return;

  const L = LANG[state.currentLang];

  // ✅ Just remove the DOM element, don't re-render everything
  const pagesGrid = document.getElementById("pagesGrid");
  const pageCard = pagesGrid?.querySelector(`[data-page-id="${pageId}"]`);
  if (pageCard) {
    pageCard.remove();
  }

  state.pages.splice(index, 1);
  state.pages.forEach((page, idx) => {
    page.currentIndex = idx;
  });

  state.totalPages = state.pages.length;
  updateFileInfo();

  utils.showToast(L.pageRemoved, "success");
}

function insertPageAt(pageId, side) {
  const index = state.pages.findIndex((p) => p.id === pageId);
  if (index === -1) return;

  insertPosition = side === "left" ? index : index + 1;

  const modal = document.getElementById("insertModal");
  if (modal) {
    modal.style.display = "flex";
  }
}

// ==================== INSERT BLANK PAGE (NO RELOAD) ====================
async function insertBlankPage() {
  if (insertPosition === null) return;

  const L = LANG[state.currentLang];
  const targetPosition = insertPosition;

  hideInsertModal();

  try {
    // Create blank canvas
    const canvas = document.createElement("canvas");
    canvas.width = 595;
    canvas.height = 842;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    const newPage = {
      id: `page-${Date.now()}-${Math.random()}`,
      originalPageNumber: 0,
      currentIndex: targetPosition,
      rendered: true,
      canvas: canvas,
      isBlank: true,
      isImage: false,
    };

    // ✅ Insert page into array
    state.pages.splice(targetPosition, 0, newPage);

    // ✅ Update indices
    state.pages.forEach((page, idx) => {
      page.currentIndex = idx;
    });

    state.totalPages = state.pages.length;
    updateFileInfo();

    // ✅ ONLY insert the new card, don't re-render everything
    const pagesGrid = document.getElementById("pagesGrid");
    const pageCard = createPageCard(newPage);

    if (pagesGrid && pageCard) {
      const existingCards = pagesGrid.querySelectorAll(".page-card");
      if (targetPosition >= existingCards.length) {
        pagesGrid.appendChild(pageCard);
      } else {
        pagesGrid.insertBefore(pageCard, existingCards[targetPosition]);
      }
    }

    utils.showToast(L.blankPageInserted, "success");
  } catch (error) {
    console.error("Failed to insert blank page:", error);
    utils.showToast(L.errorLoading, "error");
  }

  insertPosition = null;
}

// ==================== INSERT FILES (NO FULL RELOAD) ====================
async function handleInsertFiles(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0 || insertPosition === null) {
    console.warn("No files selected or invalid insert position");
    return;
  }

  const L = LANG[state.currentLang];
  const targetPosition = insertPosition;

  hideInsertModal();

  // ✅ Show lightweight toast instead of loading overlay
  utils.showToast(L.insertingFiles, "info");

  try {
    const newPages = [];

    for (const file of files) {
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith(".pdf")) {
        const validation = utils.validatePdfFile(file);
        if (!validation.valid) {
          console.warn(`Skipping invalid PDF: ${file.name}`);
          continue;
        }

        const originalBytes = await utils.readFileAsArrayBuffer(file);
        const storedBytes = originalBytes.slice(0);
        const pdfJsBytes = originalBytes.slice(0);

        const loadingTask = pdfjsLib.getDocument({
          data: pdfJsBytes,
          verbosity: 0,
        });
        const pdfDoc = await loadingTask.promise;

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const scale = 1.0; // ✅ HIGH QUALITY
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const ctx = canvas.getContext("2d", {
            alpha: false,
            willReadFrequently: false,
          });

          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport }).promise;

          newPages.push({
            id: `page-${Date.now()}-${Math.random()}`,
            originalPageNumber: 0,
            currentIndex: 0,
            rendered: true,
            canvas: canvas,
            fromFile: file.name,
            pdfBytes: storedBytes,
            pageNumberInSource: i,
          });
        }
      } else if (
        fileName.endsWith(".png") ||
        fileName.endsWith(".jpg") ||
        fileName.endsWith(".jpeg")
      ) {
        const img = await createImageBitmap(file);
        const canvas = document.createElement("canvas");

        const scale = 0.8;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        newPages.push({
          id: `page-${Date.now()}-${Math.random()}`,
          originalPageNumber: 0,
          currentIndex: 0,
          rendered: true,
          canvas: canvas,
          fromFile: file.name,
          isImage: true,
        });
      }
    }

    if (newPages.length === 0) {
      utils.showToast(L.noValidFiles, "warning");
      insertPosition = null;
      e.target.value = "";
      return;
    }

    // ✅ Insert new pages
    state.pages.splice(targetPosition, 0, ...newPages);

    // ✅ Update indices
    state.pages.forEach((page, idx) => {
      page.currentIndex = idx;
    });

    state.totalPages = state.pages.length;
    updateFileInfo();

    // ✅ ONLY insert new cards, don't re-render everything
    const pagesGrid = document.getElementById("pagesGrid");
    if (pagesGrid) {
      const existingCards = pagesGrid.querySelectorAll(".page-card");
      const fragment = document.createDocumentFragment();

      newPages.forEach((pageData) => {
        const pageCard = createPageCard(pageData);
        if (pageCard) {
          fragment.appendChild(pageCard);
        }
      });

      if (targetPosition >= existingCards.length) {
        pagesGrid.appendChild(fragment);
      } else {
        pagesGrid.insertBefore(fragment, existingCards[targetPosition]);
      }
    }

    utils.showToast(
      `${newPages.length}${
        state.currentLang === "ja" ? "ページを挿入しました" : " pages inserted"
      }`,
      "success"
    );
  } catch (error) {
    console.error("Failed to insert files:", error);
    utils.showToast(L.errorLoading, "error");
  }

  insertPosition = null;
  e.target.value = "";
}

// ==================== ADD MORE FILES (NO FULL RELOAD) ====================
async function addMoreFiles() {
  const addMoreFileInput = document.getElementById("addMoreFileInput");
  addMoreFileInput?.click();
}

async function handleAddMoreFiles(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  const L = LANG[state.currentLang];

  // ✅ Show lightweight toast
  utils.showToast(L.loadingFiles, "info");

  try {
    const newPages = [];

    for (const file of files) {
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith(".pdf")) {
        const validation = utils.validatePdfFile(file);
        if (!validation.valid) continue;

        const originalBytes = await utils.readFileAsArrayBuffer(file);
        const storedBytes = originalBytes.slice(0);
        const pdfJsBytes = originalBytes.slice(0);

        const loadingTask = pdfjsLib.getDocument({
          data: pdfJsBytes,
          verbosity: 0,
        });
        const pdfDoc = await loadingTask.promise;

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const scale = 1.0; // ✅ HIGH QUALITY
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const ctx = canvas.getContext("2d", {
            alpha: false,
            willReadFrequently: false,
          });

          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport }).promise;

          newPages.push({
            id: `page-${Date.now()}-${state.pages.length}-${Math.random()}`,
            originalPageNumber: 0,
            currentIndex: state.pages.length,
            rendered: true,
            canvas: canvas,
            fromFile: file.name,
            pdfBytes: storedBytes,
            pageNumberInSource: i,
          });
        }
      } else if (
        fileName.endsWith(".png") ||
        fileName.endsWith(".jpg") ||
        fileName.endsWith(".jpeg")
      ) {
        const img = await createImageBitmap(file);
        const canvas = document.createElement("canvas");

        const scale = 0.8;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        newPages.push({
          id: `page-${Date.now()}-${state.pages.length}-${Math.random()}`,
          originalPageNumber: 0,
          currentIndex: state.pages.length,
          rendered: true,
          canvas: canvas,
          fromFile: file.name,
          isImage: true,
        });
      }
    }

    // ✅ Add to state
    state.pages.push(...newPages);
    state.totalPages = state.pages.length;
    updateFileInfo();

    // ✅ ONLY append new cards, don't re-render everything
    const pagesGrid = document.getElementById("pagesGrid");
    if (pagesGrid) {
      const fragment = document.createDocumentFragment();
      newPages.forEach((pageData) => {
        const pageCard = createPageCard(pageData);
        if (pageCard) {
          fragment.appendChild(pageCard);
        }
      });
      pagesGrid.appendChild(fragment);
    }

    utils.showToast(
      `${newPages.length}${
        state.currentLang === "ja" ? "ページを追加しました" : " pages added"
      }`,
      "success"
    );
  } catch (error) {
    console.error("Failed to add files:", error);
    utils.showToast(L.errorLoading, "error");
  }

  e.target.value = "";
}

// ==================== SORT & REORDER ====================
function sortPages(order) {
  const L = LANG[state.currentLang];

  state.pages.sort((a, b) => {
    if (order === "asc") {
      return a.currentIndex - b.currentIndex;
    } else {
      return b.currentIndex - a.currentIndex;
    }
  });

  state.pages.forEach((page, idx) => {
    page.currentIndex = idx;
  });

  // ✅ Full re-render needed for sorting
  renderAllPages();

  utils.showToast(order === "asc" ? L.sortedAsc : L.sortedDesc, "success");
}

function resetPageOrder() {
  const L = LANG[state.currentLang];

  const originalPdfPages = state.pages.filter(
    (p) => p.originalPageNumber > 0 && !p.isImage && !p.isBlank
  );
  const addedContent = state.pages.filter(
    (p) => (p.originalPageNumber === 0 && !p.isBlank) || p.isImage
  );
  const blankPages = state.pages.filter((p) => p.isBlank);

  originalPdfPages.sort((a, b) => a.originalPageNumber - b.originalPageNumber);

  state.pages = [...originalPdfPages, ...addedContent, ...blankPages];

  state.pages.forEach((page, idx) => {
    page.currentIndex = idx;
  });

  // ✅ Full re-render needed for reset
  renderAllPages();

  utils.showToast(L.orderReset, "success");
}

function clearAllPages() {
  if (state.pages.length === 0) return;

  const L = LANG[state.currentLang];
  const confirmed = confirm(L.confirmClearAll);

  if (confirmed) {
    state.pages = [];
    const pagesGrid = document.getElementById("pagesGrid");
    if (pagesGrid) pagesGrid.innerHTML = "";

    utils.showToast(L.allPagesCleared, "success");
  }
} // features/pdf-organizer/feature.js
// PDF Page Organizer Feature - FIXED Part 4: Drag & Drop, Save

// ==================== DRAG & DROP ====================
function setupPageDragEvents(pageCard, pageData) {
  pageCard.addEventListener("dragstart", (e) => {
    pageCard.classList.add("dragging");
    state.draggedElement = pageCard;
    state.draggedIndex = state.pages.findIndex((p) => p.id === pageData.id);

    const pagesArea = document.getElementById("pagesGrid")?.parentElement;
    if (pagesArea) {
      pagesArea.style.scrollBehavior = "auto";
    }
    e.dataTransfer.effectAllowed = "move";

    const rect = pageCard.getBoundingClientRect();
    state.dragOffsetX = e.clientX - rect.left;
    state.dragOffsetY = e.clientY - rect.top;
    state.draggedElementHeight = rect.height;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    e.dataTransfer.setDragImage(pageCard, centerX, centerY);
  });

  pageCard.addEventListener("dragend", () => {
    pageCard.classList.remove("dragging");
    state.draggedElement = null;
    state.draggedIndex = null;
    state.dragOffsetX = 0;
    state.dragOffsetY = 0;
    state.draggedElementHeight = 0;

    stopAutoScroll();

    const pagesArea = document.getElementById("pagesGrid")?.parentElement;
    if (pagesArea) {
      pagesArea.style.scrollBehavior = "smooth";
    }
  });

  pageCard.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (state.draggedElement && state.draggedElement !== pageCard) {
      pageCard.classList.add("drag-over");
    }

    startAutoScroll(e.clientX, e.clientY);
  });

  pageCard.addEventListener("dragleave", () => {
    pageCard.classList.remove("drag-over");
  });

  pageCard.addEventListener("drop", (e) => {
    e.preventDefault();
    pageCard.classList.remove("drag-over");

    stopAutoScroll();

    if (!state.draggedElement || state.draggedElement === pageCard) return;

    const targetIndex = state.pages.findIndex((p) => p.id === pageData.id);

    if (
      state.draggedIndex !== null &&
      targetIndex !== null &&
      state.draggedIndex !== targetIndex
    ) {
      const movedPage = state.pages.splice(state.draggedIndex, 1)[0];
      state.pages.splice(targetIndex, 0, movedPage);

      state.pages.forEach((page, idx) => {
        page.currentIndex = idx;
      });

      const draggedCard = state.draggedElement;
      const targetCard = pageCard;

      if (state.draggedIndex < targetIndex) {
        targetCard.parentNode.insertBefore(draggedCard, targetCard.nextSibling);
      } else {
        targetCard.parentNode.insertBefore(draggedCard, targetCard);
      }

      state.draggedIndex = targetIndex;
    }
  });
}

// ==================== AUTO-SCROLL ====================
let autoScrollRAF = null;
let autoScrollSpeed = 0;
let targetScrollSpeed = 0;

function setupAutoScroll() {
  const pagesArea = document.getElementById("pagesGrid")?.parentElement;
  if (!pagesArea) return;

  pagesArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (state.draggedElement) {
      startAutoScroll(e.clientX, e.clientY);
    }
  });

  pagesArea.addEventListener("drop", () => {
    stopAutoScroll();
  });

  pagesArea.addEventListener("dragend", () => {
    stopAutoScroll();
  });
}

function startAutoScroll(clientX, clientY) {
  const pagesArea = document.getElementById("pagesGrid")?.parentElement;
  if (!pagesArea) return;

  const dragOffsetY = state.dragOffsetY || 60;
  const draggedHeight = state.draggedElementHeight || 240;

  const draggedTop = clientY - dragOffsetY;
  const draggedBottom = draggedTop + draggedHeight;

  const header = document.querySelector(".organize-header");
  const headerHeight = header ? header.getBoundingClientRect().height : 80;

  const viewportTop = headerHeight;
  const viewportBottom = window.innerHeight;

  const maxSpeed = 12;
  const topZoneSize = 180;
  const bottomZoneSize = 200;

  const distanceFromTop = draggedTop - viewportTop;
  const distanceFromBottom = viewportBottom - draggedBottom;

  if (distanceFromTop < topZoneSize && distanceFromTop > -150) {
    pagesArea.classList.add("scroll-active-top");
    pagesArea.classList.remove("scroll-active-bottom");

    const normalizedDistance = Math.max(
      0,
      Math.min(topZoneSize, topZoneSize - distanceFromTop)
    );
    const intensity = normalizedDistance / topZoneSize;

    targetScrollSpeed = -maxSpeed * intensity;
  } else if (distanceFromBottom < bottomZoneSize && distanceFromBottom > -150) {
    pagesArea.classList.add("scroll-active-bottom");
    pagesArea.classList.remove("scroll-active-top");

    const normalizedDistance = Math.max(
      0,
      Math.min(bottomZoneSize, bottomZoneSize - distanceFromBottom)
    );
    const intensity = normalizedDistance / bottomZoneSize;

    targetScrollSpeed = maxSpeed * intensity;
  } else {
    pagesArea.classList.remove("scroll-active-top", "scroll-active-bottom");
    targetScrollSpeed = 0;
  }

  if (!autoScrollRAF) {
    autoScrollRAF = requestAnimationFrame(autoScrollLoop);
  }
}

function autoScrollLoop() {
  const pagesArea = document.getElementById("pagesGrid")?.parentElement;
  if (!pagesArea) {
    stopAutoScroll();
    return;
  }

  const lerpFactor = 0.6;
  autoScrollSpeed += (targetScrollSpeed - autoScrollSpeed) * lerpFactor;

  if (Math.abs(autoScrollSpeed) > 0.5) {
    pagesArea.scrollTop += autoScrollSpeed;
    autoScrollRAF = requestAnimationFrame(autoScrollLoop);
  } else if (Math.abs(targetScrollSpeed) > 0.5) {
    pagesArea.scrollTop += targetScrollSpeed;
    autoScrollRAF = requestAnimationFrame(autoScrollLoop);
  } else {
    autoScrollSpeed = 0;
    autoScrollRAF = null;
  }
}

function stopAutoScroll() {
  targetScrollSpeed = 0;
  autoScrollSpeed = 0;
  if (autoScrollRAF) {
    cancelAnimationFrame(autoScrollRAF);
    autoScrollRAF = null;
  }
}

// ==================== SAVE PDF ====================
async function savePdf() {
  if (state.pages.length === 0) {
    const L = LANG[state.currentLang];
    utils.showToast(L.noPages, "error");
    return;
  }

  const L = LANG[state.currentLang];
  const loading = utils.createLoadingOverlay(L.savingFiles);
  loading.show();

  try {
    await ensurePdfLib();
    const PDFLib = window.PDFLib;

    const hasOnlyOriginalPages = state.pages.every(
      (p) => p.originalPageNumber > 0 && !p.isBlank && !p.isImage
    );
    const isOriginalOrder = state.pages.every(
      (p, idx) => p.originalPageNumber === idx + 1
    );

    if (hasOnlyOriginalPages && isOriginalOrder && state.pdfBytes) {
      const blob = new Blob([state.pdfBytes], { type: "application/pdf" });
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(blob);
      });

      const result = await window.electronAPI.saveBytesBase64(
        "organized.pdf",
        base64
      );

      loading.hide();

      if (result.success) {
        showSuccessModal(result.path);
      }
      return;
    }

    let originalPdf = null;
    if (state.pdfBytes && state.pages.some((p) => p.originalPageNumber > 0)) {
      originalPdf = await PDFLib.PDFDocument.load(state.pdfBytes.slice(0));
    }

    const newPdf = await PDFLib.PDFDocument.create();
    const BATCH_SIZE = 20;

    for (let i = 0; i < state.pages.length; i += BATCH_SIZE) {
      const batch = state.pages.slice(
        i,
        Math.min(i + BATCH_SIZE, state.pages.length)
      );

      if (i % 40 === 0 || i === 0) {
        loading.updateMessage?.(
          `${L.processingPdf} ${Math.round((i / state.pages.length) * 100)}%`
        );
      }

      for (const pageData of batch) {
        try {
          if (pageData.isBlank || pageData.isImage) {
            if (!pageData.canvas) continue;

            const dataUrl = pageData.canvas.toDataURL("image/jpeg", 0.9);
            const base64Data = dataUrl.split(",")[1];
            const jpegBytes = Uint8Array.from(atob(base64Data), (c) =>
              c.charCodeAt(0)
            );

            const jpegImage = await newPdf.embedJpg(jpegBytes);
            const page = newPdf.addPage([
              pageData.canvas.width,
              pageData.canvas.height,
            ]);

            page.drawImage(jpegImage, {
              x: 0,
              y: 0,
              width: pageData.canvas.width,
              height: pageData.canvas.height,
            });
          } else if (pageData.pdfBytes && pageData.pageNumberInSource) {
            const sourcePdf = await PDFLib.PDFDocument.load(
              pageData.pdfBytes.slice(0)
            );
            const [copiedPage] = await newPdf.copyPages(sourcePdf, [
              pageData.pageNumberInSource - 1,
            ]);
            newPdf.addPage(copiedPage);
          } else if (pageData.originalPageNumber > 0 && originalPdf) {
            const [copiedPage] = await newPdf.copyPages(originalPdf, [
              pageData.originalPageNumber - 1,
            ]);
            newPdf.addPage(copiedPage);
          }
        } catch (pageError) {
          console.error(`Failed to process page ${pageData.id}:`, pageError);
        }
      }

      if (i % 40 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    loading.updateMessage?.(L.savingFiles);

    const pdfBytes = await newPdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 100,
    });

    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    });

    const result = await window.electronAPI.saveBytesBase64(
      "organized.pdf",
      base64
    );

    loading.hide();

    if (result.success) {
      showSuccessModal(result.path);
    }
  } catch (error) {
    console.error("Failed to save PDF:", error);
    loading.hide();
    utils.showToast(L.errorSaving, "error");
  }
}

async function ensurePdfLib() {
  if (window.PDFLib) return;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `file://${window.libs.pdfLibPath}`;
    script.onload = () => {
      console.log("✅ pdf-lib loaded");
      resolve();
    };
    script.onerror = () => {
      reject(new Error("Failed to load pdf-lib"));
    };
    document.head.appendChild(script);
  });
}
