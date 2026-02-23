const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");

// Electron hot reload - moved AFTER app import
if (!app.isPackaged) {
  require("electron-reload")(__dirname, {
    electron: require("path").join(
      __dirname,
      "node_modules",
      ".bin",
      "electron"
    ),
    hardResetMethod: "exit",
    ignore: /node_modules|[\/\\]\.|dist|build/,
    forceHardReset: ["main.js", "preload.js"],
  });
}

// A4 dimensions in points (1 point = 1/72 inch)
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 40;

function enableLiveReload() {
  if (!app.isPackaged) {
    if (process.stdin) {
      process.stdin.on("data", (data) => {
        if (data.toString().trim() === "reload") {
          BrowserWindow.getAllWindows().forEach((window) => {
            window.webContents.reloadIgnoringCache();
          });
          console.log("🔄 Renderer reloaded");
        }
      });
    }
  }
}

// ============= LOGGING & AUTO-UPDATE =============
let autoUpdater = null;
let log = null;

// Only load updater in production (packaged app)
if (app.isPackaged) {
  try {
    autoUpdater = require("electron-updater").autoUpdater;
    log = require("electron-log");
    log.transports.file.level = "info";
    autoUpdater.logger = log;
  } catch (error) {
    console.error("Could not load electron-updater:", error.message);
  }
} else {
  console.log("Running in development mode - auto-update disabled");
}

// ============= AUTO-UPDATE CONFIGURATION =============
let mainWindow = null;
let updateCheckInProgress = false;

