// features/pdfToJpeg/feature.js

import eventBus from "../../core/event-bus.js";
import * as utils from "../../core/utils.js";

// Constants
const JPEG_QUALITY = 0.95;
const THUMBNAIL_SCALE = 0.3;
const RENDER_SCALE = 2.0;
const MAX_FILE_SIZE = 1024 * 1024 * 500; // 500MB per file
const BATCH_SIZE = 5; // Process 5 pages at a time

// State
let state = {
  pdfGroups: [],
  currentLang: "ja",
  processing: false,
};

// Language translations
const LANG = {
  ja: {
    back: "戻る",
    title: "PDF → JPEG 変換",
    uploadPrompt: "PDFファイルをドラッグ&ドロップ",
    uploadSubtext: "または",
    selectBtn: "ファイルを選択",
    uploadHint: "複数のPDFファイルを選択可能",
    previewTitle: "プレビュー & 変換",
    addMore: "PDFを追加",
    totalPdfs: "PDFファイル:",
    totalPages: "合計ページ数:",
    convertBtn: "JPEG に変換",
    rotate: "回転",
    progressTitle: "変換中...",
    progressDetail: "準備中...",
    successTitle: "変換完了!",
    successMessage: "JPEGファイルが保存されました",
    convertMore: "もっと変換",
    goHome: "ホームに戻る",
    pages: "ページ",
    errorTitle: "エラー",
    errorTooLarge: "ファイルサイズが大きすぎます (最大500MB)",
    errorInvalidPdf: "無効なPDFファイルです",
    errorLoading: "PDFの読み込みに失敗しました",
    errorConverting: "変換に失敗しました",
    controlPanel: "設定パネル",
    statistics: "統計情報",
    pdfsLabel: "PDFファイル",
    pagesLabel: "合計ページ数",
    actions: "アクション",
    outputSettings: "出力設定",
    format: "形式",
    quality: "品質",
    location: "保存先",
    downloads: "ダウンロード",
  },
  en: {
    back: "Back",
    title: "PDF → JPEG Converter",
    uploadPrompt: "Drag & drop PDF files",
    uploadSubtext: "or",
    selectBtn: "Select Files",
    uploadHint: "Multiple PDF files can be selected",
    previewTitle: "Preview & Convert",
    addMore: "Add PDF",
    totalPdfs: "PDF Files:",
    totalPages: "Total Pages:",
    convertBtn: "Convert to JPEG",
    rotate: "Rotate",
    progressTitle: "Converting...",
    progressDetail: "Preparing...",
    successTitle: "Conversion Complete!",
    successMessage: "JPEG files have been saved",
    convertMore: "Convert More",
    goHome: "Go Home",
    pages: "pages",
    errorTitle: "Error",
    errorTooLarge: "File size too large (max 500MB)",
    errorInvalidPdf: "Invalid PDF file",
    errorLoading: "Failed to load PDF",
    errorConverting: "Failed to convert",
    controlPanel: "Control Panel",
    statistics: "Statistics",
    pdfsLabel: "PDF Files",
    pagesLabel: "Total Pages",
    actions: "Actions",
    outputSettings: "Output Settings",
    format: "Format",
    quality: "Quality",
    location: "Location",
    downloads: "Downloads",
  },
};

/**
 * Initialize feature
 */
export async function init(container, params = {}) {
  console.log("🚀 PDF to JPEG feature initializing...");

  state.currentLang = params.lang || "ja";
  state.pdfGroups = [];
  state.processing = false;

  // Apply language
  applyLanguage();

  // Setup event listeners
  setupEventListeners();

  // Listen for language changes
  eventBus.on(
    "language-changed",
    (lang) => {
      state.currentLang = lang;
      applyLanguage();
    },
    "pdf-to-jpeg"
  );

  console.log("✅ PDF to JPEG feature initialized");
  return state;
}

/**
 * Cleanup feature
 */
export async function cleanup() {
  console.log("🧹 Cleaning up PDF to JPEG feature...");

  // Clear state
  state.pdfGroups.forEach((group) => {
    if (group.thumbnailUrl) {
      URL.revokeObjectURL(group.thumbnailUrl);
    }
  });
  state.pdfGroups = [];

  // Remove event listeners
  eventBus.clear("language-changed");
}

/**
 * Apply language to UI
 */
