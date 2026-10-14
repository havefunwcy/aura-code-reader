const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { playWord } = require('./audioPlayer');
const { pushWordToAnki, pushBatchToAnki, isAnkiOnline, DECK_NAME } = require('./ankiClient');

class VocabManager {
  constructor() {
    this.storageDir = path.join(os.homedir(), '.aura_books');
    this.storageFile = path.join(this.storageDir, 'vocab.json');
    this.words = [];
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.initStorage();
  }

  initStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf8');
        this.words = JSON.parse(raw);
        if (!Array.isArray(this.words)) this.words = [];
      } else {
        this.words = [];
        this.save();
      }
    } catch (e) {
      this.words = [];
    }
  }

  save() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      fs.writeFileSync(this.storageFile, JSON.stringify(this.words, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save vocab:', e);
    }
    this._onDidChangeTreeData.fire();
  }

  async addWord(item) {
    if (!item || !item.word) return;
    const cleanWord = item.word.trim();

    // Check if word already exists to preserve existing ankiSynced state if unchanged
    const existing = this.words.find(w => w.word.toLowerCase() === cleanWord.toLowerCase());
    const wasSynced = existing ? !!existing.ankiSynced : false;

    // Remove old copy and put at the top
    this.words = this.words.filter(w => w.word.toLowerCase() !== cleanWord.toLowerCase());

    const newEntry = {
      word: cleanWord,
      phonetic: item.phonetic || (existing ? existing.phonetic : ''),
      translation: item.translation || (existing ? existing.translation : ''),
      sentence: item.sentence || (existing ? existing.sentence : ''),
      source: item.source || (existing ? existing.source : 'Aura Code Reader'),
      ankiSynced: wasSynced,
      timestamp: Date.now()
    };

    this.words.unshift(newEntry);
    this.save();

    // Live sync to Anki via AnkiConnect
    try {
      const ankiRes = await pushWordToAnki(newEntry);
      if (ankiRes && ankiRes.success) {
        newEntry.ankiSynced = true;
        this.save();
        vscode.window.showInformationMessage(`⭐ 生词已入库并直推至 Anki「${DECK_NAME}」：${cleanWord}`);
        return;
      }
    } catch (err) {
      // Ignore
    }

    // Fallback notification when Anki is offline or didn't accept
    vscode.window.showInformationMessage(`⭐ 生词已入库本地：${cleanWord}（Anki 未启动，稍后可点击同步）`);
  }

  async syncAllToAnki() {
    const online = await isAnkiOnline();
    if (!online) {
      vscode.window.showWarningMessage('未检测到 Anki 运行。请先启动 Anki 桌面端并确认安装了 AnkiConnect 插件。');
      return;
    }

    if (this.words.length === 0) {
      vscode.window.showInformationMessage('当前生词本为空，无需同步');
      return;
    }

    const unsynced = this.words.filter(w => !w.ankiSynced);
    let toPush = unsynced;

    if (unsynced.length === 0) {
      const choice = await vscode.window.showInformationMessage(
        '当前所有生词已与 Anki 同步，是否重新推送全部生词？',
        '重新推送全部',
        '取消'
      );
      if (choice === '重新推送全部') {
        toPush = this.words;
      } else {
        return;
      }
    }

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Aura: 正在推送 ${toPush.length} 个生词至 Anki「${DECK_NAME}」牌组...`,
      cancellable: false
    }, async () => {
      const res = await pushBatchToAnki(toPush);
      if (res && res.success) {
        for (const item of toPush) {
          item.ankiSynced = true;
        }
        this.save();
        vscode.window.showInformationMessage(`🎉 成功同步 ${res.count || toPush.length} 个生词至 Anki「${DECK_NAME}」！已自动触发 AnkiWeb 云端同步。`);
      } else {
        vscode.window.showErrorMessage(`Anki 同步失败：${res ? res.reason : '未知错误'}`);
      }
    });
  }

  removeWord(word) {
    if (!word) return;
    const cleanWord = word.trim().toLowerCase();
    this.words = this.words.filter(w => w.word.toLowerCase() !== cleanWord);
    this.save();
    vscode.window.showInformationMessage(`🗑️ 已移除生词: ${word}`);
  }

  clear() {
    this.words = [];
    this.save();
    vscode.window.showInformationMessage('🧹 生词本已清空');
  }

  async exportAnki() {
    if (this.words.length === 0) {
      vscode.window.showWarningMessage('生词本为空，无需导出');
      return;
    }

    const defaultUri = vscode.Uri.file(path.join(os.homedir(), `aura_anki_vocab_${Date.now()}.csv`));
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { 'Anki CSV': ['csv'] }
    });

    if (!target) return;

    // Build standard Anki CSV (Tab delimited, UTF-8 BOM for Excel/Anki)
    let content = '\ufeffWord\tPhonetic\tTranslation\tContext\tDate\r\n';
    for (const w of this.words) {
      const cleanWord = (w.word || '').replace(/[\t\r\n]/g, ' ');
      const cleanPhonetic = (w.phonetic || '').replace(/[\t\r\n]/g, ' ');
      const cleanTrans = (w.translation || '').replace(/[\t\r\n]/g, ' ');
      const cleanSentence = (w.sentence || '').replace(/[\t\r\n]/g, ' ');
      const dateStr = new Date(w.timestamp || Date.now()).toLocaleDateString();
      content += `${cleanWord}\t${cleanPhonetic}\t${cleanTrans}\t${cleanSentence}\t${dateStr}\r\n`;
    }

    fs.writeFileSync(target.fsPath, content, 'utf8');
    vscode.window.showInformationMessage(`🎉 成功导出 ${this.words.length} 条生词至 Anki CSV！`, '打开文件').then(choice => {
      if (choice === '打开文件') {
        vscode.commands.executeCommand('vscode.open', target);
      }
    });
  }

  // TreeDataProvider Implementation
  getTreeItem(element) {
    const item = new vscode.TreeItem(element.word, vscode.TreeItemCollapsibleState.None);
    const syncStatus = element.ankiSynced ? '✓ Anki' : '● 本地';
    item.description = `${element.phonetic || ''}  ${element.translation || ''}  [${syncStatus}]`.trim();
    item.tooltip = new vscode.MarkdownString(`### **${element.word}** \`${element.phonetic || ''}\` ${element.ankiSynced ? '*(已同步至 Anki)*' : '*(未同步至 Anki)*'}\n\n**释义**：${element.translation || ''}\n\n**例句**：*${element.sentence || '暂无例句'}*\n\n**来源**：${element.source || 'Aura Code Reader'}`);
    item.iconPath = element.ankiSynced ? new vscode.ThemeIcon('check') : new vscode.ThemeIcon('bookmark');
    item.contextValue = 'vocabItem';
    item.command = {
      command: 'aura.playAudio',
      title: '朗读',
      arguments: [element.word]
    };
    return item;
  }

  getChildren(element) {
    if (!element) {
      return this.words;
    }
    return [];
  }
}

module.exports = VocabManager;
