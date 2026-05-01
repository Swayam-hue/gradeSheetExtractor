/**
 * gradeParser.js
 * Client-side 1:1 port of the Python extract_grades.py and app.py logic.
 * All parsing and SGPA calculation happens in the browser — no server needed.
 */

const GRADE_POINTS = {
  S: 10, A: 9, B: 8, C: 7, D: 6, E: 5, F: 0
};

const IGNORED_GRADES = new Set(['I', 'AB', 'DT', 'MP']);

/**
 * Parses a single .txt grade sheet file content and extracts data for a student.
 * Mirrors extract_student_data() in app.py.
 *
 * @param {string} content    - Raw text content of the grade sheet file
 * @param {string} filename   - The filename (e.g. "CS202A5.txt")
 * @param {string} regNo      - Registration number to search for (exact match)
 * @returns {Object|null}     - Student data object or null if not found
 */
function parseGradeFile(content, filename, regNo) {
  const lines = content.split(/\r?\n/);

  let subjectTitle = '';
  let subjectCredit = 0.0;

  // First pass: extract subject metadata (mirrors app.py's first for-loop)
  for (const line of lines) {
    if (line.includes('Subject Title')) {
      subjectTitle = line.split(':', 2)[1]?.trim() ?? '';
    }
    if (line.includes('Subject Credit')) {
      const raw = line.split(':', 2)[1]?.trim() ?? '';
      const parsed = parseFloat(raw);
      subjectCredit = isNaN(parsed) ? 0.0 : parsed;
    }
  }

  // Second pass: find the exact registration number row (mirrors app.py's second for-loop)
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 5 && parts[0] === regNo) {
      const code = filename.replace(/\.[^/.]+$/, ''); // strip extension
      return {
        Code: code,
        Subject: subjectTitle,
        Credits: subjectCredit,
        Internal: parts[1],
        'End-Sem': parts[2],
        Total: parts[3],
        Grade: parts[4]
      };
    }
  }

  return null;
}

/**
 * Reads multiple File objects and extracts grade data for the given reg number.
 * Async wrapper that returns a Promise resolving to the results array.
 *
 * @param {string}   regNo   - Registration number (exact match)
 * @param {FileList} files   - FileList from the file input element
 * @returns {Promise<Array>} - Resolves with array of student subject data
 */
function extractStudentData(regNo, files) {
  const readPromises = Array.from(files).map(file => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = parseGradeFile(e.target.result, file.name, regNo);
        resolve(result);
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
  });

  return Promise.all(readPromises).then(results =>
    results.filter(r => r !== null)
  );
}

/**
 * Calculates SGPA from an array of subject data objects.
 * Mirrors calculate_sgpa() in app.py exactly.
 *
 * @param {Array}  resultsData  - Array of subject objects with Grade and Credits
 * @param {Object} gradePoints  - Map of grade letter to grade points
 * @returns {number}            - Calculated SGPA, or 0.0 if no eligible subjects
 */
function calculateSGPA(resultsData, gradePoints = GRADE_POINTS) {
  let totalCreditsAttempted = 0;
  let totalCreditPoints = 0;

  for (const subject of resultsData) {
    const grade = subject.Grade;
    const credits = subject.Credits;

    if (IGNORED_GRADES.has(grade)) continue;

    totalCreditsAttempted += credits;

    if (grade in gradePoints) {
      totalCreditPoints += credits * gradePoints[grade];
    }
  }

  if (totalCreditsAttempted === 0) return 0.0;
  return totalCreditPoints / totalCreditsAttempted;
}