function applyLanguage() {
  const L = LANG[state.currentLang];

  // Update text elements
  const elements = {
    backText: L.back,
    uploadTitle: L.title,
    uploadPrompt: L.uploadPrompt,
    uploadSubtext: L.uploadSubtext,
    selectBtnText: L.selectBtn,
    uploadHint: L.uploadHint,
    backPreviewText: L.back,
    previewTitle: L.previewTitle,
    addMoreText: L.addMore,
    convertBtnText: L.convertBtn,
    progressTitle: L.progressTitle,
    successTitle: L.successTitle,
    successMessage: L.successMessage,
    convertMoreText: L.convertMore,
    goHomeText: L.goHome,
    controlPanelTitle: L.controlPanel,
    statisticsTitle: L.statistics,
    pdfsLabel: L.pdfsLabel,
    pagesLabel: L.pagesLabel,
    actionsTitle: L.actions,
    outputTitle: L.outputSettings,
    formatLabel: L.format,
    qualityLabel: L.quality,
    locationLabel: L.location,
    locationValue: L.downloads,
  };

  Object.entries(elements).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) {
      if (id.includes("Text") && el.tagName === "SPAN") {
        el.textContent = text;
      } else {
        el.textContent = text;
      }
    }
  });
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Back to home
  const backToHome = document.getElementById("backToHome");
  if (backToHome) {
    backToHome.addEventListener("click", () => {
      if (window.featureManager) {
        window.featureManager.deactivateAll();
      }
    });
  }

  // Back to upload from preview
  const backToUpload = document.getElementById("backToUpload");
  if (backToUpload) {
    backToUpload.addEventListener("click", () => {
      showUploadStage();
      // Clear groups
      state.pdfGroups.forEach((group) => {
        if (group.thumbnailUrl) {
          URL.revokeObjectURL(group.thumbnailUrl);
        }
      });
      state.pdfGroups = [];
    });
  }

  // File input
  const fileInput = document.getElementById("pdfFileInput");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const uploadArea = document.getElementById("uploadArea");

  if (selectFileBtn && fileInput) {
    selectFileBtn.addEventListener("click", () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) => handleFiles(e.target.files));
  }

  // Drag and drop
  if (uploadArea) {
    ["dragenter", "dragover"].forEach((evt) => {
      uploadArea.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadArea.classList.add("drag-over");
      });
    });

    ["dragleave", "drop"].forEach((evt) => {
      uploadArea.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadArea.classList.remove("drag-over");
      });
    });

    uploadArea.addEventListener("drop", (e) => {
      const files = e.dataTransfer?.files;
      if (files) handleFiles(files);
    });

    // Click to select
    uploadArea.addEventListener("click", (e) => {
      if (e.target === uploadArea || e.target.closest(".upload-icon")) {
        fileInput.click();
      }
    });
  }

  // Add more PDFs
  const addMoreBtn = document.getElementById("addMoreBtn");
  if (addMoreBtn) {
    addMoreBtn.addEventListener("click", () => fileInput.click());
  }

  // Convert button
  const convertBtn = document.getElementById("convertBtn");
  if (convertBtn) {
    convertBtn.addEventListener("click", convertToJpeg);
  }

  // Success modal actions
  const convertMoreBtn = document.getElementById("convertMoreBtn");
  if (convertMoreBtn) {
    convertMoreBtn.addEventListener("click", () => {
      hideSuccessModal();
      showUploadStage();
      state.pdfGroups = [];
    });
  }

  const goHomeBtn = document.getElementById("goHomeBtn");
  if (goHomeBtn) {
    goHomeBtn.addEventListener("click", () => {
      if (window.featureManager) {
        window.featureManager.deactivateAll();
      }
    });
  }
}

/**
 * Handle file selection
 */
async function handleFiles(files) {
  if (!files || files.length === 0) return;

  const L = LANG[state.currentLang];
  const fileArray = Array.from(files);

  // Validate files
  const validFiles = [];
  for (const file of fileArray) {
    const validation = utils.validatePdfFile(file);
    if (!validation.valid) {
      utils.showToast(`${file.name}: ${validation.error}`, "error");
      continue;
    }

    if (file.size > MAX_FILE_SIZE) {
      utils.showToast(`${file.name}: ${L.errorTooLarge}`, "error");
      continue;
    }

    validFiles.push(file);
  }

  if (validFiles.length === 0) return;

  // Show loading
  const loader = utils.createLoadingOverlay(
    state.currentLang === "ja" ? "PDFを読み込み中..." : "Loading PDFs..."
  );
  loader.show();

  try {
    // Load PDFs
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) {
      throw new Error("PDF.js not loaded");
    }

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      loader.updateMessage(
        `${state.currentLang === "ja" ? "読み込み中" : "Loading"} ${i + 1}/${
          validFiles.length
        }: ${file.name}`
      );

      try {
        const arrayBuffer = await utils.readFileAsArrayBuffer(file);
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        // Generate thumbnail from first page
        const thumbnailUrl = await generateThumbnail(pdf);

        state.pdfGroups.push({
          id: utils.generateId(),
          file,
          pdf,
          name: file.name,
          pageCount: pdf.numPages,
          rotation: 0, // 0, 90, 180, 270
          thumbnailUrl,
        });
      } catch (error) {
        console.error(`Failed to load ${file.name}:`, error);
        utils.showToast(`${file.name}: ${L.errorLoading}`, "error");
      }
    }

    loader.hide();

    // Show preview stage
    if (state.pdfGroups.length > 0) {
      showPreviewStage();
      renderPdfGroups();
    }
  } catch (error) {
    loader.hide();
    console.error("Error handling files:", error);
    utils.showToast(L.errorLoading, "error");
  }
}

