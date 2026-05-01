/**
 * app.js
 * Main application logic — handles upload flow, file preview,
 * results rendering, and all UI state transitions.
 */

// ─── DOM References ──────────────────────────────────────────────────────────
const uploadView    = document.getElementById('upload-view');
const resultsView   = document.getElementById('results-view');
const uploadForm    = document.getElementById('upload-form');
const fileInput     = document.getElementById('files');
const fileListEl    = document.getElementById('file-list-container');
const dropZone      = document.getElementById('drop-zone');
const submitBtn     = document.getElementById('submit-btn');
const btnText       = document.getElementById('btn-text');
const btnSpinner    = document.getElementById('btn-spinner');

// Results DOM
const errorBanner   = document.getElementById('error-banner');
const errorMsg      = document.getElementById('error-msg');
const resultRegNo   = document.getElementById('result-regno');
const resultsTable  = document.getElementById('results-tbody');
const statsBar      = document.getElementById('stats-bar');
const sgpaSection   = document.getElementById('sgpa-section');
const sgpaValue     = document.getElementById('sgpa-value');
const sgpaRemark    = document.getElementById('sgpa-remark');
const sgpaFill      = document.getElementById('sgpa-fill');
const extractAgain  = document.getElementById('extract-again');

// ─── Grade Styling ───────────────────────────────────────────────────────────
const GRADE_CONFIG = {
  S: { cls: 'grade-s', label: 'S' },
  A: { cls: 'grade-a', label: 'A' },
  B: { cls: 'grade-b', label: 'B' },
  C: { cls: 'grade-c', label: 'C' },
  D: { cls: 'grade-d', label: 'D' },
  E: { cls: 'grade-e', label: 'E' },
  F: { cls: 'grade-f', label: 'F' },
};

function getGradeBadge(grade) {
  const cfg = GRADE_CONFIG[grade] || { cls: 'grade-other', label: grade };
  return `<span class="grade-badge ${cfg.cls}">${cfg.label}</span>`;
}

// ─── File Preview ────────────────────────────────────────────────────────────
function readSubjectTitle(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.split(/\r?\n/);
      let title = 'Unknown Subject';
      for (const line of lines) {
        if (line.includes('Subject Title')) {
          title = line.split(':', 2)[1]?.trim() ?? 'Unknown Subject';
          break;
        }
      }
      resolve({ name: file.name, title });
    };
    reader.onerror = () => resolve({ name: file.name, title: 'Unknown Subject' });
    reader.readAsText(file);
  });
}

async function updateFilePreview(files) {
  fileListEl.innerHTML = '';
  if (!files || files.length === 0) {
    fileListEl.innerHTML = '<p class="file-placeholder">Selected files will appear here…</p>';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'file-list';
  fileListEl.appendChild(ul);

  const promises = Array.from(files).map(f => readSubjectTitle(f));
  const results = await Promise.all(promises);

  results.forEach(({ name, title }, i) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.innerHTML = `
      <span class="file-icon">📄</span>
      <span class="file-info">
        <span class="file-name">${name}</span>
        <span class="file-subject">${title}</span>
      </span>
    `;
    ul.appendChild(li);
  });
}

fileInput.addEventListener('change', () => {
  updateFilePreview(fileInput.files);
});

// ─── Drag & Drop ─────────────────────────────────────────────────────────────
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const dt = e.dataTransfer;
  if (dt.files.length) {
    fileInput.files = dt.files;
    updateFilePreview(fileInput.files);
  }
});
dropZone.addEventListener('click', () => fileInput.click());

// ─── Form Submission ──────────────────────────────────────────────────────────
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const regNo = document.getElementById('regno').value.trim();
  const files = fileInput.files;

  // Validation
  if (!regNo) return showError('Please enter your registration number.');
  if (!files || files.length === 0) return showError('Please select at least one grade sheet file.');

  for (const file of files) {
    if (!file.name.endsWith('.txt')) {
      return showError(`Invalid file type: "${file.name}". Please upload only .txt files.`);
    }
  }

  // Loading state
  setLoading(true);

  try {
    const data = await extractStudentData(regNo, files);
    const sgpa = calculateSGPA(data);
    renderResults(regNo, data, sgpa);
  } catch (err) {
    showError('An error occurred while processing your files. Please try again.');
    console.error(err);
  } finally {
    setLoading(false);
  }
});