// Configure auto-updater (only if available)
if (autoUpdater) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  // ✅ CRITICAL: Force silent installation for seamless updates
  autoUpdater.forceRunAfter = true; // Force restart after download

  // Enhanced logging
  log.info("=".repeat(60));
  log.info("🔧 AUTO-UPDATER INITIALIZATION");
  log.info("=".repeat(60));
  log.info("Silent Installation: ENABLED");
  log.info("Force Restart After Update: ENABLED");
  log.info(`Current Version: ${app.getVersion()}`);
  log.info(`App Name: ${app.getName()}`);
  log.info(`Is Packaged: ${app.isPackaged}`);
  log.info(`Platform: ${process.platform}`);
  log.info(`Arch: ${process.arch}`);

  //GitHub repository
  const feedConfig = {
    provider: "github",
    owner: "AllagikhabyshikiGaisya",
    repo: "PDF-merger",
    releaseType: "release",
  };

  log.info("GitHub Feed Configuration:", feedConfig);
  autoUpdater.setFeedURL(feedConfig);

  // Verify feed URL was set
  const feedURL = autoUpdater.getFeedURL();
  log.info(`Feed URL set to: ${feedURL}`);
  log.info("=".repeat(60));

  let updateDownloadProgress = 0;
  let updateInfo = null;

  autoUpdater.on("checking-for-update", () => {
    log.info("\n" + "=".repeat(60));
    log.info("🔍 UPDATE CHECK STARTED (SILENT)");
    log.info("=".repeat(60));
    log.info(`Timestamp: ${new Date().toISOString()}`);
    log.info(`Current Version: ${app.getVersion()}`);
    log.info(`Feed URL: ${autoUpdater.getFeedURL()}`);
    log.info("Querying GitHub releases API silently...");

    // ❌ REMOVED: Don't send status to window during check
    // This keeps the check silent in the background
  });

  autoUpdater.on("update-available", (info) => {
    log.info("\n" + "=".repeat(60));
    log.info("✅ UPDATE AVAILABLE - SHOWING MODAL");
    log.info("=".repeat(60));
    log.info(`Current Version: ${app.getVersion()}`);
    log.info(`New Version: ${info.version}`);
    log.info(`Release Date: ${info.releaseDate}`);
    log.info(`Release Notes: ${info.releaseNotes || "N/A"}`);
    log.info(
      `Files to download:`,
      info.files?.map((f) => ({
        url: f.url,
        size: `${Math.round(f.size / 1024 / 1024)}MB`,
      }))
    );
    log.info("=".repeat(60));

    updateInfo = info;

    // ✅ NOW show the modal since update is actually available
    sendStatusToWindow("update-available", {
      version: info.version,
      currentVersion: app.getVersion(),
      releaseDate: info.releaseDate,
      message: `新しいバージョン ${info.version} が利用可能です`,
      messageEn: `New version ${info.version} is available`,
      autoDownloading: true,
    });

    // ✅ Update will auto-download because autoDownload = true
    log.info("📥 Starting automatic download...");
  });

  autoUpdater.on("update-not-available", (info) => {
    log.info("\n" + "=".repeat(60));
    log.info("✅ NO UPDATE AVAILABLE - STAYING SILENT");
    log.info("=".repeat(60));
    log.info(`Current Version: ${app.getVersion()}`);
    log.info(`Latest Version: ${info.version}`);
    log.info(`Release Date: ${info.releaseDate || "N/A"}`);
    log.info("App is already on the latest version");
    log.info("No UI notification needed");
    log.info("=".repeat(60) + "\n");

    // ❌ REMOVED: Don't notify user when no update exists
    // Silent background check completed successfully

    updateCheckInProgress = false;
  });

  autoUpdater.on("error", (err) => {
    log.error("\n" + "=".repeat(60));
    log.error("❌ UPDATE ERROR");
    log.error("=".repeat(60));
    log.error(`Error Type: ${err.name}`);
    log.error(`Error Message: ${err.message}`);

    // Check if error is related to installation
    if (
      err.message.includes("elevation") ||
      err.message.includes("permissions")
    ) {
      log.error("⚠️ DIAGNOSIS: Installation requires elevated permissions");
      log.error("   - User might have denied UAC prompt");
      log.error("   - Try running as administrator");
      log.error("   - Or use perMachine: false in package.json");
    }
    log.error(`Error Stack:`, err.stack);
    log.error(`Current Version: ${app.getVersion()}`);
    log.error(`Feed URL: ${autoUpdater.getFeedURL()}`);

    // Additional diagnostic info
    if (err.message.includes("404")) {
      log.error("⚠️ DIAGNOSIS: GitHub release not found (404)");
      log.error("   - Check that release v2.1.3 exists in GitHub");
      log.error("   - Verify release is published (not draft)");
      log.error("   - Confirm release assets are attached");
    } else if (err.message.includes("rate limit")) {
      log.error("⚠️ DIAGNOSIS: GitHub API rate limit exceeded");
      log.error("   - Wait 1 hour or use authenticated requests");
    } else if (
      err.message.includes("ENOTFOUND") ||
      err.message.includes("ETIMEDOUT")
    ) {
      log.error("⚠️ DIAGNOSIS: Network connectivity issue");
      log.error("   - Check internet connection");
      log.error("   - Verify GitHub is accessible");
    } else if (err.message.includes("Could not get code signature")) {
      log.error("⚠️ DIAGNOSIS: Code signing issue (can be ignored in testing)");
    }

    log.error("=".repeat(60) + "\n");

    sendStatusToWindow("update-error", {
      message: "アップデートエラーが発生しました",
      messageEn: "Update error occurred",
      error: err.message,
      canRetry: true,
    });
    updateCheckInProgress = false;
  });

  // 4. Download progress
  autoUpdater.on("download-progress", (progressObj) => {
    updateDownloadProgress = Math.round(progressObj.percent);
    const message = {
      percent: updateDownloadProgress,
      transferred:
        Math.round((progressObj.transferred / 1024 / 1024) * 10) / 10,
      total: Math.round((progressObj.total / 1024 / 1024) * 10) / 10,
      bytesPerSecond: Math.round(progressObj.bytesPerSecond / 1024),
    };

    log.info(`📥 Download progress: ${message.percent}%`);
    sendStatusToWindow("update-progress", message);
  });
  // 5. Update downloaded - Force restart with silent installation
  autoUpdater.on("update-downloaded", (info) => {
    log.info("✅ Update downloaded:", info.version);
    log.info("🔄 Preparing SILENT installation...");

    sendStatusToWindow("update-downloaded", {
      version: info.version,
      message: "アップデートをインストール中...",
      messageEn: "Installing update...",
    });

    // ✅ Force quit and install immediately with silent flags
    setTimeout(() => {
      log.info("=".repeat(60));
      log.info("🚀 INITIATING SILENT UPDATE INSTALLATION");
      log.info("=".repeat(60));
      log.info(`New Version: ${info.version}`);
      log.info("Installation Mode: SILENT (no user interaction)");
      log.info("Action: Uninstall old → Install new → Auto-restart");
      log.info("=".repeat(60));

      // Remove listeners to prevent app from staying open
      app.removeAllListeners("window-all-closed");

      // Force quit and install silently
      // Parameters: (isSilent=true, isForceRunAfter=true)
      autoUpdater.quitAndInstall(true, true);

      log.info(
        "✅ Silent installation initiated - app will restart automatically"
      );
    }, 2000);
  });
}