/**
 * Generate thumbnail from PDF
 */
async function generateThumbnail(pdf) {
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });

    await page.render({
      canvasContext: ctx,
      viewport,
      intent: "display",
    }).promise;

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          resolve(URL.createObjectURL(blob));
        },
        "image/jpeg",
        0.8
      );
    });
  } catch (error) {
    console.error("Error generating thumbnail:", error);
    return null;
  }
}

/**
 * Show upload stage
 */
function showUploadStage() {
  const uploadStage = document.getElementById("uploadStage");
  const previewStage = document.getElementById("previewStage");

  if (uploadStage) uploadStage.classList.add("active");
  if (previewStage) previewStage.classList.remove("active");
}

/**
 * Show preview stage
 */
function showPreviewStage() {
  const uploadStage = document.getElementById("uploadStage");
  const previewStage = document.getElementById("previewStage");

  if (uploadStage) uploadStage.classList.remove("active");
  if (previewStage) previewStage.classList.add("active");
}

/**
 * Render PDF groups
 */
function renderPdfGroups() {
  const container = document.getElementById("pdfGroupsContainer");
  if (!container) return;

  const L = LANG[state.currentLang];

  container.innerHTML = "";

  state.pdfGroups.forEach((group) => {
    const groupEl = document.createElement("div");
    groupEl.className = "pdf-group";
    groupEl.innerHTML = `
      <button class="delete-btn" data-id="${group.id}">×</button>
      <div class="pdf-thumbnail-wrapper">
        <div class="pdf-thumbnail" data-id="${
          group.id
        }" style="transform: rotate(${group.rotation}deg)">
          ${
            group.thumbnailUrl
              ? `<img src="${group.thumbnailUrl}" alt="${group.name}">`
              : '<div class="thumbnail-loading">Loading...</div>'
          }
        </div>
      </div>
      <div class="pdf-info">
        <h3 class="pdf-name" title="${group.name}">${group.name}</h3>
        <div class="pdf-meta">
          <span>${group.pageCount} ${L.pages}</span>
          <span>${utils.formatFileSize(group.file.size)}</span>
        </div>
      </div>
      <button class="rotate-btn" data-id="${group.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2"/>
        </svg>
        ${L.rotate}
      </button>
    `;

    // Delete button
    const deleteBtn = groupEl.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", () => deleteGroup(group.id));

    // Rotate button
    const rotateBtn = groupEl.querySelector(".rotate-btn");
    rotateBtn.addEventListener("click", () => rotateGroup(group.id));

    container.appendChild(groupEl);
  });

  updateStats();
}

/**
 * Delete PDF group
 */
function deleteGroup(id) {
  const index = state.pdfGroups.findIndex((g) => g.id === id);
  if (index === -1) return;

  const group = state.pdfGroups[index];
  if (group.thumbnailUrl) {
    URL.revokeObjectURL(group.thumbnailUrl);
  }

  state.pdfGroups.splice(index, 1);

  if (state.pdfGroups.length === 0) {
    showUploadStage();
  } else {
    renderPdfGroups();
  }
}

/**
 * Rotate PDF group
 */
function rotateGroup(id) {
  const group = state.pdfGroups.find((g) => g.id === id);
  if (!group) return;

  group.rotation = (group.rotation + 90) % 360;

  const thumbnail = document.querySelector(`.pdf-thumbnail[data-id="${id}"]`);
  if (thumbnail) {
    thumbnail.style.transform = `rotate(${group.rotation}deg)`;
  }
}

/**
 * Update statistics
 */