// ─── Render Results ───────────────────────────────────────────────────────────
function renderResults(regNo, data, sgpa) {
  // Switch views
  uploadView.classList.remove('active');
  resultsView.classList.add('active');

  // Clear previous errors
  hideError();

  resultRegNo.textContent = regNo;

  if (!data || data.length === 0) {
    resultsTable.innerHTML = `
      <tr>
        <td colspan="7" class="empty-row">
          No results found for registration number <strong>${regNo}</strong>.
          Make sure you uploaded the correct grade sheet files.
        </td>
      </tr>
    `;
    statsBar.style.display = 'none';
    sgpaSection.style.display = 'none';
    return;
  }

  // Build table rows
  resultsTable.innerHTML = '';
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.style.animationDelay = `${i * 60}ms`;
    tr.className = 'result-row';
    tr.innerHTML = `
      <td><code class="subject-code">${row.Code}</code></td>
      <td class="subject-name">${row.Subject}</td>
      <td class="text-center">${row.Credits}</td>
      <td class="text-center">${row.Internal}</td>
      <td class="text-center">${row['End-Sem']}</td>
      <td class="text-center"><strong>${row.Total}</strong></td>
      <td class="text-center">${getGradeBadge(row.Grade)}</td>
    `;
    resultsTable.appendChild(tr);
  });

  // Stats bar
  const totalCredits = data.reduce((s, r) => s + r.Credits, 0);
  const subjects = data.length;
  const passingGrades = new Set(['S','A','B','C','D','E']);
  const passedSubjects = data.filter(r => passingGrades.has(r.Grade)).length;

  statsBar.style.display = 'flex';
  document.getElementById('stat-subjects').textContent = subjects;
  document.getElementById('stat-credits').textContent = totalCredits.toFixed(1);
  document.getElementById('stat-passed').textContent = passedSubjects;

  // SGPA display
  sgpaSection.style.display = 'block';
  const sgpaStr = sgpa.toFixed(2);
  sgpaValue.textContent = sgpaStr;

  const remark = sgpa >= 9.0 ? 'Outstanding! 🏆'
               : sgpa >= 8.0 ? 'Excellent! 🌟'
               : sgpa >= 7.0 ? 'Good Job! 👍'
               : sgpa >= 6.0 ? 'Solid Effort 💪'
               : 'Keep Trying 📚';
  sgpaRemark.textContent = remark;

  // Animate the SGPA arc fill (0–10 scale → 0–100%)
  const pct = Math.min((sgpa / 10) * 100, 100);
  setTimeout(() => {
    sgpaFill.style.strokeDashoffset = 251.2 - (251.2 * pct / 100);
  }, 300);
}

// ─── Extract Again ────────────────────────────────────────────────────────────
extractAgain.addEventListener('click', () => {
  resultsView.classList.remove('active');
  uploadView.classList.add('active');
  uploadForm.reset();
  fileListEl.innerHTML = '<p class="file-placeholder">Selected files will appear here…</p>';
  sgpaFill.style.strokeDashoffset = 251.2;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setLoading(state) {
  submitBtn.disabled = state;
  btnText.textContent = state ? 'Processing…' : 'Extract Grades';
  btnSpinner.style.display = state ? 'inline-block' : 'none';
}

function showError(msg) {
  setLoading(false);
  resultsView.classList.add('active');
  uploadView.classList.remove('active');
  errorBanner.style.display = 'block';
  errorMsg.textContent = msg;
  resultsTable.innerHTML = '';
  statsBar.style.display = 'none';
  sgpaSection.style.display = 'none';
}

function hideError() {
  errorBanner.style.display = 'none';
  errorMsg.textContent = '';
}
