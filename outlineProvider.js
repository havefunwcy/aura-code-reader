const vscode = require('vscode');

class OutlineProvider {
  constructor() {
    this.chapters = [];
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  setOutline(chapters) {
    this.chapters = chapters || [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    const item = new vscode.TreeItem(element.title, vscode.TreeItemCollapsibleState.None);
    item.description = element.page ? `P.${element.page}` : `L.${element.line + 1}`;
    item.tooltip = `${element.title} (点击直达第 ${element.line + 1} 行)`;
    item.iconPath = new vscode.ThemeIcon('symbol-class');
    item.command = {
      command: 'aura.jumpToLine',
      title: '跳转至章节',
      arguments: [element.line]
    };
    return item;
  }

  getChildren(element) {
    if (!element) {
      return this.chapters;
    }
    return [];
  }
}

module.exports = OutlineProvider;
