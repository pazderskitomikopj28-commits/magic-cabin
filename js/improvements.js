/* ============================================================
   魔法小木屋 · improvements.js —— 在原版基础上的三项改进
     1. 持久化：时辰 / 流速 / 天气 / 路牌文字 自动保存，刷新不再丢失
     2. 分享链接：把当前布置编码进 URL，发给朋友即可看到同款小屋
     3. 拍照明信片：一键把当前画面导出成带衬边与落款的 PNG 明信片
   依赖原版 index.html 内的 window.CABIN_CORE 钩子；原版逻辑零改动。
   ============================================================ */
(function () {
  'use strict';
  const core = window.CABIN_CORE;
  if (!core) { console.warn('[improvements] 未找到 CABIN_CORE 钩子'); return; }

  const SAVE_KEY = 'pa-cabin-v1';
  const $ = (s) => document.querySelector(s);

  /* ---------- 小样式与 Toast ---------- */
  const style = document.createElement('style');
  style.textContent = `
    #paFab { position: fixed; right: 16px; bottom: 18px; z-index: 60; display: flex; flex-direction: column; gap: 10px; }
    #paFab button {
      width: 46px; height: 46px; border-radius: 50%;
      border: 1.5px solid #33302a; background: rgba(253, 251, 246, .92);
      font-size: 19px; cursor: pointer;
      box-shadow: 2px 2px 0 rgba(51, 48, 42, .8);
      transition: transform .15s ease;
    }
    #paFab button:hover { transform: translate(-1px, -1px) scale(1.05); }
    #paFab button:active { transform: translate(1px, 1px); }
    #paToast {
      position: fixed; left: 50%; bottom: 30px; transform: translateX(-50%);
      z-index: 70; padding: 9px 20px; border-radius: 999px;
      border: 1.5px solid #33302a; background: rgba(253, 251, 246, .95);
      font: 600 13px/1 "PingFang SC", "Microsoft YaHei", sans-serif; color: #33302a;
      box-shadow: 2px 2px 0 rgba(51, 48, 42, .8);
      opacity: 0; pointer-events: none; transition: opacity .25s ease, translate .25s ease;
    }
    #paToast.show { opacity: 1; }
  `;
  document.head.appendChild(style);

  const toastEl = document.createElement('div');
  toastEl.id = 'paToast';
  document.body.appendChild(toastEl);
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  const fab = document.createElement('div');
  fab.id = 'paFab';
  fab.innerHTML = `<button id="paPhoto" title="拍照明信片（导出 PNG）">📷</button>
                   <button id="paShare" title="复制分享链接">🔗</button>`;
  document.body.appendChild(fab);

  /* ---------- 编解码 ---------- */
  const enc = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dec = (str) => JSON.parse(decodeURIComponent(escape(atob(
    str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)
  ))));

  /* ---------- 状态读写 ---------- */
  function snapshot() {
    return {
      g: Math.round(core.gameSec),           // 游戏内时刻（秒）
      s: Math.round(core.timeScale),         // 流速
      w: core.wx.type,                       // 天气
      r: core.wx.random ? 1 : 0,             // 天气自动轮换
      t: core.signText,                      // 路牌文字
    };
  }
  function apply(data) {
    if (!data) return;
    if (typeof data.g === 'number') {
      core.gameSec = data.g;
      try { core.timeSlider.value = Math.min(24, data.g / 3600); } catch (e) { /* 忽略 */ }
    }
    if (typeof data.s === 'number') {
      core.timeScale = data.s;
      try {
        const v = data.s <= 60 ? data.s / 120 : 0.5 + (data.s - 60) / (2 * (3600 - 60));
        core.speedSlider.value = Math.max(0, Math.min(1, v));
      } catch (e) { /* 忽略 */ }
    }
    if (data.w && core.WX_LIST.includes(data.w)) core.setWeather(data.w);
    if (data.r !== undefined && core.wxRandToggle) {
      core.wx.random = !!data.r;
      core.wxRandToggle.classList.toggle('on', !!data.r);
    }
    if (typeof data.t === 'string' && data.t) core.drawSign(data.t);
  }
  function saveLocal() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot())); } catch (e) { /* 忽略 */ }
  }
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
  }

  // 启动恢复：分享链接优先于本地存档
  try {
    const m = location.hash.match(/#c=([A-Za-z0-9\-_]+)/);
    if (m) {
      apply(dec(m[1]));
      history.replaceState(null, '', location.pathname + location.search);
      toast('已载入朋友分享的小屋 ✓');
    } else {
      apply(loadLocal());
    }
  } catch (e) { console.warn('[improvements] 恢复失败', e); }

  setInterval(saveLocal, 4000);
  addEventListener('beforeunload', saveLocal);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveLocal(); });

  /* ---------- 分享链接 ---------- */
  $('#paShare').addEventListener('click', () => {
    saveLocal();
    const code = enc(snapshot());
    const url = location.href.split('#')[0] + '#c=' + code;
    const done = () => toast('🔗 链接已复制，发给朋友就能看到同款小屋');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
    } else {
      fallbackCopy(url, done);
    }
  });
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动复制地址栏'); }
    ta.remove();
  }

  /* ---------- 拍照明信片 ---------- */
  $('#paPhoto').addEventListener('click', () => {
    if (document.pointerLockElement) document.exitPointerLock();
    // 手动补一帧再读取，绕过 preserveDrawingBuffer 限制
    core.renderer.render(core.scene, core.camera);
    const src = core.renderer.domElement.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
      const MARGIN = 36, CAPTION = 64;
      const W = img.width + MARGIN * 2, H = img.height + MARGIN * 2 + CAPTION;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const x = cv.getContext('2d');
      // 纸底
      x.fillStyle = '#fdfbf6';
      x.fillRect(0, 0, W, H);
      // 照片 + 墨线衬边
      x.drawImage(img, MARGIN, MARGIN);
      x.strokeStyle = '#33302a';
      x.lineWidth = 3;
      x.strokeRect(MARGIN + 1.5, MARGIN + 1.5, img.width - 3, img.height - 3);
      // 落款
      const d = new Date();
      const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
      x.fillStyle = '#33302a';
      x.font = `600 20px "PingFang SC", "Microsoft YaHei", sans-serif`;
      x.textBaseline = 'middle';
      x.textAlign = 'left';
      x.fillText('线稿风格魔女小屋', MARGIN, H - CAPTION / 2);
      x.textAlign = 'right';
      x.font = `400 18px ui-monospace, Consolas, monospace`;
      x.fillStyle = '#8a8478';
      x.fillText(date, W - MARGIN, H - CAPTION / 2);
      // 下载
      const a = document.createElement('a');
      a.download = `magic-cabin-postcard-${Date.now()}.png`;
      a.href = cv.toDataURL('image/png');
      a.click();
      toast('📷 明信片已保存到下载目录');
    };
    img.onerror = () => toast('截图失败，请再试一次');
    img.src = src;
  });

  window.__pa_cabin = { snapshot, apply, saveLocal };
})();
