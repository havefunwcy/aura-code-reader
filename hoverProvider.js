const vscode = require('vscode');
const { lookup } = require('./dictionary');

class AuraHoverProvider {
  constructor(vocabManager) {
    this.vocabManager = vocabManager;
  }

  async provideHover(document, position, token) {
    const range = document.getWordRangeAtPosition(position, /[a-zA-Z\-'’]{2,40}/);
    if (!range) return null;

    const word = document.getText(range);
    if (!word || word.length < 2) return null;

    // Filter out common Python keywords and syntax tokens
    const pyKeywords = new Set([
      'def', 'class', 'self', 'return', 'import', 'from', 'pass', 'true', 'false',
      'none', 'async', 'await', 'with', 'try', 'except', 'finally', 'raise', 'if',
      'elif', 'else', 'for', 'while', 'in', 'is', 'not', 'and', 'or', 'lambda',
      'yield', 'assert', 'break', 'continue', 'global', 'nonlocal', 'typing', 'dict',
      'list', 'optional', 'any', 'str', 'int', 'bool', 'logger', 'logging', 'scene'
    ]);

    if (pyKeywords.has(word.toLowerCase())) {
      return null;
    }

    // Extract surrounding context (for contextual translation and vocab saving)
    let sentence = document.lineAt(position.line).text.trim();
    sentence = sentence.replace(/^[#"\s]+|[#"\s]+$/g, '');

    const result = await lookup(word, sentence);
    if (!result || token.isCancellationRequested) return null;

    const vocabItem = {
      word: result.word,
      phonetic: result.phonetic || '',
      translation: result.translation || '',
      sentence: sentence || '',
      source: document.fileName ? document.fileName.split(/[\\/]/).pop() : 'Python Geek Stream'
    };

    const addVocabArgs = encodeURIComponent(JSON.stringify([vocabItem]));
    const playAudioArgs = encodeURIComponent(JSON.stringify([result.word]));

    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;
    md.supportHtml = true;

    const phoneticText = result.phonetic ? `\`${result.phonetic}\`` : '';
    
    // Ultra-compact, low-profile layout (only 2 lines, pure text buttons without emojis)
    md.appendMarkdown(`**${result.word}** ${phoneticText} &nbsp;&nbsp; [收藏](command:aura.addVocab?${addVocabArgs}) · [朗读](command:aura.playAudio?${playAudioArgs})  \n`);
    md.appendMarkdown(`${result.shortTrans || result.translation}\n`);

    return new vscode.Hover(md, range);
  }
}

module.exports = AuraHoverProvider;
