/**
 * @typedef {Object} ScanResult
 * @property {string} domain Original user input domain string.
 * @property {"Valid"|"Empty File"|"Error"} status Human-readable scan status.
 * @property {number} lines Count of valid DIRECT/RESELLER records.
 * @property {string} url Resolved URL used for the result, or "-" when unresolved.
 * @property {"valid"|"empty"|"error"} cssClass CSS status class used in table rendering.
 */

function initPopup() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const modeToggleBtn = document.getElementById('modeToggleBtn');
  const standardModeView = document.getElementById('standardModeView');
  const bulkModeView = document.getElementById('bulkModeView');

  const checkBtn = document.getElementById('checkBtn');
  const stopBtn = document.getElementById('stopBtn');
  const loadFileBtn = document.getElementById('loadFileBtn');
  const fileInput = document.getElementById('fileInput');
  const downloadBtn = document.getElementById('downloadBtn');
  const domainInput = document.getElementById('domainList');
  const fileTypeSelect = document.getElementById('fileTypeSelect');
  const tableBody = document.querySelector('#resultsTable tbody');
  const statusText = document.getElementById('statusText');
  const progressText = document.getElementById('progressText');

  const bulkLoadFileBtn = document.getElementById('bulkLoadFileBtn');
  const bulkFileInput = document.getElementById('bulkFileInput');
  const bulkFileTypeSelect = document.getElementById('bulkFileTypeSelect');
  const bulkCheckBtn = document.getElementById('bulkCheckBtn');
  const bulkStopBtn = document.getElementById('bulkStopBtn');
  const bulkDownloadBtn = document.getElementById('bulkDownloadBtn');
  const bulkFileStatus = document.getElementById('bulkFileStatus');
  const bulkProgressValue = document.getElementById('bulkProgressValue');
  const bulkTimeValue = document.getElementById('bulkTimeValue');

  let results = [];
  let isScanning = false;
  let currentTheme = localStorage.getItem('theme') || 'light';
  let isBulkMode = false;
  
  let bulkLines = [];
  let bulkTimerInterval = null;
  let bulkStartTime = 0;
  let bulkResultsArray = [];

  applyTheme(currentTheme);
  updateThemeBtnText(currentTheme);

  // Block mode switching while a scan is running to avoid mixed UI state.
  modeToggleBtn.addEventListener('click', () => {
    if (isScanning) return;
    isBulkMode = !isBulkMode;
    if (isBulkMode) {
      modeToggleBtn.innerText = 'Standard Mode';
      standardModeView.style.display = 'none';
      bulkModeView.style.display = 'block';
    } else {
      modeToggleBtn.innerText = 'Bulk Mode';
      standardModeView.style.display = 'block';
      bulkModeView.style.display = 'none';
    }
  });

  function updateThemeBtnText(theme) {
    themeToggleBtn.innerText = theme === 'light' ? 'Dark Theme' : 'Light Theme';
  }

  function handleThemeToggle() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', currentTheme);
    applyTheme(currentTheme);
    updateThemeBtnText(currentTheme);
  }
  themeToggleBtn.addEventListener('click', handleThemeToggle);

  // Standard mode handlers.

  loadFileBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      domainInput.value = event.target.result;
      const count = domainInput.value.split('\n').map(l => l.trim()).filter(l => l).length;
      statusText.innerText = `Loaded ${count} domains from file`;
      fileInput.value = '';
    };
    reader.readAsText(file);
  });

  stopBtn.addEventListener('click', () => {
    isScanning = false;
    statusText.innerText = 'Stopping after current batch...';
    stopBtn.disabled = true;
  });

  async function handleCheckClick() {
    const text = domainInput.value;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const fileType = fileTypeSelect.value;

    if (lines.length === 0) {
      statusText.innerText = 'List is empty!';
      return;
    }

    isScanning = true;
    modeToggleBtn.disabled = true;
    results = [];
    tableBody.innerHTML = '';
    downloadBtn.style.display = 'none';
    
    checkBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    stopBtn.disabled = false;
    loadFileBtn.disabled = true;
    domainInput.disabled = true;
    fileTypeSelect.disabled = true;

    let completed = 0;
    progressText.innerText = `0/${lines.length}`;

    const batchSize = 10;

    for (let i = 0; i < lines.length; i += batchSize) {
      if (!isScanning) {
        statusText.innerText = 'Stopped by user';
        break;
      }

      const batch = lines.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(domain => checkDomainSmart(domain, fileType)));

      batchResults.forEach(res => {
        addResultToTable(res, tableBody);
        results.push(res);
        completed++;
      });

      progressText.innerText = `${completed}/${lines.length}`;

      if (isScanning && (i + batchSize < lines.length)) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    if (isScanning) statusText.innerText = 'Completed!';

    isScanning = false;
    modeToggleBtn.disabled = false;
    checkBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    loadFileBtn.disabled = false;
    domainInput.disabled = false;
    fileTypeSelect.disabled = false;
    
    if (results.length > 0) downloadBtn.style.display = 'block';
  }

  function handleDownloadClick() {
    let csv = 'File URL,Status,Lines\n';
    results.forEach(r => {
      const urlForCsv = r.url !== '-' ? r.url : r.domain;
      csv += `${urlForCsv},${r.status},${r.lines}\n`;
    });
    triggerDownload(csv, 'checker_results.csv');
  }

  checkBtn.addEventListener('click', handleCheckClick);
  downloadBtn.addEventListener('click', handleDownloadClick);


  // Bulk mode handlers.

  bulkLoadFileBtn.addEventListener('click', () => bulkFileInput.click());

  bulkFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      bulkLines = event.target.result.split('\n').map(l => l.trim()).filter(l => l);
      bulkFileStatus.innerText = `File loaded: ${bulkLines.length} domains ready.`;
      bulkProgressValue.innerText = `0 / ${bulkLines.length}`;
      bulkTimeValue.innerText = "00:00";
      bulkCheckBtn.disabled = bulkLines.length === 0;
      bulkDownloadBtn.style.display = 'none';
      bulkFileInput.value = '';
    };
    reader.readAsText(file);
  });

  function updateBulkTimer() {
    const diff = Math.floor((Date.now() - bulkStartTime) / 1000);
    const m = String(Math.floor(diff / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    bulkTimeValue.innerText = `${m}:${s}`;
  }

  bulkStopBtn.addEventListener('click', () => {
    isScanning = false;
    bulkStopBtn.disabled = true;
    bulkFileStatus.innerText = 'Stopping after current batch...';
  });

  async function handleBulkCheckClick() {
    const fileType = bulkFileTypeSelect.value;
    const total = bulkLines.length;
    
    if (total === 0) return;

    isScanning = true;
    modeToggleBtn.disabled = true;
    bulkResultsArray = ['File URL,Status,Lines'];
    bulkDownloadBtn.style.display = 'none';
    
    bulkCheckBtn.style.display = 'none';
    bulkStopBtn.style.display = 'block';
    bulkStopBtn.disabled = false;
    bulkLoadFileBtn.disabled = true;
    bulkFileTypeSelect.disabled = true;

    bulkFileStatus.innerText = 'Processing...';
    bulkProgressValue.innerText = `0 / ${total}`;
    
    bulkStartTime = Date.now();
    bulkTimerInterval = setInterval(updateBulkTimer, 1000);

    let completed = 0;
    const batchSize = 15; 

    for (let i = 0; i < total; i += batchSize) {
      if (!isScanning) {
        bulkFileStatus.innerText = 'Stopped by user.';
        break;
      }

      const batch = bulkLines.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(domain => checkDomainSmart(domain, fileType)));

      batchResults.forEach(res => {
        const urlForCsv = res.url !== '-' ? res.url : res.domain;
        bulkResultsArray.push(`${urlForCsv},${res.status},${res.lines}`);
        completed++;
      });

      bulkProgressValue.innerText = `${completed} / ${total}`;

      if (isScanning && (i + batchSize < total)) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    clearInterval(bulkTimerInterval);

    if (isScanning) {
      bulkFileStatus.innerText = 'Completed successfully!';
    }

    isScanning = false;
    modeToggleBtn.disabled = false;
    bulkCheckBtn.style.display = 'block';
    bulkStopBtn.style.display = 'none';
    bulkLoadFileBtn.disabled = false;
    bulkFileTypeSelect.disabled = false;
    
    if (bulkResultsArray.length > 1) {
      bulkDownloadBtn.style.display = 'block';
    }
  }

  bulkCheckBtn.addEventListener('click', handleBulkCheckClick);

  bulkDownloadBtn.addEventListener('click', () => {
    const csvContent = bulkResultsArray.join('\n');
    triggerDownload(csvContent, 'bulk_checker_results.csv');
  });

  // Shared helpers.

  function triggerDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function checkDomainSmart(rawDomain, fileType) {
    let urls = [];

    if (fileType === 'url') {
      const exactUrl = /^(https?:\/\/)/i.test(rawDomain) ? rawDomain : `https://${rawDomain}`;
      urls = [exactUrl];
    } else {
      const domain = rawDomain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '').split('/')[0];
      urls = [
        `https://${domain}/${fileType}`,
        `https://www.${domain}/${fileType}`,
        `http://${domain}/${fileType}`,
        `http://www.${domain}/${fileType}`
      ];
    }

    const fetchUrl = async (url) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(timeoutId);

        if (response.status === 200) {
          const text = await response.text();

          if (text.toLowerCase().includes('<html') || text.toLowerCase().includes('<!doctype')) {
            throw new Error("HTML content");
          }

          const validLines = countValidLines(text);
          return {
            domain: rawDomain,
            status: validLines > 0 ? 'Valid' : 'Empty File',
            lines: validLines,
            url: url,
            cssClass: validLines > 0 ? 'valid' : 'empty'
          };
        }
        throw new Error(`HTTP ${response.status}`);
      } catch (e) {
        clearTimeout(timeoutId);
        throw e;
      }
    };

    try {
      return await Promise.any(urls.map(url => fetchUrl(url)));
    } catch (aggregateError) {
      return {
        domain: rawDomain,
        status: 'Error',
        lines: 0,
        url: '-',
        cssClass: 'error'
      };
    }
  }

  function countValidLines(content) {
    let count = 0;
    const cleanContent = content.replace(/\uFEFF/g, '');
    const lines = cleanContent.split(/\r?\n/);

    for (const line of lines) {
      const clean = line.split('#')[0].trim();
      if (!clean) continue;

      const parts = clean.split(',').map(p => p.trim());
      if (parts.length >= 3) {
        const type = parts[2].toUpperCase().replace(/[^A-Z]/g, '');
        if (type === 'DIRECT' || type === 'RESELLER') {
          count++;
        }
      }
    }

    return count;
  }

  function addResultToTable(res, tableBody) {
    const tr = document.createElement('tr');
    const urlCell = res.url !== '-'
      ? `<a href="${res.url}" target="_blank">${res.url}</a>`
      : `<span style="color:#999">${res.domain}</span>`;

    tr.innerHTML = `
      <td class="col-url">${urlCell}</td>
      <td class="col-status ${res.cssClass}">${res.status}</td>
      <td class="col-lines">${res.lines}</td>
    `;
    tableBody.appendChild(tr);
  }

  function applyTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
  }
}

document.addEventListener('DOMContentLoaded', initPopup);
