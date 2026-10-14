const fs = require('fs');
const path = require('path');
const os = require('os');
const pdfjsLib = require('./libs/pdf.min.js');

pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(__dirname, 'libs', 'pdf.worker.min.js');

function cleanUnicode(str) {
  if (!str) return '';
  return str
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2014/g, ' -- ')
    .replace(/\u2013/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\u200e\u200f\ufeff]/g, '')
    .replace(/"""/g, '\\"\\"\\"');
}

function wrapPara(text, maxLen = 84, indent = '        ') {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';

  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if ((cur + ' ' + w).length <= maxLen) {
      cur += ' ' + w;
    } else {
      lines.push(indent + cur);
      cur = w;
    }
  }
  if (cur) lines.push(indent + cur);
  return lines.join('\n');
}

function parsePageToParagraphs(items) {
  if (!items || items.length === 0) return [];

  // Group items by line Y coordinate (within 3px tolerance)
  const linesMap = new Map();
  for (const item of items) {
    if (!item.str && !item.hasEOL) continue;
    const y = Math.round(item.transform[5]);
    let foundKey = null;
    for (const k of linesMap.keys()) {
      if (Math.abs(k - y) <= 3) {
        foundKey = k;
        break;
      }
    }
    const key = foundKey !== null ? foundKey : y;
    if (!linesMap.has(key)) linesMap.set(key, []);
    linesMap.get(key).push(item);
  }

  const sortedYKeys = [...linesMap.keys()].sort((a, b) => b - a);
  if (sortedYKeys.length === 0) return [];

  const lefts = [];
  const lineDetails = [];

  for (const y of sortedYKeys) {
    const rawItems = linesMap.get(y).sort((a, b) => a.transform[4] - b.transform[4]);
    let lineStr = '';
    let maxFontSize = 0;
    for (let j = 0; j < rawItems.length; j++) {
      const it = rawItems[j];
      const fs = Math.round(Math.hypot(it.transform[0], it.transform[1]));
      if (fs > maxFontSize) maxFontSize = fs;

      if (j > 0) {
        const prevIt = rawItems[j - 1];
        const prevRight = prevIt.transform[4] + (prevIt.width || 0);
        const currLeft = it.transform[4];
        if (currLeft - prevRight > 2 && !it.str.startsWith(' ') && !lineStr.endsWith(' ')) {
          lineStr += ' ';
        }
      }
      lineStr += it.str;
    }
    lineStr = lineStr.trim();
    if (!lineStr) continue;

    const minX = Math.round(rawItems[0].transform[4]);
    if (lineStr.length > 20) lefts.push(minX);

    lineDetails.push({ y, minX, text: lineStr, fontSize: maxFontSize });
  }

  if (lineDetails.length === 0) return [];
  const baseLeft = lefts.length > 0 ? Math.min(...lefts) : 72;

  const paragraphs = [];
  let curPara = '';
  let prevY = null;

  for (let i = 0; i < lineDetails.length; i++) {
    const line = lineDetails[i];
    const isIndented = line.minX >= baseLeft + 12;
    const isLargeGap = prevY !== null && Math.abs(prevY - line.y) > 28;
    const isNewPara = (isIndented || isLargeGap) && curPara.length > 0;

    if (isNewPara) {
      const clean = cleanUnicode(curPara.trim());
      if (clean) paragraphs.push(clean);
      curPara = line.text;
    } else {
      if (!curPara) {
        curPara = line.text;
      } else {
        if (curPara.endsWith('-') && !curPara.endsWith(' -')) {
          curPara = curPara.slice(0, -1) + line.text;
        } else {
          curPara += ' ' + line.text;
        }
      }
    }
    prevY = line.y;
  }

  if (curPara) {
    const clean = cleanUnicode(curPara.trim());
    if (clean) paragraphs.push(clean);
  }

  return paragraphs;
}

async function convertPdfToPython(pdfPath, onProgress) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const numPages = doc.numPages;
  const bookBaseName = path.basename(pdfPath, path.extname(pdfPath));
  const cleanBookName = bookBaseName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').replace(/_+/g, '_');

  // Extract outline bookmarks map: pageNumber -> chapterTitle
  const outlinePageMap = new Map();
  try {
    const rawOutline = await doc.getOutline();
    if (rawOutline && Array.isArray(rawOutline)) {
      for (const item of rawOutline) {
        let dest = item.dest;
        if (typeof dest === 'string') {
          dest = await doc.getDestination(dest);
        }
        if (Array.isArray(dest) && dest[0]) {
          const pageIndex = await doc.getPageIndex(dest[0]);
          const p = pageIndex + 1;
          // Store first or most descriptive title for page
          if (!outlinePageMap.has(p)) {
            outlinePageMap.set(p, item.title);
          }
        }
      }
    }
  } catch (err) {
    // Ignore outline extraction error
  }

  const lines = [];
  const outlineEntries = [];

  // Header banner
  lines.push('# -*- coding: utf-8 -*-');
  lines.push('"""');
  lines.push('================================================================================');
  lines.push(`MODULE: ${cleanUnicode(bookBaseName)}`);
  lines.push('GENERATED BY: Aura Code Reader (Python Geek Stream v2.0)');
  lines.push(`TOTAL PAGES: ${numPages}`);
  lines.push('STATUS: Ready for Production & Stealth Reading');
  lines.push('================================================================================');
  lines.push('"""');
  lines.push('');
  lines.push('import sys');
  lines.push('import logging');
  lines.push('from typing import Any, Dict, List, Optional');
  lines.push('');
  lines.push('logger = logging.getLogger("AuraReader")');
  lines.push('');

  let chapterCount = 0;
  let inChapter = false;

  for (let p = 1; p <= numPages; p++) {
    if (onProgress) {
      onProgress(p, numPages);
    }

    const page = await doc.getPage(p);
    const textContent = await page.getTextContent();
    const paragraphs = parsePageToParagraphs(textContent.items);

    // Check if this page is marked as a chapter start
    let isChapterStart = outlinePageMap.has(p);
    let chapterTitle = outlinePageMap.get(p) || '';

    // If no PDF outline exists, fallback to detecting single chapter heading
    if (!isChapterStart && outlinePageMap.size === 0 && paragraphs.length > 0) {
      const first = paragraphs[0];
      if (/^CHAPTER\s+\d+/i.test(first) || /^Chapter\s+[0-9IVXLCDM]+/i.test(first)) {
        isChapterStart = true;
        chapterTitle = first;
      }
    }

    // Special check: First page or Front Matter if no chapter started yet
    if (!inChapter && (p === 1 || isChapterStart)) {
      isChapterStart = true;
      if (!chapterTitle) chapterTitle = 'Front_Matter';
    }

    if (isChapterStart) {
      chapterCount++;
      inChapter = true;

      const sanitizedTitle = chapterTitle
        .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40) || `Section_${chapterCount}`;

      const className = `Chapter_${String(chapterCount).padStart(2, '0')}_${sanitizedTitle}`;

      lines.push('');
      lines.push('# ' + '='.repeat(78));
      lines.push(`# [Chapter ${chapterCount}] ${chapterTitle} (Page ${p})`);
      lines.push('# ' + '='.repeat(78));
      lines.push('');

      const classLineNumber = lines.length; // 0-indexed line number in VS Code
      outlineEntries.push({
        title: chapterTitle,
        line: classLineNumber,
        page: p
      });

      lines.push(`class ${className}:`);
      lines.push('    """');
      lines.push(`    ${chapterTitle}`);
      lines.push(`    Source: Page ${p} / ${numPages}`);
      lines.push('    """');
      lines.push('');
    }

    // Now format this page as a method under the current chapter class
    const pageFnName = `page_${String(p).padStart(3, '0')}`;
    lines.push(`    def ${pageFnName}(self, state: Optional[Dict[str, Any]] = None) -> str:`);
    lines.push('        """');
    lines.push(`        [Page ${p}]`);
    lines.push('');

    if (paragraphs.length === 0) {
      lines.push('        (Illustration / Blank Page)');
    } else {
      for (let i = 0; i < paragraphs.length; i++) {
        const wrapped = wrapPara(paragraphs[i], 84, '        ');
        lines.push(wrapped);
        if (i < paragraphs.length - 1) {
          lines.push(''); // blank line between paragraphs
        }
      }
    }

    lines.push('        """');
    lines.push('        return "continue"');
    lines.push('');
  }

  // Footer
  lines.push('');
  lines.push('if __name__ == "__main__":');
  lines.push('    print("Aura Code Reader: Reached end of book stream.")');
  lines.push('');

  const outputDir = path.join(os.homedir(), '.aura_books');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${cleanBookName}.py`);
  const metaPath = path.join(outputDir, `${cleanBookName}.json`);

  const fullCode = lines.join('\n');
  fs.writeFileSync(outputPath, fullCode, 'utf8');

  // Save metadata
  fs.writeFileSync(metaPath, JSON.stringify({
    pdfPath,
    cleanBookName,
    numPages,
    numChapters: chapterCount,
    outline: outlineEntries,
    updatedAt: Date.now()
  }, null, 2), 'utf8');

  return {
    pyFilePath: outputPath,
    metaPath,
    outline: outlineEntries,
    numPages,
    numChapters: chapterCount
  };
}

module.exports = {
  convertPdfToPython
};