function sendStatusToWindow(channel, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

function checkForUpdates(showNoUpdateDialog = false) {
  if (!app.isPackaged || !autoUpdater) {
    console.log("Auto-update not available in development mode");
    if (showNoUpdateDialog) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Updates Not Available",
        message: "Auto-update is only available in the installed version",
        buttons: ["OK"],
      });
    }
    return;
  }

  if (updateCheckInProgress) {
    log.info("⏳ Update check already in progress - skipping");
    return;
  }

  log.info("\n" + "🚀 ".repeat(30));
  log.info("INITIATING UPDATE CHECK");
  log.info("🚀 ".repeat(30));
  log.info(`Trigger: ${showNoUpdateDialog ? "Manual" : "Automatic"}`);
  log.info(`Timestamp: ${new Date().toISOString()}`);

  updateCheckInProgress = true;

  autoUpdater
    .checkForUpdates()
    .then((result) => {
      log.info("\n📦 UPDATE CHECK RESULT:");
      log.info(`Update Info:`, JSON.stringify(result.updateInfo, null, 2));
      log.info(
        `Cancellation Token: ${result.cancellationToken ? "Active" : "None"}`
      );

      const hasUpdate = result.updateInfo.version !== app.getVersion();
      log.info(`Has Update: ${hasUpdate}`);

      if (showNoUpdateDialog && !hasUpdate) {
        log.info("Showing 'no update' dialog to user");
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "No Updates",
          message: "You are already using the latest version!",
          buttons: ["OK"],
        });
      }
    })
    .catch((err) => {
      log.error("\n💥 UPDATE CHECK FAILED:");
      log.error(`Error: ${err.message}`);
      log.error(`Stack: ${err.stack}`);
      log.error(`Code: ${err.code || "N/A"}`);

      updateCheckInProgress = false;

      if (showNoUpdateDialog) {
        log.error("Showing error dialog to user");
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Update Check Failed",
          message: "Could not check for updates",
          detail: `${err.message}\n\nCheck logs for details.`,
          buttons: ["OK"],
        });
      }
    });
}

// ============= MENU =============
// function createMenu() {
//   const template = [
//     {
//       label: "File",
//       submenu: [{ role: "quit" }],
//     },
//     {
//       label: "Edit",
//       submenu: [
//         { role: "undo" },
//         { role: "redo" },
//         { type: "separator" },
//         { role: "cut" },
//         { role: "copy" },
//         { role: "paste" },
//       ],
//     },
//     {
//       label: "View",
//       submenu: [
//         { role: "reload" },
//         { role: "forceReload" },
//         { role: "toggleDevTools" },
//         { type: "separator" },
//         { role: "resetZoom" },
//         { role: "zoomIn" },
//         { role: "zoomOut" },
//         { type: "separator" },
//         { role: "togglefullscreen" },
//       ],
//     },
//     {
//       label: "Help",
//       submenu: [
//         {
//           label: "Check for Updates",
//           click: () => {
//             checkForUpdates(true);
//           },
//         },
//         { type: "separator" },
//         {
//           label: "About",
//           click: () => {
//             dialog.showMessageBox(mainWindow, {
//               type: "info",
//               title: "About PDF Merger",
//               message: "PDF Merger",
//               detail: `Version: ${app.getVersion()}\n\nLocal PDF & Image Merger\nAll processing happens on your computer\n\nDeveloped by Utsav Adhikari\nLicense: MIT`,
//               buttons: ["OK"],
//             });
//           },
//         },
//       ],
//     },
//   ];

//   const menu = Menu.buildFromTemplate(template);
//   Menu.setApplicationMenu(menu);
// }

// ============= WINDOW MANAGEMENT =============
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, "icon.png"),
    show: false, // Don't show until ready
  });

  mainWindow.loadFile("index.html");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();

    // ✅ Initialize update modal system (but don't show it)
    if (app.isPackaged && autoUpdater) {
      mainWindow.webContents.executeJavaScript(`
        window.createUpdateModal && window.createUpdateModal();
      `);

      // ✅ Check for updates silently in background after 2 seconds
      setTimeout(() => {
        log.info("🚀 Starting silent background update check...");
        checkForUpdates(false);
      }, 2000);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Create menu
  // createMenu();
}

app.whenReady().then(() => {
  createWindow();
  enableLiveReload();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ============= IPC HANDLERS =============

// Manual update check
ipcMain.handle("check-for-updates", async () => {
  if (!app.isPackaged || !autoUpdater) {
    return {
      available: false,
      message: "Updates only work in production build",
      currentVersion: app.getVersion(),
    };
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        available: false,
        error: "Update check timeout",
        currentVersion: app.getVersion(),
      });
    }, 10000);

    autoUpdater
      .checkForUpdates()
      .then((result) => {
        clearTimeout(timeout);
        const updateAvailable = result.updateInfo.version !== app.getVersion();
        resolve({
          available: updateAvailable,
          currentVersion: app.getVersion(),
          latestVersion: result.updateInfo.version,
          releaseDate: result.updateInfo.releaseDate,
        });
      })
      .catch((error) => {
        clearTimeout(timeout);
        resolve({
          available: false,
          error: error.message,
          currentVersion: app.getVersion(),
        });
      });
  });
});

