const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { convertPdfToPython } = require('./converter');
const { lookup } = require('./dictionary');
const { playWord } = require('./audioPlayer');
const { triggerBossKey } = require('./bossKey');
const VocabManager = require('./vocabManager');
const OutlineProvider = require('./outlineProvider');
const AuraHoverProvider = require('./hoverProvider');
const AuraStatusBar = require('./statusBar');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('Aura Code Reader Extension is now active!');

  const vocabManager = new VocabManager();
  const outlineProvider = new OutlineProvider();
  const statusBar = new AuraStatusBar();
  const hoverProvider = new AuraHoverProvider(vocabManager);

  // Register Tree Views
  vscode.window.registerTreeDataProvider('aura.outlineView', outlineProvider);
  vscode.window.registerTreeDataProvider('aura.vocabView', vocabManager);

  // Register Hover Provider for Python, Markdown and text files
  const hoverRegistration = vscode.languages.registerHoverProvider(
    ['python', 'markdown', 'plaintext'],
    hoverProvider
  );

  // Register Status Bar selection tracking
  const selectionListener = vscode.window.onDidChangeTextEditorSelection((e) => {
    statusBar.updateSelection(e.textEditor);
  });

  // Track active editor to sync outline bookmarks automatically
  const activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor && editor.document) {
      const docPath = editor.document.fileName;
      if (docPath.endsWith('.py')) {
        const metaPath = docPath.replace(/\.py$/, '.json');
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            if (meta && meta.outline) {
              outlineProvider.setOutline(meta.outline);
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    }
  });

  // 1. Command: Open PDF as Python Code
  const openPdfCommand = vscode.commands.registerCommand('aura.openPdf', async () => {
    const fileUris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: '转换为 Python 极客代码阅读',
      filters: {
        'PDF Documents': ['pdf']
      }
    });

    if (!fileUris || fileUris.length === 0) return;
    const pdfPath = fileUris[0].fsPath;
    const bookBaseName = path.basename(pdfPath, path.extname(pdfPath));
    const cleanBookName = bookBaseName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').replace(/_+/g, '_');
    const cachedPyPath = path.join(os.homedir(), '.aura_books', `${cleanBookName}.py`);
    const cachedMetaPath = path.join(os.homedir(), '.aura_books', `${cleanBookName}.json`);

    let shouldConvert = true;
    if (fs.existsSync(cachedPyPath) && fs.existsSync(cachedMetaPath)) {
      const choice = await vscode.window.showInformationMessage(
        `检测到《${bookBaseName}》此前已转换过，是否直接打开？`,
        '直接秒开',
        '重新完整转换'
      );
      if (choice === '直接秒开') {
        shouldConvert = false;
      } else if (!choice) {
        return;
      }
    }

    let result = null;
    if (shouldConvert) {
      result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Aura: 正在重构《${bookBaseName}》为 Python 极客代码流...`,
          cancellable: false
        },
        async (progress) => {
          let lastReport = 0;
          return await convertPdfToPython(pdfPath, (current, total) => {
            const pct = Math.round((current / total) * 100);
            if (pct >= lastReport + 5 || current === total) {
              lastReport = pct;
              progress.report({
                message: `已解析第 ${current} / ${total} 页 (${pct}%)`,
                increment: 5
              });
            }
          });
        }
      );
    } else {
      const meta = JSON.parse(fs.readFileSync(cachedMetaPath, 'utf8'));
      result = {
        pyFilePath: cachedPyPath,
        outline: meta.outline || [],
        numChapters: meta.numChapters || 0,
        numPages: meta.numPages || 0
      };
    }

    if (result && result.pyFilePath) {
      const doc = await vscode.workspace.openTextDocument(result.pyFilePath);
      await vscode.window.showTextDocument(doc, { preview: false });
      outlineProvider.setOutline(result.outline);

      vscode.window.showInformationMessage(
        `✨《${bookBaseName}》已就绪！共 ${result.numChapters} 个章节已载入左侧大纲，请尽情享受沉浸代码阅读。`
      );
    }
  });

  // 2. Command: Jump to line from outline
  const jumpToLineCommand = vscode.commands.registerCommand('aura.jumpToLine', async (line) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || typeof line !== 'number') return;

    const pos = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  });

  // 3. Command: Add Vocab
  const addVocabCommand = vscode.commands.registerCommand('aura.addVocab', async (arg) => {
    let item = arg;

    // If string arg from command link, parse JSON
    if (typeof arg === 'string') {
      try {
        const parsed = JSON.parse(decodeURIComponent(arg));
        item = Array.isArray(parsed) ? parsed[0] : parsed;
      } catch (e) {
        item = null;
      }
    } else if (Array.isArray(arg)) {
      item = arg[0];
    }

    if (item && item.word) {
      vocabManager.addWord(item);
      return;
    }

    // Fallback: extract from active editor selection
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const selection = editor.selection;
      let word = '';
      if (!selection.isEmpty) {
        word = editor.document.getText(selection).trim();
      } else {
        const range = editor.document.getWordRangeAtPosition(selection.active, /[a-zA-Z\-'’]{2,40}/);
        if (range) word = editor.document.getText(range).trim();
      }

      if (word) {
        const res = await lookup(word);
        const sentence = editor.document.lineAt(selection.active.line).text.trim().replace(/^[#"\s]+|[#"\s]+$/g, '');
        vocabManager.addWord({
          word,
          phonetic: res ? res.phonetic : '',
          translation: res ? res.translation : '暂无释义',
          sentence,
          source: editor.document.fileName.split(/[\\/]/).pop()
        });
      } else {
        vscode.window.showWarningMessage('请先用光标选中要收藏的生词');
      }
    }
  });

  // 4. Command: Remove Vocab
  const removeVocabCommand = vscode.commands.registerCommand('aura.removeVocab', (item) => {
    if (item && item.label) {
      vocabManager.removeWord(item.label);
    } else if (typeof item === 'string') {
      vocabManager.removeWord(item);
    }
  });

  // 5. Command: Export Anki
  const exportAnkiCommand = vscode.commands.registerCommand('aura.exportAnki', () => {
    vocabManager.exportAnki();
  });

  // 5.1 Command: Sync Anki (AnkiConnect live sync)
  const syncAnkiCommand = vscode.commands.registerCommand('aura.syncAnki', () => {
    vocabManager.syncAllToAnki();
  });

  // 6. Command: Clear Vocab
  const clearVocabCommand = vscode.commands.registerCommand('aura.clearVocab', async () => {
    const choice = await vscode.window.showWarningMessage('确定要清空全部生词吗？此操作无法撤销。', '确定清空', '取消');
    if (choice === '确定清空') {
      vocabManager.clear();
    }
  });

  // 7. Command: Play Audio
  const playAudioCommand = vscode.commands.registerCommand('aura.playAudio', (arg) => {
    let word = arg;
    if (Array.isArray(arg)) word = arg[0];
    else if (arg && arg.label) word = arg.label;

    if (!word && vscode.window.activeTextEditor) {
      const editor = vscode.window.activeTextEditor;
      const sel = editor.selection;
      if (!sel.isEmpty) word = editor.document.getText(sel).trim();
      else {
        const range = editor.document.getWordRangeAtPosition(sel.active, /[a-zA-Z\-'’]{2,40}/);
        if (range) word = editor.document.getText(range).trim();
      }
    }

    if (word) {
      playWord(word);
    }
  });

  // 8. Command: Boss Key
  const bossKeyCommand = vscode.commands.registerCommand('aura.bossKey', () => {
    triggerBossKey();
  });

  // Push to subscriptions
  context.subscriptions.push(
    hoverRegistration,
    selectionListener,
    activeEditorListener,
    openPdfCommand,
    jumpToLineCommand,
    addVocabCommand,
    removeVocabCommand,
    exportAnkiCommand,
    syncAnkiCommand,
    clearVocabCommand,
    playAudioCommand,
    bossKeyCommand,
    statusBar
  );
}

function deactivate() {
  console.log('Aura Code Reader Extension deactivated.');
}

module.exports = {
  activate,
  deactivate
};
