# Aura Code Reader | Python 极客流阅读器 (VS Code Extension)

![VS Code](https://img.shields.io/badge/VS%20Code-Extension-blue?style=flat-square)
![Stream Style](https://img.shields.io/badge/Stream-Python%20Geek-green?style=flat-square)
![Stealth](https://img.shields.io/badge/Stealth-Boss%20Key-orange?style=flat-square)

**专为开发者打造的沉浸式极客代码流 PDF 阅读器。**  
将枯燥的 PDF 文档和长篇英文原著，自动重构为带有高亮语法、标准 PEP8 排版与函数场景的 **Python 伪代码**。配合有道词典 Hover 悬停查词、状态栏摸鱼微显、左侧大纲树与 Anki 生词本，让在 VS Code 里读原著像是在 Review 优雅的源码。

---

## ✨ 核心特性

### 1. 🐍 Python 极客代码流重构引擎 (Python Geek Stream)
- **Class 章节大纲**：PDF 书签目录自动映射为 `class Chapter_01_The_Awakening:`；
- **Function 场景切分**：段落与对话自动切分为 `def scene_001(self):` 独立代码块；
- **原生代码折叠 (Code Folding)**：在 VS Code 中随心使用 `Ctrl+Shift+[` 折叠或展开整章与任意场景；
- **100% 杜绝划词错位**：文本完全进入 VS Code 原生字符缓冲器，享受零误差的单词双击与光标选取。

### 2. 📖 原生 Hover 悬停查词 (Native Hover Tooltip)
- 鼠标悬停在代码中的任意英文单词上，自动浮现 VS Code 原生深色/浅色磨砂气泡；
- 显示国际音标、有道权威中英文释义、上下文原句；
- **交互命令直达**：在气泡内直接点击 **`[⭐ 收藏至生词本]`** 或 **`[🔊 朗读]`**。

### 3. 🤫 状态栏摸鱼极简释义 (Status Bar Stealth Mode)
- 光标移动或选词时，屏幕上**不产生任何弹窗**；
- 底部状态栏自动极简浮现：`$(book) word [phonetic]: 释义`；
- 在任何公共场合、工位或自习室，保持极致低调。

### 4. 🚨 摸鱼老板键 (Boss Key)
- 快捷键 **`Ctrl+Alt+B`**（Mac 上为 `Cmd+Alt+B`）；
- 瞬间秒切至高逼格的集群健康监控脚本（`ConnectionPoolMonitor`），并显示全绿微服务通过状态。

### 5. 📑 章节大纲与生词本侧边工作台 (Activity Bar)
- 点击 VS Code 左侧活动栏的 **Aura 图标** 展开侧边面板；
- **章节大纲 (Chapters)**：按页码与标题列出全部章节，点击任意条目时光标直达该代码行；
- **触感生词本 (Vocab Book)**：展示全部收藏生词，支持发音、单条移除；
- **一键 Anki 词库导出**：点击面板顶部的 `$(cloud-download)` 图标，一键生成标准 UTF-8 CSV。

---

## ⌨️ 快捷键速查

| 快捷键 (Windows/Linux) | 快捷键 (macOS) | 对应功能 |
| :--- | :--- | :--- |
| **`Ctrl+Alt+O`** | `Cmd+Alt+O` | 打开本地 PDF 文件并重构为 Python 代码流 |
| **`Ctrl+Alt+B`** | `Cmd+Alt+B` | **老板键**：瞬间切出工作代码 |
| **`Alt+P`** | `Alt+P` | 朗读当前光标所在单词 |
| **鼠标悬停 (Hover)** | 鼠标悬停 | 呼出原生释义卡片与一键收藏 |

---

## 🛠️ 安装方法

### 方式一：直接链接到 VS Code 扩展目录（最简便）
本扩展已配置为无任何外部 npm 依赖，开箱即用。直接将本文件夹软链接或复制到 VS Code 的扩展目录即可：
```powershell
# 复制到 VS Code 全局扩展目录
Copy-Item -Path "C:\Users\HP\.gemini\antigravity\scratch\aura-code-reader" -Destination "$HOME\.vscode\extensions\aura-code-reader" -Recurse -Force
```
重启 VS Code 或在命令面板（`Ctrl+Shift+P`）执行 **`Developer: Reload Window`**，即可在左侧活动栏看到 Aura 图标！

---

## 📚 内置开箱即用样例书籍 (Example Book)

本项目在 `examples/` 目录下内置了著名科幻小说《挽救计划》（*Project Hail Mary* - Andy Weir）的完整 Python 极客流全书源码：
- **文件路径**：`examples/Project_Hail_Mary_Andy_Weir_.py`
- **全书规模**：467 页小说完整重构为 23,000+ 行标准 PEP8 规范 Python 代码，包含全部 37 个章节及完整大纲索引；
- **体验方式**：在 VS Code 中直接打开该文件，即可体验流畅的 Python 场景阅读、语境自适应悬停查词与 Anki 闭环同步！

---

## 📄 开源许可证

MIT License © 2026 [havefunwcy](https://github.com/havefunwcy)