// Get current version
ipcMain.handle("get-version", async () => {
  return {
    version: app.getVersion(),
    name: app.getName(),
    isPackaged: app.isPackaged,
  };
});

// ============= PDF MERGING =============
function normalizeBuffer(bufLike) {
  if (!bufLike) return Buffer.alloc(0);
  if (Buffer.isBuffer(bufLike)) return bufLike;
  if (Array.isArray(bufLike)) return Buffer.from(bufLike);
  if (bufLike instanceof ArrayBuffer) return Buffer.from(bufLike);
  if (ArrayBuffer.isView(bufLike))
    return Buffer.from(bufLike.buffer, bufLike.byteOffset, bufLike.byteLength);
  try {
    return Buffer.from(bufLike);
  } catch (e) {
    return Buffer.alloc(0);
  }
}

ipcMain.handle("merge-files", async (event, filesArray) => {
  try {
    if (!filesArray || filesArray.length < 1)
      throw new Error("No files provided");

    // ✅ Debug: Log incoming files
    console.log(
      `🔧 Main process: Received ${filesArray.length} files to merge`
    );
    filesArray.forEach((f, i) => {
      const bufferSize = f.buffer?.byteLength || f.buffer?.length || 0;
      console.log(
        `  File ${i + 1}: ${f.name} (${f.type}) - ${bufferSize} bytes`
      );
    });

    const mergedPdf = await PDFDocument.create();
    const BATCH_SIZE = 3;

    for (let i = 0; i < filesArray.length; i += BATCH_SIZE) {
      const batch = filesArray.slice(i, i + BATCH_SIZE);

      // Send progress BEFORE processing batch
      const startProgress = Math.round((i / filesArray.length) * 100);
      event.sender.send("merge-progress", startProgress);

      const processedPages = await Promise.all(
        batch.map(async (f) => {
          const name = f.name || "unknown";
          const type = f.type || "";
          const buffer = normalizeBuffer(f.buffer);

          if (!buffer || buffer.length === 0) {
            console.warn(`⚠️ Empty buffer for ${name}`);
            return null;
          }

          try {
            if (type === "application/pdf" || /\.pdf$/i.test(name)) {
              const pdfDoc = await PDFDocument.load(buffer, {
                ignoreEncryption: true,
                updateMetadata: false,
                throwOnInvalidObject: false,
              });
              return { type: "pdf", doc: pdfDoc };
            } else if (
              type.startsWith("image/") ||
              /\.(png|jpe?g|jpg)$/i.test(name)
            ) {
              let embedded;
              if (type === "image/jpeg" || /\.jpe?g|jpg$/i.test(name)) {
                embedded = await mergedPdf.embedJpg(buffer);
              } else {
                try {
                  embedded = await mergedPdf.embedPng(buffer);
                } catch {
                  embedded = await mergedPdf.embedJpg(buffer);
                }
              }

              const imgWidth = embedded.width;
              const imgHeight = embedded.height;
              const maxWidth = A4_WIDTH - 2 * MARGIN;
              const maxHeight = A4_HEIGHT - 2 * MARGIN;

              const scaleX = maxWidth / imgWidth;
              const scaleY = maxHeight / imgHeight;
              const scale = Math.min(scaleX, scaleY);

              const scaledWidth = imgWidth * scale;
              const scaledHeight = imgHeight * scale;

              const x = (A4_WIDTH - scaledWidth) / 2;
              const y = (A4_HEIGHT - scaledHeight) / 2;

              return {
                type: "image",
                embedded,
                x,
                y,
                width: scaledWidth,
                height: scaledHeight,
              };
            }
          } catch (err) {
            console.error("Error processing file:", name, err.message);
            return null;
          }

          return null;
        })
      );

      for (const processed of processedPages) {
        if (!processed) continue;

        if (processed.type === "pdf") {
          const pageIndices = processed.doc.getPageIndices();
          const copied = await mergedPdf.copyPages(processed.doc, pageIndices);
          copied.forEach((p) => mergedPdf.addPage(p));
        } else if (processed.type === "image") {
          const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);
          page.drawImage(processed.embedded, {
            x: processed.x,
            y: processed.y,
            width: processed.width,
            height: processed.height,
          });
        }
      }

      // Send progress AFTER processing batch
      const endProgress = Math.round(
        ((i + batch.length) / filesArray.length) * 100
      );
      event.sender.send("merge-progress", endProgress);

      // ✅ Smaller yield for smoother UI
      await new Promise((resolve) => setImmediate(resolve));
    }

    const mergedBytes = await mergedPdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 50,
    });

    // ✅ Debug: Verify output
    console.log(
      `✅ Main process: Merged PDF created - ${mergedBytes.length} bytes`
    );
    console.log(`  Pages: ${mergedPdf.getPageCount()}`);

    return { success: true, bytes: Array.from(mergedBytes) };
  } catch (err) {
    console.error("Merge error:", err);
    return { success: false, message: err.message || String(err) };
  }
});

