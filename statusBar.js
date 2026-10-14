const vscode = require('vscode');
const { lookup } = require('./dictionary');

class AuraStatusBar {
  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'aura.addVocab';
    this.lastWord = '';
    this.timeout = null;
    this.item.text = '$(book) Aura Code Reader';
    this.item.tooltip = 'Aura Python 极客阅读器 - 状态栏摸鱼查词已激活';
    this.item.show();
  }

  updateSelection(editor) {
    if (!editor || !editor.document) return;

    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    this.timeout = setTimeout(async () => {
      const selection = editor.selection;
      let word = '';

      if (!selection.isEmpty) {
        word = editor.document.getText(selection).trim();
      } else {
        const range = editor.document.getWordRangeAtPosition(selection.active, /[a-zA-Z\-'’]{2,40}/);
        if (range) {
          word = editor.document.getText(range).trim();
        }
      }

      if (!word || word.length < 2 || word === this.lastWord) {
        return;
      }

      // Ignore common python keywords
      const pyKeywords = new Set([
        'def', 'class', 'self', 'return', 'import', 'from', 'pass', 'true', 'false',
        'none', 'async', 'await', 'with', 'try', 'except', 'finally', 'raise', 'if',
        'elif', 'else', 'for', 'while', 'in', 'is', 'not', 'and', 'or'
      ]);
      if (pyKeywords.has(word.toLowerCase())) return;

      this.lastWord = word;
      let sentence = '';
      try {
        sentence = editor.document.lineAt(selection.active.line).text.trim().replace(/^[#"\s]+|[#"\s]+$/g, '');
      } catch (e) {
        // Ignore
      }

      const res = await lookup(word, sentence);
      if (res && res.translation) {
        const phoneticStr = res.phonetic ? ` ${res.phonetic}` : '';
        this.item.text = `$(book) ${res.word}${phoneticStr}: ${res.shortTrans}`;
        this.item.tooltip = `【${res.word}】\n${res.translation}\n\n点击直接收藏至生词本`;
      }
    }, 200);
  }

  dispose() {
    if (this.timeout) clearTimeout(this.timeout);
    this.item.dispose();
  }
}

module.exports = AuraStatusBar;