function updateStats() {
  const totalPdfs = document.getElementById("totalPdfs");
  const totalPages = document.getElementById("totalPages");

  if (totalPdfs) {
    totalPdfs.textContent = state.pdfGroups.length;
  }

  if (totalPages) {
    const total = state.pdfGroups.reduce((sum, g) => sum + g.pageCount, 0);
    totalPages.textContent = total;
  }
}

/**
 * Convert to JPEG
 */
async function convertToJpeg() {
  if (state.processing || state.pdfGroups.length === 0) return;

  state.processing = true;
  const L = LANG[state.currentLang];

  showProgressOverlay();
  updateProgress(0, L.progressDetail);

  try {
    const totalPages = state.pdfGroups.reduce((sum, g) => sum + g.pageCount, 0);
    let processedPages = 0;

    // Create folder name with timestamp
    const now = new Date();
    const folderName = `pdf_to_jpeg_${now.getFullYear()}${String(
      now.getMonth() + 1
    ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(
      now.getHours()
    ).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

    let folderPath = null;

    // Process each PDF group
    for (
      let groupIndex = 0;
      groupIndex < state.pdfGroups.length;
      groupIndex++
    ) {
      const group = state.pdfGroups[groupIndex];
      const pdf = group.pdf;
      const rotation = group.rotation;

      updateProgress(
        Math.floor((processedPages / totalPages) * 100),
        `${L.progressDetail.replace("準備中...", "")}${group.name}`
      );

      // Process pages in batches
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += BATCH_SIZE) {
        const batchEnd = Math.min(pageNum + BATCH_SIZE - 1, pdf.numPages);
        const batchPromises = [];

        for (let i = pageNum; i <= batchEnd; i++) {
          batchPromises.push(renderPageToJpeg(pdf, i, rotation));
        }

        const jpegResults = await Promise.all(batchPromises);

        // Save each JPEG
        for (let i = 0; i < jpegResults.length; i++) {
          const { base64, pageIndex } = jpegResults[i];
          const fileName = `${group.name.replace(/\.pdf$/i, "")}_page_${String(
            pageIndex
          ).padStart(3, "0")}.jpg`;

          const isFirst = folderPath === null && pageIndex === 1;
          const isLast =
            groupIndex === state.pdfGroups.length - 1 &&
            pageIndex === pdf.numPages;

          const result = await window.electronAPI.saveSplitFileDirect(
            fileName,
            base64,
            isFirst,
            isLast,
            folderPath
          );

          if (result.success && isFirst) {
            folderPath = result.path;
          }

          processedPages++;
          updateProgress(
            Math.floor((processedPages / totalPages) * 100),
            `${processedPages} / ${totalPages} ${L.pages}`
          );
        }

        // Allow UI to breathe
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    hideProgressOverlay();
    showSuccessModal(folderPath);
  } catch (error) {
    console.error("Conversion error:", error);
    hideProgressOverlay();
    utils.showToast(L.errorConverting, "error");
  } finally {
    state.processing = false;
  }
}

/**
 * Render PDF page to JPEG
 */
async function renderPageToJpeg(pdf, pageNum, rotation) {
  try {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({
      scale: RENDER_SCALE,
      rotation: rotation,
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });

    // White background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      intent: "print",
    }).promise;

    // Convert to base64 JPEG
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const base64 = dataUrl.split(",")[1];

    // Cleanup
    canvas.width = 0;
    canvas.height = 0;

    return { base64, pageIndex: pageNum };
  } catch (error) {
    console.error(`Error rendering page ${pageNum}:`, error);
    throw error;
  }
}

/**
 * Progress overlay controls
 */
function showProgressOverlay() {
  const overlay = document.getElementById("progressOverlay");
  if (overlay) overlay.classList.add("active");
}

function hideProgressOverlay() {
  const overlay = document.getElementById("progressOverlay");
  if (overlay) overlay.classList.remove("active");
}

function updateProgress(percent, detail) {
  const progressBar = document.getElementById("progressBar");
  const progressPercent = document.getElementById("progressPercent");
  const progressDetail = document.getElementById("progressDetail");

  if (progressBar) progressBar.style.width = `${percent}%`;
  if (progressPercent) progressPercent.textContent = `${percent}%`;
  if (progressDetail && detail) progressDetail.textContent = detail;
}

/**
 * Success modal controls
 */
function showSuccessModal(folderPath) {
  const modal = document.getElementById("successModal");
  const pathEl = document.getElementById("successPath");

  if (pathEl && folderPath) {
    pathEl.textContent = folderPath;
  }

  if (modal) modal.classList.add("active");
}

function hideSuccessModal() {
  const modal = document.getElementById("successModal");
  if (modal) modal.classList.remove("active");
}

export default {
  init,
  cleanup,
};
