/**
 * @typedef {Object} ScanResult
 * @property {string} domain Original user input domain string.
 * @property {"Valid"|"Empty File"|"Error"} status Human-readable scan status.
 * @property {number} lines Count of valid DIRECT/RESELLER records.
 * @property {string} url Resolved URL used for the result, or "-" when unresolved.
 * @property {"valid"|"empty"|"error"} cssClass CSS status class used in table rendering.
 */

/**
 * Initializes popup event handlers and runtime UI state.
 *
 * @returns {void} Does not return a value.
 *
 * @example
 * ```javascript
 * document.addEventListener('DOMContentLoaded', initPopup);
 * // Expected: popup controls are wired and ready for interaction.
 * ```
 */
function initPopup() {
  const checkBtn = document.getElementById('checkBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const domainInput = document.getElementById('domainList');
  const fileTypeSelect = document.getElementById('fileTypeSelect');
  const tableBody = document.querySelector('#resultsTable tbody');
  const statusText = document.getElementById('statusText');
  const progressText = document.getElementById('progressText');
  const themeSelect = document.getElementById('themeSelect');

  /** @type {ScanResult[]} */
  let results = [];
  const savedTheme = localStorage.getItem('theme') || 'light';
  applyTheme(savedTheme);
  themeSelect.value = savedTheme;

  themeSelect.addEventListener('change', () => {
    const selectedTheme = themeSelect.value;
    localStorage.setItem('theme', selectedTheme);
    applyTheme(selectedTheme);
  });

  const savedTheme = localStorage.getItem('theme') || 'light';
  applyTheme(savedTheme);
  themeSelect.value = savedTheme;

  /**
   * Persists and applies a newly selected theme.
   *
   * @returns {void} Does not return a value.
   *
   * @example
   * ```javascript
   * themeSelect.value = 'dark';
   * handleThemeChange();
   * // Expected: localStorage theme becomes "dark" and dark class is applied.
   * ```
   */
  function handleThemeChange() {
    const selectedTheme = themeSelect.value;
    localStorage.setItem('theme', selectedTheme);
    applyTheme(selectedTheme);
  }

  /**
   * Executes the domain scan workflow and updates UI progress.
   *
   * @returns {Promise<void>} Resolves when all scan batches complete.
   *
   * @example
   * ```javascript
   * await handleCheckClick();
   * // Expected: results table is populated and progress reaches total count.
   * ```
   */
  async function handleCheckClick() {
    const text = domainInput.value;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const fileType = fileTypeSelect.value;

    if (lines.length === 0) {
      statusText.innerText = 'List is empty!';
      return;
    }

    results = [];
    tableBody.innerHTML = '';
    checkBtn.disabled = true;
    checkBtn.innerText = 'Processing...';
    downloadBtn.style.display = 'none';

    let completed = 0;
    progressText.innerText = `0/${lines.length}`;

    const batchSize = 2;

    // Process in small batches to avoid overloading browser/network resources.
    for (let i = 0; i < lines.length; i += batchSize) {
      const batch = lines.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(domain => checkDomainSmart(domain, fileType)));

      batchResults.forEach(res => {
        addResultToTable(res, tableBody);
        results.push(res);
        completed++;
      });

      progressText.innerText = `${completed}/${lines.length}`;
    }

    statusText.innerText = 'Completed!';
    checkBtn.disabled = false;
    checkBtn.innerText = 'Run Check';
    downloadBtn.style.display = 'block';
  }

  /**
   * Converts current scan results to CSV and triggers file download.
   *
   * @returns {void} Does not return a value.
   *
   * @example
   * ```javascript
   * handleDownloadClick();
   * // Expected: browser downloads "checker_results.csv".
   * ```
   */
  function handleDownloadClick() {
    let csv = 'File URL,Status,Lines\n';
    results.forEach(r => {
      const urlForCsv = r.url !== '-' ? r.url : r.domain;
      csv += `${urlForCsv},${r.status},${r.lines}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'checker_results.csv';
    a.click();
  }

  themeSelect.addEventListener('change', handleThemeChange);
  checkBtn.addEventListener('click', handleCheckClick);
  downloadBtn.addEventListener('click', handleDownloadClick);
}

/**
 * Attempts multiple URL variants to find a valid ads file for a domain.
 *
 * @param {string} rawDomain User-provided domain value that may include protocol/path.
 * @param {string} fileType Target file name (`ads.txt` or `app-ads.txt`).
 * @returns {Promise<ScanResult>} Resolved scan result containing status and metadata.
 *
 * @example
 * ```javascript
 * const result = await checkDomainSmart('example.com', 'ads.txt');
 * // Expected: { domain: 'example.com', status: 'Valid'|'Empty File'|'Error', ... }
 * ```
 */
async function checkDomainSmart(rawDomain, fileType) {
  const domain = rawDomain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '').split('/')[0];

  const urls = [
    `https://www.${domain}/${fileType}`,
    `https://${domain}/${fileType}`,
    `http://www.${domain}/${fileType}`,
    `http://${domain}/${fileType}`
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timeoutId);

      if (response.status === 200) {
        const text = await response.text();

        if (text.toLowerCase().includes('<html') || text.toLowerCase().includes('<!doctype')) {
          continue;
        }

        const validLines = countValidLines(text);
        return {
          domain: rawDomain,
          status: validLines > 0 ? 'Valid' : 'Empty File',
          lines: validLines,
          url,
          cssClass: validLines > 0 ? 'valid' : 'empty'
        };
      }
    } catch (e) {
    }
  }

  return {
    domain: rawDomain,
    status: 'Error',
    lines: 0,
    url: '-',
    cssClass: 'error'
  };
}

/**
 * Counts valid IAB seller records in ads content.
 *
 * @param {string} content Raw file contents fetched from an ads endpoint.
 * @returns {number} Number of valid records containing `DIRECT` or `RESELLER`.
 *
 * @example
 * ```javascript
 * const lines = countValidLines('google.com, pub-1, DIRECT');
 * // Expected: 1
 * ```
 */
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

/**
 * Renders a scan result row in the results table body.
 *
 * @param {ScanResult} res Normalized scan result payload.
 * @param {HTMLTableSectionElement} tableBody Target `<tbody>` element for appending rows.
 * @returns {void} Does not return a value.
 *
 * @example
 * ```javascript
 * addResultToTable({ domain: 'example.com', status: 'Error', lines: 0, url: '-', cssClass: 'error' }, tableBody);
 * // Expected: one new row appears in the table.
 * ```
 */
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

/**
 * Applies the selected theme to the popup root element.
 *
 * @param {string} theme Theme identifier (`light` or `dark`).
 * @returns {void} Does not return a value.
 *
 * @example
 * ```javascript
 * applyTheme('dark');
 * // Expected: <body> has class "dark".
 * ```
 */
function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
}

document.addEventListener('DOMContentLoaded', initPopup);
