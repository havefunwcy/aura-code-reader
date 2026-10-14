const http = require('http');

const ANKI_PORT = 8765;
const ANKI_HOST = '127.0.0.1';
const DECK_NAME = 'Aura Vocab';

function invoke(action, params = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ action, version: 6, params });
    const req = http.request({
      hostname: ANKI_HOST,
      port: ANKI_PORT,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 2000
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          resolve({ error: 'Invalid JSON response from AnkiConnect' });
        }
      });
    });

    req.on('error', err => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('AnkiConnect request timed out'));
    });

    req.write(payload);
    req.end();
  });
}

async function isAnkiOnline() {
  try {
    const res = await invoke('version');
    return res && res.result >= 6;
  } catch (e) {
    return false;
  }
}

async function getCompatibleModelInfo() {
  try {
    const modelsRes = await invoke('modelNames');
    const models = (modelsRes && modelsRes.result) || [];

    // 1. Chinese Anki default: 问答题
    if (models.includes('问答题')) {
      return { modelName: '问答题', frontField: '正面', backField: '背面' };
    }

    // 2. English Anki default: Basic
    if (models.includes('Basic')) {
      return { modelName: 'Basic', frontField: 'Front', backField: 'Back' };
    }

    // 3. Fallback: inspect first available model
    if (models.length > 0) {
      const first = models[0];
      const fieldsRes = await invoke('modelFieldNames', { modelName: first });
      const fields = (fieldsRes && fieldsRes.result) || [];
      if (fields.length >= 2) {
        return { modelName: first, frontField: fields[0], backField: fields[1] };
      }
    }
  } catch (e) {
    // Ignore
  }

  return { modelName: '问答题', frontField: '正面', backField: '背面' };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatFrontHtml(item) {
  let highlightedSentence = '';
  if (item.sentence) {
    const regex = new RegExp(`\\b${escapeRegExp(item.word)}\\b`, 'gi');
    highlightedSentence = item.sentence.replace(regex, '<b>$&</b>');
  }

  const phoneticHtml = item.phonetic ? `<div style="color:#689f84; font-size:16px; margin:4px 0;">${item.phonetic}</div>` : '';
  const contextHtml = highlightedSentence ? `<div style="font-size:15px; color:#555; margin-top:14px; line-height:1.5;">"${highlightedSentence}"</div>` : '';

  return `<div style="font-size:24px; font-weight:bold; color:#d97736;">${item.word}</div>
${phoneticHtml}
${contextHtml}`;
}

function formatBackHtml(item) {
  const sourceText = item.source ? `<div style="font-size:12px; color:#999; margin-top:12px;">📖 来源：${item.source}</div>` : '';

  return `<hr id="answer" style="margin:12px 0; border:none; border-top:1px dashed #ccc;">
<div style="font-size:17px; font-weight:bold; color:#2c3e50;">${item.translation || '暂无释义'}</div>
${sourceText}`;
}

async function pushWordToAnki(item) {
  try {
    const online = await isAnkiOnline();
    if (!online) {
      return { success: false, reason: 'Anki 未启动' };
    }

    // 1. Ensure deck exists
    await invoke('createDeck', { deck: DECK_NAME });

    // 2. Get model & field mapping
    const { modelName, frontField, backField } = await getCompatibleModelInfo();

    // 3. Clean source tag
    const sourceTag = (item.source || 'AuraReader')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 25);

    const note = {
      deckName: DECK_NAME,
      modelName,
      fields: {
        [frontField]: formatFrontHtml(item),
        [backField]: formatBackHtml(item)
      },
      options: {
        allowDuplicate: false
      },
      tags: ['AuraReader', sourceTag]
    };

    const res = await invoke('addNote', { note });

    if (res && res.result) {
      // Trigger cloud sync to AnkiWeb in background (non-blocking)
      invoke('sync').catch(() => {});
      return { success: true, noteId: res.result };
    } else {
      return { success: false, reason: res.error || '添加卡片失败' };
    }
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

async function pushBatchToAnki(items) {
  try {
    const online = await isAnkiOnline();
    if (!online) {
      return { success: false, reason: 'Anki 未启动，请先打开 Anki 桌面客户端' };
    }

    if (!items || items.length === 0) {
      return { success: true, count: 0 };
    }

    await invoke('createDeck', { deck: DECK_NAME });
    const { modelName, frontField, backField } = await getCompatibleModelInfo();

    const notes = items.map(item => {
      const sourceTag = (item.source || 'AuraReader')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 25);

      return {
        deckName: DECK_NAME,
        modelName,
        fields: {
          [frontField]: formatFrontHtml(item),
          [backField]: formatBackHtml(item)
        },
        options: {
          allowDuplicate: false
        },
        tags: ['AuraReader', sourceTag]
      };
    });

    const res = await invoke('addNotes', { notes });

    if (res && Array.isArray(res.result)) {
      const successCount = res.result.filter(id => id !== null).length;
      invoke('sync').catch(() => {});
      return { success: true, count: successCount, total: items.length };
    }

    return { success: false, reason: res.error || '批量同步失败' };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

module.exports = {
  isAnkiOnline,
  pushWordToAnki,
  pushBatchToAnki,
  DECK_NAME
};