// ============= PERFORMANCE-TRACKED CHUNKED PDF MERGING =============
ipcMain.handle("merge-files-chunk", async (event, { files, existingPdf }) => {
  const chunkStartTime = Date.now();
  const timings = {};

  try {
    if (!files || files.length < 1) throw new Error("No files provided");

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔧 CHUNK START: ${files.length} files`);
    console.log(`${"=".repeat(60)}`);

    // TIMING 1: PDF Loading
    const loadStartTime = Date.now();
    let mergedPdf;
    if (existingPdf && existingPdf.length > 0) {
      mergedPdf = await PDFDocument.load(Buffer.from(existingPdf), {
        ignoreEncryption: true,
        updateMetadata: false,
      });
      console.log(`📄 Continuing from ${mergedPdf.getPageCount()} pages`);
    } else {
      mergedPdf = await PDFDocument.create();
    }
    timings.pdfLoad = Date.now() - loadStartTime;

    // TIMING 2: File Processing (Parallel)
    const processStartTime = Date.now();
    const results = await Promise.allSettled(
      files.map(async (f) => {
        const fileStartTime = Date.now();
        const name = f.name || "unknown";
        const type = f.type || "";
        const buffer = normalizeBuffer(f.buffer);

        if (!buffer || buffer.length === 0) {
          console.warn(`⚠️  Empty buffer: ${name}`);
          return null;
        }

        try {
          if (type === "application/pdf" || /\.pdf$/i.test(name)) {
            const pdfDoc = await PDFDocument.load(buffer, {
              ignoreEncryption: true,
              updateMetadata: false,
              throwOnInvalidObject: false,
            });
            const fileTime = Date.now() - fileStartTime;
            console.log(
              `   ✓ PDF loaded: ${name} (${fileTime}ms, ${pdfDoc.getPageCount()} pages)`
            );
            return { type: "pdf", doc: pdfDoc, name, loadTime: fileTime };
          } else if (
            type.startsWith("image/") ||
            /\.(png|jpe?g|jpg)$/i.test(name)
          ) {
            const fileTime = Date.now() - fileStartTime;
            console.log(
              `   ✓ Image loaded: ${name} (${fileTime}ms, ${Math.round(
                buffer.length / 1024
              )}KB)`
            );
            return {
              type: "image",
              buffer,
              name,
              mimeType: type,
              loadTime: fileTime,
            };
          }
        } catch (err) {
          const fileTime = Date.now() - fileStartTime;
          console.warn(`   ✗ Failed: ${name} (${fileTime}ms) - ${err.message}`);
          return null;
        }
        return null;
      })
    );
    timings.fileProcessing = Date.now() - processStartTime;

    // TIMING 3: Result Collection
    const collectStartTime = Date.now();
    const validResults = results
      .filter(
        (r) =>
          r.status === "fulfilled" && r.value !== null && r.value !== undefined
      )
      .map((r) => r.value);
    timings.resultCollection = Date.now() - collectStartTime;

    const skippedCount = files.length - validResults.length;
    console.log(
      `\n📊 Loaded: ${validResults.length}/${files.length} files ${
        skippedCount > 0 ? `(skipped ${skippedCount})` : ""
      }`
    );

    // TIMING 4: PDF Assembly
    const assemblyStartTime = Date.now();
    let pdfCount = 0;
    let imageCount = 0;

    for (const result of validResults) {
      if (result.type === "pdf") {
        const pageIndices = result.doc.getPageIndices();
        const copied = await mergedPdf.copyPages(result.doc, pageIndices);
        copied.forEach((p) => mergedPdf.addPage(p));
        pdfCount++;
      } else if (result.type === "image") {
        let embedded;
        if (
          result.mimeType === "image/jpeg" ||
          /\.jpe?g|jpg$/i.test(result.name)
        ) {
          embedded = await mergedPdf.embedJpg(result.buffer);
        } else {
          try {
            embedded = await mergedPdf.embedPng(result.buffer);
          } catch {
            embedded = await mergedPdf.embedJpg(result.buffer);
          }
        }

        const imgWidth = embedded.width;
        const imgHeight = embedded.height;
        const maxWidth = A4_WIDTH - 2 * MARGIN;
        const maxHeight = A4_HEIGHT - 2 * MARGIN;
        const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
        const scaledWidth = imgWidth * scale;
        const scaledHeight = imgHeight * scale;

        const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);
        page.drawImage(embedded, {
          x: (A4_WIDTH - scaledWidth) / 2,
          y: (A4_HEIGHT - scaledHeight) / 2,
          width: scaledWidth,
          height: scaledHeight,
        });
        imageCount++;
      }
    }
    timings.pdfAssembly = Date.now() - assemblyStartTime;

    // TIMING 5: PDF Save
    const saveStartTime = Date.now();
    const mergedBytes = await mergedPdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 100,
    });
    timings.pdfSave = Date.now() - saveStartTime;

    // TIMING 6: Array Conversion
    const convertStartTime = Date.now();
    const bytesArray = Array.from(mergedBytes);
    timings.arrayConversion = Date.now() - convertStartTime;

    const totalTime = Date.now() - chunkStartTime;

    // Performance Summary
    console.log(`\n⏱️  PERFORMANCE BREAKDOWN:`);
    console.log(`   PDF Load:          ${timings.pdfLoad}ms`);
    console.log(`   File Processing:   ${timings.fileProcessing}ms (parallel)`);
    console.log(`   Result Collection: ${timings.resultCollection}ms`);
    console.log(
      `   PDF Assembly:      ${timings.pdfAssembly}ms (${pdfCount} PDFs, ${imageCount} images)`
    );
    console.log(`   PDF Save:          ${timings.pdfSave}ms`);
    console.log(`   Array Conversion:  ${timings.arrayConversion}ms`);
    console.log(`   ─────────────────────────────────────`);
    console.log(`   TOTAL TIME:        ${totalTime}ms`);
    console.log(
      `\n✅ Output: ${Math.round(
        mergedBytes.length / 1024 / 1024
      )}MB, ${mergedPdf.getPageCount()} pages`
    );
    console.log(`${"=".repeat(60)}\n`);

    return { success: true, bytes: bytesArray };
  } catch (err) {
    const totalTime = Date.now() - chunkStartTime;
    console.error(`\n❌ CHUNK FAILED after ${totalTime}ms:`, err.message);
    console.error(`   Timings so far:`, timings);
    console.error(`${"=".repeat(60)}\n`);
    return { success: false, message: err.message || String(err) };
  }
});

ipcMain.handle("save-bytes", async (event, { fileName, bytes }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Save PDF",
      defaultPath: fileName || "merged.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (canceled || !filePath) return { success: false, message: "canceled" };

    // ✅ Handle both Array and Uint8Array efficiently
    const buffer =
      bytes instanceof Uint8Array
        ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        : Buffer.from(bytes);

    await fs.promises.writeFile(filePath, buffer);
    return { success: true, path: filePath };
  } catch (err) {
    console.error("save-bytes error", err);
    return { success: false, message: err.message || String(err) };
  }
});

ipcMain.handle("save-bytes-base64", async (event, { fileName, base64 }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Save PDF",
      defaultPath: fileName || "merged.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (canceled || !filePath) {
      console.log("❌ Save dialog cancelled by user");
      return { success: false, message: "canceled" };
    }

    console.log(`💾 Saving PDF: ${fileName}`);
    console.log(
      `   Size: ${Math.round((base64.length / 1024 / 1024) * 0.75)}MB`
    );

    // Convert base64 directly to buffer
    const buffer = Buffer.from(base64, "base64");

    console.log(`   Buffer size: ${Math.round(buffer.length / 1024 / 1024)}MB`);

    await fs.promises.writeFile(filePath, buffer);

    console.log(`✅ PDF saved successfully: ${filePath}`);
    return { success: true, path: filePath };
  } catch (err) {
    console.error("❌ save-bytes-base64 error:", err);
    return { success: false, message: err.message || String(err) };
  }
});
// Add this after the save-bytes handler (around line 450)
ipcMain.handle("save-split-folder", async (event, files) => {
  try {
    // Create timestamp-based folder name: YYYYMMDD_HHMM_split
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    const folderName = `${year}${month}${day}_${hour}${minute}_split`;

    // Get user's Downloads folder
    const downloadsPath = app.getPath("downloads");

    // Create full folder path
    let folderPath = path.join(downloadsPath, folderName);

    // Check if folder exists, if so add counter
    let counter = 1;
    while (fs.existsSync(folderPath)) {
      folderPath = path.join(downloadsPath, `${folderName}_${counter}`);
      counter++;
    }

    // Create the folder
    await fs.promises.mkdir(folderPath, { recursive: true });

    // Save all files into the folder
    for (const file of files) {
      const filePath = path.join(folderPath, file.name);
      const buffer = Buffer.from(file.bytes);
      await fs.promises.writeFile(filePath, buffer);
    }

    return { success: true, path: folderPath };
  } catch (err) {
    console.error("save-split-folder error:", err);
    return { success: false, message: err.message || String(err) };
  }
});
// Add this new handler after save-split-folder
ipcMain.handle(
  "save-split-folder-batch",
  async (event, { files, folderPath }) => {
    try {
      let targetFolder = folderPath;

      // Create folder on first batch
      if (!targetFolder) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const hour = String(now.getHours()).padStart(2, "0");
        const minute = String(now.getMinutes()).padStart(2, "0");
        const folderName = `${year}${month}${day}_${hour}${minute}_split`;

        const downloadsPath = app.getPath("downloads");
        targetFolder = path.join(downloadsPath, folderName);

        let counter = 1;
        while (fs.existsSync(targetFolder)) {
          targetFolder = path.join(downloadsPath, `${folderName}_${counter}`);
          counter++;
        }

        await fs.promises.mkdir(targetFolder, { recursive: true });
      }

      // Save files in this batch
      for (const file of files) {
        const filePath = path.join(targetFolder, file.name);
        const buffer = Buffer.from(file.bytes);
        await fs.promises.writeFile(filePath, buffer);
      }

      return { success: true, path: targetFolder };
    } catch (err) {
      console.error("save-split-folder-batch error:", err);
      return { success: false, message: err.message || String(err) };
    }
  }
);

// ============= LARGE FILE SPLIT HANDLER (STREAMING) =============
ipcMain.handle(
  "save-split-file-direct",
  async (event, { fileName, base64Chunk, isFirst, isLast, folderPath }) => {
    try {
      let targetFolder = folderPath;

      // Create folder on first chunk
      if (isFirst && !folderPath) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const hour = String(now.getHours()).padStart(2, "0");
        const minute = String(now.getMinutes()).padStart(2, "0");
        const folderName = `${year}${month}${day}_${hour}${minute}_split`;

        const downloadsPath = app.getPath("downloads");
        targetFolder = path.join(downloadsPath, folderName);

        let counter = 1;
        while (fs.existsSync(targetFolder)) {
          targetFolder = path.join(downloadsPath, `${folderName}_${counter}`);
          counter++;
        }

        await fs.promises.mkdir(targetFolder, { recursive: true });
      }

      const filePath = path.join(targetFolder, fileName);
      const buffer = Buffer.from(base64Chunk, "base64");

      // Append or create file
      if (isFirst) {
        await fs.promises.writeFile(filePath, buffer);
      } else {
        await fs.promises.appendFile(filePath, buffer);
      }

      return {
        success: true,
        path: targetFolder,
        fileComplete: isLast,
      };
    } catch (err) {
      console.error("save-split-file-direct error:", err);
      return { success: false, message: err.message || String(err) };
    }
  }
);
// ============= CHUNKED PDF SAVE HANDLER (FOR LARGE MERGED PDFS) =============
ipcMain.handle(
  "save-chunked-base64",
  async (event, { fileName, base64Chunk, isFirst, isLast }) => {
    try {
      // Use Downloads folder by default for merged PDFs
      const downloadsPath = app.getPath("downloads");
      const filePath = path.join(downloadsPath, fileName);

      const buffer = Buffer.from(base64Chunk, "base64");

      // Write or append
      if (isFirst) {
        await fs.promises.writeFile(filePath, buffer);
        console.log(`📝 Started writing: ${fileName}`);
      } else {
        await fs.promises.appendFile(filePath, buffer);
      }

      if (isLast) {
        console.log(`✅ Completed writing: ${fileName}`);
        return { success: true, path: filePath };
      }

      return { success: true, path: filePath, partial: true };
    } catch (err) {
      console.error("save-chunked-base64 error:", err);
      return { success: false, message: err.message || String(err) };
    }
  }
);
// ============= PDF COMPRESS SAVE HANDLERS =============
function normalizePdfFileName(fileName, fallbackName) {
  const raw = (fileName || fallbackName || "compressed.pdf").trim();
  const safe = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
}

function ensureUniqueFilePath(targetPath) {
  const parsed = path.parse(targetPath);
  let candidate = targetPath;
  let counter = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(parsed.dir, `${parsed.name}_${counter}${parsed.ext}`);
    counter += 1;
  }

  return candidate;
}

function payloadToBuffer(payload) {
  if (!payload) {
    throw new Error("No data payload provided");
  }

  if (payload.bytes !== undefined && payload.bytes !== null) {
    const bytes = payload.bytes;

    if (bytes instanceof Uint8Array) {
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
    if (ArrayBuffer.isView(bytes)) {
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
    if (bytes instanceof ArrayBuffer) {
      return Buffer.from(bytes);
    }
    if (Array.isArray(bytes)) {
      return Buffer.from(bytes);
    }

    throw new Error("Unsupported bytes payload format");
  }

  if (typeof payload.base64Data === "string") {
    return Buffer.from(payload.base64Data, "base64");
  }
  if (typeof payload.base64 === "string") {
    return Buffer.from(payload.base64, "base64");
  }

  throw new Error("No file data provided");
}

ipcMain.handle("save-pdf-file", async (event, payload = {}) => {
  try {
    const suggestedName = normalizePdfFileName(
      payload.fileName,
      `compressed_${Date.now()}.pdf`
    );
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Save PDF",
      defaultPath: suggestedName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (canceled || !filePath) {
      return { success: false, message: "canceled" };
    }

    const buffer = payloadToBuffer(payload);
    await fs.promises.writeFile(filePath, buffer);

    console.log(`✅ Saved compressed PDF: ${filePath}`);
    return { success: true, path: filePath };
  } catch (err) {
    console.error("save-pdf-file error:", err);
    return { success: false, message: err.message || String(err) };
  }
});

ipcMain.handle("save-multiple-pdf-files", async (event, payload = {}) => {
  try {
    const { files } = payload;

    if (!Array.isArray(files) || files.length === 0) {
      return { success: false, message: "No files to save" };
    }

    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Select Folder to Save Compressed PDFs",
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "Save Here",
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, message: "canceled" };
    }

    const selectedFolder = filePaths[0];
    const savedPaths = [];

    // Save all files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const suggestedName = normalizePdfFileName(
        file?.name,
        `compressed_${i + 1}.pdf`
      );
      const targetPath = ensureUniqueFilePath(
        path.join(selectedFolder, suggestedName)
      );
      const buffer = payloadToBuffer(file);
      await fs.promises.writeFile(targetPath, buffer);
      savedPaths.push(targetPath);
    }

    console.log(
      `✅ Saved ${savedPaths.length} compressed PDFs to: ${selectedFolder}`
    );
    return { success: true, path: selectedFolder, files: savedPaths };
  } catch (err) {
    console.error("save-multiple-pdf-files error:", err);
    return { success: false, message: err.message || String(err) };
  }
});
// ============= PDF ROTATE SAVE HANDLERS =============

/**
 * Save single rotated PDF with file dialog
 */
ipcMain.handle(
  "save-rotated-pdf-file",
  async (event, { fileName, base64Data }) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Save Rotated PDF",
        defaultPath: fileName || "rotated.pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });

      if (canceled || !filePath) {
        return { success: false, message: "canceled" };
      }

      const buffer = Buffer.from(base64Data, "base64");
      await fs.promises.writeFile(filePath, buffer);

      console.log(`✅ Saved rotated PDF: ${filePath}`);
      return { success: true, path: filePath };
    } catch (err) {
      console.error("save-rotated-pdf-file error:", err);
      return { success: false, message: err.message || String(err) };
    }
  }
);

/**
 * Save multiple rotated PDFs with folder dialog
 */
ipcMain.handle("save-rotated-pdf-folder", async (event, { files }) => {
  try {
    // Show folder selection dialog
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Select Folder to Save Rotated PDFs",
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "Save Here",
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, message: "canceled" };
    }

    const selectedFolder = filePaths[0];

    // Create a timestamp subfolder for organization
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    const folderName = `rotated_${year}${month}${day}_${hour}${minute}`;

    const targetFolder = path.join(selectedFolder, folderName);

    // Create the subfolder
    await fs.promises.mkdir(targetFolder, { recursive: true });

    // Save all files
    for (const file of files) {
      const filePath = path.join(targetFolder, file.name);
      const buffer = Buffer.from(file.base64Data, "base64");
      await fs.promises.writeFile(filePath, buffer);
    }

    console.log(`✅ Saved ${files.length} rotated PDFs to: ${targetFolder}`);
    return { success: true, path: targetFolder };
  } catch (err) {
    console.error("save-rotated-pdf-folder error:", err);
    return { success: false, message: err.message || String(err) };
  }
});
