const { exec } = require('child_process');

function playWord(word) {
  if (!word) return;
  const clean = word.trim().replace(/[^a-zA-Z\-'’\s]/g, '');
  if (!clean) return;

  const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(clean)}&type=2`;

  // Use Windows Media Player COM object via PowerShell (plays MP3 stream directly)
  const psCmd = `powershell -NoProfile -Command "$w=New-Object -ComObject wmplayer.ocx; $w.URL='${audioUrl}'; $w.controls.play(); Start-Sleep -Seconds 2"`;

  try {
    exec(psCmd, { timeout: 4000 }, () => {
      // Ignore background audio completion / lack of sound device
    });
  } catch (e) {
    // Graceful fallback
  }
}

module.exports = {
  playWord
};
