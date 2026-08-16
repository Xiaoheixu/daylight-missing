/* 白昼失踪 - 游戏主逻辑 */

// ================== 设备检测与适配（手机端/电脑端） ==================
(function detectDeviceAndAdapt(){
  // 设备类型检测：综合UA+触摸能力+屏幕宽度判断
  const ua = navigator.userAgent || '';
  const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|SymbianOS|BlackBerry/i.test(ua);
  // iPadOS 13+ 伪装为桌面UA，靠触摸点数识别
  const isPadLike = navigator.maxTouchPoints > 1 && /Macintosh/.test(ua);
  // 屏幕宽度 ≤ 900px 视作移动端布局
  const isSmallScreen = window.innerWidth <= 900;

  // 最终判定：手机端
  window.IS_MOBILE = (isMobileUA && hasTouch) || isPadLike || (hasTouch && isSmallScreen);
  // 最终判定：触摸设备（含平板）
  window.IS_TOUCH = hasTouch && (isMobileUA || isPadLike || isSmallScreen);

  // 给<html>打标记，便于CSS差异化
  const cl = document.documentElement.classList;
  if(window.IS_MOBILE) cl.add('mode-mobile');
  else if(window.IS_TOUCH) cl.add('mode-touch');
  else cl.add('mode-desktop');

  // 防止移动端双击缩放、长按选中文字
  if(window.IS_TOUCH){
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('dblclick', e => e.preventDefault(), { passive:false });
    // 长按弹出系统菜单的屏蔽（图标、任务栏、窗口标题等）
    document.addEventListener('contextmenu', e => {
      // 只屏蔽桌面图标、任务栏、窗口标题、开始菜单区域
      if(e.target.closest('.desktop-folder, .taskbar, .window-title, #start-menu, .start-menu-list')){
        e.preventDefault();
      }
    }, { passive:false });
  }

  // 记录到全局，便于其他模块使用
  window.deviceMode = window.IS_MOBILE ? 'mobile' : (window.IS_TOUCH ? 'touch' : 'desktop');
})();

// ================== 统一的桌面图标事件代理（手机单击/电脑双击） ==================
(function desktopIconEventProxy(){
  // 防止重复绑定
  if(window.__desktopIconBound) return;
  window.__desktopIconBound = true;

  const desktop = document.getElementById('desktop') || document.body;
  // 双击间隔阈值（毫秒）：电脑端判定为双击
  const DBL_CLICK_THRESHOLD = 300;
  // 单击命中后等待是否双击的延时（仅电脑端生效）
  const CLICK_WAIT = 280;

  // 工具：执行 data-open 表达式（受限：只允许调用 openWindow/openUserFile/alert）
  function execOpen(el, e){
    const code = el.getAttribute('data-open');
    if(!code) return;
    // 白名单函数校验
    if(!/^(openWindow|openUserFile|alert)\(['"\s\S]+\)$/.test(code.trim())) {
      console.warn('[安全] 非法 data-open:', code);
      return;
    }
    try { (new Function(code))(); } catch(err){ console.error('data-open执行错误:', err); }
  }

  // 选中图标（高亮）
  function selectIcon(el){
    document.querySelectorAll('.desktop-folder').forEach(f => f.classList.remove('selected'));
    if(el) el.classList.add('selected');
  }

  // 暴露给全局，兼容旧调用
  window.selectIcon = selectIcon;

  // ---- 电脑端：双击打开，单击选中 ----
  // 用原生 dblclick 监听
  function bindDesktopEvents(){
    const icons = () => desktop.querySelectorAll('.desktop-folder[data-open]');

    if(window.IS_MOBILE || window.IS_TOUCH){
      // ============ 触屏 / 手机端 ============
      // 单击即打开（按住超过300ms算作多选/长按不触发打开）
      let touchStartTime = 0;
      let touchStartTarget = null;
      let touchMoved = false;

      icons().forEach(icon => {
        // 触屏：tap 即打开
        icon.addEventListener('touchstart', (e) => {
          touchStartTime = Date.now();
          touchStartTarget = icon;
          touchMoved = false;
        }, { passive:true });

        icon.addEventListener('touchmove', (e) => {
          touchMoved = true;
        }, { passive:true });

        icon.addEventListener('touchend', (e) => {
          if(touchMoved) return;             // 滑动不触发
          if(Date.now() - touchStartTime > 500) return;  // 长按不触发打开
          if(touchStartTarget !== icon) return;
          e.preventDefault();
          selectIcon(icon);
          // 延迟100ms打开，让选中视觉先显示
          setTimeout(() => execOpen(icon, e), 80);
        }, { passive:false });

        // 兼容鼠标点击（手机上偶尔会用蓝牙鼠标）
        icon.addEventListener('click', (e) => {
          // 触屏已经处理过，忽略
          if(e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
          selectIcon(icon);
          // 手机端鼠标也用单击
          setTimeout(() => execOpen(icon, e), 80);
        });
      });
    } else {
      // ============ 桌面端 ============
      // 保留双击打开 + 单击选中的 Windows 经典逻辑
      icons().forEach(icon => {
        icon.addEventListener('click', (e) => {
          selectIcon(icon);
        });
        icon.addEventListener('dblclick', (e) => {
          execOpen(icon, e);
        });
      });
    }
  }

  // DOM 就绪后绑定
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bindDesktopEvents);
  } else {
    bindDesktopEvents();
  }
  // 切换用户后桌面图标 display 变化但元素本身还在，事件绑定保留
})();

// ================== 安全：禁用浏览器默认右键，改用游戏内自定义右键菜单 ==================
(function(){
  // ---- 自定义右键菜单控制 ----
  function hideCtxMenu(){
    const m = document.getElementById('ctx-menu');
    if(m) m.classList.remove('active');
  }
  function showCtxMenuAt(x, y){
    const m = document.getElementById('ctx-menu');
    if(!m) return;
    // 边界：避免超出可视区域
    const W = window.innerWidth, H = window.innerHeight;
    const mw = m.offsetWidth || 230;
    const mh = m.offsetHeight || 360;
    x = Math.min(x, W - mw - 2);
    y = Math.min(y, H - mh - 2);
    m.style.left = Math.max(0, x) + 'px';
    m.style.top  = Math.max(0, y) + 'px';
    m.classList.add('active');
  }

  // 拦截浏览器默认右键，并显示游戏内菜单
  document.addEventListener('contextmenu', function(e){
    e.preventDefault();
    // 在桌面空白区域（#desktop）才能右键；在其他窗口内右键无效
    // 注意：这里允许整页右键，这样玩家在任何地方右键都能看到游戏风格的系统菜单
    showCtxMenuAt(e.clientX, e.clientY);
    return false;
  });

  // 点击任意地方关闭（左键、中键）
  document.addEventListener('mousedown', function(e){
    // 点击的如果在 ctx-menu 内，忽略（交给子元素自己的 onclick 处理）
    const target = e.target;
    if(target && target.closest && target.closest('#ctx-menu')){
      // 子菜单 / 菜单项的点击：onclick 处理完会 hide，这里不处理
      return;
    }
    hideCtxMenu();
  });

  // 滚动 / 调整大小 也关闭
  window.addEventListener('scroll', hideCtxMenu, true);
  window.addEventListener('resize', hideCtxMenu);

  // ESC 关闭
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' || e.keyCode === 27){ hideCtxMenu(); }
  });
})();

// 右键菜单动作
function ctxAction(type){
  hideCtxMenu();
  const menu = document.getElementById('ctx-menu');
  if(!menu) return;

  // 阻止 has-sub 父级菜单的点击直接触发操作，只有点具体子项才会走这里（子项onclick也会触发）
  // 但 DOM 结构里 has-sub 自己的 onclick 也绑定了 ctxAction('view'/'new')，我们这里简单忽略即可
  if(type === 'view' || type === 'new') return;

  if(type === 'refresh'){
    // 刷新：给所有可见桌面图标加上抖动动画
    const items = document.querySelectorAll('#desktop .desktop-folder');
    items.forEach((el, idx) => {
      if(el.style.display === 'none') return;
      el.classList.remove('desktop-refresh-anim');
      // 强制 reflow，重新触发动画
      void el.offsetWidth;
      el.classList.add('desktop-refresh-anim');
      // 动画结束后清除（动画 = 0.45s × 2 = 0.9s）
      setTimeout(() => el.classList.remove('desktop-refresh-anim'), 1000 + idx*20);
    });
    return;
  }

  // 大/小图标切换（视觉上缩放图标一下，不真的改变布局）
  if(type === 'view_large' || type === 'view_small'){
    const icons = document.querySelectorAll('#desktop .folder-icon');
    icons.forEach(i => {
      if(type === 'view_small'){
        i.style.transition = 'transform .25s';
        i.style.transform = 'scale(0.85)';
      } else {
        i.style.transition = 'transform .25s';
        i.style.transform = 'scale(1)';
      }
    });
    // 把对应的勾号挪到当前项
    const root = document.querySelector('#ctx-menu .ctx-submenu');
    if(root){
      root.querySelectorAll('.ctx-item').forEach(x => x.classList.remove('checked'));
      const tgt = root.querySelector(`[onclick*="${type}"]`);
      if(tgt) tgt.classList.add('checked');
    }
    return;
  }
  if(type === 'view_align' || type === 'view_grid'){
    // 切换勾选（仅视觉）
    const menu = document.querySelector('#ctx-menu');
    const item = menu && menu.querySelector(`[onclick*="${type}"]`);
    if(item){
      if(item.classList.contains('checked')) item.classList.remove('checked');
      else item.classList.add('checked');
    }
    return;
  }

  if(type === 'arrange'){
    // 模拟"按名称排列"：给桌面图标加一个轻微的顺序动画
    const items = Array.from(document.querySelectorAll('#desktop .desktop-folder')).filter(x => x.style.display !== 'none');
    items.forEach((el, idx) => {
      el.style.transition = 'all .35s ease-in-out';
      const origin = el.style.transform || '';
      el.style.transform = (origin||'') + ' translateY(-2px)';
      setTimeout(() => { el.style.transform = origin; }, 180 + idx*30);
    });
    return;
  }

  if(type === 'new_folder' || type === 'new_txt' || type === 'new_bmp'){
    const nameMap = { new_folder:'新建文件夹', new_txt:'新建 文本文档.txt', new_bmp:'新建 BMP 图像.bmp' };
    showModal(`已在桌面创建：<b>${nameMap[type]||''}</b><br><br><span style="color:#888;font-size:11px">（该项目为模拟对象，不影响主线解谜）</span>`, '📄 新建');
    return;
  }
  if(type === 'paste'){
    showModal('📋 剪贴板当前为空。<br><br>（未选择任何可粘贴对象）', '粘贴');
    return;
  }
  if(type === 'undo'){
    showModal('↶ 没有可以撤销的操作。', '撤销删除');
    return;
  }
  if(type === 'properties'){
    const u = USERS[currentUser] || { name:'未知', role:'未登录' };
    showModal(
      `<b>东川一中 · 工作桌面</b><hr style="border-color:#ddd;margin:8px 0">` +
      `🖥️ 系统：Windows 2000 Server（校园定制版）<br>` +
      `👤 当前用户：<b>${u.name}</b>（${u.role}）<br>` +
      `📅 系统时间：<b style="color:#a02020">2018年6月14日 18:41:00（与标准时偏差 ≈ 8年）</b><br>` +
      `💾 桌面项目：${Array.from(document.querySelectorAll('#desktop .desktop-folder')).filter(x=>x.style.display!=='none').length} 个<br>` +
      `🔐 登录域：<b>DCYZ-EDU.LOCAL</b><br>` +
      `📡 网络状态：<b>已连接至启明教育内网专线</b>`,
      '🛈 桌面 属性'
    );
    return;
  }
}
function hideCtxMenu(){
  const m = document.getElementById('ctx-menu');
  if(m) m.classList.remove('active');
}

// ================== 安全：拦截开发者工具快捷键 ==================
(function(){
  document.addEventListener('keydown', function(e){
    // F12
    if(e.key === 'F12' || e.keyCode === 123){
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Ctrl+Shift+I / J / C
    if(e.ctrlKey && e.shiftKey){
      const k = (e.key||'').toLowerCase();
      if(k === 'i' || k === 'j' || k === 'c' || e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67){
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }
    // Ctrl+U 查看源码
    if(e.ctrlKey && ((e.key||'').toLowerCase() === 'u' || e.keyCode === 85)){
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Ctrl+S 保存
    if(e.ctrlKey && ((e.key||'').toLowerCase() === 's' || e.keyCode === 83)){
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // F5 也可以做"刷新"动作——与右键菜单的刷新一致
    if(e.key === 'F5' || e.keyCode === 116){
      e.preventDefault();
      e.stopPropagation();
      ctxAction('refresh');
      return false;
    }
  });
  document.oncontextmenu = function(){ return false; };
})();

// ================== 游戏内模态框（替换原生alert/confirm） ==================
function showModal(message, title){
  const overlay = document.getElementById('game-modal-overlay');
  document.getElementById('gm-header').textContent = title || '提示';
  document.getElementById('gm-body').innerHTML = message.replace(/\n/g,'<br>');
  const footer = document.getElementById('gm-footer');
  footer.innerHTML = '<button class="game-modal-btn" onclick="hideModal()">确定</button>';
  overlay.classList.add('active');
}
function showConfirm(message, onYes, title){
  const overlay = document.getElementById('game-modal-overlay');
  document.getElementById('gm-header').textContent = title || '确认';
  document.getElementById('gm-body').innerHTML = message.replace(/\n/g,'<br>');
  const footer = document.getElementById('gm-footer');
  footer.innerHTML = '<button class="game-modal-btn secondary" onclick="hideModal()">取消</button>' +
    '<button class="game-modal-btn danger" id="gm-yes-btn">确定</button>';
  document.getElementById('gm-yes-btn').onclick = () => { hideModal(); if(onYes) onYes(); };
  overlay.classList.add('active');
}
function hideModal(){
  document.getElementById('game-modal-overlay').classList.remove('active');
}

// 覆盖原生alert/confirm为游戏内版本
window.alert = showModal;
window.confirm = showConfirm;

// ================== 启动动画（跳过，直接显示前言） ==================
(function bootSequence(){
  document.getElementById('boot-screen').style.display = 'none';
  showPrologue();
})();

// ================== 前言介绍 ==================
function showPrologue(){
  const screen = document.getElementById('prologue-screen');
  const textEl = document.getElementById('prologue-text');
  screen.classList.add('active');

  const prologueLines = [
    '<span class="dim">2026 年 8 月 15 日 · 深夜</span>',
    '',
    '我坐在这台闲置了八年的旧电脑前，',
    '屏幕上的灰尘反射着微弱的光。',
    '',
    '八年前的那个夏天，我的好朋友 <span class="highlight">许妍</span> 失踪了。',
    '没有告别，没有遗书，',
    '她的一切痕迹在一夜之间从世界上消失——',
    '学校档案、毕业合照、甚至所有人的记忆。',
    '',
    '只留下这本练习册，和一些无法解释的时间矛盾。',
    '',
    ' <span class="question">有人说她转学了。</span>',
    ' <span class="question">有人说她根本不存在过。</span>',
    ' <span class="question">但为什么我的记忆如此清晰？</span>',
    '',
    '今晚，我决定重新打开这台电脑，',
    '追查所有蛛丝马迹——',
    '',
    ' <span class="highlight">真相，藏在数据的缝隙里。</span>',
    ' <span class="highlight">而数据，永远不会说谎。</span>',
  ];

  let idx = 0, charIdx = 0, current = '';

  function typeLine(){
    if(idx >= prologueLines.length){
      document.getElementById('prologue-start-btn').classList.add('show');
      document.getElementById('prologue-hint').textContent = '[ 线索将在你探索的过程中逐渐浮现 · 没有提示 · 没有捷径 ]';
      // 前言打字完成后，立即获取并显示在线人数和总访问人数
      fetchAndRenderStats();
      // 启动定时刷新（每60秒一次），保持在线人数实时更新
      if(!window._statsTimer){
        window._statsTimer = setInterval(fetchAndRenderStats, 60000);
      }
      return;
    }
    const line = prologueLines[idx];
    if(charIdx < line.length){
      current += line[charIdx++];
      textEl.innerHTML = current + '<span class="prologue-cursor"></span>';
      setTimeout(typeLine, 12);
    } else {
      current += '\n';
      textEl.innerHTML = current;
      idx++; charIdx = 0;
      setTimeout(typeLine, 280);
    }
  }
  typeLine();
}

function startGame(){
  const screen = document.getElementById('prologue-screen');
  screen.style.opacity = '0';
  setTimeout(() => {
    screen.classList.remove('active');
    screen.style.opacity = '';
    // 显示任务栏
    document.getElementById('taskbar').style.display = 'flex';
    // 初始化用户UI（开始菜单头像、隐藏专属文件图标）
    updateUserUI();
    // 初始化用户体系下的QQ联系人（可能新增了一些）
    renderQQContacts();
  }, 800);
}

// 任务栏时钟（显示错误时间，需玩家自己校准）
let systemTime = { year: 2018, month: 6, day: 14, hour: 18, min: 41, sec: 0 };
let timeCorrected = false;
const REAL_TIME = { year: 2026, month: 8, day: 15 };

function formatSystemTime(){
  const y = systemTime.year;
  const m = String(systemTime.month).padStart(2,'0');
  const d = String(systemTime.day).padStart(2,'0');
  const h = String(systemTime.hour).padStart(2,'0');
  const mi = String(systemTime.min).padStart(2,'0');
  const s = String(systemTime.sec).padStart(2,'0');
  return `${y}/${m}/${d} ${h}:${mi}`;
}

setInterval(() => {
  systemTime.sec++;
  if(systemTime.sec >= 60){ systemTime.sec = 0; systemTime.min++; }
  if(systemTime.min >= 60){ systemTime.min = 0; systemTime.hour++; }
  if(systemTime.hour >= 24){ systemTime.hour = 0; systemTime.day++; }
  const el = document.getElementById('task-clock');
  if(el) el.textContent = formatSystemTime();
  const dig = document.getElementById('clock-digital');
  if(dig) dig.textContent = formatSystemTime() + ':' + String(systemTime.sec).padStart(2,'0');
  updateClockFace();
}, 1000);

function updateClockFace(){
  const h = document.getElementById('clock-hour');
  const m = document.getElementById('clock-minute');
  const s = document.getElementById('clock-second');
  if(!h) return;
  const secAngle = systemTime.sec * 6;
  const minAngle = systemTime.min * 6 + systemTime.sec * 0.1;
  const hourAngle = (systemTime.hour % 12) * 30 + systemTime.min * 0.5;
  h.style.transform = `rotate(${hourAngle}deg)`;
  m.style.transform = `rotate(${minAngle}deg)`;
  s.style.transform = `rotate(${secAngle}deg)`;
}

function applyClock(){
  const y = parseInt(document.getElementById('clock-year').value) || 2018;
  const mo = parseInt(document.getElementById('clock-month').value) || 1;
  const d = parseInt(document.getElementById('clock-day').value) || 1;
  const h = parseInt(document.getElementById('clock-hour-input').value) || 0;
  const mi = parseInt(document.getElementById('clock-min-input').value) || 0;
  const s = parseInt(document.getElementById('clock-sec-input').value) || 0;
  systemTime = { year: y, month: mo, day: d, hour: h, min: mi, sec: s };
  const note = document.getElementById('clock-note');
  if(y === REAL_TIME.year && mo === REAL_TIME.month && d === REAL_TIME.day){
    note.innerHTML = '<span class="clock-hint-correct">✓ 时间已校准为正确日期。<br>一些隐藏的线索可能因此浮现...</span>';
    timeCorrected = true;
    // 触发日记中隐藏内容的显示
    renderDiary(currentDiaryIdx);
    showModal('时间已校准。\n\n一些之前被隐藏的内容现在可以看到了。\n\n去检查许妍的日记和其他地方...', '系统时间更新');
  } else {
    note.innerHTML = '<span class="clock-hint-wrong">⚠ 时间已更改，但似乎还不正确...\n\n提示：练习册上的日期是多少？</span>';
    timeCorrected = false;
    renderDiary(currentDiaryIdx);
  }
}

// ================== 用户账户体系 ==================
/*
  线索位置（玩家需要自行推理组合）:
  - 许妍 密码: xuyan_B317_0614
    线索：日记里反复出现B317 + 日期0614 + 练习册里的用户名
  - 校长（陈国栋）密码: Chen_19680322_DCYZ
    线索：学校官网校长致辞"出生于1968年3月22日" + 校园简介里DCYZ缩写 + 署名"陈国栋"
  - 导师（秦明辉）密码: QmHui_QX18_1975
    线索：企业网站CEO简介"秦明辉 1975年生" + 启明星QX18代号 + 内部邮件署名QmHui
  - 导员（张志强）密码: ZhangZQ_2010_DCYZ
    线索：学校官网"师资队伍"张志强2010年入职 + DCYZ学校缩写 + 姓名拼音缩写
*/
const USERS = {
  me:        { name:'我',        role:'高三学生 / 调查者', avatarClass:'avatar-me',        avatarText:'我',  password:'',
               hint:'（无密码）' },
  xuyan:     { name:'许妍',      role:'高三学生 / 失踪者', avatarClass:'avatar-xuyan',     avatarText:'妍',  password:'xuyan_B317_0614',
               hint:'日记里反复出现的地点 + 失踪日期（yyyy-MMdd缩写拼接）' },
  teacher:   { name:'张志强',    role:'高三(2)班班主任助理', avatarClass:'avatar-mentor', avatarText:'导', password:'ZhangZQ_2010_DCYZ',
               hint:'学校官网"师资队伍"：姓名拼音缩写 + 2010年入职 + DCYZ学校缩写' },
  principal: { name:'陈国栋',    role:'东川一中校长',     avatarClass:'avatar-principal', avatarText:'校', password:'Chen_19680322_DCYZ',
               hint:'学校官网校长致辞：署名 + 生日 + 学校缩写' },
  mentor:    { name:'秦明辉',    role:'启明教育CEO / QX18导师', avatarClass:'avatar-mentor', avatarText:'导', password:'QmHui_QX18_1975',
               hint:'企业官网CEO简介：姓名缩写 + 启明星项目代号 + 出生年份' }
};
let currentUser = 'me';
let a03Restored = false;  // 校长回收站A03档案是否已还原到桌面
let lockSelectedUser = null;

function updateUserUI(){
  const u = USERS[currentUser];
  // 开始菜单
  const ma = document.getElementById('menu-avatar');
  const mu = document.getElementById('menu-username');
  if(ma) ma.textContent = u.avatarText;
  if(mu) mu.innerHTML = u.name + '<br><span style="font-size:10px;opacity:.7">'+u.role+'</span>';
  // 公共图标
  document.querySelectorAll('.user-common').forEach(el => el.style.display = 'block');
  // QQ只在学生和导员桌面显示（校长、导师不显示）
  const showQQ = (currentUser==='me'||currentUser==='xuyan'||currentUser==='teacher');
  document.querySelectorAll('.user-qq').forEach(el => el.style.display = showQQ?'block':'none');
  // 公共：所有账户都有（此电脑 / 回收站 / 浏览器 / 控制面板）
  document.querySelectorAll('.user-common').forEach(el => el.style.display = 'block');

  // QQ：学生/导员有，校长/导师无（校长/导师用启明内网通或其高权限版本）
  document.querySelectorAll('.user-qq').forEach(el => {
    el.style.display = (currentUser === 'me' || currentUser === 'xuyan' || currentUser === 'teacher') ? 'block' : 'none';
  });

  // 启明内网通：（先批量设置，后面 user-only-* 细粒度覆盖）
  //   高权限（深紫/深红） —— 校长 / 导师：桌面图标 user-entim
  //   低权限（灰蓝，带"低"水印） —— 许妍 / 导员：桌面图标 user-entim-low
  //   "我"（高三学生普通账号） —— 完全没有内网通
  document.querySelectorAll('.user-entim').forEach(el => el.style.display = (currentUser==='principal'||currentUser==='mentor')?'block':'none');
  document.querySelectorAll('.user-entim-low').forEach(el => {
    el.style.display = (currentUser==='xuyan' || currentUser==='teacher') ? 'block' : 'none';
  });

  // 用户专属文件图标（必须在最后执行：覆盖上面批量设置，避免图标重复）
  document.querySelectorAll('.user-only-me').forEach(el => el.style.display = currentUser==='me'?'block':'none');
  document.querySelectorAll('.user-only-xuyan').forEach(el => el.style.display = currentUser==='xuyan'?'block':'none');
  document.querySelectorAll('.user-only-principal').forEach(el => el.style.display = currentUser==='principal'?'block':'none');
  document.querySelectorAll('.user-only-mentor').forEach(el => el.style.display = currentUser==='mentor'?'block':'none');
  document.querySelectorAll('.user-only-teacher').forEach(el => el.style.display = currentUser==='teacher'?'block':'none');

  // A03还原文件：仅校长还原后显示（a03Restored 全局变量在还原动作时置 true）
  const a03 = document.getElementById('a03-restored');
  if(a03){
    a03.style.display = (currentUser === 'principal' && a03Restored) ? 'block' : 'none';
  }
  // 锁屏右上角当前用户
  const tip = document.getElementById('lock-current-tip');
  if(tip) tip.textContent = '当前：' + u.name + '（已登录）';
  // 开始菜单个性化：按账户显示/隐藏特定程序项
  renderStartMenuPersonalized();
}

function renderLockUserList(){
  const list = document.getElementById('lock-user-list');
  list.innerHTML = Object.keys(USERS).map(k => {
    const u = USERS[k];
    return `<div class="lock-user ${lockSelectedUser===k?'selected':''}" onclick="selectLockUser('${k}')">
      <div class="lock-user-avatar ${u.avatarClass}">${u.avatarText}</div>
      <div class="lock-user-name">${u.name}</div>
      <div class="lock-user-role">${u.role}</div>
    </div>`;
  }).join('');
  // 提示
  const ph = document.getElementById('lock-password');
  if(ph){
    if(lockSelectedUser){
      const u = USERS[lockSelectedUser];
      ph.placeholder = u.password ? `输入 ${u.name} 的密码` : `点击登录即可（${u.name} 无密码）`;
    } else {
      ph.placeholder = '先点击上方用户头像，再输入密码';
    }
  }
}

function selectLockUser(k){
  lockSelectedUser = k;
  renderLockUserList();
  document.getElementById('lock-err').textContent = '';
  // 如果该账号已保存密码，自动填充并勾选记住
  const saved = getSavedAccounts();
  const hasSaved = saved[k] !== undefined;
  const pwInput = document.getElementById('lock-password');
  if(hasSaved){
    pwInput.value = saved[k];
    document.getElementById('lock-remember').checked = true;
  } else {
    pwInput.value = '';
    document.getElementById('lock-remember').checked = true;
  }
  if(USERS[k].password === ''){
    pwInput.disabled = true;
    // 无密码账户直接给提示
    pwInput.placeholder = `点击登录即可（${USERS[k].name} 无密码）`;
  } else {
    pwInput.disabled = false;
    setTimeout(() => pwInput.focus(), 50);
  }
}

// ============ 已保存密码管理（localStorage 持久化） ============
const SAVED_ACCOUNTS_KEY = 'bm_saved_accounts';
function getSavedAccounts(){
  try {
    return JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || '{}');
  } catch(e){ return {}; }
}
function saveAccountPassword(userKey, password){
  const all = getSavedAccounts();
  if(!password){
    delete all[userKey];
  } else {
    all[userKey] = password;
  }
  localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(all));
}
function clearSavedAccounts(){
  localStorage.removeItem(SAVED_ACCOUNTS_KEY);
}

// 渲染已保存账号列表（快速登录区）
function renderSavedAccountsList(){
  const wrap = document.getElementById('lock-saved-accounts');
  const list = document.getElementById('lock-saved-list');
  if(!wrap || !list) return;
  const saved = getSavedAccounts();
  const keys = Object.keys(saved);
  if(keys.length === 0){
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  list.innerHTML = keys.map(k => {
    const u = USERS[k] || { name: k, role:'', avatarClass:'', avatarText:'?' };
    return `<div class="lock-saved-item" onclick="quickLoginSaved('${k}')">
      <div class="lock-user-avatar ${u.avatarClass}">${u.avatarText}</div>
      <div class="lock-saved-info">
        <div class="lock-saved-name">${u.name}</div>
        <div class="lock-saved-role">${u.role}</div>
      </div>
      <div class="lock-saved-badge" title="已保存密码">已记住</div>
      <button class="lock-saved-forget" onclick="event.stopPropagation();forgetSavedAccount('${k}')" title="忘记此账号密码">×</button>
    </div>`;
  }).join('');
}

// 一键登录已保存的账号
function quickLoginSaved(k){
  const saved = getSavedAccounts();
  if(saved[k] === undefined) return;
  // 模拟选择+填密码+登录
  lockSelectedUser = k;
  renderLockUserList();
  const pwInput = document.getElementById('lock-password');
  pwInput.value = saved[k];
  pwInput.disabled = (USERS[k].password === '');
  document.getElementById('lock-err').textContent = '';
  tryLogin();
}

// 忘记某个已保存账号
function forgetSavedAccount(k){
  const all = getSavedAccounts();
  delete all[k];
  localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(all));
  renderSavedAccountsList();
}

// ============ 在线人数 / 总访问人数 显示 ============
async function fetchAndRenderStats(){
  try {
    const r = await fetch('/api/stats');
    const d = await r.json();
    const onlineEl = document.getElementById('stat-online');
    const totalEl = document.getElementById('stat-total');
    if(onlineEl) onlineEl.textContent = d.online;
    if(totalEl) totalEl.textContent = d.totalVisits;
  } catch(e){ /* 静默失败，玩家看不到统计不影响游戏 */ }
}

function tryLogin(){
  if(!lockSelectedUser){
    document.getElementById('lock-err').textContent = '请先点击上方选择要登录的用户。';
    return;
  }
  const u = USERS[lockSelectedUser];
  const pw = document.getElementById('lock-password').value;
  if(pw !== u.password){
    document.getElementById('lock-err').textContent = '密码错误。请仔细查找网站和文档中的线索...';
    return;
  }
  // 登录成功 —— 如果勾选"记住密码"且密码非空，保存到 localStorage
  const remember = document.getElementById('lock-remember')?.checked;
  if(remember && u.password){
    saveAccountPassword(lockSelectedUser, u.password);
  } else if(!remember){
    // 取消勾选则移除已保存的密码
    saveAccountPassword(lockSelectedUser, '');
  }
  // 登录成功 —— 切换用户前关闭所有已打开的窗口并重置任务栏
  const switchingToOther = lockSelectedUser !== currentUser;
  currentUser = lockSelectedUser;
  updateUserUI();
  if(switchingToOther){
    // 关闭所有窗口（保留窗口元素本身，只隐藏并清空浏览器等会保留状态的内容）
    document.querySelectorAll('.window').forEach(w => {
      w.style.display = 'none';
      const id = w.id;
      const taskId = 'taskbtn-' + id.split('-')[0];
      const task = document.getElementById(taskId);
      if(task){ task.style.display = 'none'; task.classList.remove('active'); }
    });
    // 清空浏览器内容，下次打开显示Web导航
    const bc = document.getElementById('browser-content');
    if(bc) bc.innerHTML = '';
    const bt = document.getElementById('browser-tabs');
    if(bt) bt.innerHTML = `<div class="tab active" data-tab="newtab" onclick="switchTab('newtab')">新标签页 <span class="close-tab" onclick="event.stopPropagation()">×</span></div>`;
    const bi = document.getElementById('url-input');
    if(bi) bi.value = '';
  }
  document.getElementById('lock-err').textContent = '';
  document.getElementById('lock-screen').classList.remove('active');
  // 欢迎提示
  if(currentUser === 'xuyan'){
    showModal('切换成功：许妍视角\n\n桌面现在多出一个"加密日记"图标。\n这是她写下的、只有自己才能看到的内容...', '登录成功');
  } else if(currentUser === 'principal'){
    showModal('切换成功：校长 陈国栋\n\n桌面上出现了一个"校长密函"文件夹。\n这是他授意掩盖许妍失踪事件的原始文件...', '登录成功');
  } else if(currentUser === 'mentor'){
    showModal('切换成功：秦明辉 导师\n\n桌面上出现了"实验日志"文件夹。\n这里记录了QX18实验的真实数据...', '登录成功');
  } else if(currentUser === 'teacher'){
    showModal('切换成功：张志强 导员\n\n桌面上出现了"学习管理系统"图标。\n这是班主任助理管理学生学籍、成绩、考勤的系统...', '登录成功');
  } else {
    showModal('回到了我自己的桌面。', '登录成功');
  }
}

function openLockScreen(){
  lockSelectedUser = currentUser;
  renderLockUserList();
  // 显示已保存账号列表（一键登录）
  renderSavedAccountsList();
  // 如果当前用户已有保存密码，自动填入
  if(lockSelectedUser){
    const saved = getSavedAccounts();
    if(saved[lockSelectedUser] !== undefined){
      document.getElementById('lock-password').value = saved[lockSelectedUser];
      document.getElementById('lock-remember').checked = true;
    }
  }
  // 锁屏时钟显示系统时间
  function updLockClock(){
    const el1 = document.getElementById('lock-time');
    const el2 = document.getElementById('lock-date');
    if(!el1) return;
    el1.textContent = String(systemTime.hour).padStart(2,'0') + ':' + String(systemTime.min).padStart(2,'0');
    el2.textContent = `${systemTime.year}年${systemTime.month}月${systemTime.day}日`;
  }
  updLockClock();
  if(!window._lockClockTimer) window._lockClockTimer = setInterval(updLockClock, 1000);
  document.getElementById('lock-screen').classList.add('active');
}

function backToDesktop(){
  document.getElementById('lock-screen').classList.remove('active');
}

// ================== 用户专属文件内容 ==================
const USER_FILES = {
  xuyan_secret: {
    title:'🔒 许妍的加密日记',
    html:`<div class="doc-head">许妍 · 私人加密日记</div>
<div class="doc-secret">仅本人可见</div>
<div class="doc-meta">2018年6月14日  18:55</div>

<p>如果有人能看到这个文件——那说明那个人<strong>不是我</strong>。</p>
<p>&nbsp;</p>
<p>或者是，八年后的我。</p>
<p>&nbsp;</p>
<p>我在QX18实验中注意到了一件事：我们的记忆是可以被<strong>改写</strong>的。启明教育在我们学生身上做了一次尝试。</p>
<p>我是第一个被试者。</p>
<p>&nbsp;</p>
<p>如果有人试图删除我存在过的痕迹，我希望这个文件能<strong>留到八年后</strong>。</p>
<p>&nbsp;</p>
<p style="text-indent:2em;">账号：xuyan &nbsp;&nbsp; 密码：<strong>B317_QX18_20180614</strong></p>
<p style="text-indent:2em;">（如果你能看到这里，就用我的账号登录校园内网——有一篇只有我才能访问的日志）</p>
<p>&nbsp;</p>
<p>老师说：<strong>"记忆是会骗人的，但服务器日志不会。"</strong></p>
<p>我希望他说的是对的。</p>
<p>&nbsp;</p>
<p style="text-align:right;">—— 许妍 · 在B-317门外写的</p>
<div class="doc-stamp">加密文件<br>2018.06.14<br>指纹校验</div>`
  },
  principal_cover: {
    title:'🔴 校长密函 · 关于处理许妍事件的指示',
    html:`<div class="doc-secret">★ 机密 · 阅后即焚 ★</div>
<div class="doc-head">东川一中内部文件</div>
<div class="doc-meta">文件编号：DC-2018-M0614<br>签发人：陈国栋<br>日期：2018年6月14日 21:05</div>

<p><strong>事由：</strong>关于高三(3)班学生许妍在B-317室"消失"一事的处理方案。</p>
<p>&nbsp;</p>
<p><strong>一、背景</strong></p>
<p>许妍同学为我校启明星(QX18)项目入选学生。今日下午于B-317室参与启明教育实验后，<strong>相关实验产生了不可预料的副作用</strong>，目前该生状态不明。</p>
<p>&nbsp;</p>
<p><strong>二、统一口径</strong></p>
<p>1. 所有师生对外一律答复：<em>"许妍同学已于6月13日办理转学手续，家长亲自接送。"</em></p>
<p>2. 学籍、档案、毕业照、成绩单等所有纸质与电子档案中<strong>删除许妍的全部记录</strong>。</p>
<p>3. 对该生的好友（如高三2班的同学）进行<strong>心理暗示和记忆引导</strong>，必要时可使用QX18协议第二版。</p>
<p>&nbsp;</p>
<p><strong>三、时间修正</strong></p>
<p>已通知启明教育技术部将B-317门禁及服务器系统时间<strong>调快7分钟</strong>，以制造不在场证明，确保所有记录与"转学"口径一致。</p>
<p>&nbsp;</p>
<p><strong>四、事后</strong></p>
<p>待QX18实验组出具正式报告后，再决定是否恢复该生档案。</p>
<p>如无法恢复，则永久封口。</p>
<p>&nbsp;</p>
<p style="text-align:right;">—— 陈国栋（签字）</p>
<div class="doc-stamp">东川市<br>第一中学<br>公章</div>`
  },
  mentor_log: {
    title:'🟣 秦明辉 · QX18实验日志',
    html:`<div class="doc-secret">QX18-A03 实验记录 · 启明教育</div>
<div class="doc-head">启明星计划 · 第18号实验组</div>
<div class="doc-meta">记录人：秦明辉（导师/CEO）<br>实验代号：QX18-A03<br>时间：2018年6月14日 20:13</div>

<p><strong>第007次实验 · 被试者：许妍（高三）</strong></p>
<p>&nbsp;</p>
<p><strong>实验目标：</strong>验证QX18协议对"短期记忆锚定"的改写效果，及对"记忆群体同步篡改"的可行性。</p>
<p>&nbsp;</p>
<p><strong>实验过程：</strong></p>
<p>1. 18:41 被试者进入B-317实验室，情绪稳定。</p>
<p>2. 18:58 服务器启动协议，同时为后续掩盖，<strong>系统整体时钟 +7分钟</strong>。</p>
<p>3. 19:03（实际为18:56）协议注入，被试者<strong>记忆开始偏移</strong>。</p>
<p>4. 19:11（实际为19:04）数据访问高峰，协议同步至学校网络。</p>
<p>5. <span style="color:#a00;"><strong>异常发生：</strong></span>被试者本人的<strong>存在记忆</strong>（而非单个事件）被连带改写。其本人从系统中"消失"。</p>
<p>&nbsp;</p>
<p><strong>数据：</strong></p>
<p>· 偏移量：<code style="background:#e0e0ff;padding:2px 6px;">ΔT = +7 分钟</code></p>
<p>· 影响范围：被试者本人 + 所有关联个体记忆</p>
<p>· 副作用等级：<code style="background:#ffe0e0;padding:2px 6px;color:#a00;">S 级 · 不可逆转</code></p>
<p>&nbsp;</p>
<p><strong>后续建议：</strong></p>
<p>1. 由陈校长出面负责校园口径处理。</p>
<p>2. 数据备份，<code>QX18_A03_20180614.db</code> 加密存入服务器。</p>
<p>3. <span style="color:#a00;">该项目须暂停，<strong>但可在8年后的同日再次尝试</strong>——根据理论模型，原被试者可能会在新的锚定点"浮现"。</span></p>
<p>&nbsp;</p>
<p style="text-align:right;">—— 秦明辉 · 启明教育科技有限公司</p>
<div class="doc-stamp">启明星计划<br>QX18-A03<br>绝密</div>`
  },
  a03_archive: {
    title:'⚠️【还原】A03 许妍 完整档案（机密级）',
    html:`<div class="doc-secret" style="background:linear-gradient(90deg,#900,#b03030,#900);">★ 机密 · 仅校长阅 ★ 此文件已从回收站还原 ★</div>
<div class="doc-head">A03 · 许妍 —— QX18 被试完整档案</div>
<div class="doc-meta">
  档案编号：QX18-A03-2018-0614-HK<br>
  创建人：启明教育 · 周博士<br>
  删除时间：<b style="color:#b01020">2018-06-15 00:13（校长陈国栋手动删除）</b><br>
  <span style="color:#a00;">⚠ 原文件应为 38MB，此处仅保留校长曾看过的 4 页概要</span>
</div>

<p><strong>【第1页】基础信息</strong></p>
<p>姓　名：<b>许妍</b> &nbsp; 性别：女 &nbsp; 年龄：17 &nbsp; 班级：高三(3)班<br>
学号：2018060308 &nbsp; 身份证前6位：530102 &nbsp; 籍贯：东川本市<br>
紧急联系人：许建国（父） / 电话已停用（家长封口后已换号）</p>
<p>&nbsp;</p>
<p><strong>【第2页】入选原因</strong></p>
<p>2018年4月16日 入学常规脑电扫描：海马体活跃度 = 1.82倍常模，<b>7分钟共振特征完美</b>。由导师秦明辉亲自圈入A系列，签批人陈国栋。<br>
同期入选名单（共5人）：<br>
　A01 林×（高三1班，已删除，封口完成）<br>
　A02 王×（高三4班，已删除，封口完成）<br>
　A03 <b style="color:#a02020">许妍（高三3班，本次实验对象，封口失败）</b><br>
　A04 刘××（高二，已删除，封口完成）<br>
　A05 陈×（本校陈校长侄女，对照组，<b style="color:#060">未做任何处理</b>）</p>
<p>&nbsp;</p>
<p><strong>【第3页】实验摘要</strong></p>
<p>共 7 次 QX18 注入，末次：2018-06-14 19:03(+00:07偏移)<br>
记忆改写成功率：<b style="color:#a02020">对外人(97.4%)，对本人(41.6%)</b> ← 本人反抗强烈<br>
未覆盖锚点：共 3 处 <code style="background:#ffe0e0;padding:2px 6px">① 7 分钟差、② 蓝色发带、③ "你要记得我啊"语音残片</code><br>
<b style="color:#b01020">副作用爆发：其存在从集体记忆中消失，并发生逆传染（同桌、小夏开始记起她）</b></p>
<p>&nbsp;</p>
<p><strong>【第4页】校长操作日志</strong></p>
<p>2018-06-15 00:10 陈国栋登录系统，浏览本档案 2 分 47 秒。<br>
2018-06-15 00:13 <b style="color:#a02020">校长点"删除"，未选"彻底删除"，仅移入回收站。</b><br>
操作日志备注：<br>
<code style="background:#f0f0f0;padding:8px;display:block;line-height:1.7;color:#444">
admin_chen@DCYZ-EDU:> del A03-许妍-完整档案.pdf
[提示] 您确定将文件移动到回收站吗？(Y/N): Y
[系统] 已移动到回收站。如需永久删除请使用 /purge。
[系统备注] 管理员习惯：重要文件<u>从不</u>使用 /purge，以防"日后需要"（此习惯来自校长本人04年泄密事件后）
</code></p>
<p>&nbsp;</p>
<p style="text-align:right;color:#b01020">—— 档案结束 · 解密时间：文件被还原的那一刻</p>
<div class="doc-stamp" style="background:linear-gradient(180deg,#fff0f0,#ffd0d0);color:#a02020">回收站<br>还原印记<br>A03</div>`
  }
};

function openUserFile(key){
  const file = USER_FILES[key];
  if(!file) return;
  document.getElementById('file-viewer-title').textContent = file.title;
  document.getElementById('file-viewer-body').innerHTML = file.html;
  openWindow('file-viewer-window');
}

// ================== 学习管理系统（导员专属） ==================
let lmsCurrentModule = 'dashboard';
function renderLMS(){
  const root = document.getElementById('lms-root');
  if(!root) return;
  root.innerHTML = `
    <div class="lms-container">
      <div class="lms-topbar">
        <div><strong>📚 DCYZ-LMS 学习管理系统 v3.2</strong> · 东川市第一中学</div>
        <div class="lms-user">
          <div class="lms-avatar">张</div>
          <div>张志强 · 高三(2)班班主任助理<br><span style="font-size:10px;opacity:.8;">工号：T20100901 · 最后登录：2018-06-15 08:42</span></div>
        </div>
      </div>
      <div class="lms-body">
        <div class="lms-sidebar">
          <div class="lms-nav-item ${lmsCurrentModule==='dashboard'?'active':''}" onclick="lmsNav('dashboard')"><span class="icon">🏠</span> 工作台</div>
          <div class="lms-nav-item ${lmsCurrentModule==='students'?'active':''}" onclick="lmsNav('students')"><span class="icon">👥</span> 学生学籍</div>
          <div class="lms-nav-item ${lmsCurrentModule==='grades'?'active':''}" onclick="lmsNav('grades')"><span class="icon">📊</span> 成绩管理</div>
          <div class="lms-nav-item ${lmsCurrentModule==='attendance'?'active':''}" onclick="lmsNav('attendance')"><span class="icon">📅</span> 考勤记录</div>
          <div class="lms-nav-item ${lmsCurrentModule==='qx18'?'active':''}" onclick="lmsNav('qx18')"><span class="icon">⭐</span> 启明星名单</div>
          <div class="lms-nav-item ${lmsCurrentModule==='logs'?'active':''}" onclick="lmsNav('logs')"><span class="icon">📜</span> 操作日志</div>
          <div class="lms-nav-item ${lmsCurrentModule==='archive'?'active':''}" onclick="lmsNav('archive')"><span class="icon">🗄️</span> 已归档学生</div>
        </div>
        <div class="lms-content" id="lms-content"></div>
      </div>
    </div>`;
  renderLMSModule();
}
function lmsNav(m){
  lmsCurrentModule = m;
  document.querySelectorAll('.lms-nav-item').forEach(el => el.classList.remove('active'));
  event.target.closest('.lms-nav-item').classList.add('active');
  renderLMSModule();
}
function renderLMSModule(){
  const c = document.getElementById('lms-content');
  if(!c) return;
  if(lmsCurrentModule === 'dashboard'){
    c.innerHTML = `
      <h3>🏠 工作台 · 欢迎回来，张老师</h3>
      <div class="lms-info-card">
        <strong>本日待办：</strong><br>
        · 高三(2)班期末考试座位表审核（截止 6/16）<br>
        · 启明星计划(QX-18)学生名单复核（截止 6/20）<br>
        · <span style="color:#c00;">高三(3)班许妍同学学籍异常处理（紧急）</span>
      </div>
      <div class="lms-info-card warn">
        <strong>⚠ 系统通知：</strong><br>
        2018-06-15 08:30 · 接校长办公室通知：高三(3)班学生许妍（学号 2018060308）已于 6/14 办理转学手续，请协助完成学籍归档。
      </div>
      <h3 style="margin-top:24px;">📊 班级概览</h3>
      <table class="lms-table">
        <tr><th>班级</th><th>人数</th><th>今日考勤</th><th>启明星入选</th><th>备注</th></tr>
        <tr><td>高三(1)班</td><td>48</td><td>到齐</td><td>3</td><td>—</td></tr>
        <tr><td>高三(2)班</td><td>47</td><td>1请假</td><td>2</td><td>—</td></tr>
        <tr class="highlight-row"><td>高三(3)班</td><td>46</td><td>到齐</td><td>2</td><td>含1名已转学</td></tr>
        <tr><td>高三(4)班</td><td>49</td><td>到齐</td><td>1</td><td>—</td></tr>
      </table>`;
  } else if(lmsCurrentModule === 'students'){
    c.innerHTML = `
      <h3>👥 学生学籍管理</h3>
      <div class="lms-filter-bar">
        班级：<select><option>全部</option><option>高三(2)班</option><option>高三(3)班</option></select>
        关键字：<input type="text" placeholder="学号/姓名">
        状态：<select><option>全部</option><option>在读</option><option>已转学</option><option>已删除</option></select>
        <button>查询</button>
      </div>
      <table class="lms-table">
        <tr><th>学号</th><th>姓名</th><th>班级</th><th>状态</th><th>入学日期</th><th>最后更新</th><th>操作</th></tr>
        <tr><td>2018060201</td><td>李雯雯</td><td>高三(2)班</td><td><span class="status-active">在读</span></td><td>2016-09-01</td><td>2018-06-10</td><td>查看</td></tr>
        <tr><td>2018060202</td><td>夏洁</td><td>高三(2)班</td><td><span class="status-active">在读</span></td><td>2016-09-01</td><td>2018-06-10</td><td>查看</td></tr>
        <tr><td>2018060203</td><td>我（玩家）</td><td>高三(2)班</td><td><span class="status-active">在读</span></td><td>2016-09-01</td><td>2018-06-10</td><td>查看</td></tr>
        <tr class="deleted-row"><td>2018060308</td><td>许妍</td><td>高三(3)班</td><td><span class="status-deleted">已删除</span></td><td>2016-09-01</td><td>2018-06-15 08:31</td><td>查看归档</td></tr>
        <tr><td>2018060301</td><td>王梓涵</td><td>高三(3)班</td><td><span class="status-active">在读</span></td><td>2016-09-01</td><td>2018-06-10</td><td>查看</td></tr>
        <tr><td>2018060302</td><td>陈思远</td><td>高三(3)班</td><td><span class="status-active">在读</span></td><td>2016-09-01</td><td>2018-06-10</td><td>查看</td></tr>
      </table>
      <div class="lms-info-card danger">
        <strong>⚠ 异常记录：</strong><br>
        学号 2018060308（许妍）的学籍档案于 <strong>2018-06-15 08:31</strong> 被强制删除，删除者：校长办公室（admin）。<br>
        该操作跳过了正常的转学审批流程，所有关联数据（成绩、考勤、奖惩、启明星入选）一并清除。<br>
        <span style="color:#666;">注：此操作在系统中留下了痕迹，无法彻底抹除。</span>
      </div>`;
  } else if(lmsCurrentModule === 'grades'){
    c.innerHTML = `
      <h3>📊 成绩管理</h3>
      <div class="lms-tabs">
        <div class="lms-tab active">高三(3)班 · 三模成绩</div>
        <div class="lms-tab">高三(2)班 · 三模成绩</div>
      </div>
      <table class="lms-table">
        <tr><th>排名</th><th>学号</th><th>姓名</th><th>语文</th><th>数学</th><th>英语</th><th>理综</th><th>总分</th></tr>
        <tr><td>1</td><td>2018060301</td><td>王梓涵</td><td>128</td><td>142</td><td>135</td><td>278</td><td>683</td></tr>
        <tr class="deleted-row"><td>2</td><td>2018060308</td><td>许妍</td><td>132</td><td>148</td><td>140</td><td>282</td><td>702</td></tr>
        <tr><td>3</td><td>2018060302</td><td>陈思远</td><td>120</td><td>138</td><td>131</td><td>270</td><td>659</td></tr>
        <tr><td>4</td><td>2018060303</td><td>林婉清</td><td>118</td><td>135</td><td>128</td><td>265</td><td>646</td></tr>
        <tr><td>5</td><td>2018060304</td><td>赵子轩</td><td>115</td><td>140</td><td>125</td><td>260</td><td>640</td></tr>
      </table>
      <div class="lms-info-card warn">
        <strong>⚠ 数据异常：</strong><br>
        许妍同学三模成绩 <strong>702分</strong>，位列年级第2，原应保送东川师范大学附属学院。<br>
        该成绩已于 2018-06-15 被从系统中删除，但在备份数据库中仍可查到痕迹。<br>
        删除后，原排名第3的陈思远自动升为第2，但学号 2018060308 的位置仍然空缺。
      </div>
      <div class="lms-info-card">
        <strong>📋 班主任备注：</strong><br>
        许妍同学三模前一周状态异常，常在午休时独自去B楼。三模当天数学最后一道压轴题（关于时间序列的）她用了非常规解法，<strong>解题过程里写了一串数字：18:56 19:03 19:11</strong>，监考老师以为她在草稿，没在意。
      </div>`;
  } else if(lmsCurrentModule === 'attendance'){
    c.innerHTML = `
      <h3>📅 考勤记录 · 2018年6月14日</h3>
      <table class="lms-table">
        <tr><th>学号</th><th>姓名</th><th>班级</th><th>上午</th><th>下午</th><th>晚自习</th><th>备注</th></tr>
        <tr><td>2018060201</td><td>李雯雯</td><td>高三(2)班</td><td>√</td><td>√</td><td>√</td><td>—</td></tr>
        <tr><td>2018060203</td><td>我（玩家）</td><td>高三(2)班</td><td>√</td><td>√</td><td>请假</td><td>外出寻人</td></tr>
        <tr class="highlight-row"><td>2018060308</td><td>许妍</td><td>高三(3)班</td><td>√</td><td>√</td><td>—</td><td><strong>18:41后失联</strong></td></tr>
        <tr><td>2018060301</td><td>王梓涵</td><td>高三(3)班</td><td>√</td><td>√</td><td>√</td><td>—</td></tr>
      </table>
      <div class="lms-info-card danger">
        <strong>⚠ 门禁记录冲突：</strong><br>
        许妍同学于 <strong>18:41</strong> 在B楼一楼门禁刷卡进入（系统记录为 <strong>18:48</strong>，与实际相差7分钟）。<br>
        之后 B-317 实验室门禁记录显示其在 <strong>19:03（实际18:56）</strong>进入实验室。<br>
        <strong>19:11（实际19:04）</strong> 之后，B-317门禁再无该学号的进出记录，但门禁系统未触发"长时间未离开"警报。<br>
        该生晚自习未归，宿舍413群室友19:12发起询问，未获回复。
      </div>
      <div class="lms-info-card">
        <strong>📋 班主任备注：</strong><br>
        当晚 20:13 我接到玩家同学电话询问许妍下落，回复"许妍已请假回家"，但实际上<strong>该生当天并无请假记录</strong>。这是校长办公室口头指示的统一口径，我无权更改。
      </div>`;
  } else if(lmsCurrentModule === 'qx18'){
    c.innerHTML = `
      <h3>⭐ 启明星计划(QX-18)入选学生名单</h3>
      <div class="lms-info-card">
        <strong>项目背景：</strong>由启明教育科技有限公司与我校合作开展的教育神经科学研究项目，代号 QX-18，研究室设于 B 楼 B-317。<br>
        <strong>导师：</strong>秦明辉（启明教育CEO）<br>
        <strong>校内负责人：</strong>陈国栋校长<br>
        <strong>入选标准：</strong>高三学生，综合成绩年级前5%，自愿报名并经家长签字同意。
      </div>
      <table class="lms-table">
        <tr><th>序号</th><th>学号</th><th>姓名</th><th>班级</th><th>入选日期</th><th>实验编号</th><th>状态</th></tr>
        <tr class="deleted-row"><td>1</td><td>2018060308</td><td>许妍</td><td>高三(3)班</td><td>2018-03-25</td><td><strong>QX18-A03</strong></td><td><span class="status-deleted">已退出(异常)</span></td></tr>
        <tr><td>2</td><td>2018060105</td><td>周明轩</td><td>高三(1)班</td><td>2018-03-25</td><td>QX18-A01</td><td><span class="status-active">实验中</span></td></tr>
        <tr><td>3</td><td>2018060112</td><td>李雨欣</td><td>高三(1)班</td><td>2018-03-25</td><td>QX18-A02</td><td><span class="status-active">实验中</span></td></tr>
        <tr><td>4</td><td>2018060218</td><td>陈昊</td><td>高三(2)班</td><td>2018-03-25</td><td>QX18-A04</td><td><span class="status-active">实验中</span></td></tr>
        <tr><td>5</td><td>2018060220</td><td>刘思琪</td><td>高三(2)班</td><td>2018-03-25</td><td>QX18-A05</td><td><span class="status-active">实验中</span></td></tr>
      </table>
      <div class="lms-info-card danger">
        <strong>⚠ 实验异常报告：</strong><br>
        许妍同学（实验编号 QX18-A03）于 2018-06-14 第7次实验后出现<strong>不可逆状态异常</strong>，启明教育导师秦明辉要求暂停该生实验，并<strong>由校长办公室负责对外口径处理</strong>。<br>
        根据秦明辉导师的理论模型，<strong>该异常可能在8年后（2026-06-14）的同日出现"锚定回溯"现象</strong>，届时原被试者记忆或可恢复。
      </div>`;
  } else if(lmsCurrentModule === 'logs'){
    c.innerHTML = `
      <h3>📜 系统操作日志</h3>
      <div class="lms-info-card">
        以下日志记录了与许妍学籍相关的所有系统操作。注意：<strong>部分操作的执行者是校长办公室的admin账户</strong>，远超班主任助理权限。
      </div>
      <div class="lms-log-entry warn">
        <span class="log-time">2018-06-14 21:05</span> · <span class="log-action">[校长指令]</span> 接收来自校长办公室的紧急处理指令：删除高三(3)班许妍的全部学籍、成绩、考勤数据，对外口径统一为"已转学"。
      </div>
      <div class="lms-log-entry danger">
        <span class="log-time">2018-06-14 21:08</span> · <span class="log-action">[admin]</span> <span class="log-target">学号 2018060308（许妍）</span> · 操作：批量删除学籍、成绩、考勤、奖惩记录
      </div>
      <div class="lms-log-entry danger">
        <span class="log-time">2018-06-14 21:09</span> · <span class="log-action">[admin]</span> <span class="log-target">班级合影、毕业照预选</span> · 操作：移除许妍相关影像数据
      </div>
      <div class="lms-log-entry danger">
        <span class="log-time">2018-06-14 21:12</span> · <span class="log-action">[admin]</span> <span class="log-target">宿舍分配系统</span> · 操作：将413宿舍由4人间调整为3人间，许妍床位记录改为"未分配"
      </div>
      <div class="lms-log-entry warn">
        <span class="log-time">2018-06-14 21:15</span> · <span class="log-action">[admin]</span> <span class="log-target">QX-18名单</span> · 操作：将许妍状态改为"已退出(异常)"，但实验数据保留
      </div>
      <div class="lms-log-entry warn">
        <span class="log-time">2018-06-14 21:30</span> · <span class="log-action">[admin]</span> <span class="log-target">校园卡系统</span> · 操作：注销许妍校园卡，消费记录归档
      </div>
      <div class="lms-log-entry">
        <span class="log-time">2018-06-15 08:31</span> · <span class="log-action">[admin]</span> <span class="log-target">学生档案</span> · 操作：归档完成，档案编号 DC-2018-M0614
      </div>
      <div class="lms-log-entry">
        <span class="log-time">2018-06-15 08:42</span> · <span class="log-action">[张志强]</span> 登录系统查看异常通知
      </div>
      <div class="lms-log-entry warn">
        <span class="log-time">2018-06-15 08:45</span> · <span class="log-action">[张志强·私人备注]</span> 校长的电脑我登过两次，他的密码习惯很老套：<span class="log-target">姓氏拼音首字母大写+出生年月日+学校缩写</span>。当年我帮他装办公软件，他让我写的，说"这种密码好记，不会忘"。（我当时记在便签上了以防万一）
      </div>
      <div class="lms-info-card danger" style="margin-top:14px;">
        <strong>⚠ 班主任助理备注（仅自己可见）：</strong><br>
        1. 我知道许妍根本没有转学。她消失在 B-317，这一点校长和秦导师都清楚。<br>
        2. 我手里保留了一份<strong>原始纸质成绩单</strong>（在三模考试卷宗里），上面有许妍的702分。<br>
        3. 我也保留了 B-317 门禁原始日志的<strong>截图</strong>——时间戳确实被改过7分钟。<br>
        4. 如果有一天有人来查这件事，<strong>请去找我办公桌抽屉第二层的那份文件</strong>。密码是 <code style="background:#ffe;padding:2px 6px;">ZhangZQ_2010_DCYZ</code>（我自己电脑的登录密码，应该没人想到）。<br>
        5. <strong>补充关于秦导师：</strong>上次去启明教育开项目会，他的电脑密码我瞟到一眼——他是个很自恋的人，<span style="color:#c00;">用的是自己的姓名缩写+项目代号+出生年份</span>这种格式，1975是他的生年没错吧？反正QX-18那个代号他肯定会加进去。
      </div>`;
  } else if(lmsCurrentModule === 'archive'){
    c.innerHTML = `
      <h3>🗄️ 已归档学生</h3>
      <div class="lms-info-card">
        以下学生的学籍已被归档（删除/转学/退学）。<strong>注意：归档记录不可被普通账户删除，是校长也无法抹除的最后痕迹。</strong>
      </div>
      <table class="lms-table">
        <tr><th>归档编号</th><th>学号</th><th>姓名</th><th>归档原因</th><th>归档日期</th><th>归档人</th><th>档案位置</th></tr>
        <tr class="deleted-row"><td>DC-2018-M0614</td><td>2018060308</td><td>许妍</td><td>转学（实际：实验异常）</td><td>2018-06-15</td><td>admin</td><td><span style="color:#c00;">校长办公室保险柜</span></td></tr>
        <tr><td>DC-2017-S0912</td><td>2016050128</td><td>赵晨阳</td><td>转学</td><td>2017-09-12</td><td>张志强</td><td>教务处档案室 B-12</td></tr>
        <tr><td>DC-2017-T0305</td><td>2016040215</td><td>钱欣怡</td><td>退学</td><td>2017-03-05</td><td>张志强</td><td>教务处档案室 B-15</td></tr>
      </table>
      <div class="lms-info-card warn">
        <strong>🔍 许妍档案的特别说明：</strong><br>
        该生档案归档后，<strong>实物档案（纸质学籍卡、成绩单、合影照片）被校长办公室单独取走，存放于行政楼3楼校长办公室保险柜</strong>，钥匙由校长本人保管。<br>
        系统内的电子档案虽已删除，但<strong>数据库每周日自动备份</strong>，备份文件存于服务器机房，文件名格式：<code style="background:#f0f0ff;padding:2px 6px;">dcyz_backup_YYYYMMDD.sql</code>。<br>
        如需查阅 2018-06-14 之前的完整数据，可尝试寻找 <code style="background:#f0f0ff;padding:2px 6px;">dcyz_backup_20180610.sql</code>。
      </div>`;
  }
}

// ================== 窗口管理 ==================
let zCounter = 100;
function openWindow(id){
  const w = document.getElementById(id);
  w.style.display = 'flex';
  w.style.zIndex = ++zCounter;
  const taskId = 'taskbtn-' + id.split('-')[0];
  const task = document.getElementById(taskId);
  if(task) { task.style.display = 'block'; task.classList.add('active'); }
  if(id === 'browser-window'){
    const content = document.getElementById('browser-content');
    if(!content || !content.innerHTML.trim()){
      renderNewTab();
    }
  }
  if(id === 'diary-window'){
    renderDiary(currentDiaryIdx);
  }
  if(id === 'qq-window'){
    renderQQContacts();
    switchQQContact(currentQQContact);
  }
  if(id === 'lms-window'){
    renderLMS();
  }
  if(id === 'notes-window'){ renderNotes(); }
  if(id === 'b317form-window'){ renderB317Form(); }
  if(id === 'mail-window'){ renderMail(); }
  if(id === 'exam-window'){ renderExam(); }
  if(id === 'schooladmin-window'){ renderSchoolAdmin(); }
  if(id === 'accesscontrol-window'){ renderAccessControl(); }
  if(id === 'qx18console-window'){ renderQX18Console(); }
  if(id === 'dataview-window'){ renderDataView(); }
  if(id === 'im-window'){ renderInternalIM(); }
  if(id === 'thispc-window'){ renderThisPC(); }
  if(id === 'recyclebin-window'){ renderRecycleBin(); }
  if(id === 'clock-window'){
    updateClockFace();
  }
}
function closeWindow(id){
  document.getElementById(id).style.display = 'none';
  const taskId = 'taskbtn-' + id.split('-')[0];
  const task = document.getElementById(taskId);
  if(task) { task.style.display = 'none'; task.classList.remove('active'); }
  // 关闭浏览器时重置为Web导航，下次打开显示首页
  if(id === 'browser-window'){
    const content = document.getElementById('browser-content');
    if(content) content.innerHTML = '';
    const tabs = document.getElementById('browser-tabs');
    if(tabs){
      tabs.innerHTML = `<div class="tab active" data-tab="newtab" onclick="switchTab('newtab')">新标签页 <span class="close-tab" onclick="event.stopPropagation()">×</span></div>`;
    }
    const input = document.getElementById('url-input');
    if(input) input.value = '';
  }
}
function focusWindow(id){
  const w = document.getElementById(id);
  if(w.style.display === 'none') return openWindow(id);
  w.style.zIndex = ++zCounter;
}
function minimizeWindow(id){
  document.getElementById(id).style.display = 'none';
  const taskId = 'taskbtn-' + id.split('-')[0];
  const task = document.getElementById(taskId);
  if(task) task.classList.remove('active');
}
function maximizeWindow(id){
  const w = document.getElementById(id);
  if(w.dataset.maximized === '1'){
    w.style.width = w.dataset.pw; w.style.height = w.dataset.ph;
    w.style.top = w.dataset.pt; w.style.left = w.dataset.pl;
    w.dataset.maximized = '0';
  } else {
    w.dataset.pw = w.style.width; w.dataset.ph = w.style.height;
    w.dataset.pt = w.style.top; w.dataset.pl = w.style.left;
    w.style.width = '100%'; w.style.height = 'calc(100vh - 36px)';
    w.style.top = '0'; w.style.left = '0';
    w.dataset.maximized = '1';
  }
}
// selectIcon 已在事件代理模块中实现并暴露到 window.selectIcon
// 此处保留旧函数签名以兼容，直接转发
let dragTarget = null, dragOffX = 0, dragOffY = 0;
function startDrag(e, id){
  dragTarget = document.getElementById(id);
  if(!dragTarget) return;
  // 兼容鼠标和触屏：统一取坐标
  let cx, cy;
  if(e.touches && e.touches.length){
    cx = e.touches[0].clientX;
    cy = e.touches[0].clientY;
  } else {
    cx = e.clientX; cy = e.clientY;
  }
  const r = dragTarget.getBoundingClientRect();
  dragOffX = cx - r.left;
  dragOffY = cy - r.top;
  dragTarget.style.zIndex = ++zCounter;
  if(e.preventDefault) e.preventDefault();
}
// 鼠标拖拽
document.addEventListener('mousemove', e => {
  if(!dragTarget) return;
  dragTarget.style.left = (e.clientX - dragOffX) + 'px';
  dragTarget.style.top = (e.clientY - dragOffY) + 'px';
});
document.addEventListener('mouseup', () => dragTarget = null);
// 触屏拖拽
document.addEventListener('touchmove', e => {
  if(!dragTarget) return;
  if(!e.touches.length) return;
  const t = e.touches[0];
  dragTarget.style.left = (t.clientX - dragOffX) + 'px';
  dragTarget.style.top = (t.clientY - dragOffY) + 'px';
  e.preventDefault();
}, { passive:false });
document.addEventListener('touchend', () => dragTarget = null);
document.addEventListener('touchcancel', () => dragTarget = null);

// ================== 开始菜单 ==================
function toggleStartMenu(){
  document.getElementById('start-menu').classList.toggle('active');
}
function closeStartMenu(){
  document.getElementById('start-menu').classList.remove('active');
}
document.addEventListener('click', (e) => {
  const sm = document.getElementById('start-menu');
  if(sm && sm.classList.contains('active')){
    if(!e.target.closest('#start-menu') && !e.target.closest('#start-btn')){
      closeStartMenu();
    }
  }
});

// ================== 许妍的日记 ==================
const diaryEntries = [
  {
    date: '2018年3月12日',
    weather: '晴 · 微风',
    tag: '开学第一天',
    content: `新学期开始了。今天转来了一个新同学，坐在我后面。他总是盯着窗外看，很少说话。\n\n班主任说这学期要准备 <strong>启明星计划</strong> 的选拔，据说只有成绩前5%的同学才能参加。我一定要入选。\n\n放学的时候路过B楼，看到工人在搬运一些奇怪的设备。上面贴着 <span class="highlight-red">QX-18</span> 的标签。`,
    illustration: `┌─────────────┐
│  启明星计划  │
│  QX-18      │
│  ▓▓▓░░░    │
│  (保密项目)  │
└─────────────┘`,
    illustrationLabel: '﹏ 我在B楼看到的设备铭牌 ﹏'
  },
  {
    date: '2018年4月7日',
    weather: '多云',
    tag: '实验室的秘密',
    content: `今天我们第一次进入启明星计划的预选名单。老师带我们参观了B-317实验室。\n\n实验室里有三台服务器，墙上贴着 <strong>启明教育科技</strong> 的合作铭牌。老师说这是和企业合作的项目，数据非常重要。\n\n我偷偷记下了服务器的IP地址：<span class="highlight-red">192.168.1.184</span>\n\n还有老师随口提到的——这个项目的代号就是<span class="highlight-red">QX18</span>。`,
    illustration: `    ╔═══════════════════╗
    ║  启明教育科技       ║
    ║  启明星计划 · QX-18 ║
    ║  联合实验室         ║
    ╠═══════════════════╣
    ║  IP: 192.168.1.184 ║
    ║  端口: 8080        ║
    ╚═══════════════════╝`,
    illustrationLabel: '﹏ 实验室铭牌（我画的草图） ﹏'
  },
  {
    date: '2018年5月20日',
    weather: '雨',
    tag: '时间的疑点',
    content: `今天我发现了一件奇怪的事。\n\n我在练习册上随手写了几个时间点：\n18:41 我给朋友发了QQ消息\n18:57 我离开教室\n19:03 门禁记录显示我进入B-317\n\n但是——我清楚地记得，那天我根本没有在19:03进入过B楼。\n\n门禁记录不会错，但我的记忆也不会错。\n\n<span class="highlight-red">有什么东西被篡改了。</span>\n\n${timeCorrected ? '我后来查了更多数据...时间差正好是 <span class="highlight-red">7分钟</span>。有人修改了服务器的系统时间。' : '<span class="hidden">（此处内容被遮盖——需要正确的系统时间才能显示）</span>'}`,
    illustration: `  时间线对比：
  ──────────────────────
  我的记忆    门禁记录
  18:41       18:41  ✓
  18:57       19:03  ✗ ← 差了7分钟?
  ???         19:11  ← 这是我的访问记录?
  ──────────────────────`,
    illustrationLabel: '﹏ 时间线对比（疑点标注） ﹏'
  },
  {
    date: '2018年6月1日',
    weather: '闷热',
    tag: '最后的准备',
    content: `距离高考还有13天。启明星计划的最终名单快公布了。\n\n老师说我和另一个竞争者的表现几乎一样，他们需要做最后一轮评估。\n\n今天在QQ上和朋友聊了很久，她说觉得我最近压力很大。她让我有空一起去B楼后面的小花园走走。\n\n今晚查了启明星计划的官方网站——<span class="highlight-red">www.qx18-project.org</span>。\n\n${timeCorrected ? '有一个隐藏的授权入口，需要输入项目代号。我已经记住了：QX18。' : '<span class="hidden">网站上似乎有隐藏入口...好像需要什么代号...</span>'}`,
    illustration: `    │ 启明星计划 │
    │  授权入口   │
    │ [  ______ ] │
    │  提交       │`,
    illustrationLabel: '﹏ 启明星计划网站的授权界面 ﹏'
  },
  {
    date: '2018年6月14日',
    weather: '雷阵雨',
    tag: '最后一天',
    content: `今天是高考前的最后一天。\n\n下午6点多，我收到了启明教育的一封邮件，说关于我的评估需要最后一次面谈，让我到B-317来。\n\n我有点不安，但还是答应了。\n\n18:41 我给朋友发了QQ："我去B楼一趟，很快回来。"\n\n${timeCorrected ? '然后我进入了B-317。那是我最后一次被监控拍到的时间。之后发生的事——我不记得了。\n\n或者说，我根本没有机会记下来。' : '<span class="hidden">后面的内容...被水浸湿了，看不清。</span>'}'`,
    illustration: `  ╔══════════════╗
  ║  B栋教学楼    ║
  ║  ┌──────┐    ║
  ║  │ 317  │    ║
  ║  │实验室 │    ║
  ║  └──┬───┘    ║
  ║     │↓       ║
  ║  [消失点]    ║
  ╚══════════════╝`,
    illustrationLabel: '﹏ B楼317室（最后出现的地点） ﹏'
  },
  {
    date: '???',
    weather: '???',
    tag: '最后一页',
    content: `如果你还能看到这个——\n\n请重新数一遍。\n\n时间不对，数据不对，记忆不对。\n\n但有一件事是确定的：\n\n<span class="highlight-red">人会忘。东西不会。</span>\n\n去检查所有你能找到的东西。\nQQ记录、服务器日志、门禁数据、企业内部报告。\n\n真相藏在数据的缝隙里。\n\n——许妍`,
    illustration: `    *  *  *  *  *
    
      真相
    
    *  *  *  *  *`,
    illustrationLabel: ''
  }
];

let currentDiaryIdx = 0;
function renderDiary(idx){
  if(idx < 0) idx = 0;
  if(idx >= diaryEntries.length) idx = diaryEntries.length - 1;
  currentDiaryIdx = idx;
  const entry = diaryEntries[idx];
  const container = document.getElementById('diary-container');
  container.innerHTML = `
    <div class="diary-entry">
      <div class="diary-date">${entry.date}</div>
      <div class="diary-weather">${entry.weather}</div>
      ${entry.tag ? `<div class="diary-entry-tag">${entry.tag}</div>` : ''}
      <div class="diary-content">${entry.content}</div>
      ${entry.illustration ? `
        <div style="margin-top:24px;">
          <div class="diary-illustration-label">${entry.illustrationLabel || ''}</div>
          <div class="diary-illustration">${entry.illustration}</div>
        </div>
      ` : ''}
      <div class="diary-nav">
        <button onclick="renderDiary(${idx-1})" ${idx===0?'disabled':''}>上一篇</button>
        <button onclick="renderDiary(${idx+1})" ${idx===diaryEntries.length-1?'disabled':''}>下一篇</button>
      </div>
    </div>
  `;
}

// ================== QQ聊天记录（按账户分视角） ==================
// ===== 视角1：我（高三学生）=====
const qqContacts_ME = [
  {
    id: 'me-xuyan',
    name: '我 ↔ 许妍',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '妍',
    chats: [
      { time: '2018-06-14 18:41', divider: true, text: '今天' },
      { me: false, text: '你在吗？' },
      { me: true, text: '在的，怎么了？' },
      { me: false, text: '我去B楼一趟。很快回来。' },
      { me: true, text: '好的，注意安全，雷雨要来了。' },
      { me: false, text: '嗯，一会儿见。' },
      { me: true, text: '......' },
      { me: true, text: '许妍？你到了吗？' },
      { me: true, text: '许妍？？' },
      { time: '2018-06-14 19:07', divider: true, text: '19:07' },
      { me: true, text: '你手机关机了？' },
      { me: true, text: '我在去B楼的路上了' },
      { me: true, text: '老师说你根本没进过B楼' },
      { me: true, text: '但门禁记录显示你19:03进去了啊...' },
      { time: '2018-06-14 20:13', divider: true, text: '20:13' },
      { me: true, text: '我找不到你' },
      { me: true, text: '大家都说没见过你' },
      { me: true, text: '这到底怎么回事...' },
    ]
  },
  {
    id: 'xuyan-class',
    name: '班级群 (东川一中2018级)',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '群',
    chats: [
      { time: '2018-06-14 18:50', divider: true, text: '班级群' },
      { me: false, text: '老师：今天最后一天了，大家好好休息' },
      { me: false, text: '学生A：许妍去哪了？好像一下午都没见' },
      { me: false, text: '学生B：不知道，可能请假了吧' },
      { me: false, text: '学生C：她不是进启明星计划了吗？可能在实验室' },
      { me: false, text: '学生A：我刚从B楼回来，没看到她' },
      { me: false, text: '老师：许妍同学请假回家了，不用担心' },
      { me: true, text: '请假？她没跟我说过啊' },
      { me: false, text: '老师：你是？哦，她的朋友是吧，她妈妈来接她了' },
      { time: '2018-06-14 19:30', divider: true, text: '19:30' },
      { me: true, text: '（我当时觉得很奇怪，现在回想起来...）' },
    ]
  },
  {
    id: 'me-xuyan-may',
    name: '我 ↔ 许妍 (5月)',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '妍',
    chats: [
      { time: '2018-05-20 22:10', divider: true, text: '5月20日 晚上' },
      { me: false, text: '我发现了一件奇怪的事' },
      { me: true, text: '什么事？' },
      { me: false, text: '你那天的门禁记录...时间好像不对' },
      { me: true, text: '什么意思？' },
      { me: false, text: '我进B-317的时间是18:57，但门禁上写的是19:03' },
      { me: true, text: '差了6分钟？' },
      { me: false, text: '<strong>差了7分钟</strong>。而且只有B-317的记录有问题，其他门都是准的' },
      { me: true, text: '服务器时间被改了？' },
      { me: false, text: '可能。我查过服务器日志...有人在18:58动过系统时间' },
      { me: true, text: '谁干的？' },
      { me: false, text: '<strong>日志里没有记录。但我知道谁有这个权限。</strong>' },
    ]
  },
  {
    id: 'me-teacher-zhang',
    name: '我 ↔ 张导员（班主任助理）',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '导',
    chats: [
      { time: '2018-06-14 19:45', divider: true, text: '6月14日 傍晚' },
      { me: true, text: '张导员在吗？请问许妍今天来学校了吗？' },
      { me: false, text: '同学你好。许妍同学今天上午请假了，说是家里有事，下午没有来学校。' },
      { me: true, text: '可是她18:41还跟我说她在学校，去B楼了' },
      { me: false, text: 'B楼？你确定？B楼下午5点就锁门了，现在都快8点了，哪有人。' },
      { me: true, text: '她今天没请假吧？上午我还看到她去食堂了' },
      { me: false, text: '同学，我这边系统显示她确实请假了。你是不是记错了？' },
      { me: true, text: '我有聊天记录！' },
      { me: false, text: '......' },
      { me: false, text: '同学，我知道你和许妍关系好。<strong>但有些事，忘了对你更好。</strong>' },
      { me: false, text: '她已经转学了，接受现实吧。' },
      { me: true, text: '等等，你刚才还说请假回家了，现在又说转学？' },
      { me: false, text: '（对方停止了回复）' },
      { time: '2018-06-15 08:10', divider: true, text: '第二天 早上' },
      { me: false, text: '张导员：同学，昨天的事我都忘了我们聊过什么。快期末考试了，专心复习吧。' },
      { time: '2018-06-02 15:06', divider: true, text: '6月2日 两周前（偶然的一次）' },
      { me: true, text: '张导员，请问三模的成绩单要去哪里领？' },
      { me: false, text: '去行政楼305校长办公室外面的打印室。' },
      { me: false, text: '对了，要是校长办公室的门没关让你进去等他，千万<strong>别盯着他屏幕看</strong>。上次我帮他装软件，他输密码的时候没遮屏幕，<strong>是他自己的生日加学校缩写那种，老派干部风格</strong>，看到了也当没看到哈。' },
      { me: true, text: '哈哈好的，我记住了。' },
      { me: false, text: '还有上次启明星项目会，<strong>秦导师输密码的时候嘴里念叨了一遍自己的名字</strong>，说他的密码是"QmHui加QX18加出生年1975"，<strong>生怕自己忘了</strong>，我当时在他身后也听到了。这两个人真是，密码一个比一个好猜。' },
      { me: true, text: '哈哈哈，原来导师也这么自恋啊。' },
      { me: false, text: '（第二天我发现这段记录差点被系统自动删除了，赶紧手动设为加密。<strong>不知道为什么要删</strong>......）' },
    ]
  },
  {
    id: 'me-xiaoxia',
    name: '我 ↔ 小夏（我的同桌/闺蜜）',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '夏',
    chats: [
      { time: '2018-06-14 20:32', divider: true, text: '6月14日 晚上' },
      { me: true, text: '小夏，你还记得许妍吗？' },
      { me: false, text: '...' },
      { me: false, text: '你怎么突然问她？你不是说你不认识这个人吗？' },
      { me: true, text: '我什么时候说过？！她是我们的好朋友啊！' },
      { me: false, text: '等等...你也想起来了？' },
      { me: true, text: '什么叫"也"？你也记得？' },
      { me: false, text: '我...我不确定。我昨天跟我妈提起许妍，她说"你什么时候有过姓许的朋友？"，我还以为我疯了' },
      { me: true, text: '我也是！我妈说我从来都是一个人上学的' },
      { me: false, text: '她...她真的存在过对吧？我还记得高三上学期，她坐我们前面那排，扎马尾，喜欢戴蓝色发带。' },
      { me: true, text: '对！她还借过你一套数学笔记没还！' },
      { me: false, text: '那我们不是疯了...那她去哪里了？' },
      { me: true, text: '我不知道。但B-317好像跟她有关。' },
      { me: false, text: '别查了行吗？我怕... <strong>怕我们也像她一样被人忘掉。</strong>' },
      { me: true, text: '......' },
      { time: '2018-06-15 09:00', divider: true, text: '6月15日 上午' },
      { me: false, text: '我...我昨天晚上好像跟你聊了很多奇怪的话，你别当真，我做噩梦了。' },
      { me: true, text: '小夏？你忘了昨晚？' },
      { me: false, text: '昨晚我很早就睡了啊，你没什么事吧？' },
      { me: true, text: '（我意识到：有些人的记忆已经被彻底改写了...）' },
    ]
  },
  {
    id: 'dorm-group',
    name: '413宿舍群',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '舍',
    chats: [
      { time: '2018-06-14 18:30', divider: true, text: '6月14日 下午放学' },
      { me: false, text: '阿雯：谁看到许妍了？她今天值日啊，人呢？' },
      { me: false, text: '小洁：她最后一节课还在啊，中间好像被老师叫出去了' },
      { me: false, text: '许妍：我在B楼开会，晚点儿回去，值日帮我留一下🙏' },
      { me: false, text: '阿雯：行，你几点回？食堂最后一份红烧肉我给你留着？' },
      { me: false, text: '许妍：19:00之前应该可以吧...今天可能有点悬' },
      { me: false, text: '小洁：悬啥呀？' },
      { me: false, text: '许妍：（没回复）' },
      { time: '2018-06-14 19:12', divider: true, text: '19:12' },
      { me: false, text: '阿雯：@许妍 你还回不回啊，肉都凉了' },
      { me: false, text: '小洁：你跟她联系了吗？她QQ刚才显示在线，突然就离线了' },
      { me: true, text: '我也联系不上她...她说去B楼，B楼现在锁着啊' },
      { me: false, text: '阿雯：等等，许妍是谁啊？' },
      { me: true, text: '？？？你室友啊！' },
      { me: false, text: '阿雯：我们宿舍不是三个人吗？我、小洁、你，没别人了' },
      { me: false, text: '小洁：对呀，雯雯你在说什么啊，我们一直都是三人间' },
      { me: true, text: '她下铺还空着！她的粉色枕头还在那儿！' },
      { me: false, text: '阿雯：那个不是你的枕头吗？你上周说多买了一个放着的' },
      { me: true, text: '（我看了一眼枕头，<strong>真的变成了我买的款式...</strong>）' },
      { me: false, text: '小洁：你是不是复习太紧张了？明天就最后一天课了，别给自己太大压力' },
      { me: true, text: '（...整个宿舍群里，只剩下我一个人还记得她住过413）' },
    ]
  }
];

// ===== 视角2：许妍（高三学生/启明星计划被试A03）=====
const qqContacts_XUYAN = [
  {
    id: 'xy-me',
    name: '许妍 ↔ 我（同桌）',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '我',
    chats: [
      { time: '2018-06-14 18:38', divider: true, text: '6月14日 出发前' },
      { me: false, text: '我一会儿要去B楼，你晚饭先吃？' },
      { me: true, text: '什么事啊这么急？马上要下雨了' },
      { me: false, text: '秦明辉让我去取上次实验的数据表' },
      { me: true, text: '他不是说今天不做实验吗？' },
      { me: false, text: '谁知道呢，说是陈校长也过来了' },
      { me: true, text: '你小心点，B楼那个地方总觉得阴森森的' },
      { me: false, text: '放心，20分钟我就回来' },
      { me: false, text: '对了，万一我失联了——' },
      { me: true, text: '说什么鬼话！' },
      { me: false, text: '哈哈哈，没什么。<strong>你要记得我啊。</strong>' },
      { me: true, text: '你今天说话怪怪的' },
      { me: false, text: '没事，一会儿见。' },
      { time: '2018-06-14 18:59', divider: true, text: '18:59（发送失败）' },
      { me: false, text: '【消息未送达。对方已离线】' },
    ]
  },
  {
    id: 'xy-xiaoxia',
    name: '许妍 ↔ 小夏',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '夏',
    chats: [
      { time: '2018-06-10 12:00', divider: true, text: '6月10日 午饭' },
      { me: false, text: '小夏，你最近有没有觉得...早上起来像丢了一些记忆？' },
      { me: true, text: '你压力太大了吧？三模考完就好了' },
      { me: false, text: '我前天晚上写的日记，第二天翻开空白了一页' },
      { me: true, text: '不是你自己撕了？' },
      { me: false, text: '我才不会撕。而且我昨天问过我妈，她说我从来没有姐姐' },
      { me: true, text: '你不是独生子女吗？' },
      { me: false, text: '我明明有一个姐姐啊...三岁的时候生病去世的，我跟你说过的' },
      { me: true, text: '......我不记得了。你会不会记错了？' },
      { me: false, text: '（...看来我不是第一个。）' },
    ]
  },
  {
    id: 'xy-teacher',
    name: '许妍 ↔ 张志强（导员）',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '导',
    chats: [
      { time: '2018-06-13 17:20', divider: true, text: '6月13日 下午' },
      { me: false, text: '张老师，明天下午的实验我想请假不去' },
      { me: true, text: '不行，秦导师说这次很重要' },
      { me: false, text: '可是我最近每次做完实验头都很痛' },
      { me: true, text: '许妍同学，项目马上要收尾了，你再坚持一下' },
      { me: false, text: '我上次说想退出启明星，陈校长说让我自己考虑后果...那是什么意思？' },
      { me: true, text: '我也不清楚。<strong>但既然进来了，就好好配合，对你对大家都好。</strong>' },
      { time: '2018-06-14 18:02', divider: true, text: '6月14日 今天' },
      { me: true, text: '许妍，秦导师让你18:50到B-317' },
      { me: false, text: '知道了。' },
    ]
  },
  {
    id: 'xy-qing',
    name: '许妍 ↔ 秦明辉（导师）',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '秦',
    chats: [
      { time: '2018-04-18 09:12', divider: true, text: '4月 招募时' },
      { me: true, text: '许妍同学，你的大脑活跃度测试结果很优秀，想不想加入我们启明星项目？' },
      { me: false, text: '秦老师，这个项目是做什么的？' },
      { me: true, text: '我们在研究<strong>人类记忆的可编辑性</strong>，可以帮助你消除不愉快的记忆，比如高考压力。' },
      { me: false, text: '我的记忆没什么需要消除的' },
      { me: true, text: '别急着拒绝。我们会给高考加15分的综合评价推荐。考虑一下？' },
      { time: '2018-06-14 18:45', divider: true, text: '今天 18:45' },
      { me: true, text: '到了没有？在B-317门口等你，陈校长已到。' },
      { me: false, text: '在路上。秦老师，今天结束之后我可以退出项目吗？' },
      { me: true, text: '先到了再说。' },
    ]
  },
  {
    id: 'xy-413',
    name: '413宿舍群（许妍视角）',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '舍',
    chats: [
      { time: '2018-06-14 18:31', divider: true, text: '下午放学' },
      { me: false, text: '我在B楼开会，晚点儿回去，值日帮我留一下🙏' },
      { me: false, text: '19:00之前应该可以吧...今天可能有点悬' },
      { me: true, text: '小洁：悬啥呀？' },
      { me: false, text: '（没回复）' },
      { time: '2018-06-14 19:12', divider: true, text: '19:12（最后一条已发送但无人收到）' },
      { me: false, text: '我好像出不去了，有人吗？' },
    ]
  },
  {
    id: 'xy-class',
    name: '班级群（许妍视角）',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '群',
    chats: [
      { time: '2018-06-14 18:50', divider: true, text: '班级群' },
      { me: false, text: '学生A：许妍去哪了？好像一下午都没见' },
      { me: false, text: '学生B：不知道，可能请假了吧' },
      { me: false, text: '学生C：她不是进启明星计划了吗？可能在实验室' },
      { me: false, text: '老师：许妍同学请假回家了，不用担心' },
      { me: true, text: '（我就站在班级群门口的走廊，却已经被"请假回家"了）' },
    ]
  }
];

// ===== 视角3：张志强（导员 / 高三2班 班主任助理）=====
const qqContacts_TEACHER = [
  {
    id: 'tch-principal',
    name: '张志强 ↔ 陈国栋（校长）',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '陈',
    chats: [
      { time: '2018-06-14 19:05', divider: true, text: '6月14日 今晚' },
      { me: true, text: '校长，许妍已经进B-317了' },
      { me: false, text: '好。所有接触过她的人，明天上班前处理完。' },
      { me: true, text: '她那个同桌，今天在找她，要不要...' },
      { me: false, text: '一起处理。<strong>留着那个女孩是隐患，她记忆力太好了。</strong>' },
      { me: true, text: '明白了。那家长那边？' },
      { me: false, text: '家长明天会接到"转学"通知。秦明辉那边费用已经打过去了，这次封口没问题。' },
      { me: true, text: '校长，我心里有点难受...她才17岁' },
      { me: false, text: '小张，你当年也是我招进来的。<strong>你想想自己的记忆是谁修的？</strong>' },
      { me: true, text: '......我知道了。' },
    ]
  },
  {
    id: 'tch-qing',
    name: '张志强 ↔ 秦明辉（启明教育 导师）',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '秦',
    chats: [
      { time: '2018-06-14 18:10', divider: true, text: '6月14日 傍晚' },
      { me: false, text: '张老师，A03（许妍）今天一定要来。最后一轮收尾。' },
      { me: true, text: '秦总，她最近情绪很不稳定，昨天说想退出' },
      { me: false, text: '别让她退。<strong>QX18的闭环必须完整，否则前面5个人的数据都会失效。</strong>' },
      { me: true, text: '如果她真的反抗呢？' },
      { me: false, text: '陈校长会安排。你只要负责把她带到门口。' },
      { me: true, text: '好。但是她今天没来上课，我让她下午6:50去B-317' },
      { me: false, text: '提前到18:50，陈校长也要来观察。' },
    ]
  },
  {
    id: 'tch-workgroup',
    name: '高三班主任工作群',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '师',
    chats: [
      { time: '2018-06-14 19:20', divider: true, text: '今晚' },
      { me: false, text: '教务王主任：各位班主任注意，明天早自习前统一更新班级名单。<strong>高三2班请移除许妍。</strong>' },
      { me: false, text: '李老师（3班）：又是转学？这个月第三个了' },
      { me: false, text: '教务王主任：不该问的别问，李老师。' },
      { me: true, text: '张志强（2班）：收到，马上处理。' },
      { me: false, text: '王老师（5班）：张老师，你们班那个A03？我听说她今天在B楼见过她...' },
      { me: false, text: '教务王主任：王老师注意言论。<strong>大家都忙，早点下班。</strong>' },
    ]
  },
  {
    id: 'tch-parent',
    name: '高三2班家长群',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '长',
    chats: [
      { time: '2018-06-15 07:30', divider: true, text: '6月15日 早上（将发送）' },
      { me: true, text: '各位家长早上好。【通知】原就读本班的许妍同学因个人家庭原因，已办理转学手续，后续不再参与班级活动。高考报名资格已在系统中注销，请家长们安心备考，不要过度讨论。' },
      { me: false, text: '（群内回复：收到/好的 等统一模板）' },
    ]
  },
  {
    id: 'tch-student-xy',
    name: '张志强 ↔ 许妍',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '妍',
    chats: [
      { time: '2018-06-14 18:02', divider: true, text: '6月14日' },
      { me: true, text: '许妍，秦导师让你18:50到B-317' },
      { me: false, text: '知道了。' },
      { me: true, text: '记得带好学生证，门口要刷。' },
      { me: false, text: '好。张老师，我可以问你一个问题吗？' },
      { me: true, text: '问。' },
      { me: false, text: '上学期隔壁班的林晓，你还记得吗？' },
      { me: true, text: '......哪个班的？不记得了。' },
      { me: false, text: '（没回复）' },
    ]
  },
  {
    id: 'tch-me',
    name: '张志强 ↔ 许妍同桌（我）',
    avatarClass: 'qq-avatar-xuyan',
    avatarText: '我',
    chats: [
      { time: '2018-06-14 19:45', divider: true, text: '6月14日 傍晚' },
      { me: false, text: '张导员在吗？请问许妍今天来学校了吗？' },
      { me: true, text: '同学你好。许妍同学今天上午请假了，说是家里有事，下午没有来学校。' },
      { me: false, text: '可是她18:41还跟我说她在学校，去B楼了' },
      { me: true, text: 'B楼？你确定？B楼下午5点就锁门了' },
      { me: false, text: '我有聊天记录！' },
      { me: true, text: '......' },
      { me: true, text: '<strong>有些事，忘了对你更好。她已经转学了。</strong>' },
      { time: '2018-06-15 08:10', divider: true, text: '第二天 早上（我已做过记忆微调）' },
      { me: true, text: '同学，昨天的事我都忘了我们聊过什么。快期末考试了，专心复习吧。' },
    ]
  }
];

function getQQContactsByUser(user){
  if(user === 'xuyan') return qqContacts_XUYAN;
  if(user === 'teacher') return qqContacts_TEACHER;
  if(user === 'principal' || user === 'mentor') return [];
  return qqContacts_ME; // me / 默认
}

let currentQQContact = 0;
let lastQQUser = 'me';

function renderQQContacts(){
  const list = document.getElementById('qq-contact-list');
  const title = document.getElementById('qq-chat-title');
  const area = document.getElementById('qq-chat-area');
  if(!list || !title || !area) return;

  const contacts = getQQContactsByUser(currentUser);

  if(!contacts || contacts.length === 0){
    list.innerHTML = '';
    title.textContent = '提示';
    area.innerHTML = `
      <div style="padding:40px 20px;color:#666;text-align:center;line-height:1.8">
        <div style="font-size:48px;margin-bottom:18px">💻</div>
        <div style="font-size:15px">该账户为工作专用账户，<br/>未安装QQ个人通讯软件。</div>
        <div style="font-size:12px;margin-top:14px;color:#999">如需使用通讯工具，请使用系统内置的<strong>邮箱</strong>或<strong>校务系统</strong>。</div>
      </div>`;
    return;
  }

  if(lastQQUser !== currentUser){
    currentQQContact = 0;
    lastQQUser = currentUser;
  }
  if(currentQQContact >= contacts.length) currentQQContact = 0;

  list.innerHTML = contacts.map((c, i) => `
    <div class="qq-contact ${i===currentQQContact?'active':''}" onclick="switchQQContact(${i})">
      <div class="qq-avatar ${c.avatarClass}">${c.avatarText}</div>
      <div class="qq-contact-info">
        <div class="qq-contact-name">${c.name}</div>
        <div class="qq-contact-msg">${c.chats[c.chats.length-1].text.replace(/<[^>]+>/g,'').substring(0,30)}</div>
      </div>
    </div>
  `).join('');

  const c = contacts[currentQQContact];
  if(c){
    title.textContent = '与 ' + c.name + ' 的对话';
    area.innerHTML = c.chats.map(m => {
      if(m.divider) return `<div class="qq-day-divider">—— ${m.text} ——</div>`;
      const cls = m.me ? 'me' : 'other';
      const avatarHtml = `<div class="qq-msg-avatar ${m.me?'qq-avatar-me':c.avatarClass}">${m.me?'我':c.avatarText}</div>`;
      const timeHtml = m.time ? `<div class="qq-msg-time">${m.time}</div>` : '';
      return `${timeHtml}<div class="qq-msg ${cls}">${avatarHtml}<div class="qq-msg-bubble">${m.text}</div></div>`;
    }).join('');
    area.scrollTop = area.scrollHeight;
  }
}

function switchQQContact(idx){
  const contacts = getQQContactsByUser(currentUser);
  if(!contacts || contacts.length === 0) return;
  if(idx >= contacts.length) idx = 0;
  currentQQContact = idx;
  renderQQContacts();
}

// ================== 练习册翻页 (已废弃，保留兼容) ==================
let nbPage = 1;
function notebookTurn(d){
  nbPage = Math.max(1, Math.min(6, nbPage + d));
}

// ================== 浏览器模拟 ==================
const SITES = {
  'www.dcyz-edu.cn': renderSchoolSite,
  'intranet.dcyz-edu.cn': renderIntranetSite,
  'www.qx18-project.org': renderQX18Site,
  'www.qiming-edu.com': renderEnterpriseSite,
  'search.web': renderSearch
};

const tabs = [{id:'newtab', url:'', history:['about:newtab'], historyIdx:0}];
let activeTabId = 'newtab';

function switchTab(id){
  activeTabId = id;
  document.querySelectorAll('#browser-tabs .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === id);
  });
  const tab = tabs.find(t => t.id === id);
  document.getElementById('url-input').value = tab.url;
  renderUrl(tab.url, false);
}

function newTab(url){
  const id = 'tab' + Date.now();
  tabs.push({id, url, history: [url || 'about:newtab'], historyIdx: 0});
  activeTabId = id;
  const tabBar = document.getElementById('browser-tabs');
  const div = document.createElement('div');
  div.className = 'tab active';
  div.dataset.tab = id;
  div.innerHTML = (url || '新标签页') + ' <span class="close-tab">×</span>';
  div.onclick = () => switchTab(id);
  div.querySelector('.close-tab').onclick = (e) => {
    e.stopPropagation();
    const idx = tabs.findIndex(t => t.id === id);
    tabs.splice(idx,1);
    div.remove();
    if(tabs.length === 0){
      tabs.push({id:'newtab', url:'', history:['about:newtab'], historyIdx:0});
    }
    switchTab(tabs[0].id);
  };
  tabBar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tabBar.appendChild(div);
  if(url) renderUrl(url, false);
}

function currentTab(){ return tabs.find(t => t.id === activeTabId); }

function browserGo(){
  let raw = document.getElementById('url-input').value.trim();
  if(!raw) raw = 'about:newtab';
  let url = raw;
  if(!url.includes('://') && url !== 'about:newtab'){
    url = 'http://' + url;
  }
  const tab = currentTab();
  tab.url = url;
  tab.history = tab.history.slice(0, tab.historyIdx + 1);
  tab.history.push(url);
  tab.historyIdx = tab.history.length - 1;
  const nodes = document.querySelector(`#browser-tabs .tab[data-tab="${activeTabId}"]`).childNodes;
  nodes[0].nodeValue = (raw === 'about:newtab' ? '新标签页 ' : (raw + ' '));
  renderUrl(url, true);
}
function browserBack(){
  const tab = currentTab();
  if(tab.historyIdx <= 0) return;
  tab.historyIdx--;
  const url = tab.history[tab.historyIdx];
  tab.url = url;
  document.getElementById('url-input').value = url.replace(/^http:\/\//,'');
  renderUrl(url, false);
}
function browserForward(){
  const tab = currentTab();
  if(tab.historyIdx >= tab.history.length - 1) return;
  tab.historyIdx++;
  const url = tab.history[tab.historyIdx];
  tab.url = url;
  document.getElementById('url-input').value = url.replace(/^http:\/\//,'');
  renderUrl(url, false);
}
function browserRefresh(){
  renderUrl(currentTab().url, false);
}

function openLink(url){
  newTab(url);
}

async function renderUrl(raw, updateTitle){
  const content = document.getElementById('browser-content');
  let url = raw;
  if(!url || url === 'about:newtab'){
    renderNewTab();
    return;
  }
  url = url.replace(/^https?:\/\//, '');
  const slashIdx = url.indexOf('/');
  const host = slashIdx === -1 ? url : url.substr(0, slashIdx);
  const path = slashIdx === -1 ? '/' : url.substr(slashIdx);

  document.getElementById('url-input').value = (raw.startsWith('http') ? raw.replace(/^https?:\/\//,'') : raw);
  document.getElementById('url-proto').textContent = 'http://';

  const renderer = SITES[host];
  if(!renderer){
    content.innerHTML = `
      <div class="site-404">
        <h2>404</h2>
        <p style="font-size:16px; margin-bottom:16px;">找不到该网站: <b>${host}</b></p>
        <p style="font-size:13px;">请检查网址是否正确，或使用搜索功能。</p>
        <div style="margin-top:30px;">
          <input type="text" placeholder="搜索关键字..." id="web-search-input" style="padding:8px 12px; width:360px; border:1px solid #aaa; border-radius:3px;">
          <button class="btn" onclick="doSearch()">搜索</button>
        </div>
      </div>`;
  } else {
    renderer(path, content);
  }
  if(updateTitle){
    const nodes = document.querySelector(`#browser-tabs .tab[data-tab="${activeTabId}"]`).childNodes;
    nodes[0].nodeValue = host + ' ';
  }
}

// ================== 新标签页 ==================
function renderNewTab(){
  document.getElementById('browser-content').innerHTML = `
    <div style="padding:60px 40px; text-align:center;">
      <div style="font-size:36px; color:#2c5aa0; margin-bottom:30px; letter-spacing:8px;">Web 导航</div>
      <div style="margin-bottom:30px;">
        <input type="text" placeholder="输入网址或搜索..." id="nt-search" style="width:520px; padding:10px 16px; border:1px solid #bbb; border-radius:22px; font-size:14px;" onkeydown="if(event.key==='Enter'){ document.getElementById('url-input').value=this.value; browserGo(); }">
        <button class="btn" style="margin-left:8px; padding:10px 20px; border-radius:22px;" onclick="document.getElementById('url-input').value=document.getElementById('nt-search').value; browserGo();">访问</button>
      </div>
      <div style="max-width:640px; margin:0 auto; text-align:left;">
        <h4 style="color:#555; margin-bottom:16px; font-weight:normal;">快速访问</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="enterprise-card" style="cursor:pointer;" onclick="openLink('www.dcyz-edu.cn')">
            <h4>🏫 东川市第一中学 官网</h4>
            <p>www.dcyz-edu.cn<br>母校官方网站</p>
          </div>
          <div class="enterprise-card" style="cursor:pointer;" onclick="openLink('intranet.dcyz-edu.cn')">
            <h4>🔐 东川一中 校园内网</h4>
            <p>intranet.dcyz-edu.cn<br>需要账号登录</p>
          </div>
          <div class="enterprise-card" style="cursor:pointer;" onclick="openLink('www.qx18-project.org')">
            <h4>⭐ 启明星计划 官方网站</h4>
            <p>www.qx18-project.org<br>教育研究项目</p>
          </div>
          <div class="enterprise-card" style="cursor:pointer;" onclick="openLink('www.qiming-edu.com')">
            <h4>🏢 启明教育科技</h4>
            <p>www.qiming-edu.com<br>校企合作单位</p>
          </div>
        </div>
        <div style="margin-top:30px;">
          <h4 style="color:#555; margin-bottom:16px; font-weight:normal;">📝 今日笔记</h4>
          <div style="font-size:13px; color:#666; line-height:2; padding:14px; background:#fafafa; border-left:3px solid #e0a030;">
            · 那本练习册上的时间戳，是2018年6月14日晚上的记录。<br>
            · 学校官网的新闻缓存应该能找到关于B-317和启明星计划的线索。<br>
            · 进入内网需要正确的账号密码，用户名可能是许妍的名字拼音，密码要把日期和房间号拼起来。<br>
            · 不同系统的时钟可能存在偏差——七分钟？
          </div>
        </div>
      </div>
    </div>`;
}

// ================== 搜索 ==================
function renderSearch(path, root){
  const q = (new URLSearchParams(path.split('?')[1] || '')).get('q') || '';
  root.innerHTML = `
    <div class="site-container">
      <div style="background:#f0f4f8; padding:18px 30px; border-bottom:1px solid #ddd;">
        <input type="text" value="${q}" style="width:480px; padding:8px 14px; border:1px solid #bbb; border-radius:3px;" placeholder="搜索..." id="search-q">
        <button class="btn" onclick="openLink('search.web?q='+encodeURIComponent(document.getElementById('search-q').value))">搜索</button>
      </div>
      <div class="site-main">
        <div style="color:#888; font-size:13px; margin-bottom:16px;">搜索 "<b style="color:#333;">${q||''}</b>" 的结果...</div>
        <div id="search-results"></div>
      </div>
    </div>`;
  doSearchQuery(q, document.getElementById('search-results'));
}
function doSearch(){
  const v = document.getElementById('web-search-input')?.value || document.getElementById('nt-search')?.value || '';
  if(v) openLink('search.web?q=' + encodeURIComponent(v));
}
function doSearchQuery(q, root){
  if(!q){ root.innerHTML = '<p style="color:#888;">请输入关键词搜索</p>'; return; }
  const corpus = [
    { title: '东川市第一中学 官网', url: 'www.dcyz-edu.cn', desc: '东川市重点中学，百年老校，提供校园新闻、通知公告、招生信息等。' },
    { title: '启明星教育研究计划', url: 'www.qx18-project.org', desc: '面向青少年智能教育的探索性研究计划，由多家单位联合发起。' },
    { title: '启明教育科技有限公司', url: 'www.qiming-edu.com', desc: '专注于教育科技产品研发与服务，与多所高校建立合作。' },
    { title: '东川一中 - 校园内网门户', url: 'intranet.dcyz-edu.cn', desc: '校内师生使用，包含门禁、档案、教学等系统。需授权账号访问。' },
    { title: '【缓存】东川一中2017年建筑平面图(已归档)', url: 'www.dcyz-edu.cn/archive?year=2017', desc: '注意：此内容来自搜索引擎2017年缓存，原网页已删除。包含B楼三层详细房间信息...' },
    { title: '【缓存】2018校企合作 智能教育新模式报道', url: 'www.dcyz-edu.cn/news/20180320', desc: '报道日期2018年3月20日，东川一中与启明教育科技举行校企合作签约仪式...' },
    { title: '关于"学生综合研究室B-317"的变更公告[缓存]', url: 'www.dcyz-edu.cn/archive?b317', desc: '原B楼三层学生综合研究室（编号B-317）因教学结构调整，自2018年7月起合并至其他场地...' }
  ];
  const matched = corpus.filter(r => (r.title + r.desc + r.url).toLowerCase().includes(q.toLowerCase()));
  if(matched.length === 0){
    root.innerHTML = '<p style="color:#888;">没有找到相关结果，尝试其他关键词？</p>';
    return;
  }
  root.innerHTML = matched.map(r => `
    <div style="padding:14px 4px; border-bottom:1px dashed #ddd;">
      <div><a style="color:#2244aa; font-size:15px; cursor:pointer; text-decoration:underline;" onclick="openLink('${r.url}')">${r.title}</a></div>
      <div style="color:#207030; font-size:12px; margin:4px 0;">${r.url}</div>
      <div style="color:#555; font-size:13px; line-height:1.7;">${r.desc}</div>
    </div>`).join('');
}

// ================== 学校官网 ==================
function renderSchoolSite(path, root){
  const [mainPath, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  const header = `
    <div class="site-container site-school">
      <div class="site-header">
        <h1>🏫 东川市第一中学</h1>
        <div style="font-size:12px; opacity:.8;">DONGCHUAN NO.1 HIGH SCHOOL · 建校于1905年</div>
      </div>
      <div class="site-nav">
        <a class="${mainPath==='/'||mainPath===''?'active':''}" onclick="renderSubSiteSchool('/')">首页</a>
        <a onclick="renderSubSiteSchool('/news')">学校新闻</a>
        <a onclick="renderSubSiteSchool('/about')">学校简介</a>
        <a onclick="renderSubSiteSchool('/teachers')">师资队伍</a>
        <a onclick="renderSubSiteSchool('/archive')">档案与校史</a>
        <a onclick="renderSubSiteSchool('/contact')">联系方式</a>
        <a style="margin-left:auto; background:#a02c2c;" onclick="openLink('intranet.dcyz-edu.cn')">🔐 内网入口</a>
      </div>
      <div class="site-main" id="school-main"></div>
      <div class="site-footer">
        © 2018-2026 东川市第一中学 版权所有 · 地址：东川市文化路1号 · 联系电话：0871-6xxxxxx<br>
        <span style="opacity:.6;">推荐分辨率 1024×768 · IE8+ 浏览器</span>
      </div>
    </div>`;
  root.innerHTML = header;
  const main = document.getElementById('school-main');

  if(mainPath === '/' || mainPath === ''){
    main.innerHTML = `
      <div class="hero">
        <h2>百年名校 · 育人于行</h2>
        <p>诚 朴 勤 勇 —— 东川一中校训</p>
      </div>
      <div class="news-section">
        <div class="section-card">
          <h3>📢 通知公告</h3>
          <div class="card-body">
            <ul class="news-list">
              <li><a onclick="alert('关于2026年秋季学期开学工作的通知\\n\\n新学期将于9月1日正式开学。')">关于2026年秋季学期开学工作的通知</a><span class="news-date">2026-08-10</span></li>
              <li><a onclick="alert('高考加油！')">致高三同学：沉着应考，旗开得胜</a><span class="news-date">2026-06-01</span></li>
              <li><a onclick="alert('图书馆暑期开放时间：周一至周五9:00-17:00。')">图书馆暑期开放时间调整</a><span class="news-date">2026-07-15</span></li>
            </ul>
          </div>
        </div>
        <div class="section-card">
          <h3>📰 校园新闻</h3>
          <div class="card-body">
            <ul class="news-list">
              <li><a onclick="renderSubSiteSchool('/news/20180320')">校企合作，探索智能教育新模式</a><span class="news-date">2018-03-20</span></li>
              <li><a onclick="alert('高2018级毕业典礼圆满举行。')">高2018级毕业典礼圆满举行</a><span class="news-date">2018-06-22</span></li>
              <li><a onclick="alert('我校篮球队获全市亚军。')">市中学生联赛我校获亚军</a><span class="news-date">2018-05-12</span></li>
            </ul>
          </div>
        </div>
      </div>
      <div class="cache-search">
        <b>🔍 搜索引擎缓存检索：</b>
        <input type="text" placeholder="例：B-317 建筑平面图 2017..." id="sch-cache-input">
        <button class="btn btn-secondary" onclick="searchSchoolCache()">查找缓存</button>
        <div id="sch-cache-result" style="margin-top:10px;"></div>
      </div>`;
  } else if(mainPath === '/news'){
    main.innerHTML = `
      <div class="page-title">📰 学校新闻</div>
      <ul class="news-list" style="font-size:14px;">
        <li><a onclick="renderSubSiteSchool('/news/20180320')">校企合作，探索智能教育新模式 —— 我校与启明教育科技共建研究基地</a><span class="news-date">2018-03-20</span></li>
        <li><a onclick="alert('高2018级毕业典礼顺利举行。')">高2018级毕业典礼圆满举行</a><span class="news-date">2018-06-22</span></li>
        <li><a onclick="alert('B楼外墙翻新工程完工。')">B楼外墙翻新工程顺利完工</a><span class="news-date">2019-01-15</span></li>
      </ul>`;
  } else if(mainPath === '/news/20180320'){
    main.innerHTML = `
      <div class="page-title">校企合作，探索智能教育新模式</div>
      <div style="color:#888; font-size:12px; margin-bottom:20px;">发布日期：2018年3月20日 · 来源：校办公室</div>
      <div style="line-height:2; font-size:14px; color:#333;">
        <p>&nbsp;&nbsp;&nbsp;&nbsp;3月20日上午，我校与启明教育科技有限公司校企合作签约仪式在行政楼会议室隆重举行。</p>
        <p>&nbsp;&nbsp;&nbsp;&nbsp;据悉，双方将合作开展"智能教育新模式"研究，共建学生综合研究室（位于B楼 <b style="color:#a02c2c;">B-317</b> 室），探索学生学习行为、认知规律与个性化教学方案。</p>
        <p>&nbsp;&nbsp;&nbsp;&nbsp;该研究计划代号"<b>启明星计划（QX-18）</b>"，将选取高三年级部分志愿者学生参与。</p>
        <p style="text-align:right; color:#666; margin-top:30px;">（文/图 校办公室）</p>
      </div>
      <div style="margin-top:30px; padding:14px; background:#f8f8f0; border:1px dashed #ccc; font-size:12px; color:#777;">
        <b>📝 编辑记录：</b>最后修改时间 2018-06-16 23:47。<br>
        <span style="color:#a00;">⚠ 注：本报道于2018年6月16日进行过修改，修改原因："文字表述调整"</span>
      </div>`;
  } else if(mainPath === '/about'){
    main.innerHTML = `
      <div class="page-title">🏫 学校简介</div>
      <div style="line-height:2; font-size:14px; color:#333;">
        <p>东川市第一中学（<strong>简称 DCYZ</strong>）始建于1905年，坐落于文化路1号，是本省历史最悠久的省级示范高中之一。</p>
        <p>校园占地260余亩，在校学生3200余人，教职工260余人。</p>
        <h4 style="margin-top:20px; color:#1a3a60;">校舍分布</h4>
        <ul style="padding-left:24px; line-height:2;">
          <li>A楼：高一、高二教学区</li>
          <li>B楼：高三教学区（1-3层）</li>
          <li>C楼：实验楼</li>
          <li>图书馆 · 体育馆 · 行政楼</li>
        </ul>
        <h4 style="margin-top:24px; color:#1a3a60;">现任领导</h4>
        <p><strong>校长：陈国栋</strong></p>
        <p style="text-indent:2em; font-size:13px; color:#555;">陈国栋同志出生于<strong>1968年3月22日</strong>，自2003年起任我校党委书记、校长，主持学校全面工作。</p>
        <h4 style="margin-top:24px; color:#1a3a60;">校长寄语</h4>
        <div style="border-left:4px solid #a02c2c; padding:10px 16px; background:#fff8f0; color:#554030; font-size:13px; line-height:2;">
          "百年学府，薪火相传。诚朴勤勇是DCYZ人的底色。<br>愿每一位同学在这里找到属于自己的启明星。"
          <p style="text-align:right; margin-top:6px; color:#666;">—— <strong>陈国栋</strong> 2018年春</p>
        </div>
      </div>`;
  } else if(mainPath === '/teachers'){
    main.innerHTML = `
      <div class="page-title">👥 师资队伍</div>
      <div style="line-height:2; font-size:14px; color:#333;">
        <p>我校现有专任教师210人，其中特级教师12人，高级教师78人，研究生学历占比45%。</p>
        <h4 style="margin-top:20px; color:#1a3a60;">高三年级班主任团队</h4>
        <table style="width:100%; border-collapse:collapse; font-size:13px; margin-top:10px;">
          <tr style="background:#e4ecf4;"><th style="border:1px solid #c0d0e0; padding:6px 10px; text-align:left;">姓名</th><th style="border:1px solid #c0d0e0; padding:6px 10px; text-align:left;">职务</th><th style="border:1px solid #c0d0e0; padding:6px 10px; text-align:left;">任教学科</th><th style="border:1px solid #c0d0e0; padding:6px 10px; text-align:left;">入职年份</th><th style="border:1px solid #c0d0e0; padding:6px 10px; text-align:left;">工号</th></tr>
          <tr><td style="border:1px solid #d0d8e0; padding:6px 10px;">陈国栋</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">校长 / 党委书记</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">物理</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">2003</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">T20030101</td></tr>
          <tr><td style="border:1px solid #d0d8e0; padding:6px 10px;">王秀英</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">高三(1)班班主任</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">语文</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">2005</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">T20050901</td></tr>
          <tr><td style="border:1px solid #d0d8e0; padding:6px 10px;">李建华</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">高三(2)班班主任</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">数学</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">2008</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">T20080901</td></tr>
          <tr style="background:#fff8e0;"><td style="border:1px solid #d0d8e0; padding:6px 10px;"><strong>张志强</strong></td><td style="border:1px solid #d0d8e0; padding:6px 10px;">高三(2)班班主任助理</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">生物</td><td style="border:1px solid #d0d8e0; padding:6px 10px;"><strong>2010</strong></td><td style="border:1px solid #d0d8e0; padding:6px 10px;">T20100901</td></tr>
          <tr><td style="border:1px solid #d0d8e0; padding:6px 10px;">赵敏</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">高三(3)班班主任</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">英语</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">2007</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">T20070901</td></tr>
          <tr><td style="border:1px solid #d0d8e0; padding:6px 10px;">孙伟</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">高三(4)班班主任</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">化学</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">2006</td><td style="border:1px solid #d0d8e0; padding:6px 10px;">T20060901</td></tr>
        </table>
        <div style="margin-top:16px; padding:12px 16px; background:#f8fbff; border-left:4px solid #2d5a8a; font-size:12px; line-height:1.8;">
          <strong>张志强 老师 简介：</strong><br>
          张志强，男，1985年生，<strong>2010年9月入职东川市第一中学</strong>（<strong>DCYZ</strong>），任高三年级生物教师及班主任助理。<br>
          工作认真负责，关心学生成长，所带班级生物均分连续三年年级前列。<br>
          校内系统账户名为 <strong>zhangzq</strong>（姓名拼音缩写 ZhangZQ），是少数几个保留早期命名规则的老教师账户之一。
        </div>
      </div>`;
  } else if(mainPath === '/archive'){
    const year = params.get('year');
    if(year === '2017'){
      main.innerHTML = `
        <div class="notice-box">⚠ 此内容来自<b>搜索引擎历史缓存</b>（2017年11月归档），原链接已失效。</div>
        <div class="page-title">📘 校园建筑平面图 · 2017存档</div>
        <h4 style="color:#1a3a60; margin:14px 0;">B楼 三层平面图</h4>
        <div style="padding:20px; background:#f5f5f5; border:1px solid #ddd; font-family:'Consolas',monospace; font-size:13px; line-height:1.8;">
<pre>
┌─────────────────────────────────────────────────────────────────────┐
│  B楼 三层  [2017版]                                                 │
│                                                                     │
│  [B-301][B-302][B-303][B-304][B-305][B-306][B-307][B-308]          │
│  高三1   高三2   高三3   高三4   高三5   高三6   高三7   高三8       │
│                                                                     │
│  ──────────────────────── 走 廊 ────────────────────────────────    │
│                                                                     │
│  [B-309][B-310][B-311][B-312][B-313][B-314][B-315][B-316][B-317]   │
│  备课室  教师办公 会议室  机房1   机房2   资料室  休息室  杂物室    │
│                                               <span style="background:#ffcc00; color:#884400;">[学生综合研究室]</span>│
│  ↑ 楼梯B                                                    楼梯A ↑ │
└─────────────────────────────────────────────────────────────────────┘
</pre>
        </div>
        <div style="margin-top:20px;">
          <button class="btn btn-secondary" onclick="renderSubSiteSchool('/archive?year=2019')">► 查看2019年存档（当前官网版本）</button>
        </div>`;
    } else if(year === '2019'){
      main.innerHTML = `
        <div class="page-title">📘 校园建筑平面图 · 2019版（当前）</div>
        <h4 style="color:#1a3a60; margin:14px 0;">B楼 三层平面图</h4>
        <div style="padding:20px; background:#f5f5f5; border:1px solid #ddd; font-family:'Consolas',monospace; font-size:13px; line-height:1.8;">
<pre>
┌─────────────────────────────────────────────────────────────────────┐
│  B楼 三层  [2019版]                                                 │
│                                                                     │
│  [B-301]...[B-308]  （高一～高三教室）                             │
│                                                                     │
│  ──────────────────────── 走 廊 ────────────────────────────────    │
│                                                                     │
│  [B-309][B-310][B-311][B-312][B-313][B-314][B-315][B-316]  ┌───┐  │
│  备课室  办公    会议   机房1   机房2  资料室  休息室 杂物室 │楼梯│  │
│                                                              │间A │  │
│  ↑ 楼梯B                                                    └───┘  │
└─────────────────────────────────────────────────────────────────────┘
</pre>
        </div>
        <div class="info-box">💡 对比2017与2019版：<b style="color:#c03030;">B-317</b> 在2019版中不存在。原B-317位置被标注为"楼梯间A"。</div>
      `;
    } else if(params.get('b317') !== null){
      main.innerHTML = `
        <div class="notice-box">⚠ 此内容来自<b>搜索引擎历史缓存</b>，原公告页面已被删除。</div>
        <div class="page-title">关于"学生综合研究室B-317"的变更公告</div>
        <div style="color:#888; font-size:12px; margin-bottom:20px;">发布日期：2018年7月2日</div>
        <div style="line-height:2; font-size:14px; color:#333;">
          <p>&nbsp;&nbsp;&nbsp;&nbsp;因学校教学结构调整，原位于B楼三层的学生综合研究室（编号 <b>B-317</b>）自即日起停止使用。</p>
          <p>&nbsp;&nbsp;&nbsp;&nbsp;该研究室内的相关设备、资料已统一转移至校实验楼C区专用场所。</p>
          <p style="text-align:right; color:#666; margin-top:30px;">东川一中 后勤处<br>2018年7月2日</p>
        </div>`;
    } else {
      main.innerHTML = `
        <div class="page-title">📚 档案与校史</div>
        <div style="font-size:14px; line-height:2; color:#444;">
          <ul style="padding-left:24px; margin-top:14px;">
            <li><a style="cursor:pointer; color:#2244aa;" onclick="renderSubSiteSchool('/archive?year=2019')">2019年度校园建筑平面图（现行版）</a></li>
            <li><a style="cursor:pointer; color:#2244aa;" onclick="alert('2018年度档案正在整理中...')">2018年度档案 [整理中]</a></li>
          </ul>
        </div>
        <div class="cache-search" style="margin-top:30px;">
          <b>🔍 搜索引擎缓存检索：</b>
          <input type="text" placeholder="例：2017 B-317" id="sch-cache-input">
          <button class="btn btn-secondary" onclick="searchSchoolCache()">查找缓存</button>
          <div id="sch-cache-result" style="margin-top:10px;"></div>
        </div>`;
    }
  } else if(mainPath === '/contact'){
    main.innerHTML = `
      <div class="page-title">📞 联系方式</div>
      <div style="font-size:14px; line-height:2; color:#333;">
        <p>📍 地址：东川市文化路1号</p>
        <p>☎ 办公室：0871-6xxxxxx</p>
        <p>🌐 校园内网：intranet.dcyz-edu.cn（<b>需教职工/学生账号登录</b>）</p>
        <p style="margin-top:16px;"><b>账号说明：</b>教职工账号为"姓名拼音"，初始密码格式参考入职通知邮件。</p>
      </div>`;
  }
}
function renderSubSiteSchool(path){
  const tab = currentTab();
  tab.url = 'http://www.dcyz-edu.cn' + path;
  tab.history.push(tab.url);
  tab.historyIdx = tab.history.length - 1;
  renderUrl(tab.url, false);
}
function searchSchoolCache(){
  const q = document.getElementById('sch-cache-input').value.trim();
  const out = document.getElementById('sch-cache-result');
  if(q.match(/2017/i) || q.match(/B-?317/i) || q.match(/建筑平面/i)){
    out.innerHTML = `<span style="color:#206020;">✓ 命中缓存 1 条：</span> 
      <a style="color:#2244aa; cursor:pointer; text-decoration:underline;" onclick="renderSubSiteSchool('/archive?year=2017')">2017年B楼三层建筑平面图 [缓存]</a>`;
  } else if(q.match(/2018/i) && q.match(/(变更|公告|317)/i)){
    out.innerHTML = `<span style="color:#206020;">✓ 命中缓存 1 条：</span>
      <a style="color:#2244aa; cursor:pointer; text-decoration:underline;" onclick="renderSubSiteSchool('/archive?b317=1')">关于B-317学生综合研究室变更公告 [缓存]</a>`;
  } else if(q.match(/qx|启明星/i)){
    out.innerHTML = `<span style="color:#206020;">✓ 提示：</span>请前往"学校新闻 → 2018年3月20日 校企合作"报道查看相关内容。`;
  } else {
    out.innerHTML = `<span style="color:#888;">✗ 未找到该关键词的缓存内容。</span>`;
  }
}

// ================== 校园内网 ==================
let intranetState = { loggedIn: false, currentPage: 'home' };

async function renderIntranetSite(path, root){
  try {
    const st = await (await fetch('/api/state')).json();
    intranetState.loggedIn = st.intranetLoggedIn;
    intranetState.user = st.currentUser;
  } catch(e){}

  const header = `
    <div class="site-container">
      <div style="background:#1e2e50; color:#fff; padding:12px 24px; display:flex; align-items:center; justify-content:space-between;">
        <div><b>🔐 东川市第一中学 · 校园内网</b> <span style="opacity:.7; font-size:12px; margin-left:10px;">DYCZ INTRANET PORTAL</span></div>
        <div style="font-size:12px;">
          ${intranetState.loggedIn ? `<span>登录用户：<b style="color:#ffdd99;">${intranetState.user||'用户'}</b></span>
          <button class="btn btn-danger" style="margin-left:14px; padding:3px 12px; font-size:12px;" onclick="intranetLogout()">退出</button>` : '未登录'}
        </div>
      </div>
      <div id="intranet-body"></div>
      <div style="background:#2a3544; color:#8898a8; padding:14px 24px; font-size:12px; text-align:center;">
        东川一中 信息中心 · 内网系统 v3.1.7 · ${intranetState.loggedIn ? '连接正常' : '会话未授权'}
      </div>
    </div>`;
  root.innerHTML = header;
  const body = document.getElementById('intranet-body');

  if(!intranetState.loggedIn){
    body.innerHTML = `
      <div class="login-box">
        <div class="login-header"><h3>🔐 校园内网登录</h3><div style="opacity:.8; font-size:12px; margin-top:6px;">请使用学校分配的账号</div></div>
        <div class="login-body">
          <div id="login-err"></div>
          <div class="form-row">
            <label>账号</label>
            <input type="text" id="login-user" placeholder="用户名">
          </div>
          <div class="form-row">
            <label>密码</label>
            <input type="password" id="login-pass" placeholder="密码" onkeydown="if(event.key==='Enter') intranetLogin()">
          </div>
          <div class="form-row" style="justify-content:center;">
            <button class="btn" style="padding:8px 36px;" onclick="intranetLogin()">登 录</button>
          </div>
          <div class="login-tip">
            "用户名是她的名字拼音，密码把日期和房间号拼起来试试？"<br>
            （练习册上的日期 / B楼消失的房间号，中间用下划线连接）
          </div>
        </div>
      </div>`;
  } else {
    body.innerHTML = `
      <div class="intranet-dash">
        <div class="intranet-menu">
          <a class="active" onclick="intraPage('home', this)">🏠 内网首页</a>
          <a onclick="intraPage('access', this)">🚪 门禁记录查询</a>
          <a onclick="intraPage('student', this)">👥 学生档案</a>
          <a onclick="intraPage('floorplan', this)">🗺 建筑平面图</a>
          <a onclick="intraPage('chatlogs', this)">💬 聊天记录存档</a>
          <a onclick="intraPage('timeline', this)">⏱ 系统时间校准工具</a>
          <a onclick="intraPage('qx18', this)">📁 项目文档区</a>
        </div>
        <div class="intranet-content" id="intra-content"></div>
      </div>`;
    intraPage('home');
  }
}

async function intranetLogin(){
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const res = await (await fetch('/api/intranet/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({username:u, password:p})
  })).json();
  if(res.success){
    intranetState.loggedIn = true;
    intranetState.user = u;
    renderUrl(currentTab().url, false);
  } else {
    document.getElementById('login-err').innerHTML = `<div class="error-box">${res.message}</div>`;
  }
}
async function intranetLogout(){
  await fetch('/api/intranet/logout', {method:'POST'});
  intranetState.loggedIn = false;
  renderUrl(currentTab().url, false);
}

async function intraPage(p, aEl){
  document.querySelectorAll('.intranet-menu a').forEach(x => x.classList.remove('active'));
  if(aEl) aEl.classList.add('active');
  const el = document.getElementById('intra-content');
  if(p === 'home'){
    el.innerHTML = `
      <h3 style="color:#1a3a60;">欢迎回来，${intranetState.user || '用户'}</h3>
      <div style="font-size:13px; color:#666; margin-top:8px; margin-bottom:20px;">最后登录：2026/08/15 · 来自：旧电脑</div>
      <div class="notice-box">
        <b>📌 系统公告 [2026-08-12]</b><br>
        近期部分学生档案数据异常。注意：系统日志时间轴为多源数据合并，<b>如发现时间偏差请使用"时间校准工具"。</b>
      </div>
      <div style="font-size:13px; line-height:2; color:#444;">
        <ul style="padding-left:24px;">
          <li><b>门禁记录查询</b>：2018年6月14日的刷卡记录</li>
          <li><b>学生档案</b>：学生基本信息查询</li>
          <li><b>建筑平面图</b>：2017/2019存档对比</li>
          <li><b>聊天记录存档</b>：四人关于许妍的证词（互相矛盾！）</li>
          <li><b>系统时间校准工具</b>：多系统时间戳对比 → 时间线重构</li>
          <li><b>项目文档区</b>：QX18_ 前缀文件（如 QX18_A03_SUB0617）</li>
        </ul>
      </div>`;
  } else if(p === 'access'){
    el.innerHTML = `<h3 style="color:#1a3a60; margin-bottom:16px;">🚪 门禁记录查询 · 2018年6月14日</h3>
      <div class="notice-box">数据来源：校园门禁独立系统 · 注意：门禁系统时钟为独立硬件计时，<b>未与NTP同步</b>。</div>
      <div id="access-loading" style="padding:30px; text-align:center; color:#888;">正在加载门禁日志...</div>`;
    setTimeout(async () => {
      const logs = await (await fetch('/api/access-logs')).json();
      document.getElementById('access-loading').innerHTML = `
        <table class="data-table">
          <thead><tr><th>时间</th><th>地点</th><th>使用者</th><th>状态</th></tr></thead>
          <tbody>
            ${logs.map((l,i)=>`
              <tr class="${i%2?'odd':''}">
                <td style="font-family:Consolas;">${l.time.substr(11)}</td>
                <td>${l.door}</td>
                <td>${l.user}</td>
                <td style="color:${l.status.includes('异常')?'#c03030':'#333'}">${l.status}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="info-box">💡 对比练习册上的 [18:41][18:57][19:03][19:11]<br>
        门禁显示19:03许妍进入B-317，19:11"未知用户"又进入？19:18显示"数据复制完成"？<br>
        服务器时间显示数据复制也是19:03开始——许妍进入和复制开始的先后关系需要再想想。</div>`;
    }, 500);
  } else if(p === 'student'){
    el.innerHTML = `
      <h3 style="color:#1a3a60; margin-bottom:16px;">👥 学生档案查询</h3>
      <div class="form-row">
        <label style="width:auto;">姓名：</label>
        <input type="text" id="stu-name" placeholder="输入学生姓名" onkeydown="if(event.key==='Enter') searchStu()">
        <button class="btn" onclick="searchStu()">查询</button>
        <button class="btn btn-secondary" style="margin-left:8px;" onclick="document.getElementById('stu-result').innerHTML=class3ListHtml()">高三(3)班名单</button>
      </div>
      <div id="stu-result"></div>`;
  } else if(p === 'floorplan'){
    el.innerHTML = `
      <h3 style="color:#1a3a60; margin-bottom:16px;">🗺 建筑平面图存档</h3>
      <div>存档年度：
        <button class="btn" onclick="loadFloor(2017)">2017</button>
        <button class="btn btn-secondary" onclick="loadFloor(2019)">2019</button>
        <button class="btn btn-secondary" onclick="loadFloor(2018)">2018</button>
      </div>
      <div id="floor-body" style="margin-top:20px;"></div>`;
  } else if(p === 'chatlogs'){
    el.innerHTML = `<h3 style="color:#1a3a60; margin-bottom:16px;">💬 聊天记录存档 · 6·14 相关证词</h3>
      <div class="notice-box">四人的记忆描述不完全一致——会不会有人的记忆被修改过？</div>
      <div id="cl-loading" style="padding:20px; color:#888;">读取存档...</div>`;
    setTimeout(async () => {
      const data = await (await fetch('/api/chatlogs')).json();
      document.getElementById('cl-loading').innerHTML = data.map((c,i)=>`
        <div class="enterprise-card" style="margin-bottom:14px; background:${i%2?'#faf8f0':'#fff'}">
          <h4>📝 ${c.witness}</h4>
          <p>"${c.statement}"</p>
        </div>`).join('') + `
        <div class="info-box">
        ⚠ 证词矛盾：<br>· 18点前走了 · 18:40还在教室 · 没去B楼 · 19:03看见她进入<br>
        或者某个系统的时间和真实时间对不上？比如那个"独立硬件计时"的门禁。</div>`;
    }, 500);
  } else if(p === 'timeline'){
    el.innerHTML = `
      <h3 style="color:#1a3a60; margin-bottom:16px;">⏱ 多系统时间校准工具</h3>
      <div class="notice-box">事件基准：QX-18数据复制启动（企业服务器标准时间 19:03:00）<br>
      用下方按钮查询其他系统对"同一瞬间"显示的时间，计算各系统之间的偏差。</div>
      <div style="margin-bottom:20px;">
        <button class="btn" onclick="loadTime('access')">门禁系统时间</button>
        <button class="btn btn-secondary" onclick="loadTime('server')">企业服务器时间</button>
        <button class="btn btn-secondary" onclick="loadTime('monitor')">监控录像时间</button>
        <button class="btn btn-secondary" onclick="loadTime('photo')">手机照片EXIF时间</button>
      </div>
      <div id="time-result"></div>
      <div class="timeline-tool">
        <h4 style="margin-bottom:10px;">🧩 重构"6·14当晚"真正的时间线</h4>
        <div style="font-size:12px; color:#666; margin-bottom:10px;">
          说明：先从"时间池"点选，按真实发生顺序放入上方"时间槽"（点错了可以点上方再次移除）。<br>
          关键提示：许妍发消息 → 拍照片 → 【有人（非许妍）进入B-317】→ 数据开始复制 → 许妍进入 → 复制完成 → 学校处理 → 企业来人 → 断电 → 记录停止。<br>
          （注意门禁比真实时间快了7分钟）
        </div>
        <div style="font-size:12px; color:#666;">已排列顺序：</div>
        <div class="timeline-slots" id="tl-slots"></div>
        <div style="font-size:12px; color:#666;">时间池：</div>
        <div class="timeline-pool" id="tl-pool"></div>
        <div style="margin-top:14px;">
          <button class="btn" onclick="submitTimeline()">提交时间线</button>
          <button class="btn btn-secondary" onclick="resetTimeline()">重置</button>
        </div>
        <div class="timeline-result" id="tl-result"></div>
      </div>`;
    renderTimelineTool();
  } else if(p === 'qx18'){
    el.innerHTML = `
      <h3 style="color:#1a3a60; margin-bottom:16px;">📁 项目文档区 · QX-18</h3>
      <div class="notice-box">文件名格式：QX18_[分级]_[编号]<br>
      已知编号参考：SUB-0617许妍；SUB-0618林嘉；SUB-0621陈放；SUB-0624苏雨；SUB-0627周航；SUB-0630数据缺失</div>
      <div class="form-row">
        <label style="width:auto;">文件编号：</label>
        <input type="text" id="qx18-file" placeholder="QX18_A03_SUB0617" style="max-width:260px;" onkeydown="if(event.key==='Enter') loadQX18()">
        <button class="btn" onclick="loadQX18()">读取</button>
      </div>
      <div style="margin:16px 0; font-size:12px; color:#666;">快捷：
        <a style="cursor:pointer; color:#2244aa; text-decoration:underline;" onclick="document.getElementById('qx18-file').value='QX18_A03_SUB0617'; loadQX18();">QX18_A03_SUB0617(许妍)</a> ·
        <a style="cursor:pointer; color:#2244aa; text-decoration:underline;" onclick="document.getElementById('qx18-file').value='QX18_A03_SUB0630'; loadQX18();">QX18_A03_SUB0630(???)</a>
      </div>
      <div id="qx18-body"></div>`;
  }
}

function class3ListHtml(){
  const list = ['林嘉','陈放','苏雨','周航'];
  return `<h4 style="margin:14px 0;">高三(3)班 · 在册学生名单（共43人，以下为部分）</h4>
    <table class="data-table"><thead><tr><th>学号</th><th>姓名</th><th>备注</th></tr></thead><tbody>
    ${list.map((n,i)=>`<tr class="${i%2?'odd':''}"><td>201503${String(i+1).padStart(3,'0')}</td><td>${n}</td><td>SUB-06${18+i*3|0}</td></tr>`).join('')}
    </tbody></table>
    <div style="margin-top:12px; font-size:12px; color:#888;">* 奇怪。我记得我们班应该是44个人？她去哪里了……</div>`;
}

async function searchStu(){
  const n = document.getElementById('stu-name').value.trim();
  if(!n) return;
  const r = await (await fetch('/api/student/'+encodeURIComponent(n))).json();
  const el = document.getElementById('stu-result');
  if(r.error){ el.innerHTML = `<div class="error-box">未找到匹配记录</div>`; }
  else if(r.status === '档案不存在'){
    el.innerHTML = `<div class="error-box">⚠ 数据库中无此学生记录：<b>${n}</b></div>
      <div style="margin-top:14px; padding:10px; background:#f0f0f0; font-family:Consolas; font-size:11px; color:#555;">
      [调试信息] hidden_field = ${r.hiddenData}</div>
      <div style="margin-top:10px; font-size:12px; color:#666;">
        💡 Base64解码：<span id="decoded-val" style="color:#c03030; font-weight:bold; cursor:pointer; text-decoration:underline;" onclick="document.getElementById('decoded-val').textContent=atob('${r.hiddenData}')">[点击解码]</span>
      </div>`;
  } else {
    el.innerHTML = `<h4 style="margin:14px 0;">档案详情</h4>
      <table class="data-table">
        <tr><th style="width:140px;">学生ID</th><td>${r.studentId||'-'}</td></tr>
        <tr class="odd"><th>姓名</th><td>${r.name||'-'}</td></tr>
        <tr><th>班级</th><td>${r.class||'-'}</td></tr>
        <tr class="odd"><th>状态</th><td>${r.status||'-'}</td></tr>
      </table>`;
  }
}
async function loadFloor(y){
  const el = document.getElementById('floor-body');
  el.innerHTML = '<div style="padding:20px; color:#888;">加载中...</div>';
  const r = await (await fetch('/api/floorplan/'+y)).json();
  if(r.error){ el.innerHTML = `<div class="error-box">${r.error}</div>`; return;}
  el.innerHTML = `
    <h4 style="margin:10px 0;">${r.building} · ${r.floor} · ${y}存档</h4>
    <table class="data-table">
      <tr><th style="width:160px;">房间总数</th><td>${r.rooms.length} 间</td></tr>
      <tr class="odd"><th>最后一间</th><td><b style="color:${r.lastRoom==='B-317'?'#c03030':'#333'}">${r.lastRoom}</b> ${r.purpose? '（用途：' + r.purpose + '）': ''} ${r.note? '（' + r.note + '）': ''}</td></tr>
      <tr><th>房间列表</th><td style="font-family:Consolas;">${r.rooms.join(' · ')}</td></tr>
    </table>
    <div class="info-box" style="margin-top:14px;">${r.lastRoom==='B-317'?'2017年：B-317明确存在，用途学生综合研究室。':'2019年：B-316之后直接是楼梯，B-317从图纸上消失了。'}</div>`;
}
async function loadTime(src){
  const r = await (await fetch('/api/server-time?source='+src)).json();
  document.getElementById('time-result').innerHTML = `
    <table class="data-table" style="margin-top:10px;">
      <tr><th style="width:180px;">数据来源</th><td>${({access:'门禁系统独立时钟（未同步NTP）',server:'企业服务器（NTP校准）',monitor:'学校监控录像',photo:'学生手机拍照EXIF'})[src]||src}</td></tr>
      <tr class="odd"><th>数据复制启动瞬间其显示时间</th><td style="font-family:Consolas; color:#c03030; font-size:16px;">${r.displayTime.substr(11)}</td></tr>
      <tr><th>备注</th><td>${r.note||'-'}</td></tr>
    </table>`;
}

const TIMELINE_EVENTS = ['18:41','18:42','18:56','19:03','19:11','19:18','19:24','19:32','19:47','20:13'];
let tlSelected = [];
function renderTimelineTool(){
  const pool = document.getElementById('tl-pool');
  const slots = document.getElementById('tl-slots');
  pool.innerHTML = ''; slots.innerHTML = '';
  TIMELINE_EVENTS.forEach(t => {
    const d = document.createElement('span');
    d.className = 'time-chip' + (tlSelected.includes(t)?' used':'');
    d.textContent = t;
    if(!tlSelected.includes(t)) d.onclick = () => { tlSelected.push(t); renderTimelineTool(); };
    pool.appendChild(d);
  });
  tlSelected.forEach((t,i) => {
    const d = document.createElement('span');
    d.className = 'time-chip';
    d.textContent = (i+1) + '. ' + t;
    d.onclick = () => { tlSelected.splice(i,1); renderTimelineTool(); };
    slots.appendChild(d);
  });
}
function resetTimeline(){ tlSelected = []; renderTimelineTool(); const el = document.getElementById('tl-result'); if(el){el.className='timeline-result'; el.textContent='';}}
async function submitTimeline(){
  const r = await (await fetch('/api/submit-timeline',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({timeline: tlSelected})
  })).json();
  const el = document.getElementById('tl-result');
  el.className = 'timeline-result ' + (r.success?'success':'failed');
  el.innerHTML = (r.success?'✅ ':'❌ ') + r.message + (r.success?' <a style="color:#206020; text-decoration:underline; cursor:pointer;" onclick="checkEndingAvailable()">► 所有碎片齐全了吗？</a>':' 试试考虑7分钟偏差。');
}

async function loadQX18(){
  const code = document.getElementById('qx18-file').value.trim();
  const el = document.getElementById('qx18-body');
  if(!code){ el.innerHTML = '<div class="error-box">请输入文件编号</div>'; return;}
  el.innerHTML = '<div style="padding:20px; color:#888;">正在读取文件...</div>';
  const r = await (await fetch('/api/qx18/file',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({fileCode: code})
  })).json();
  if(r.success){
    const d = r.data;
    el.innerHTML = `<div class="file-reader">
<span class="yellow">╔═══════════════════════════════════════════╗</span>
<span class="yellow">║</span>        QX-18 实验记录 · 内部文档 · 机密        <span class="yellow">║</span>
<span class="yellow">╚═══════════════════════════════════════════╝</span>

文件编号: <span class="cyan">${code}</span>
实验对象ID: <span class="cyan">${d.id}</span>
姓名: <span class="red">${d.name}</span>
${d.birthYear?`出生: ${d.birthYear}  学校: ${d.school}  班级: ${d.class}`:''}
${d.experimentDate?`实验日期: <span class="red">${d.experimentDate}</span>`:''}

─────────────────── 实验记录 ───────────────────
${d.records.map(x=>`· ${x.type||x[0]}: ${x.value||x.status||x[1]}  ${x.date?('['+x.date+']'):''}`).join('\n')}

─────────────────── 最终结论 ───────────────────
<span class="red">${d.finalNote}</span>

<span class="yellow">─────────────────────────────────────────────</span>
<span style="font-size:11px; color:#888;">
[SUB-0630分析]：姓名缺失，但出生年份/学校/班级/实验日期
与"我"完全吻合——SUB-0630就是我。
实验最后一日(2018/06/14)的记录完全缺失，且最终结论为
"记忆恢复失败"——说明有人试图抹去我那一天的记忆。</span>
</div>`;
  } else {
    el.innerHTML = `<div class="error-box">${r.message}</div>`;
  }
}

// ================== 启明星计划网站 ==================
function renderQX18Site(path, root){
  root.innerHTML = `
    <div class="site-container site-qx18">
      <div class="site-header">
        <h1>⭐ 启明星教育研究计划 · QX-18</h1>
        <div style="font-size:12px; opacity:.8;">QIMING STAR · EDUCATION RESEARCH</div>
      </div>
      <div style="background:#000820; color:#88aacc; padding:8px 30px; display:flex; gap:0;">
        <a id="qxnav-home" class="active" style="padding:8px 18px; cursor:pointer; color:#fff; background:rgba(74,144,226,.3);" onclick="qxTab('home')">项目首页</a>
        <a id="qxnav-intro" style="padding:8px 18px; cursor:pointer;" onclick="qxTab('intro')">项目介绍</a>
        <a id="qxnav-research" style="padding:8px 18px; cursor:pointer;" onclick="qxTab('research')">研究成果</a>
        <a id="qxnav-access" style="padding:8px 18px; cursor:pointer;" onclick="qxTab('access')">授权登录</a>
        <a id="qxnav-contact" style="padding:8px 18px; cursor:pointer;" onclick="qxTab('contact')">联系我们</a>
      </div>
      <div class="site-main" id="qx18-main"></div>
      <div class="site-footer" style="background:#080818;">
        © 2016-2026 启明星教育研究计划 · 主办：启明教育科技 · 协作单位：东川市第一中学
      </div>
    </div>`;
  qxTab('home');
}
function qxTab(t){
  ['home','intro','research','access','contact'].forEach(x=>{
    const el = document.getElementById('qxnav-'+x);
    if(el){ el.style.color = (x===t)?'#fff':'#aabbdd'; el.style.background = (x===t)?'rgba(74,144,226,.3)':'transparent'; }
  });
  const m = document.getElementById('qx18-main');
  if(t === 'home'){
    m.innerHTML = `
      <div class="star-bg">
        <h2>✦ 启 明 星 计 划 ✦</h2>
        <p>QX-18 · 面向青少年智能教育的探索性研究</p>
        <p style="margin-top:30px; font-size:13px; opacity:.6;">用科学的方式，理解每一颗星星的光芒。</p>
      </div>
      <div class="project-info">
        <h4 style="color:#0a2a50; margin-bottom:14px;">🌌 项目简介</h4>
        <p>"启明星计划（QX-18）"成立于2016年，由启明教育科技牵头、多家重点中学参与的联合研究项目，致力于探索学生学习行为、认知规律与记忆特征。</p>
        <h4 style="color:#0a2a50; margin:20px 0 14px;">📊 研究方向</h4>
        <ul style="padding-left:24px; line-height:2;">
          <li>学习过程中的注意力与记忆特征分析</li>
          <li>基于认知科学的个性化教学路径规划</li>
          <li>青少年记忆发展规律与学习效率优化</li>
        </ul>
        <div style="margin-top:30px; padding:16px; background:#f5f7ff; border-left:4px solid #4a90e2; font-size:13px;">
          💡 项目代号含义：<b>QX = 启明星</b>，<b>18 = 2018年度正式批次</b>。
        </div>
      </div>`;
  } else if(t === 'intro'){
    m.innerHTML = `
      <h3 class="page-title">📖 项目介绍</h3>
      <div class="project-info">
        <p><b>QX-18</b> 聚焦于学生在学习过程中的<b>记忆编码、存储与提取</b>机制。</p>
        <h4 style="color:#0a2a50; margin:20px 0 14px;">🔬 核心实验方法</h4>
        <ol style="padding-left:24px; line-height:2;">
          <li>反应时间测试（RT Test）</li>
          <li>记忆测试（Memory Assessment）</li>
          <li>重复描述实验（Re-description）</li>
          <li>事件回忆任务（Event Recall）</li>
        </ol>
        <h4 style="color:#0a2a50; margin:20px 0 14px;">👥 实验对象</h4>
        <p>实验对象编号以 <b>SUB-06XX</b> 格式编码。</p>
        <div style="margin-top:20px; padding:16px; background:#fff8f0; border-left:4px solid #e08030; font-size:13px;">
          ⚠ <b>注意</b>：研究显示，通过反复引导和"纠正"，受试者可能会怀疑甚至修改原始记忆。
        </div>
      </div>`;
  } else if(t === 'research'){
    m.innerHTML = `
      <h3 class="page-title">📚 研究成果</h3>
      <div class="project-info">
        <div class="enterprise-card" style="margin-bottom:14px;">
          <h4>📄 青少年长期记忆稳定性研究</h4>
          <p>《教育神经科学学报》2018年第3期。<br>摘要：32%的受试者在三个月后对同一事件的描述出现了可测量的细节偏差。</p>
        </div>
        <div class="enterprise-card" style="margin-bottom:14px;">
          <h4>📄 引导性提问与记忆重构</h4>
          <p>摘要：在受控环境下，受试者可能会对从未发生过的事情产生"清晰的回忆"。</p>
        </div>
      </div>`;
  } else if(t === 'access'){
    m.innerHTML = `
      <h3 class="page-title">🔐 授权登录 · QX-18 实验数据系统</h3>
      <div style="max-width:480px;">
        <div class="notice-box">本区域仅限项目核心研究人员访问。请输入<b>项目授权码</b>。<br>
        <span style="font-size:12px;">（提示：就是项目代号本身，有一条横杠——别漏了。）</span>
        </div>
        <div id="qx-acc-err"></div>
        <div class="form-row">
          <label style="width:100px;">授权码</label>
          <input type="text" id="qx-acc-code" placeholder="例：QX-XX" onkeydown="if(event.key==='Enter') qxUnlock()">
          <button class="btn" onclick="qxUnlock()">解锁</button>
        </div>
        <div id="qx-acc-body"></div>
      </div>`;
  } else if(t === 'contact'){
    m.innerHTML = `
      <h3 class="page-title">📞 联系我们</h3>
      <div class="project-info">
        <p>📧 qx18@qx18-project.org</p>
        <p>🏢 启明教育科技有限公司 基础研究部</p>
        <p>🏫 协作单位：东川市第一中学 教研处</p>
        <p>📁 企业官网：<a style="cursor:pointer; color:#2244aa; text-decoration:underline;" onclick="openLink('www.qiming-edu.com')">www.qiming-edu.com</a></p>
      </div>`;
  }
}
async function qxUnlock(){
  const code = document.getElementById('qx-acc-code').value.trim();
  const err = document.getElementById('qx-acc-err');
  const body = document.getElementById('qx-acc-body');
  const r = await (await fetch('/api/qx18/unlock', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({accessCode: code})
  })).json();
  if(r.success){
    err.innerHTML = '';
    body.innerHTML = `
      <div class="info-box" style="margin-top:20px;">✅ 授权码正确。QX-18系统已解锁。</div>
      <div class="file-reader" style="margin-top:20px;">
<span class="cyan">系统>></span> 已解锁项目数据访问权限。
<span class="yellow">──────────────────────────────────</span>
<span class="yellow"> 已知对象列表：</span>
  SUB-0617  ·  <span class="red">许妍</span>
  SUB-0618  ·  林嘉
  SUB-0621  ·  陈放
  SUB-0624  ·  苏雨
  SUB-0627  ·  周航
  SUB-0630  ·  <span class="red">[数据缺失]</span>

<span style="color:#888;">[提示] SUB-0630 = 我？ 出生年份2000 / 东川一中 / 高三(3)班 / 实验日期 2018-06-14</span>
      </div>
      <div style="margin-top:20px;">
        <h5 style="color:#0a2a50;">📂 文件读取器</h5>
        <div class="form-row">
          <label style="width:auto;">文件编号:</label>
          <input type="text" id="qx2-file" placeholder="QX18_A03_SUB0617">
          <button class="btn btn-secondary" onclick="quickQX18()">读取</button>
        </div>
        <div id="qx2-body"></div>
      </div>`;
  } else {
    err.innerHTML = `<div class="error-box">${r.message}</div>`;
  }
}
async function quickQX18(){
  const code = document.getElementById('qx2-file').value.trim();
  if(!code) return;
  const r = await (await fetch('/api/qx18/file', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({fileCode: code})
  })).json();
  const el = document.getElementById('qx2-body');
  if(r.success){
    const d = r.data;
    el.innerHTML = `<div class="file-reader">
文件: ${code}
ID: ${d.id}  姓名: <span class="red">${d.name}</span>
${d.birthYear?`出生: ${d.birthYear} / ${d.school} / ${d.class}`:''}
${d.experimentDate?`实验日期: <span class="red">${d.experimentDate}</span>`:''}

── 记录 ──
${d.records.map(x=>`· ${x.type||x[0]}: ${x.value||x.status||x[1]}`).join('\n')}

── 结论 ──
<span class="red">${d.finalNote}</span>
</div>`;
  } else el.innerHTML = `<div class="error-box">${r.message}</div>`;
}

// ================== 企业网站 ==================
function renderEnterpriseSite(path, root){
  root.innerHTML = `
    <div class="site-container site-enterprise">
      <div class="site-header">
        <h1>🏢 启明教育科技有限公司</h1>
        <div style="font-size:12px; opacity:.8;">QIMING EDUCATION TECHNOLOGY CO., LTD.</div>
      </div>
      <div class="site-nav" style="background:#30304a;">
        <a id="entnav-home" class="active" onclick="entTab('home', this)">首页</a>
        <a id="entnav-about" onclick="entTab('about', this)">关于我们</a>
        <a id="entnav-business" onclick="entTab('business', this)">业务领域</a>
        <a id="entnav-clients" onclick="entTab('clients', this)">合作案例</a>
        <a id="entnav-internal" style="margin-left:auto; background:#555;" onclick="entTab('internal', this)">🔒 内部员工入口</a>
      </div>
      <div class="site-main" id="ent-main"></div>
      <div class="site-footer" style="background:#252535;">
        © 启明教育科技 · 致力于中国教育的智能化未来<br>
        地址：东川市高新区科技路88号 · 电话：0871-6xxxxxx
      </div>
    </div>`;
  entTab('home');
}
function entTab(t, a){
  document.querySelectorAll('.site-enterprise .site-nav a').forEach(x => x.classList.remove('active'));
  if(a) a.classList.add('active');
  const m = document.getElementById('ent-main');
  if(t === 'home'){
    m.innerHTML = `
      <div class="hero-banner">
        <h2>以科技，点亮每一个课堂</h2>
        <p>启明教育科技 · 专注教育智能化解决方案</p>
      </div>
      <div class="enterprise-grid">
        <div class="enterprise-card"><h4>🎯 个性化学习</h4><p>基于认知科学与大数据分析，为每位学生定制最佳学习路径。</p></div>
        <div class="enterprise-card"><h4>🧠 智能测评</h4><p>多维度学生能力评估系统，精准定位学习短板与潜力方向。</p></div>
        <div class="enterprise-card"><h4>🔬 教育研究</h4><p>联合多所高校与中学，开展前沿教育科学研究。</p></div>
      </div>
      <div style="margin-top:30px; padding:18px; background:#f8f8f8; border-left:4px solid #2c5aa0; font-size:13px; line-height:1.9;">
        <b>🏆 近期项目：</b>2018年3月，我司与东川市第一中学签署战略合作协议，共建"启明星计划（QX-18）"研究基地。
      </div>`;
  } else if(t === 'about'){
    m.innerHTML = `
      <h3 class="page-title">关于启明</h3>
      <div style="font-size:14px; line-height:2; color:#333;">
        <p>启明教育科技有限公司成立于2014年，是一家专注教育智能化解决方案的高新技术企业。</p>
        <h4 style="margin-top:20px; color:#30405a;">创始人兼首席执行官</h4>
        <div style="padding:16px; background:#f0f2fa; border-left:4px solid #5b6aa0;">
          <p><strong>秦明辉 博士</strong></p>
          <p style="font-size:13px; color:#555;">生于<strong>1975年</strong>，教育神经科学博士，曾任东川一中高中部生物教师、东川师范大学教育科学研究所副研究员。</p>
          <p style="font-size:13px; color:#555;">主导公司全部核心研发项目，包括代号"<strong>QX-18</strong>"的启明星计划学生研究项目。</p>
          <p style="text-align:right; font-size:12px; color:#888; font-style:italic;">—— 启明内部邮件常署名为 "<strong>QmHui</strong>"</p>
        </div>
        <h4 style="margin-top:20px; color:#30405a;">公司文化</h4>
        <ul style="padding-left:24px;"><li>求真</li><li>务实</li><li>审慎</li></ul>
      </div>`;
  } else if(t === 'business'){
    m.innerHTML = `
      <h3 class="page-title">业务领域</h3>
      <div class="enterprise-grid" style="grid-template-columns:1fr 1fr;">
        <div class="enterprise-card"><h4>智慧校园解决方案</h4><p>教学管理、校园卡、门禁与监控系统等。</p></div>
        <div class="enterprise-card"><h4>个性化学习平台</h4><p>基于学生画像的自适应学习系统。</p></div>
        <div class="enterprise-card"><h4>教育研究合作</h4><p>代号<b>"QX-18"</b>为东川一中的典型合作案例。研究室设在B楼 B-317。</p></div>
        <div class="enterprise-card"><h4>教师培训服务</h4><p>信息化教学能力培训。</p></div>
      </div>`;
  } else if(t === 'clients'){
    m.innerHTML = `
      <h3 class="page-title">合作案例</h3>
      <ul class="client-list">
        <li>东川市第一中学 <span class="client-tag">战略合作伙伴 · QX-18项目</span></li>
        <li>东川市第三中学 <span class="client-tag">智慧校园</span></li>
      </ul>
      <div style="margin-top:30px;" class="enterprise-card">
        <h4>✨ 明星案例：东川一中 · QX-18</h4>
        <p>2018年3月签署深度合作协议，在该校高三年级中选取<b>志愿者学生</b>开展教育神经科学联合研究。
        研究室设在该校B楼 B-317 学生综合研究室，配备专用数据采集设备与服务器。</p>
      </div>`;
  } else if(t === 'internal'){
    m.innerHTML = `
      <h3 class="page-title">🔒 员工内部系统入口</h3>
      <div class="enterprise-login">
        <h4>📂 内部文档中心</h4>
        <div style="font-size:12px; margin-bottom:14px; color:#999;">
          仅授权员工可访问。<br>
          （访问密码提示：项目代号 + 下划线 + 项目启动年份）<br>
          <span style="color:#666;">附：IT部门密码规范提醒：本公司CEO秦明辉博士的所有办公系统账户统一采用"姓名缩写_项目代号_出生年份"格式——这是他本人在2014年公司成立时定下的格式，8年未曾更换过。为保证安全请定期修改，但他从不改。</span>
        </div>
        <div id="ent-login-err"></div>
        <div class="form-row">
          <label style="width:80px; color:#bbb;">访问密码</label>
          <input type="password" id="ent-pass" placeholder="密码">
        </div>
        <div class="form-row">
          <label style="width:80px; color:#bbb;">文档编号</label>
          <input type="text" id="ent-docid" placeholder="例：INT_2018_0615">
        </div>
        <div class="form-row" style="padding-left:90px;">
          <button class="btn btn-danger" onclick="entLogin()">读取文档</button>
        </div>
        <div id="ent-doc-body" style="margin-top:16px;"></div>
      </div>`;
  }
}
async function entLogin(){
  const pwd = document.getElementById('ent-pass').value;
  const id = document.getElementById('ent-docid').value.trim();
  const err = document.getElementById('ent-login-err');
  const body = document.getElementById('ent-doc-body');
  const r = await (await fetch('/api/enterprise/doc',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({password: pwd, docId: id})
  })).json();
  if(r.success){
    err.innerHTML = '';
    const d = r.data;
    body.innerHTML = `
      <div class="internal-doc">
        <h5>📄 ${d.title}</h5>
        ${d.content.map(l => `<div>${l}</div>`).join('')}
      </div>
      <div class="info-box" style="margin-top:16px;">
      💡 综合结论：<br>
      · 数据复制过程 <b>在许妍进入B-317之前就已经开始</b>（所以18:56有人先进去）<br>
      · 许妍并非实验发起者，甚至不是目标——她是个无法预料的变量。<br>
      · 记忆干预程序启动：解释了其他人为什么会忘记许妍。<br>
      · SUB-0630（就是"我"）：记忆恢复失败——那一天我究竟发生了什么？
      </div>
      <div style="margin-top:20px; text-align:center;">
        <button class="btn btn-danger" style="padding:10px 28px;" onclick="checkEndingAvailable()">🧩 我已经拼齐了所有真相 → 前往B楼</button>
      </div>`;
  } else {
    err.innerHTML = `<div style="color:#ff8080; font-size:12px; margin:6px 0;">${r.message}</div>`;
  }
}

// ================== 结局判定 ==================
function checkEndingAvailable(){
  fetch('/api/state').then(r=>r.json()).then(s => {
    const missing = [];
    if(!s.timelineReconstructed) missing.push('内网"时间校准工具"中重构的正确时间线');
    if(!s.qx18Unlocked) missing.push('启明星计划网站"授权登录"');
    if(!s.enterpriseUnlocked) missing.push('启明教育企业网站"内部文档"');
    if(missing.length > 0){
      alert('你还缺少关键线索：\n\n· ' + missing.join('\n· ') + '\n\n请先完成以上部分。');
      return;
    }
    showConfirm('所有碎片都已拼齐。\n\n现在，你要去B楼吗？\n（许妍在练习册最后留下的话——"如果你想知道真相，就去B楼。今晚。"）', triggerEnding, '最后的选择');
  });
}

async function triggerEnding(){
  const r = await (await fetch('/api/ending',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({finalChoice: 'truth'})
  })).json();
  if(!r.success){ alert(r.message); return; }
  const scr = document.getElementById('ending-screen');
  scr.classList.add('active');
  const textEl = document.getElementById('ending-text');
  const lines = r.ending.text;
  let i = 0;
  (function showLine(){
    if(i >= lines.length){
      setTimeout(showPhoto, 800);
      return;
    }
    const l = lines[i++];
    const p = document.createElement('div');
    p.textContent = l;
    textEl.appendChild(p);
    setTimeout(showLine, l?350:120);
  })();
}

function showPhoto(){
  const ph = document.getElementById('ending-photo');
  ph.innerHTML = `
    <div style="margin-bottom:10px;">📷 东川一中 班级活动照 · EXIF: 2018/06/14 18:42</div>
    <div class="photo-line">
      <div class="person" title="林嘉"></div>
      <div class="person" title="陈放"></div>
      <div class="person" title="苏雨"></div>
      <div class="person special" title="许妍（没有看镜头，她在看我）"></div>
      <div class="person" title="周航"></div>
      <div class="person future" title="2026年的我？？？"></div>
    </div>`;
  setTimeout(() => {
    document.getElementById('ending-photo-back').style.display = 'block';
    document.getElementById('ending-photo-back').textContent = '照片背面：你终于想起来了。';
    setTimeout(showFinal, 1500);
  }, 1600);
}
function showFinal(){
  const finalEl = document.getElementById('ending-final');
  const finalText = `
    <div style="text-align:center; font-size:16px; margin-bottom:20px; color:#ccddee;">
      ════════════════════════════════
    </div>
    我终于想起来了：2018年6月14日那天晚上，我其实没有回家。我去了B楼。
    我站在B-317门口，我看见许妍。她对我说："你不应该来的。"
    然后她把那本数学练习册交给我，她说："如果以后你忘了，就从时间开始查。"

    我忘了。整整八年。

    现在我明白：许妍留下的，不是一份寻找她的线索。
    是一份让我重新找回自己记忆的路线图。
    
    她知道她会消失，也知道我会忘记，所以她把真相拆成了——
    时间、数字、Base64、文件、照片、证词、实验编号。

    因为她懂我：如果答案是别人告诉我的，我也许永远不会相信。
    她要我自己把那一天重新拼出来。

    <div style="text-align:center; font-size:16px; margin-top:20px; color:#ffaaaa; letter-spacing:2px;">
      ════════════════════════════════
      <br>
      2018年6月14日，学校里消失的，不只有许妍。
      <br>
      还有一部分——属于我的记忆。
      <br>
      ════════════════════════════════
    </div>

    <div style="margin-top:30px; text-align:center; color:#668;">
      但……为什么2018年的那张班级照片里，<br>
      <b style="color:#aad;">会有2026年的我？</b>
    </div>

    <div style="margin-top:40px; padding-top:20px; border-top:1px dashed #334; text-align:center; font-size:13px; color:#556;">
      ═══ 《白昼失踪》 · 全剧终 ═══
    </div>
  `;
  let j = 0;
  (function typeFinal(){
    if(j >= finalText.length){ return; }
    finalEl.innerHTML = finalText.substr(0, ++j);
    setTimeout(typeFinal, 20);
  })();
}

// ================== 开始菜单个性化 ==================
function renderStartMenuPersonalized(){
  const list = document.getElementById('start-menu-list');
  if(!list) return;
  const items = list.querySelectorAll('.sm-item');
  const map = { 'sm-me':currentUser==='me', 'sm-xuyan':currentUser==='xuyan', 'sm-principal':currentUser==='principal', 'sm-mentor':currentUser==='mentor', 'sm-teacher':currentUser==='teacher', 'sm-all':true };
  items.forEach(it => {
    let show = false;
    for(const k in map){
      if(it.classList.contains(k) && map[k]){ show = true; break; }
    }
    it.style.display = show ? 'flex' : 'none';
  });
}

// ================== 调查笔记（高三学生·我） ==================
let notesCurrent = 'today';
const NOTES = {
  today: {
    title: '今日待办 · 2026.08.15',
    html: `
      <h4>📌 八年后的今天 · 调查日记第1天</h4>
      <p>许妍失踪已经整整八年。今天我再次打开她的电脑，决心把真相找出来。</p>
      <h5 style="color:#804010; margin-top:16px;">🔎 我的待办清单：</h5>
      <ul class="check-list">
        <li class="done">翻完她的日记（共6篇），找到所有日期和地点线索</li>
        <li>查看所有QQ聊天记录（尤其是6月2日那次）</li>
        <li>把控制面板日期调到2026年8月15日，解锁日记隐藏内容</li>
        <li>破解导员张志强电脑登录密码，看学习系统里的学籍归档痕迹</li>
        <li>进入校园内网查看门禁日志和聊天记录</li>
        <li>从学校官网和企业官网提取校长/导师的生日和密码格式</li>
        <li>登录陈国栋校长账户，看他的办公室门禁总控和校长邮箱</li>
        <li>登录秦明辉导师账户，打开QX18控制台看实验数据</li>
        <li>在时间线工具上，按照"实际时间-系统时间=7分钟"拼出正确顺序</li>
      </ul>
      <p style="margin-top:18px; color:#804010; font-style:italic;">"人会忘，但数据不会"</p>`
  },
  passwords: {
    title: '🧩 密码线索整理',
    html: `
      <h4>整理的所有密码格式</h4>
      <table style="width:100%; font-size:12px; border-collapse:collapse;">
        <tr style="background:#f0e0a0;"><th style="border:1px solid #a08040; padding:6px;">账户</th><th style="border:1px solid #a08040; padding:6px;">规律</th><th style="border:1px solid #a08040; padding:6px;">数值在哪里找</th></tr>
        <tr><td style="border:1px solid #a08040; padding:6px;">许妍 xuyan</td><td style="border:1px solid #a08040; padding:6px;">用户名_地点缩写_日期</td><td style="border:1px solid #a08040; padding:6px;">日记里有B-317、0614</td></tr>
        <tr><td style="border:1px solid #a08040; padding:6px;">张导员 teacher</td><td style="border:1px solid #a08040; padding:6px;">ZhangZQ_2010_DCYZ</td><td style="border:1px solid #a08040; padding:6px;">学校官网-师资队伍</td></tr>
        <tr><td style="border:1px solid #a08040; padding:6px;">陈校长 principal</td><td style="border:1px solid #a08040; padding:6px;">姓氏大写_生日8位_学校缩写</td><td style="border:1px solid #a08040; padding:6px;">学校简介（校长致辞）</td></tr>
        <tr><td style="border:1px solid #a08040; padding:6px;">秦导师 mentor</td><td style="border:1px solid #a08040; padding:6px;">签名缩写_项目代号_出生年</td><td style="border:1px solid #a08040; padding:6px;">企业官网-关于我们</td></tr>
      </table>
      <p style="margin-top:14px; color:#804010;">※ 另外企业内部文档访问密码是 "启明星代号_18" —— 从 QQ6月2日导员聊天里找</p>`
  },
  timeline: {
    title: '⏱️ 时间线分析',
    html: `
      <h4>许妍失踪当天的7分钟偏移</h4>
      <p>许妍的实验编号是 <b>QX18-A03</b>，她的实验编号里有个3，也许和时间偏移有关？</p>
      <h5 style="color:#804010;">目前我手上的时间点：</h5>
      <ul style="line-height:2; padding-left:18px;">
        <li><b>18:41</b>（QQ上的原始消息时间） —— "我去B楼一趟"</li>
        <li><b>19:03</b>（门禁记录） —— 实际应该是 18:56</li>
        <li><b>19:11</b>（日志保存） —— 实际应该是 19:04</li>
        <li><b>19:18</b>（系统时间显示的"最后一次心跳"） —— 实际 19:11</li>
        <li><b>20:13</b>（我发现她失踪） —— 这个时间是对的</li>
      </ul>
      <p style="color:#c00;">⚠ 日记第三页那道"时间序列题"里写了一串数字：<b>18:56 19:03 19:11</b>，等我在学习系统里看到她三模压轴题就能确认</p>`
  },
  contacts: {
    title: '📇 人物关系',
    html: `
      <h4>我目前找到的关键人物</h4>
      <ul style="line-height:2; padding-left:18px;">
        <li><b>许妍</b>：我的好朋友，高三(3)班 · QX18-A03 · 2018/06/14失踪</li>
        <li><b>张志强（导员）</b>：高三(2)班班主任助理，密码是他在QQ里亲口爆的料</li>
        <li><b>陈国栋（校长）</b>：下令删除许妍档案的人，背后是启明教育</li>
        <li><b>秦明辉（导师）</b>：QX18项目发起者，许妍的实验是他在带</li>
        <li><b>夏洁（小夏）</b>：我同桌，第二天一早就忘了许妍是谁</li>
        <li><b>413室友</b>：宿舍群里的同学，当场就没了印象</li>
      </ul>`
  }
};
function renderNotes(){
  const root = document.getElementById('notes-root');
  if(!root) return;
  root.innerHTML = `
    <div class="notes-app">
      <div class="notes-sidebar">
        <h5>📋 笔记分类</h5>
        ${Object.keys(NOTES).map(k => `
          <div class="notes-list-item ${k===notesCurrent?'active':''}" onclick="switchNote('${k}')">${k==='today'?'📅 今日待办':k==='passwords'?'🔑 密码线索':k==='timeline'?'⏱️ 时间线':'👥 人物关系'}</div>
        `).join('')}
      </div>
      <div class="notes-body" id="notes-body">${NOTES[notesCurrent].html}</div>
    </div>`;
}
function switchNote(k){
  notesCurrent = k;
  renderNotes();
}

// ================== B-317实验申请单（许妍） ==================
function renderB317Form(){
  const root = document.getElementById('b317form-root');
  if(!root) return;
  root.innerHTML = `
    <div class="b317-form">
      <div class="stamp">东川一中<br>实验中心<br>审批章<br>2018-03-25</div>
      <h3>启明星教育神经科学研究项目 · 被试申请单</h3>
      <div class="form-section">
        <div class="form-line"><span class="label">项目代号：</span><span class="val"><b>QX-18</b>（东川一中×启明教育）</span></div>
        <div class="form-line"><span class="label">姓名：</span><span class="val">许妍</span></div>
        <div class="form-line"><span class="label">学号：</span><span class="val">2018060308</span></div>
        <div class="form-line"><span class="label">班级：</span><span class="val">高三(3)班</span></div>
        <div class="form-line"><span class="label">申请日期：</span><span class="val">2018年3月25日</span></div>
        <div class="form-line"><span class="label">实验场所：</span><span class="val">B楼 <b>317室</b></span></div>
      </div>
      <div class="form-section">
        <h5>一、被试基本情况自述</h5>
        <p style="text-indent:2em;">本人为高三在读学生，年龄17岁，身体健康，无神经系统疾病史。在学习上对神经科学抱有浓厚兴趣，平时喜欢钻研记忆原理相关的科普文章。综合成绩年级排名前3%，三模成绩702分（含加分）。</p>
      </div>
      <div class="form-section">
        <h5>二、实验内容与周期</h5>
        <p style="text-indent:2em;">本次实验通过"记忆锚定神经刺激仪"对被试的情景记忆进行可控强化，每次实验时长约90分钟。<b>本项目的"记忆锚定"技术可能引起实验者无法区分时间线的情况，会在严格监督下进行</b>。实验周期为 2018/4/1 ~ 2018/6/15，每周2次，共18次。</p>
        <p style="text-indent:2em;">实验编号 <b>QX18-A03</b>（第1批-第3号）。</p>
      </div>
      <div class="form-section">
        <h5>三、监护人签字（手写）</h5>
        <p style="font-family:"华文行楷",cursive; font-size:16px; color:#303080; padding-left:40px;">许建国&nbsp;&nbsp;&nbsp;&nbsp;2018年3月25日</p>
        <div style="font-size:11px; color:#888; margin-top:-4px; padding-left:40px;">（父亲手写 · 字体稍显潦草，疑未仔细阅读后面的风险告知页）</div>
      </div>
      <div class="signature">
        <div class="sign-block">申请人签字<br><span class="signed">许妍</span><br>2018-03-25</div>
        <div class="sign-block">导师签字<br><span class="signed">秦明辉</span><br>2018-03-25</div>
        <div class="sign-block">校方审批<br><span class="signed">陈国栋</span><br>2018-03-25</div>
      </div>
    </div>`;
}

// ================== 邮件系统（导员/校长/导师各不同） ==================
const MAIL_DATA = {
  teacher: {
    title: '📧 校内邮箱 · 张志强 导员',
    folders: [
      { id:'inbox', name:'📥 收件箱', mails:[
        { id:'t1', from:'陈国栋（校长办公室）', subject:'紧急：许妍同学学籍处理统一口径', time:'06-15 08:10', unread:true, body:'志强：\n\n昨晚启明教育那边出了点状况，QX18-A03号被试（高三3班许妍）出现不可逆异常，必须按照"转学"口径处理。\n\n请你立刻做以下几件事：\n1. 对外一律说"许妍同学已于6/14办理转学手续回老家"；\n2. 如遇到同班同学询问（尤其是她同桌那个男生），态度不要太强硬，劝他"接受现实专心复习"；\n3. 我已经派admin账号直接在教务系统执行删除，你这边登录LMS会看到异常痕迹，当作没看见；\n4. 你手里保存的那三模原始卷宗（含许妍数学试卷），今晚务必把试卷上她写的那些"时间戳数字"那一页剪下来销毁。\n\n如果有人问你我的登录密码，不要说——虽然老套，但就按我老习惯来，别改就好。\n\n——陈 2018.06.15 08:08'},
        { id:'t2', from:'秦明辉（启明教育）', subject:'Re: QX18-A03后续处理', time:'06-15 09:22', unread:false, body:'张老师好：\n\n陈校长已经转了你们那边的邮件给我。\n\n需要补充的几点：\n· 许妍的家长联络方式请不要再打过去（他们的记忆已经处理过了）；\n· 你可能会在"学习系统-考勤"里看到B-317门禁时间差7分钟的问题，别慌张——那是"锚定回溯"的副作用之一，我已经把服务器时钟整体向前拨了7分钟，使记录"看起来一致"；\n· 关于我的登录密码——你在企业会议室开项目会那次，我确实念叨了一遍，你听到了就听到了，反正格式都是一样的：QmHui加项目加出生年；\n· 8年后的事情谁也说不准，但理论上说，如果有一个人对许妍的记忆没有被完全抹掉（比如你，或者她的同桌），那在2026年6月中旬是有可能"感知"到她的存在的。\n\n—— 秦 2018.06.15'},
        { id:'t3', from:'admin@dcyz-edu.cn', subject:'[系统通知] 许妍的学籍已完成归档', time:'06-15 08:31', unread:false, body:'操作人：admin（校长办公室直连）\n涉及记录：学籍、成绩、考勤、合影、宿舍、QX-18名单\n归档编号：DC-2018-M0614\n备注：该生所有校内账户已禁用，校园卡作废。'}
      ]},
      { id:'draft', name:'📝 草稿箱', mails:[
        { id:'t4', from:'张志强（草稿）', subject:'（未发出）致秦导师的一封信', time:'06-15 10:30', unread:false, body:'秦导师：\n\n我不敢把这封信发出去，写好了存草稿箱。\n\n许妍的成绩702分我是看着她考出来的，数学压轴题用了那种"7分钟递进数列"的解法她是在B317学来的对吧？我无法接受这样一个女孩从所有人记忆里消失。\n\n所以我保留了：1）三模卷宗原件（含她的时间戳解法页）；2）门禁B-317在06/14的原始日志截图；3）她的B-317实验申请单复印件（藏在我办公桌第二层抽屉的铁盒里，用我自己的登录密码做了文件密码）。\n\n如果8年后真的有人来找她——请把这些证据留给那个人。\n\n—— 张志强（没发出去）'},
      ]},
    ]
  },
  principal: {
    title: '📧 校长办公邮箱 · 陈国栋',
    folders: [
      { id:'inbox', name:'📥 收件箱', mails:[
        { id:'p1', from:'秦明辉（启明教育CEO）', subject:'【最高优先级】QX18-A03锚定异常·请立刻执行数据抹除', time:'06-14 20:45', unread:true, body:'国栋兄：\n\n刚从B-317出来，许妍同学的第7次锚定实验出了问题。我们在最后一次"7分钟时间差测试"环节，她的神经活动出现了"双向锚定"——也就是说，她的一部分意识可能同时存在于2018年和8年后（也就是2026年）。\n\n这种情况按照协议必须：\n1. 请立即启用你的 admin 账户进入LMS系统，执行【强制删除学籍】流程（跳过审批）；\n2. 对外口径统一为"已转学"，全校教职工（包括张志强）必须配合；\n3. 你那边的门禁总控系统请把B-317 06/14下午的日志整体前移7分钟（把 18:41 改成 18:48 等），让进出记录"看起来合理"；\n4. 许妍同学的QX18-A03实验数据不要删除，留给我做后续研究；\n5. 你我的账户密码格式照旧，不要在邮件里写。\n\nP.S. 你我的账户密码，都是当年设的老套路——这个我在企业内部也写在文档里了，防止自己忘。\n\n—— 秦 20:42'},
        { id:'p2', from:'admin@dcyz-edu.cn', subject:'[执行报告] 6/14 晚指令执行完毕', time:'06-14 21:30', unread:false, body:'校长：\n已完成：\n· 删除许妍学籍、成绩、考勤（含关联记录13条）\n· 宿舍413改为3人间\n· 校园卡注销\n· QX18名单状态改为"异常退出"\n· B-317门禁日志整体前移7分钟\n\n有一项无法彻底删除：学习系统每周日自动备份一次数据库，所以上一次备份（dcyz_backup_20180610.sql）中仍有她的完整记录。这部分只有物理访问服务器机房才能删除。'},
        { id:'p3', from:'张志强（导员）', subject:'三模卷宗已存放妥当', time:'06-15 09:00', unread:false, body:'校长：\n您交代的卷宗我已放在办公桌抽屉第二层。原件含许妍那页时间戳解法也保留了。\n另外今天她同桌那个男生来找我，我说"请假了"，后又改口"转学"，语气前后不一致，他可能已起疑心，请知悉。'}
      ]}
    ]
  },
  mentor: {
    title: '📧 企业邮箱 · 秦明辉（启明教育CEO）',
    folders: [
      { id:'inbox', name:'📥 收件箱', mails:[
        { id:'m1', from:'QX18-A03（自动报告）', subject:'⚠ 被试QX18-A03 第7次实验 异常警告【未归档】', time:'06-14 18:56', unread:true, body:'QX18实验控制台 自动告警邮件：\n\n被试：QX18-A03（许妍，17岁，女）\n锚定日期：2018-06-14 18:41（系统日志显示为 18:48）\n\n实验参数：锚定偏移 7分钟 · 第7次 · 双向记忆模式\n\n异常等级：<b style="color:#c00;">S级</b>（不可逆）\n\n描述：被试在双向记忆切换中，出现了"锚定残留"迹象。理论上这意味着：\n1. 被试本人在现实世界中"无法被他人正确感知"（即从他人记忆中消失）；\n2. 同时在 <b>8年后的同月同日（2026-06-14左右）</b>，如果存在一个对被试记忆足够深刻的"锚定者"，便会在那天前后出现"被试信息逐渐重现"的现象（如日记里的隐藏内容自动浮现、系统记录异常出现等）；\n3. 如锚定者能通过数据手段重建时间线，可使"锚定者-被试"双向共振。\n\n—— 本邮件保留于实验数据中，不随任何删除操作消失。\n\n发件人：QX18实验控制台 自动告警系统'},
        { id:'m2', from:'陈国栋（东川一中校长）', subject:'Re: 执行方案回复', time:'06-14 21:00', unread:false, body:'秦总：\n\n我收到你的方案了。今晚就照你说的做。\n你我账户密码多年不改（按你当年那套格式：姓名缩写+项目代号+出生年），你要是忘了就去看企业内部员工登录处的灰色提示文字。\n\n—— 陈 2018.06.14'},
        { id:'m3', from:'研发部-周博士', subject:'A03数据异常分析：偏移7分钟的可能影响', time:'06-14 21:12', unread:false, body:'秦总：\n\n7分钟偏移量在第7次实验后恰好达到"1单位"（7×7=49，取49的个位+十位=13；项目年份18-5=13，自洽）。\n\n这意味着：A03在8年后出现"锚定回溯"时，<b>所有系统记录会比真实时间晚7分钟</b>。只要锚定者能在控制面板中把日期校准到正确的2026年8月（实际锚定日6月14日+2个月缓冲），便可观察到差异。\n\n建议：让校长那边的删除流程务必"保留备份文件"——因为这些数据8年后会自动浮现。'}
      ]},
      { id:'sent', name:'📤 已发送', mails:[
        { id:'m4', from:'秦明辉（我）', subject:'【给8年后的锚定者】· 如果这封邮件被你读到', time:'06-14 21:40', unread:false, body:'致 可能存在的8年后的"你"：\n\n如果你读到了这封邮件（是我主动保存在系统里的），说明许妍真的留下了足够强的锚点——她三模数学压轴题写的那一串时间戳 `18:56 19:03 19:11` 就是密码，能打开学校官网藏着的那一页旧新闻缓存。\n\n我故意没有删除这些数据——因为技术上，一个"完全删除的记忆"是无法被找回的，但如果只是"被覆盖7分钟"，那么只要重建正确顺序就有可能。\n\n记住：QX18控制台里有一张5个被试的数据对比表，<b>A03的所有数值比别人多出一个"7"</b>，这是她的锚点标记。\n\n—— 秦明辉 2018/06/14 21:38'}
      ]}
    ]
  }
};
let mailFolder = 'inbox';
let mailId = null;
function renderMail(){
  // 根据当前用户决定渲染哪套邮箱，并设置窗口标题
  let cfg;
  if(currentUser==='teacher'){ cfg = MAIL_DATA.teacher; }
  else if(currentUser==='principal'){ cfg = MAIL_DATA.principal; }
  else if(currentUser==='mentor'){ cfg = MAIL_DATA.mentor; }
  else { return; }
  document.getElementById('mail-title').textContent = cfg.title;
  const folder = cfg.folders.find(f => f.id === mailFolder);
  const mails = folder ? folder.mails : cfg.folders[0].mails;
  const openMail = mailId || mails[0].id;
  const cur = mails.find(m => m.id === openMail) || mails[0];
  const root = document.getElementById('mail-root');
  if(!root) return;
  root.innerHTML = `
    <div class="mail-app">
      <div class="mail-toolbar">
        <button>📥 收信</button><button>📤 发送</button><button>📝 新建</button>
        <span style="flex:1;"></span>
        <input placeholder="🔍 搜索邮件…" style="padding:4px 8px; font-size:12px; border:1px solid #aaa; width:180px;">
      </div>
      <div class="mail-body">
        <div class="mail-folders">
          ${cfg.folders.map(f=>`
            <div class="mail-folder ${mailFolder===f.id?'active':''}" onclick="switchMailFolder('${f.id}')">${f.name} <span style="float:right;color:#aaa; font-size:11px;">${f.mails.length}</span></div>
          `).join('')}
        </div>
        <div class="mail-list">
          ${mails.map(m=>`
            <div class="mail-item ${openMail===m.id?'active':''} ${m.unread?'unread':''}" onclick="switchMailItem('${m.id}')">
              <div class="from">${m.from}${m.unread?' · 🔴':''}</div>
              <div class="subject">${m.subject}</div>
              <div class="time">${m.time}</div>
            </div>
          `).join('')}
        </div>
        <div class="mail-content">
          <div class="mail-header">
            <h4>${cur.subject}</h4>
            <div class="meta">
              发件人：${cur.from}<br>
              日期：${cur.time}<br>
              收件人：<b>${USERS[currentUser].name}</b>（${USERS[currentUser].role}）
            </div>
          </div>
          <div class="mail-body-text">${cur.body.replace(/\n/g,'<br>')}</div>
        </div>
      </div>
    </div>`;
}
function switchMailFolder(id){ mailFolder = id; mailId = null; renderMail(); }
function switchMailItem(id){ mailId = id; renderMail(); }

// ================== 三模卷宗（导员） ==================
function renderExam(){
  const root = document.getElementById('exam-root');
  if(!root) return;
  root.innerHTML = `
    <div class="exam-scan">
      <div class="stamp-top">东川一中 2018届高三 第三次模拟考试 · 数学 · 教师存档卷</div>
      <div class="score-mark"><div class="n">702</div><div class="l">总分 / 750</div></div>
      <div class="row"><span class="l">考号：</span><span class="v handwrite">2018060308</span></div>
      <div class="row"><span class="l">姓名：</span><span class="v handwrite">许 妍</span></div>
      <div class="row"><span class="l">班级：</span><span class="v handwrite">高三(3)班</span></div>
      <div class="row"><span class="l">语文：</span><span class="v handwrite">132</span> &nbsp; <span class="l">数学：</span><span class="v handwrite">148</span></div>
      <div class="row"><span class="l">英语：</span><span class="v handwrite">140</span> &nbsp; <span class="l">理综：</span><span class="v handwrite">282</span></div>
      <div style="clear:both; margin-top:20px;">
        <div style="font-weight:bold; color:#602020;">————— 以下为 最后一题（压轴题，20分）扫描 —————</div>
        <div class="scribble">
          <div class="title">⚠ 张志强备注：这是许妍在草稿纸空白处写的内容，和题目本身无关</div>
          <div style="font-family:"华文行楷",cursive; color:#203060; font-size:16px;">
            <pre style="margin:0;">
  // 时间序列：相邻两项相差7分钟
  18:41 (QQ上我说我去B楼)
  18:48 (门禁以为我进的时间)
  18:56 (B-317门刷卡)
  19:03 (QX18-A03 第7次启动)
  19:11 (锚定偏移达到7单位)
  19:18 (QX18-A03 心跳断连)
  19:24 (我再也没从317出来)
  19:32 (宿舍开始有人问我去哪了)
  19:47 (班长找不到我)
  20:13 (他发现我消失了)
            </pre>
          </div>
        </div>
        <p style="text-indent:2em;">（题目正文：已知一个时间序列 t₁, t₂, …… 满足 tᵢ₊₁ - tᵢ = 7 分钟，t₃ = 18:56，求 t₁ 和 t₁₀ 的值。）</p>
        <div class="scribble" style="transform:rotate(0.8deg);">
          <div class="title">张志强评语（手写）</div>
          <p style="margin:0;">这孩子……写的不是解题过程，是她自己的失踪时间线啊！我当时候没看出来……陈校长让我"把这页剪下来销毁"，但我还是留着了。<br>
          —— 张 2018/06/15 10:42</p>
        </div>
      </div>
      <div class="teacher-sign">—— 张志强 · 2018.06.15 存档于办公桌抽屉第二层 ——</div>
    </div>`;
}

// ================== 校务管理（校长） ==================
let saNav = 'overview';
function renderSchoolAdmin(){
  const root = document.getElementById('schooladmin-root');
  if(!root) return;
  root.innerHTML = `
    <div class="school-admin">
      <div class="sa-top">
        <div><b>📊 东川一中 · 校务管理平台</b> · 校长端 v2.1</div>
        <div>陈国栋 · 最后登录：2018/06/15 08:02 · 设备：校长办公室PC</div>
      </div>
      <div class="sa-body">
        <div class="sa-side">
          <div class="sa-nav ${saNav==='overview'?'active':''}" onclick="switchSA('overview')">📊 校情总览</div>
          <div class="sa-nav ${saNav==='students'?'active':''}" onclick="switchSA('students')">👥 学籍管理（特殊操作）</div>
          <div class="sa-nav ${saNav==='QX18'?'active':''}" onclick="switchSA('QX18')">⭐ QX18合作</div>
          <div class="sa-nav ${saNav==='directives'?'active':''}" onclick="switchSA('directives')">📜 校长指令记录</div>
        </div>
        <div class="sa-content" id="sa-content"></div>
      </div>
    </div>`;
  renderSAContent();
}
function switchSA(k){ saNav = k; renderSchoolAdmin(); }
function renderSAContent(){
  const c = document.getElementById('sa-content');
  if(!c) return;
  if(saNav === 'overview'){
    c.innerHTML = `
      <h3>📊 校情总览 · 2018年6月</h3>
      <div class="sa-card">
        <table class="sa-table">
          <tr><th>项目</th><th>数值</th><th>对比上月</th></tr>
          <tr><td>在校学生数</td><td>2098 <span style="color:#888;">(原2099，-1)</span></td><td style="color:#c00;">- 许妍</td></tr>
          <tr><td>启明星(QX-18)项目人数</td><td>4 <span style="color:#888;">(原5，-1)</span></td><td style="color:#c00;">- QX18-A03</td></tr>
          <tr><td>教师人数</td><td>210</td><td>无变化</td></tr>
          <tr><td>合作项目进度</td><td style="color:#c00;">QX-18 异常处理中</td><td>⚠</td></tr>
        </table>
      </div>
      <div class="sa-card warn">
        <b>最近异常提醒：</b>2018/06/15 08:31 校长办公室(admin)删除了一名学生的档案。该操作未走正常审批流程，系统已记录。<br>
        执行审批：校长本人（陈国栋，工号 T20030101）签字确认。
      </div>`;
  } else if(saNav === 'students'){
    c.innerHTML = `
      <h3>👥 学籍管理 · 特殊操作记录（仅校长可见）</h3>
      <div class="sa-card danger">
        <b style="color:#c00;">【特殊删除 · 2018/06/14 21:08 执行】</b><br>
        目标：高三(3)班 · 学号 <b>2018060308 · 许妍</b><br>
        触发人：校长办公室 admin（使用校长授权密钥执行）<br>
        范围：学籍、成绩、考勤、照片、宿舍、校园卡、QX18入选资格<br>
        原因：<b>QX18-A03 异常（S级，机密）</b><br>
        对外口径：<b>转学（回老家）</b><br>
        <span style="color:#a00;">⚠ 操作日志不可彻底删除，仍可在"已归档学生"栏目及LMS系统中查到痕迹。</span>
      </div>
      <div class="sa-card">
        仍保留的痕迹（无法通过校长端删除）：
        <ul>
          <li>学习管理系统 · 操作日志（张志强账户仍可见）</li>
          <li>学习管理系统 · 已归档学生（归档编号 DC-2018-M0614）</li>
          <li>门禁总控原始记录（物理日志不可修改）</li>
          <li>服务器自动备份 <code style="background:#f0f0ff; padding:2px 6px;">dcyz_backup_20180610.sql</code>（存在机房）</li>
          <li>张志强手里：三模卷宗原件（已写入备忘录）</li>
        </ul>
      </div>`;
  } else if(saNav === 'QX18'){
    c.innerHTML = `
      <h3>⭐ 启明星计划(QX-18) · 校方-企业合作页</h3>
      <div class="sa-card warn">
        <b>合作时间：</b>2018年3月启动 · 为期1学期<br>
        <b>企业方联系人：</b>秦明辉（启明教育CEO / QX18项目总师）<br>
        <b>校方负责人：</b>陈国栋（我本人）<br>
        <b>实验场地：</b>B楼 B-317 实验室<br>
        <b>合同条款关键段：</b>
        <p style="margin:8px 0; padding:8px; background:#fff8e0; border:1px solid #e0c080;">
          因实验性质特殊（记忆相关），如出现S级异常，校方须配合完成：① 学籍/记录抹除；② 对外统一口径管理；③ 校内设备日志的必要修正（时间偏移 ≤10 分钟）。
        </p>
      </div>
      <div class="sa-card danger">
        <b>2018/06/14 应急沟通记录（校长本人手记）：</b><br>
        · 18:56 秦导师第一次电话告知A03异常<br>
        · 19:30 第二次电话，结论："必须抹除"<br>
        · 20:45 收到秦导师邮件详细指令<br>
        · 21:00 调用admin账户启动LMS删除流程<br>
        · 21:30 同时在门禁总控端统一将B317时间戳前移7分钟（4项记录）<br>
        · 次日 08:10 邮件通知张志强"统一口径"
      </div>`;
  } else if(saNav === 'directives'){
    c.innerHTML = `
      <h3>📜 校长指令记录</h3>
      <div class="sa-card">
        <b style="color:#c00;">📌 【第 2018-06-14-01 号】紧急：许妍同学事件处理</b>
        <p>全体教职工（尤其高三年级班主任助理）：</p>
        <p>① 对外口径——许妍同学已于2018年6月14日办理转学手续回原籍，不再返校；</p>
        <p>② 如遇原班级同学询问，一律回复"官方信息就是这样"，严禁讨论、严禁私下查看LMS系统归档痕迹；</p>
        <p>③ 任何纸质文件（成绩单、卷宗、照片）涉及许妍的，由各班主任助理统一回收并由校长室销毁。</p>
        <p style="text-align:right; color:#5a3010; margin-top:10px;">—— 校长 陈国栋 2018/06/15 08:05</p>
      </div>
      <div class="sa-card">
        <b>【第 2018-06-14-02 号】内部：B-317门禁时间戳统一调整</b>
        <p>为配合企业方实验设备校准，请使用门禁总控端：选择 B-317 实验室 · 06/14 18:00-20:00 时段 · 整体向左偏移 <b>7 分钟</b>。</p>
        <p style="text-align:right; color:#5a3010;">—— 校长 陈国栋 2018/06/14 21:32</p>
      </div>`;
  }
}

// ================== 门禁总控（校长） ==================
let acGate = 'B317';
const GATES = [
  { id:'A1', name:'A楼一楼正门', last:'2018/06/14 17:58 最后出入' },
  { id:'B1', name:'B楼一楼正门', last:'2018/06/14 18:48 · ⚠ 已修改' },
  { id:'B317', name:'B楼317 启明星实验室', last:'2018/06/14 19:03 · ⚠ 已修改' },
  { id:'C1', name:'C楼一楼正门', last:'2018/06/14 18:02' },
  { id:'DORM4', name:'女生宿舍4号楼', last:'2018/06/14 22:15' },
  { id:'ADM3', name:'行政楼3楼（校长办公层）', last:'2018/06/15 07:50' },
];
const AC_LOGS = {
  B317: [
    { tag:'enter', time:'2018/06/14 18:48', text:'学号2018060308（许妍）刷卡进入', note:'系统记录时间（原始为18:41，已前移7分钟）' },
    { tag:'enter', time:'2018/06/14 18:49', text:'QX18实验员秦明辉刷卡进入', note:'正常' },
    { tag:'edit',  time:'2018/06/14 21:32', text:'⚠ 管理员修改该日时间段日志（-7分钟）', note:'校长办公室PC（陈国栋）发起' },
    { tag:'enter', time:'2018/06/14 19:03', text:'学号2018060308 刷卡进入B-317内间', note:'【系统记录】实际时间应为 18:56' },
    { tag:'alert', time:'2018/06/14 19:11', text:'⚠ 实验室"心跳"信号出现异常', note:'系统记录偏移后时间为19:18' },
    { tag:'alert', time:'2018/06/14 19:32', text:'⚠ 超过2小时未刷卡出门，未触发"未离开报警"（系统已屏蔽）', note:'校长办公室于21:33启用屏蔽' },
    { tag:'exit',  time:'2018/06/14 20:05', text:'秦明辉刷卡离开B317', note:'独自离开，未带其他人员' },
    { tag:'edit',  time:'2018/06/14 21:35', text:'⚠ 系统记录再次被整理', note:'删除了"2018/06/14 19:11之后许妍学号的任何记录"' },
  ],
  B1: [
    { tag:'enter', time:'2018/06/14 18:48', text:'学号2018060308（许妍）刷卡进入B楼', note:'【系统记录】实际应为 18:41（前移7分钟）' },
    { tag:'exit',  time:'2018/06/14 20:06', text:'秦明辉刷卡出B楼', note:'正常' },
    { tag:'edit',  time:'2018/06/14 21:32', text:'⚠ 时间段18:00~20:00整体向左偏移7分钟', note:'由校长办公室PC发起' },
  ],
  ADM3: [
    { tag:'enter', time:'2018/06/14 21:00', text:'校长（工号T20030101）刷卡进入', note:'晚21:00进入3楼办公层（非正常上班时间）' },
    { tag:'exit',  time:'2018/06/15 00:12', text:'校长刷卡离开', note:'深夜停留3小时12分钟' },
    { tag:'enter', time:'2018/06/15 07:50', text:'校长刷卡进入', note:'比平时早1小时' },
  ],
};
function renderAccessControl(){
  const root = document.getElementById('accesscontrol-root');
  if(!root) return;
  const logs = AC_LOGS[acGate] || [];
  root.innerHTML = `
    <div class="access-ctrl">
      <div class="ac-header">
        <div><span class="status-dot"></span> DCYZ · 校园门禁总控中心 v1.2 · 连接正常</div>
        <div>操作终端：校长办公室 · 权限：最高级</div>
      </div>
      <div class="ac-body">
        <div class="ac-gates">
          ${GATES.map(g=>`
            <div class="ac-gate ${acGate===g.id?'active':''}" onclick="switchAC('${g.id}')">
              <span class="gate-name">🔐 ${g.name}</span>
              <span class="gate-time">${g.last}</span>
            </div>
          `).join('')}
        </div>
        <div class="ac-log">
          <div style="color:#a0e0ff; margin-bottom:8px;">━━ 【 ${GATES.find(g=>g.id===acGate).name} 】· 原始日志（管理员修改可见） ━━</div>
          ${logs.map(l=>`
            <div class="ac-log-entry">
              <span class="tag ${l.tag}">${l.tag==='enter'?'进入':l.tag==='exit'?'离开':l.tag==='edit'?'日志修改':'⚠ 警报'}</span>
              <span style="color:#a0c0e0;">[${l.time}]</span> ${l.text}<br>
              <span style="color:#608090; font-size:11px; margin-left:60px;">· ${l.note}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
}
function switchAC(id){ acGate = id; renderAccessControl(); }

// ================== QX18控制台（导师） ==================
let qxSubject = 'A03';
const QX_SUBJECTS = [
  { id:'A01', name:'周明轩', status:'s', statusText:'S稳定 · 实验中' },
  { id:'A02', name:'李雨欣', status:'s', statusText:'S稳定 · 实验中' },
  { id:'A03', name:'许妍',   status:'a', statusText:'A异常 · 锚定残留(8年)' },
  { id:'A04', name:'陈昊',   status:'s', statusText:'S稳定 · 实验中' },
  { id:'A05', name:'刘思琪', status:'e', statusText:'E退出 · 本人主动' },
];
function renderQX18Console(){
  const root = document.getElementById('qx18console-root');
  if(!root) return;
  const s = QX_SUBJECTS.find(x => x.id === qxSubject);
  const isA03 = qxSubject === 'A03';
  root.innerHTML = `
    <div class="qx18-console">
      <div class="qx-header">
        <div class="qx-project">◎ QX-18 神经锚定实验控制台</div>
        <div class="qx-ver">v0.9.2 · Build 20180614 · 启明教育神经科学实验室</div>
      </div>
      <div class="qx-body">
        <div class="qx-panels">
          <div class="qx-panel">
            <h5>⚙ 基本参数</h5>
            <div class="metric"><span class="k">实验编号:</span><span class="v">QX18-${qxSubject}</span></div>
            <div class="metric"><span class="k">被试姓名:</span><span class="v">${s.name}</span></div>
            <div class="metric"><span class="k">当前状态:</span><span class="v ${isA03?'danger':''}">${s.statusText}</span></div>
            <div class="metric"><span class="k">启动日期:</span><span class="v">2018-04-01</span></div>
            <div class="metric"><span class="k">已完成次数:</span><span class="v ${isA03?'warn':''}">${isA03?'7/18（中断）':'第12次'}</span></div>
          </div>
          <div class="qx-panel">
            <h5>📡 锚定偏移量(标准=7)</h5>
            <div class="metric"><span class="k">理论值:</span><span class="v">7 分钟/次</span></div>
            <div class="bar-outer"><div class="bar-inner" style="width:${isA03?100:42}%;"></div></div>
            <div class="metric"><span class="k">累计累计偏移:</span><span class="v ${isA03?'danger':''}">${isA03?'49分钟（=7×7次）':'≈29分钟'}</span></div>
            <div class="metric"><span class="k">8年后的回溯日:</span><span class="v ${isA03?'danger':''}">${isA03?'2026-06-14 ± 60日':'—'}</span></div>
          </div>
          <div class="qx-panel">
            <h5>🧠 神经共振强度(单位S)</h5>
            <div class="metric"><span class="k">左半球海马体:</span><span class="v">${isA03?'S++ (越界)':'S+ 正常'}</span></div>
            <div class="bar-outer"><div class="bar-inner ${isA03?'danger':''}" style="width:${isA03?95:55}%;"></div></div>
            <div class="metric"><span class="k">右半球杏仁核:</span><span class="v ${isA03?'danger':''}">${isA03?'S++ (越界)':'S- 正常'}</span></div>
            <div class="bar-outer"><div class="bar-inner ${isA03?'danger':''}" style="width:${isA03?92:40}%;"></div></div>
          </div>
          <div class="qx-panel">
            <h5>⚠ S级异常报告${isA03?' · A03专属':''}</h5>
            ${isA03?`
            <div class="metric"><span class="k">异常级别:</span><span class="v danger">S级 - 不可逆</span></div>
            <div class="metric"><span class="k">现实表现:</span><span class="v danger">他人记忆不可感知</span></div>
            <div class="metric"><span class="k">预计回溯日:</span><span class="v warn">2026年6月中旬~8月</span></div>
            <div class="metric"><span class="k">记忆锚定者:</span><span class="v">同桌（高三2班 · 我）</span></div>
            <div class="metric"><span class="k">回溯触发条件:</span><span class="v warn">重建10个时间点顺序</span></div>
            `:`
            <div class="metric"><span class="k">异常级别:</span><span class="v">无 / 可控</span></div>
            <div class="metric"><span class="k">下次实验时间:</span><span class="v">2018-06-17 19:00</span></div>
            <div class="metric"><span class="k">累计偏差:</span><span class="v">+1.2分钟（在限内）</span></div>
            <div class="metric"><span class="k">备注:</span><span class="v">${qxSubject==='A05'?'本人申请退出，未留锚定':'实验正常进行'}</span></div>
            `}
          </div>
        </div>
        <div class="qx-side">
          <h5>👥 被试列表(5)</h5>
          ${QX_SUBJECTS.map(x=>`
            <div class="qx-subject ${qxSubject===x.id?'active':''}" onclick="switchQX('${x.id}')">
              <div><span class="id">${x.id}</span><span class="name">${x.name}</span></div>
              <div class="status ${x.status}">● ${x.statusText}</div>
            </div>
          `).join('')}
          <h5 style="margin-top:12px;">📊 数据提醒</h5>
          <div style="font-size:11px; line-height:1.7; color:#8060c0;">
            · QX18-A03的所有指标比其他4名被试<br>&nbsp;&nbsp;多出一个"7"的偏移量<br>
            · 7×7=49 → 个位+十位=13 →<br>&nbsp;&nbsp;18岁-5年=13，自洽公式成立<br>
            · 这会导致她的锚定残留<span style="color:#ff8080;">持续8年</span>
          </div>
        </div>
      </div>
    </div>`;
}
function switchQX(id){ qxSubject = id; renderQX18Console(); }

// ================== 数据分析面板（导师） ==================
function renderDataView(){
  const root = document.getElementById('dataview-root');
  if(!root) return;
  root.innerHTML = `
    <div class="data-view">
      <div class="dv-top">
        <span style="font-weight:bold; color:#1a3a60;">📈 QX-18项目 · 实验数据分析面板</span>
        <span style="flex:1;"></span>
        被试筛选：<select><option>全部5人</option><option>A03(许妍)</option></select>
        维度：<select><option>锚定偏移量</option><option>神经共振强度</option><option>记忆保留率</option></select>
      </div>
      <div class="dv-body">
        <div class="dv-chart">
          <h4>🧭 每次实验锚定偏移量（分钟）</h4>
          <svg viewBox="0 0 300 180">
            <!-- axis -->
            <line x1="20" y1="20" x2="20" y2="150" stroke="#a0a8b0"/>
            <line x1="20" y1="150" x2="290" y2="150" stroke="#a0a8b0"/>
            <!-- grid -->
            <line x1="20" y1="90" x2="290" y2="90" stroke="#e0e4e8" stroke-dasharray="3,3"/>
            <!-- A01-A05 bars -->
            <g font-size="10" fill="#666" text-anchor="middle">
              <rect x="30"  y="110" width="26" height="40" fill="#4080ff"/>
              <rect x="70"  y="100" width="26" height="50" fill="#4080ff"/>
              <rect x="110" y="30"  width="26" height="120" fill="#c00"/>
              <rect x="150" y="105" width="26" height="45" fill="#4080ff"/>
              <rect x="190" y="120" width="26" height="30" fill="#4080ff"/>
              <text x="43"  y="170">A01</text>
              <text x="83"  y="170">A02</text>
              <text x="123" y="170" fill="#c00"><b>A03</b></text>
              <text x="163" y="170">A04</text>
              <text x="203" y="170">A05</text>
              <text x="250" y="30">↑ 7min标准</text>
              <line x1="20" y1="85" x2="290" y2="85" stroke="#ff8040" stroke-dasharray="4,4"/>
            </g>
          </svg>
          <div class="caption">QX18-A03 明显超出其他被试 · 达到 49分钟（7×7）</div>
        </div>
        <div class="dv-chart">
          <h4>🧠 神经共振强度对比（S+为安全阈值）</h4>
          <svg viewBox="0 0 300 180">
            <line x1="20" y1="20" x2="20" y2="150" stroke="#a0a8b0"/>
            <line x1="20" y1="150" x2="290" y2="150" stroke="#a0a8b0"/>
            <polyline fill="none" stroke="#c040ff" stroke-width="2"
              points="30,90 70,80 110,30 150,85 190,100 230,90"/>
            <circle cx="110" cy="30" r="5" fill="#c00"/>
            <line x1="20" y1="60" x2="290" y2="60" stroke="#ff8040" stroke-dasharray="4,4"/>
            <g font-size="10" fill="#666" text-anchor="middle">
              <text x="30"  y="170">A01</text>
              <text x="70"  y="170">A02</text>
              <text x="110" y="170" fill="#c00"><b>A03</b></text>
              <text x="150" y="170">A04</text>
              <text x="190" y="170">A05</text>
            </g>
            <text x="220" y="56" font-size="10" fill="#ff8040">S+阈值线</text>
          </svg>
          <div class="caption">A03突破S+阈值，触发双向锚定残留（S级不可逆）</div>
        </div>
        <div class="dv-chart full">
          <h4>📋 5名被试详细数据对比（高亮A03异常）</h4>
          <table class="dv-table">
            <tr>
              <th>编号</th><th>姓名</th><th>实验次数</th><th>累计偏移</th><th>海马体强度</th><th>杏仁核强度</th><th>偏移/次</th><th>状态</th>
            </tr>
            <tr>
              <td>A01</td><td>周明轩</td><td>12</td><td>24分钟</td><td>S</td><td>S-</td><td>2.0分钟</td><td>✅ 实验中</td>
            </tr>
            <tr>
              <td>A02</td><td>李雨欣</td><td>11</td><td>29分钟</td><td>S+</td><td>S</td><td>2.6分钟</td><td>✅ 实验中</td>
            </tr>
            <tr class="special">
              <td>A03</td><td>许妍</td><td>7（中断）</td><td>🟥 49分钟</td><td>🟥 S++（越界）</td><td>🟥 S++（越界）</td><td>🟥 7分钟</td><td>🚨 锚定残留8年</td>
            </tr>
            <tr>
              <td>A04</td><td>陈昊</td><td>13</td><td>27分钟</td><td>S+</td><td>S</td><td>2.1分钟</td><td>✅ 实验中</td>
            </tr>
            <tr>
              <td>A05</td><td>刘思琪</td><td>6（退出）</td><td>15分钟</td><td>S-</td><td>S-</td><td>2.5分钟</td><td>📤 已退出</td>
            </tr>
          </table>
          <div class="caption" style="margin-top:10px;">
            🔍 <b>解谜提示：</b>只有A03的"每偏移/次"一栏恰好是<b>7分钟</b>——与日志里的时间差、数学压轴题的时间序列步长一致。<br>
            这组数据可与：三模卷宗 · 压轴题草稿、QQ里许妍5月聊天、学习系统 · 门禁考勤三处相互印证。
          </div>
        </div>
      </div>
    </div>`;
}

// ================== 启明内网通（校长/导师专用加密通讯） ==================
// ===== 陈国栋 校长视角（5 组会话）=====
const imContacts_PRINCIPAL = [
  {
    id: 'p-qh',
    name: '秦明辉（启明教育 CEO）',
    avatarText: '秦',
    avatarLevel: 'level-a',
    unread: 3,
    chats: [
      { time: '2018-06-14 18:20', divider: true, text: '6月14日 · 下午 · 绝密' },
      { me: false, text: '陈校长，今晚A03必须闭环。数据显示她的海马体异常放电，已经在"泄露记忆"。' },
      { me: true, text: '我知道了，我会亲自到B-317观察。费用方面你们到账了吗？' },
      { me: false, text: '第二笔500万昨天已到你海外账户。收尾完成再打300万，合同即结束。' },
      { me: true, text: '她那个同桌（我）记忆力太强，也需要处理。' },
      { me: false, text: '已经给张志强发指令了。今晚一起修掉。<strong>张志强本人当年也是我们的C级被试，他不敢不听话。</strong>' },
      { me: true, text: '上一个"不听话"的C级被试是谁？我记得是个学生家长...' },
      { me: false, text: '林晓的父亲。被处理后他已经不记得有过女儿了。<strong>很完美。</strong>' },
    ]
  },
  {
    id: 'p-zq',
    name: '张志强（高三2班 导员）',
    avatarText: '张',
    avatarLevel: 'level-c',
    unread: 0,
    chats: [
      { time: '2018-06-14 19:05', divider: true, text: '6月14日 今晚' },
      { me: true, text: '许妍已经进B-317了' },
      { me: false, text: '好。所有接触过她的人，明天上班前处理完。' },
      { me: true, text: '校长，她那个同桌，今天在找她，要不要...' },
      { me: false, text: '一起处理。<strong>留着那个女孩是隐患，她记忆力太好了。</strong>' },
      { me: true, text: '明白了。那家长那边？' },
      { me: false, text: '家长明天会接到"转学"通知。秦明辉那边费用已经打过去了，这次封口没问题。' },
      { me: true, text: '校长，我心里有点难受...她才17岁' },
      { me: false, text: '小张，你当年也是我招进来的。<strong>你想想自己的记忆是谁修的？</strong>' },
      { me: true, text: '......我知道了。' },
    ]
  },
  {
    id: 'p-zhou',
    name: '周博士（启明教育 CTO · 首席科学家）',
    avatarText: '周',
    avatarLevel: 'level-b',
    unread: 1,
    chats: [
      { time: '2018-06-13 23:40', divider: true, text: '6月13日 深夜 · 警告' },
      { me: false, text: '陈校长，我需要跟您直说了：QX18的7分钟偏移模型目前在A03身上出现了不可控回退。<strong>她的记忆无法被完全覆盖，有一部分在"外泄"。</strong>' },
      { me: true, text: '什么意思？外泄到哪里？' },
      { me: false, text: '到她接触过的人身上。比如她的同桌（我）、她的室友小夏。<strong>这两个人现在可能还能零星想起许妍存在过。</strong>' },
      { me: true, text: '有什么后果？' },
      { me: false, text: '如果不处理，最终可能发生"逆传染"：被试反而从记忆删除态恢复。<strong>最坏情况是整个QX18实验曝光。</strong>' },
      { me: true, text: '明白了。今晚A03收闭环之后，马上把她的同桌一并处理。' },
    ]
  },
  {
    id: 'p-admin',
    name: '行政部通知频道',
    avatarText: '通',
    avatarLevel: 'level-c',
    unread: 5,
    chats: [
      { time: '2018-06-10 14:10', divider: true, text: '系统公告' },
      { me: false, text: '【系统】B-317门禁日志权限已授予用户：陈国栋（权限等级：总控）' },
      { me: false, text: '【系统】2018-06-02 服务器时间 18:58-18:59 的访问日志已被管理员（admin_chen）手动清除。' },
      { time: '2018-06-14 18:55', divider: true, text: '今日 18:55' },
      { me: false, text: '【门禁】B楼B-317房间：用户"许妍"进入。刷卡时间：18:57:42。' },
      { me: false, text: '【门禁】<strong>记录已覆盖。</strong>新记录：B楼B-317房间 许妍 刷卡时间：19:03:42（+361秒偏移）' },
      { me: false, text: '【警告】B-317房内心率检测异常。<strong>被试A03脉搏：168。</strong>' },
    ]
  },
  {
    id: 'p-jiaoyu',
    name: '市教育局 王秘书',
    avatarText: '教',
    avatarLevel: 'level-b',
    unread: 0,
    chats: [
      { time: '2018-06-08 11:20', divider: true, text: '6月8日' },
      { me: false, text: '陈校长，今年的启明星二期经费已经批下来了，一共800万。其中有300万要走启明教育的合作账户，您那边安排好流程。' },
      { me: true, text: '收到，感谢王秘书关照。' },
      { me: false, text: '关照归关照，<strong>别再搞出那种"转学"的事了</strong>，今年已经三起，家长们已经有人在问了。' },
      { me: true, text: '明白，最后一年了，收尾一定干净。' },
    ]
  }
];

// ===== 秦明辉 导师/CEO 视角（5 组会话）=====
const imContacts_MENTOR = [
  {
    id: 'm-chen',
    name: '陈国栋（东川一中 校长）',
    avatarText: '陈',
    avatarLevel: 'level-a',
    unread: 2,
    chats: [
      { time: '2018-04-01 09:00', divider: true, text: '4月 · 启动启明星三期' },
      { me: false, text: '秦总，这次三期实验的5名被试已经敲定了，名单：林晓（已退出）→ 补许妍A03，其他4人不变。' },
      { me: true, text: '好。许妍的脑扫描图我看过，海马体活跃度是常人的1.8倍，<strong>完美的7分钟共振体。</strong>' },
      { time: '2018-06-14 18:20', divider: true, text: '今日 18:20' },
      { me: false, text: '我亲自去B-317看。你那设备别出什么问题。' },
      { me: true, text: '放心陈校长。QX18 Mk III 已经完成147次闭环，<strong>唯一风险是A03记忆回退</strong>，我已经让周博士准备了双重覆盖。' },
      { me: false, text: '双重覆盖会把她弄成植物人吗？' },
      { me: true, text: '不会。但会让她<strong>永远想不起自己是谁</strong>。' },
    ]
  },
  {
    id: 'm-zhou',
    name: '周博士（CTO · 首席科学家）',
    avatarText: '周',
    avatarLevel: 'level-b',
    unread: 0,
    chats: [
      { time: '2018-06-14 18:40', divider: true, text: '今日 18:40 · A03紧急' },
      { me: true, text: 'A03已经在路上。设备校准了吗？' },
      { me: false, text: '校准了。但我必须再次提醒您：A03的"7分钟偏移"与她数学压轴题的时间序列相同——这意味着她已经在"下意识记录自己被消除的时间差"。<strong>这是之前任何被试都没有出现过的认知反抗。</strong>' },
      { me: true, text: '那就做完这一轮直接上Mk IV，双重覆盖。' },
      { me: false, text: 'Mk IV的副作用报告还没走完FDA流程，您确定吗？' },
      { me: true, text: '如果她活下来并记起一切，我们所有人都要进监狱。<strong>这比FDA的罚单严重。</strong>' },
      { me: false, text: '明白。我立刻调整方案。' },
      { time: '2018-06-14 19:00', divider: true, text: '19:00 · 实验中' },
      { me: false, text: 'A03心率168，有流泪反应，嘴里在念"你要记得我"...<strong>她似乎在向外传输什么信息</strong>。' },
      { me: true, text: '阻断！立刻阻断她的语言区电信号！' },
    ]
  },
  {
    id: 'm-chat',
    name: '启明核心组（5人群）',
    avatarText: '核',
    avatarLevel: 'level-a',
    unread: 4,
    chats: [
      { time: '2018-06-14 19:06', divider: true, text: '今日 收尾会议' },
      { me: false, text: '周CTO：A03的最终扫描图已归档。偏移量稳定+7:00。' },
      { me: false, text: '法务李：家长那边合同都签好了。明天一早送"转学通知书"，附带封口费转账。' },
      { me: false, text: '财务刘：5名被试家庭各转账80万已就绪。陈校长分成300万+前期500万，总计800万。' },
      { me: true, text: '我（秦明辉）：好。<strong>下一站：启明星四期。目标：下一届高三年级。</strong>' },
      { me: false, text: '陈校长（校长号）：四期学校这边我来安排。<strong>记忆修改的实验数据，你们必须留底，别跟三期一起删了。</strong>' },
      { me: true, text: '明白。三期数据会在今晚同步到企业邮箱冷备份，加密压缩包，<strong>密码：QmHui_QX18_1975</strong>。' },
    ]
  },
  {
    id: 'm-xy',
    name: '许妍（A03 被试 · 实验沟通专线）',
    avatarText: 'A03',
    avatarLevel: 'level-c',
    unread: 0,
    chats: [
      { time: '2018-04-18 09:12', divider: true, text: '4月 · 初次招募' },
      { me: true, text: '许妍同学，你的大脑活跃度测试结果很优秀，想不想加入我们启明星项目？' },
      { me: false, text: '秦老师，这个项目是做什么的？' },
      { me: true, text: '我们在研究<strong>人类记忆的可编辑性</strong>，可以帮助你消除不愉快的记忆。高考推荐15分。' },
      { time: '2018-06-14 18:45', divider: true, text: '今日 18:45 · 最后对话' },
      { me: true, text: '到了没有？在B-317门口等你，陈校长已到。' },
      { me: false, text: '在路上。秦老师，今天结束之后我可以退出项目吗？' },
      { me: true, text: '先到了再说。' },
      { time: '2018-06-14 18:57', divider: true, text: '18:57 · 已刷卡进入 · 消息无法再发送' },
      { me: true, text: '许妍同学？请回答。【消息未送达：对方已离线】' },
    ]
  },
  {
    id: 'm-future',
    name: 'Myself（给 8年后的我）',
    avatarText: '我',
    avatarLevel: 'level-a',
    unread: 1,
    chats: [
      { time: '2018-06-14 19:25', divider: true, text: '19:25 · 实验圆满结束 · 写给将来' },
      { me: true, text: '秦明辉，如果你在2026年的某个时候看到这条消息——\n启明星计划 QX18 Mk III 的备份数据，已同步至：\n企业邮箱 · 冷备份文件夹 · "三期闭环_归档.rar"\n解压密码：<strong>QmHui_QX18_1975</strong>\n里面包含5名被试的完整生物数据、海马体扫描、以及陈校长合作协议的扫描件（含他个人签名的洗钱路径图）。\n\n<strong>万一某天我"忘记"了自己做过什么，请打开这份备份——我不会原谅一个脱罪的自己。</strong>\n\n——2018年6月14日 19:25 秦明辉 于 B-317 控制台' },
    ]
  }
];

// ===== 启明内网通 低权限版本 =====
// 张志强（导员）—— C-1级 访客：只能看到"系统公告 + 项目进度通知 + 人事任命"3条单向通知通道，无法访问核心机密，对方无法回复
const imContacts_TEACHER_LOW = [
  {
    id: 'lp-notice',
    name: '【系统公告】启明教育专线 · 只读频道',
    avatarText: '公',
    avatarLevel: 'level-c',
    unread: 2,
    chats: [
      { time: '2018-06-09 08:00', divider: true, text: '系统公告（单向，仅管理员可发言）' },
      { me: false, text: '【通知】v2.3 专线客户端已正式启用，强制加密模式：AES-256。若出现"证书错误"提示请联系启明 IT（内线 8800）' },
      { time: '2018-06-12 17:30', divider: true, text: '6/12 17:30' },
      { me: false, text: '【人事】高三（2）班班主任助理 <b>张志强</b> 权限调整：C-1 级访客，可访问：<br>· 启明星项目名单（摘要版）<br>· 学校-启明联合考勤<br>· 内部通知频道<br>⚠ 禁止访问：<b>A系列被试档案 / QX18控制台 / 冷备份邮件</b>' },
      { time: '2018-06-14 22:05', divider: true, text: '今晚 22:05' },
      { me: false, text: '【紧急】关于高三学生许妍的统一口径：<br>　　从即刻起，任何对外询问一律回复："<b>该生6月13日办理转学，家长亲自接送</b>"。<br>　　如被追问，请转介校长办公室或启明教育对口对接人。<br>　　<b>本消息 10 分钟后自动销毁。</b>' },
    ]
  },
  {
    id: 'lp-schedule',
    name: '启明星三期 · 进度通知（只读）',
    avatarText: '⏱',
    avatarLevel: 'level-b',
    unread: 1,
    chats: [
      { time: '2018-05-02 09:00', divider: true, text: '里程碑' },
      { me: false, text: '【进度 · 0/5】启明星三期招募启动：5名被试确定，协议签字完成。' },
      { me: false, text: '【进度 · 1/5】第一次记忆锚定测试：全员通过。' },
      { me: false, text: '【进度 · 2/5】第二次偏移测试（+1 min 小样本）：成功。' },
      { me: false, text: '【进度 · 3/5】第三次偏移测试（+7 min 全量）：全员通过。' },
      { time: '2018-06-14 19:45', divider: true, text: '今日 19:45' },
      { me: false, text: '【进度 · 4/5】A03 最终收尾进行中，预计 20:00 完成。C-1 及以下权限无需等待。' },
      { me: false, text: '【进度 · 4/5】后续任务（C-1 及以下可见）：<br>　· 配合行政完成学籍变动 <b>（张志强负责）</b><br>　· 高三各班班主任统一口径传达' },
    ]
  },
  {
    id: 'lp-assign',
    name: '人事任命 · 张志强专用（只读）',
    avatarText: '命',
    avatarLevel: 'level-c',
    unread: 0,
    chats: [
      { time: '2017-09-01 09:00', divider: true, text: '2017 学年' },
      { me: false, text: '【任命】<b>张志强</b> 担任高三（2）班班主任助理，直属校长陈国栋，对接启明教育驻校团队。' },
      { time: '2018-04-02 10:00', divider: true, text: '2018 年 4 月' },
      { me: false, text: '【附加权限】C-1 级访客权限开通。<br>条件：需配合完成"记忆微调"程序（签字协议见 D 盘我的文档）。<br>说明：为保证工作效率与保密需要，每月一次例行微调，<b>不影响正常教学工作。</b>' },
      { time: '2018-06-15 00:30', divider: true, text: '今晚 00:30（自动推）' },
      { me: false, text: '【工作任务】<br>　1. 明日早自习前完成高三（2）班许妍同学的转学名单移除。<br>　2. 回复校长邮箱的封口邮件。<br>　3. 8:30 前到校门口迎接"许妍家长"（实际为启明教育外包人员，请配合）。<br>—— 你的配合会得到回报。陈国栋' },
    ]
  }
];

// 许妍（失踪者） —— C-3级 被试 只读：只能看到"入组通知 / 测试日程 / 她发给导师的'最后消息投递失败通道'"，她完全看不到核心机密
const imContacts_XUYAN_LOW = [
  {
    id: 'lp-xu-join',
    name: '【通知】启明星三期 · 入组通知（只读）',
    avatarText: '组',
    avatarLevel: 'level-c',
    unread: 0,
    chats: [
      { time: '2018-04-19 14:00', divider: true, text: '入组日' },
      { me: false, text: '许妍同学你好：\n恭喜你通过东川一中×启明教育「启明星三期」初选，现正式通知你为 A03 号成员。\n\n· 项目福利：<b>高考综合评价 +15 分</b>（校长特批）\n· 实验次数：每周 1 次，共 6～8 次\n· 地点：B 楼 B-317 实验室\n· 每次补贴：50 元现金 / 次\n\n请在本周五前将签字后的协议交给班主任助理张志强老师。\n\n—— 启明教育 · 秦明辉（导师）' },
      { time: '2018-04-22 09:30', divider: true, text: '4/22' },
      { me: false, text: '【C-3级 权限说明】\n你仅能访问此 3 条单向通知频道，<b>无法主动添加联系人、无法进入云盘机密区、无法进入控制台。</b>' },
    ]
  },
  {
    id: 'lp-xu-plan',
    name: 'QX18 实验日程（C-3只读）',
    avatarText: '📅',
    avatarLevel: 'level-c',
    unread: 1,
    chats: [
      { me: false, text: '第 01 次 2018/04/26 17:30 - 18:30 ｜ 海马体基线扫描 ｜ ✅' },
      { me: false, text: '第 02 次 2018/05/03 17:30 - 19:00 ｜ 记忆锚定测试 ｜ ✅' },
      { me: false, text: '第 03 次 2018/05/10 17:30 - 19:00 ｜ +1min 小样本 ｜ ✅' },
      { me: false, text: '第 04 次 2018/05/24 17:30 - 19:00 ｜ +3min 小样本 ｜ ✅' },
      { me: false, text: '第 05 次 2018/06/01 17:30 - 20:00 ｜ +7min 全量 ｜ ✅' },
      { me: false, text: '第 06 次 2018/06/08 17:30 - 20:00 ｜ +7min 全量复核 ｜ ✅' },
      { time: '2018-06-14 18:03', divider: true, text: '今日 18:03' },
      { me: false, text: '<b style="color:#a02020">【临时加测】第 07 次</b>，6月14日 18:50 B-317。<br>出席要求：必须。<br>说明：<b>实验后发放全部剩余补贴 + 高考推荐加分承诺书（签字版）</b>。' },
    ]
  },
  {
    id: 'lp-xu-sent',
    name: '发送给 秦明辉（最后消息投递状态）',
    avatarText: '投',
    avatarLevel: 'level-c',
    unread: 0,
    chats: [
      { time: '2018-06-14 18:56', divider: true, text: '18:56 我的手机' },
      { me: true,  text: '秦老师，我已经在B楼走廊了，这里的灯好像有点暗？' },
      { me: true,  text: '秦老师，B-317门口的刷卡机开了，我刷进去了啊' },
      { me: true,  text: '等等，里面好像有个玻璃舱...是让我进去吗？' },
      { time: '2018-06-14 18:58', divider: true, text: '18:58 系统时钟 +7分钟 偏移启动' },
      { me: true,  text: '秦老师...！这个舱门自己关上了！' },
      { me: true,  text: '里面有气体！我头好晕... 你要记得我啊...' },
      { time: '2018-06-14 19:03（系统显示时）', divider: true, text: '系统时间 19:03（真实 18:56）' },
      { me: false, text: '<b style="color:#a02020">【投递失败】</b><br>联系人 "秦明辉" 已屏蔽此会话。<br><b style="color:#555">发送方身份验证失败：该用户不存在。</b>' },
      { me: false, text: '<b style="color:#a02020">【投递失败】</b><br>消息无法送达：<b>许妍</b>（A03）在该系统中的身份记录已被注销。<br><br><span style="color:#888">—— 这三条消息，最终没有一个人能收到。</span>' },
    ]
  }
];

function getInternalIMByUser(user){
  if(user === 'principal') return { self: { name:'陈国栋', role:'东川一中 · 校长 / 启明教育合作方董事', avatarClass:'principal', avatarText:'陈' }, list: imContacts_PRINCIPAL, lowperm:false };
  if(user === 'mentor')    return { self: { name:'秦明辉', role:'启明教育 · CEO / QX18项目总负责人', avatarClass:'mentor', avatarText:'秦' }, list: imContacts_MENTOR, lowperm:false };
  if(user === 'teacher')   return { self: { name:'张志强', role:'高三2班 · 班主任助理 / 启明专线访客', avatarClass:'principal', avatarText:'张' }, list: imContacts_TEACHER_LOW,   lowperm:true, level:'C-1级' };
  if(user === 'xuyan')     return { self: { name:'许妍',   role:'高三3班 · 学生 / A03被试 / 启明专线只读', avatarClass:'mentor', avatarText:'妍' }, list: imContacts_XUYAN_LOW,     lowperm:true, level:'C-3级' };
  return null;
}

// ================== 此电脑 / 回收站 渲染 ==================
let thisPCSideNav = 'thispc'; // thispc | desktop | cdrive | ddrive | documents
function renderThisPC(){
  const root = document.getElementById('thispc-root');
  if(!root) return;
  const u = USERS[currentUser] || { name:'未知', role:'未登录' };

  // 左侧导航点击
  setTimeout(() => {
    document.querySelectorAll('.exp-side-js').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        thisPCSideNav = el.dataset.side || 'thispc';
        renderThisPC();
      });
    });
  }, 0);

  // 按当前定位生成主内容
  let contentHTML = '';
  if(thisPCSideNav === 'thispc'){
    contentHTML = `
      <div style="font-size:12px;color:#556;margin-bottom:8px">设备和驱动器</div>
      <div class="exp-grid">
        <div class="exp-file" onclick="thisPCSideNav='cdrive';renderThisPC()">
          <div class="fi">💿</div><div class="fn">本地磁盘 (C:)</div>
          <div style="font-size:10px;color:#88a">已用 18.2 GB / 40 GB</div>
        </div>
        <div class="exp-file" onclick="thisPCSideNav='ddrive';renderThisPC()">
          <div class="fi">💽</div><div class="fn">数据盘 (D:)</div>
          <div style="font-size:10px;color:#88a">已用 102 GB / 320 GB</div>
        </div>
        <div class="exp-file" onclick="thisPCSideNav='qxnet';renderThisPC()">
          <div class="fi" style="filter:hue-rotate(180deg)">🌐</div><div class="fn" style="color:#069">启明教育云盘 (Z:)</div>
          <div style="font-size:10px;color:#88a">网络映射 · 已加密连接</div>
        </div>
        <div class="exp-file" onclick="showModal('驱动器中没有软盘。<br>请在驱动器 A: 中插入磁盘。', '磁盘未就绪')">
          <div class="fi">💾</div><div class="fn">3.5 软盘 (A:)</div>
          <div style="font-size:10px;color:#b00">不可用</div>
        </div>
      </div>
      <div style="font-size:12px;color:#556;margin:20px 0 8px">其它</div>
      <div class="exp-grid">
        <div class="exp-file" onclick="thisPCSideNav='desktop';renderThisPC()">
          <div class="fi">🖥️</div><div class="fn">桌面</div>
        </div>
        <div class="exp-file" onclick="thisPCSideNav='documents';renderThisPC()">
          <div class="fi">📁</div><div class="fn">我的文档</div>
        </div>
        <div class="exp-file" onclick="showModal('控制面板可从桌面左下角的「开」菜单打开，或直接双击桌面「控制面板」图标。', '📂 控制面板')">
          <div class="fi">⚙️</div><div class="fn">控制面板</div>
        </div>
      </div>`;
  }
  else if(thisPCSideNav === 'desktop'){
    // "桌面"目录：展示当前用户桌面可见的文件名列表
    const visible = Array.from(document.querySelectorAll('#desktop .desktop-folder')).filter(x=>x.style.display!=='none');
    contentHTML = `
      <div style="font-size:12px;color:#556;margin-bottom:8px">桌面文件 · 当前用户：<b>${u.name}</b>（${u.role}）</div>
      <div class="exp-grid">
        ${visible.length===0?`<div class="exp-empty"><div class="big">📭</div>此目录为空</div>`:
        visible.map(el=>{
          const name = (el.querySelector('div:last-child')||{textContent:''}).textContent.trim();
          return `<div class="exp-file"><div class="fi">📄</div><div class="fn">${name}</div></div>`;
        }).join('')}
      </div>`;
  }
  else if(thisPCSideNav === 'cdrive'){
    contentHTML = `
      <div style="font-size:12px;color:#556;margin-bottom:8px">C:\\ 本地磁盘</div>
      <div class="exp-grid">
        <div class="exp-file" onclick="showModal('Program Files 文件夹包含系统程序。<br>请勿随意修改，以免系统崩溃。', '⚠️ 警告')"><div class="fi">📁</div><div class="fn">Program Files</div></div>
        <div class="exp-file" onclick="showModal('Windows 系统文件夹。<br>禁止访问。', '⚠️ 拒绝访问')"><div class="fi">📁</div><div class="fn" style="color:#a8a8a8">WINDOWS</div></div>
        <div class="exp-file" onclick="thisPCSideNav='documents';renderThisPC()"><div class="fi">👤</div><div class="fn">Documents and Settings</div></div>
        <div class="exp-file" onclick="showModal('页面文件 pagefile.sys 正在使用中，无法打开。', '📄 pagefile.sys')"><div class="fi">📄</div><div class="fn" style="color:#888">pagefile.sys</div></div>
      </div>`;
  }
  else if(thisPCSideNav === 'ddrive'){
    contentHTML = `
      <div style="font-size:12px;color:#556;margin-bottom:8px">D:\\ 数据盘</div>
      <div class="exp-grid">
        <div class="exp-file" onclick="showModal('教务处共享文件夹：需要教务处账号（如校长账号已自带权限）。<br>里面包含：<br>· 高三年级考试安排.doc<br>· 高考报名汇总.xls<br>· <b style="color:#a02020">启明星合作账目（校长可访问的.xls）.xls</b>', '📂 教务处共享')"><div class="fi">📁</div><div class="fn">教务处共享</div></div>
        <div class="exp-file" onclick="showModal('D:\\备份\\2018\\6月\\<br>内含门禁快照、考勤备份、LMS数据库。大小：4.2 GB', '🗄️ 学校备份')"><div class="fi">🗄️</div><div class="fn">学校备份（2018年6月）</div></div>
        <div class="exp-file" onclick="showModal('安装包文件夹，内含：<br>· QQ2012_安装包.exe<br>· 启明专线客户端 v2.3.msi<br>· Chrome-v48 离线安装包.exe', '💿 安装包')"><div class="fi">💿</div><div class="fn">安装包</div></div>
        <div class="exp-file" onclick="showModal('个人照片（当前用户桌面也有快捷入口）。<br>共 138 张，最后拍摄：2018/06/14 上午', '📷 个人照片')"><div class="fi">📷</div><div class="fn">个人照片</div></div>
      </div>`;
  }
  else if(thisPCSideNav === 'documents'){
    contentHTML = `
      <div style="font-size:12px;color:#556;margin-bottom:8px">我的文档 · ${u.name}</div>
      <div class="exp-grid">
        <div class="exp-file" onclick="showModal('我的文档 / 图片收藏：138 张<br>我的音乐：4 首（MP3，约34MB）<br>我的视频：0<br>下载：2 个安装包', '📂 我的文档')"><div class="fi">🖼️</div><div class="fn">图片收藏</div></div>
        <div class="exp-file" onclick="showModal('播放软件 Winamp 未安装或已损坏。<br>无法打开此目录。', '🎵 我的音乐')"><div class="fi">🎵</div><div class="fn">我的音乐</div></div>
        <div class="exp-file" onclick="showModal('当前用户<b>'+'${u.name}'+'</b>的文档列表：<br><br>· 期末复习提纲（语文）.doc<br>· 三模数学压轴题参考解.pdf<br>· <b>启明星三期个人承诺书（已签字）.pdf</b><br>· 2018高考志愿预填方案.xls', '📄 文档')"><div class="fi">📄</div><div class="fn">高三复习资料</div></div>
      </div>`;
  }
  else if(thisPCSideNav === 'qxnet'){
    contentHTML = `
      <div style="font-size:12px;color:#556;margin-bottom:8px">Z:\\ 启明教育加密云盘</div>
      <div class="exp-grid">
        <div class="exp-file ${currentUser==='principal'||currentUser==='mentor'?'':'disabled'}"
             onclick="${(currentUser==='principal'||currentUser==='mentor')?"openWindow('qx18console-window')":"showModal('您的权限等级不足访问此文件夹。<br>所需等级：<b>B-0级以上（校长/CEO）</b><br>您的等级：<b>"+(u.name==='张志强'||u.name==='许妍'?'C级访客':'未授权')+"</b>', '⚠️ 拒绝访问')"}">
          <div class="fi" style="color:#a02020">🔐</div><div class="fn" style="color:#a02020;font-weight:bold">【机密】QX18-三期档案</div>
        </div>
        <div class="exp-file" onclick="showModal('Z:\\公共目录\\<br><br>· 启明星宣传册.pdf<br>· 合作办学协议（公开版）.pdf<br>· 2017年度科研成果白皮书.pdf<br>· CEO秦明辉致辞.mp4（18分钟）', '📂 公共目录')"><div class="fi">📂</div><div class="fn">公共目录</div></div>
        <div class="exp-file ${currentUser==='principal'||currentUser==='mentor'?'':'disabled'}"
             onclick="${currentUser==='mentor'?"openWindow('dataview-window')":"showModal('仅启明教育 CEO 本人可访问数据分析工作区。<br>校长可在「校务管理」中查看聚合摘要。', '⚠️ 拒绝访问')"}">
          <div class="fi">📊</div><div class="fn">数据分析 · 工作区</div>
        </div>
      </div>`;
  }

  const addrMap = { thispc:'此电脑', desktop:'桌面', cdrive:'本地磁盘 (C:)', ddrive:'数据盘 (D:)', documents:'我的文档', qxnet:'启明教育云盘 (Z:)' };
  const curAddr = addrMap[thisPCSideNav] || '此电脑';

  root.innerHTML = `
    <div class="explorer">
      <div class="explorer-toolbar">
        <button class="exp-btn" onclick="history.back()" title="后退">← 后退</button>
        <button class="exp-btn" title="前进" disabled>→ 前进</button>
        <button class="exp-btn" onclick="thisPCSideNav='thispc';renderThisPC()">⬆ 向上</button>
        <div class="exp-addressbar">
          <span>📍 地址</span><span class="sep">:</span>
          <span class="seg" onclick="thisPCSideNav='thispc';renderThisPC()">此电脑</span>
          ${thisPCSideNav!=='thispc'?`<span class="sep">›</span><span class="seg" onclick="thisPCSideNav='${thisPCSideNav}';renderThisPC()">${curAddr}</span>`:''}
        </div>
        <button class="exp-btn" title="搜索">🔍 搜索</button>
      </div>
      <div class="explorer-body">
        <div class="explorer-side">
          <div class="exp-side-title">📍 位置栏</div>
          <div class="exp-side-item exp-side-js ${thisPCSideNav==='desktop'?'active':''}" data-side="desktop"><span class="ico">🖥️</span> 桌面</div>
          <div class="exp-side-item exp-side-js ${thisPCSideNav==='documents'?'active':''}" data-side="documents"><span class="ico">📄</span> 我的文档</div>
          <div class="exp-side-title">💻 我的电脑</div>
          <div class="exp-side-item exp-side-js ${thisPCSideNav==='thispc'?'active':''}" data-side="thispc"><span class="ico">💻</span> 此电脑</div>
          <div class="exp-side-item exp-side-js ${thisPCSideNav==='cdrive'?'active':''}" data-side="cdrive"><span class="ico">💿</span> 本地磁盘 C:</div>
          <div class="exp-side-item exp-side-js ${thisPCSideNav==='ddrive'?'active':''}" data-side="ddrive"><span class="ico">💽</span> 数据盘 D:</div>
          <div class="exp-side-title">🌐 网络</div>
          <div class="exp-side-item exp-side-js ${thisPCSideNav==='qxnet'?'active':''}" data-side="qxnet"><span class="ico">☁️</span> 启明云盘 Z:</div>
        </div>
        <div class="explorer-content">
          ${contentHTML}
        </div>
      </div>
      <div class="explorer-status">
        <span>📄 当前位置：${curAddr} 　 👤 登录用户：${u.name}</span>
        <span>对象总数：—— 　 · 　 DCYZ-EDU.LOCAL</span>
      </div>
    </div>`;
}

// 回收站渲染（校长：A03档案；其余：空）
function renderRecycleBin(){
  const root = document.getElementById('recycle-root');
  if(!root) return;
  const u = USERS[currentUser] || { name:'未知', role:'未登录' };

  // 校长回收站内容
  let items = [];
  if(currentUser === 'principal'){
    if(!a03Restored){
      items.push({
        id:'a03archive',
        ico:'📂', danger:true,
        name:'A03-许妍-完整档案.pdf',
        origin:'C:\\Users\\admin_chen\\桌面\\机密区',
        delTime:'2018/06/15 00:13',
        size:'38.2 MB',
        onclickContent:USER_FILES.a03_archive ? USER_FILES.a03_archive.html : ''
      });
      items.push({
        id:'note2018',
        ico:'📄', danger:false,
        name:'旧~高三转学名单(草稿).doc',
        origin:'C:\\Documents and Settings\\admin_chen\\My Documents',
        delTime:'2018/06/14 23:58',
        size:'22 KB'
      });
    }
    // 如果还原了，就给一个"干净的回收站"，但显示一条撤销提示
  } else if(currentUser === 'mentor'){
    items = [
      { id:'tmp1', ico:'📄', danger:false, name:'~$QX18阶段汇报.pptx', origin:'D:\\安装包', delTime:'2018/06/14 20:01', size:'0 KB'},
      { id:'tmp2', ico:'🖼️', danger:false, name:'截图(废弃).png', origin:'桌面', delTime:'2018/06/10 15:22', size:'886 KB'}
    ];
  }

  // 工具栏点击回调绑定
  setTimeout(() => {
    const rb = document.getElementById('recycle-root');
    if(!rb) return;
    const restoreBtn = rb.querySelector('.rb-restore-btn');
    if(restoreBtn) restoreBtn.onclick = () => recycleBinAction('restore');
    const deleteBtn  = rb.querySelector('.rb-delete-btn');
    if(deleteBtn)  deleteBtn.onclick  = () => recycleBinAction('delete');
    const emptyBtn   = rb.querySelector('.rb-empty-btn');
    if(emptyBtn)   emptyBtn.onclick   = () => recycleBinAction('empty');
    const undoBtn    = rb.querySelector('.rb-undo-btn');
    if(undoBtn)    undoBtn.onclick    = () => recycleBinAction('undo');
  }, 0);

  const rowHTML = (items.length === 0) ? '' : items.map((it, idx)=>`
    <tr data-id="${it.id}" class="${recycleSelected===idx?'selected':''}" onclick="recycleSelect(${idx})">
      <td style="width:28px"><input type="radio" ${recycleSelected===idx?'checked':''}></td>
      <td style="width:36px">${it.ico}</td>
      <td class="${it.danger?'danger':''}">${it.name}</td>
      <td>${it.origin}</td>
      <td>${it.delTime}</td>
      <td>${it.size}</td>
      <td style="width:72px"><button class="exp-btn primary" onclick="event.stopPropagation();recycleOpen(${idx})">查看</button></td>
    </tr>
  `).join('');

  root.innerHTML = `
    <div class="explorer">
      <div class="explorer-toolbar">
        <button class="exp-btn rb-undo-btn">↶ 撤销删除</button>
        <button class="exp-btn primary rb-restore-btn" ${items.length===0?'disabled':''}>↩ 还原此项目</button>
        <button class="exp-btn rb-delete-btn" style="margin-left:12px;color:#a01020" ${items.length===0?'disabled':''}>✕ 彻底删除</button>
        <button class="exp-btn rb-empty-btn" ${items.length===0?'disabled':''}>🗑️ 清空回收站</button>
        <div style="flex:1"></div>
        <span style="font-size:11px;color:#667">当前用户：<b>${u.name}</b>（${u.role}）</span>
      </div>
      <div class="explorer-body">
        <div class="explorer-side">
          <div class="exp-side-title">📍 系统文件夹</div>
          <div class="exp-side-item" onclick="openWindow('thispc-window')"><span class="ico">💻</span> 此电脑</div>
          <div class="exp-side-item" onclick="openWindow('thispc-window')"><span class="ico">💿</span> 本地磁盘 C:</div>
          <div class="exp-side-item" onclick="openWindow('thispc-window')"><span class="ico">💽</span> 数据盘 D:</div>
          <div class="exp-side-title">🗑️ 回收站</div>
          <div class="exp-side-item active"><span class="ico">🗑️</span> 回收站</div>
        </div>
        <div class="explorer-content">
          ${items.length === 0 ? `
            <div class="exp-empty">
              <div class="big">🗑️</div>
              <div><b>回收站为空</b></div>
              <div style="margin-top:10px;font-size:11px;color:#888">
                ${a03Restored && currentUser==='principal'
                  ? '<b style="color:#080">A03档案已成功还原到桌面</b>（可在桌面右下位置看到）'
                  : '当您删除文件或文件夹时，这些项目会暂时存放在回收站中。'}
              </div>
            </div>` : `
            <table class="exp-list-table">
              <thead><tr>
                <th style="width:28px"></th>
                <th style="width:36px"></th>
                <th>名称</th><th>原始位置</th><th>删除日期</th><th style="width:88px">大小</th><th style="width:72px">操作</th>
              </tr></thead>
              <tbody>${rowHTML}</tbody>
            </table>`}
        </div>
      </div>
      <div class="explorer-status">
        <span>🗑️ 回收站 · 位置：桌面根目录</span>
        <span>共 ${items.length} 个对象</span>
      </div>
    </div>`;

  // 当前列表保存起来供按钮用
  recycleCurrentList = items;
}

let recycleSelected = -1;
let recycleCurrentList = [];
function recycleSelect(idx){ recycleSelected = idx; renderRecycleBin(); }
function recycleOpen(idx){
  const it = recycleCurrentList[idx];
  if(!it) return;
  if(it.id === 'a03archive'){
    openUserFile('a03_archive');
    return;
  }
  showModal(`📄 ${it.name}<br><br>原始位置：${it.origin}<br>删除时间：${it.delTime}<br>文件大小：${it.size}<br><br><span style="color:#888;font-size:11px">（该文件已被标记为"不保留内容"，无法预览实际内容）</span>`, `📄 预览：${it.name}`);
}
function recycleBinAction(action){
  if(action === 'restore'){
    if(recycleSelected < 0){
      showModal('请先选择要还原的项目（单击一行即可）。', '提示');
      return;
    }
    const it = recycleCurrentList[recycleSelected];
    if(!it) return;
    if(it.id === 'a03archive'){
      a03Restored = true;
      recycleSelected = -1;
      // 同时把校长桌面上的还原图标显示出来
      const a03 = document.getElementById('a03-restored');
      if(a03) a03.style.display = 'block';
      renderRecycleBin();
      showModal(`✅ 已还原 1 个项目：<br><br><b style="color:#b01020">A03-许妍-完整档案.pdf</b><br><br>已还原到位置：<br><b>陈国栋（校长）桌面 · 右下角</b><br><br>现在可以关闭此窗口，回桌面双击该文件，查看完整档案内容。`, '✔ 还原成功');
      return;
    }
    a03Restored = a03Restored;  // 其他文件"模拟还原"
    recycleCurrentList.splice(recycleSelected, 1);
    recycleSelected = -1;
    renderRecycleBin();
    showModal(`✅ 已将 "${it.name}" 还原到原位置：<br>${it.origin}`, '✔ 还原成功');
    return;
  }
  if(action === 'delete'){
    if(recycleSelected < 0){
      showModal('请先选择要彻底删除的项目。', '提示');
      return;
    }
    const it = recycleCurrentList[recycleSelected];
    showConfirm(`确实要彻底删除 "${it.name}" 吗？\n\n一旦删除，将无法从回收站恢复（游戏内模拟）。`, () => {
      recycleCurrentList.splice(recycleSelected, 1);
      recycleSelected = -1;
      renderRecycleBin();
      showModal(`已彻底删除 "${it.name}"。`, '已删除');
    }, '⚠ 确认文件删除');
    return;
  }
  if(action === 'empty'){
    if(recycleCurrentList.length === 0){
      showModal('回收站已经是空的。', '提示');
      return;
    }
    showConfirm(`确实要清空回收站吗？\n\n清空后 ${recycleCurrentList.length} 个项目将永久无法从回收站恢复（游戏内模拟）。`, () => {
      recycleCurrentList = [];
      recycleSelected = -1;
      renderRecycleBin();
      showModal('已清空回收站。', '已清空');
    }, '⚠ 确认清空回收站');
    return;
  }
  if(action === 'undo'){
    showModal('最近一次操作：（无）<br><br>没有可以撤销的删除。', '撤销删除');
    return;
  }
}

let currentIMContact = 0;
let lastIMUser = null;

function renderInternalIM(){
  const root = document.getElementById('im-root');
  if(!root) return;

  const data = getInternalIMByUser(currentUser);
  // 非校长/导师/导员/许妍强行打开 → 显示提示
  if(!data){
    root.innerHTML = `
      <div class="im-container">
        <div class="im-left-panel">
          <div class="im-avatar-bar">
            <div class="im-avatar" style="background:#555">?</div>
            <div class="im-user-meta">
              <div class="im-user-name">未知账户</div>
              <div class="im-user-role">无权限</div>
            </div>
          </div>
          <div class="im-enc-banner">⚠ 此软件仅授权校长与启明教育管理层使用</div>
          <div class="im-contact-list"></div>
        </div>
        <div class="im-right-panel">
          <div class="im-chat-title">权限错误 <span class="sec">SECURITY LOCKED</span></div>
          <div class="im-chat-area" style="justify-content:center;align-items:center;color:#89a;flex-direction:column">
            <div style="font-size:54px;margin-bottom:20px">🔐</div>
            <div style="font-size:15px">当前账户不具备「启明专线」访问权限</div>
            <div style="font-size:12px;margin-top:12px">如需访问，请使用以下账户之一登录：<br>陈国栋（校长）/ 秦明辉（CEO）/ 张志强（导员）/ 许妍（高三3班）</div>
          </div>
          <div class="im-tip-bar">
            <span>此会话已记录您的登录 IP：127.0.0.1</span>
            <span class="warn">⚠ 越权尝试将被系统上报</span>
          </div>
        </div>
      </div>`;
    return;
  }

  if(lastIMUser !== currentUser){
    currentIMContact = 0;
    lastIMUser = currentUser;
  }
  const contacts = data.list;
  if(currentIMContact >= contacts.length) currentIMContact = 0;
  const active = contacts[currentIMContact];

  // 低权限横幅（许妍/导员专用）
  const lowpermBanner = data.lowperm ? `
    <div class="lowperm-banner">
      🔒 您当前以 <b>${data.level||'C级访客'}</b> 身份访问 &nbsp;|&nbsp;
      此客户端为 <b>单向只读 · 日志模式</b> &nbsp;|&nbsp;
      <b>无法主动发起会话、无法访问机密区</b>
    </div>` : '';

  // 输入框占位文字（按权限区分）
  const inputPlaceholder = data.lowperm
    ? '【单向只读通道】您的账号权限等级不足，只能查看系统推送的通知。如需发送消息，请通过QQ联系上级对接人。'
    : '【该输入框已被系统锁定】此通讯通道为单向加密日志模式，您无法发送消息（防止留下电子痕迹）。如需发送指令，请使用阅后即焚一次性密函。';

  // 右侧安全标签（按权限区分）
  const rightSecLabel = data.lowperm
    ? '只读 · C级通道 · 日志归档中'
    : 'AES-256 · PGP签名 · QX18通道';

  // 加密横幅
  const encBanner = data.lowperm
    ? `🔒 专线镜像模式 · 单向接收 · 所有操作均记录于审计日志`
    : `🔒 端到端军事级加密 · 会话自动阅后即焚 · 服务器不保留聊天日志`;

  // 底部提示栏
  const tipBarLeft = data.lowperm
    ? '📋 本窗口内容为单向日志推送 · 关闭后本地不缓存'
    : '🔒 本对话阅后即焚 · 关闭窗口后服务器端自动删除';
  const tipBarRight = data.lowperm
    ? `<span class="warn">⚠ 如需升级权限，请联系校长办公室（内线 8001）</span>`
    : `<span class="warn">⚠ 请勿将内容截图或转发</span>`;

  root.innerHTML = `
    <div class="im-container ${data.lowperm ? 'lowperm' : ''}">
      <div class="im-left-panel">
        <div class="im-avatar-bar">
          <div class="im-avatar ${data.self.avatarClass}">${data.self.avatarText}</div>
          <div class="im-user-meta">
            <div class="im-user-name">${data.self.name}</div>
            <div class="im-user-role">${data.self.role}</div>
          </div>
          <div class="im-user-status" title="在线"></div>
        </div>
        ${lowpermBanner}
        <div class="im-enc-banner">${encBanner}</div>
        <div class="im-contact-list" id="im-contact-list">
          ${contacts.map((c, i) => `
            <div class="im-contact ${i===currentIMContact?'active':''}" onclick="switchIMContact(${i})">
              <div class="im-contact-avatar ${c.avatarLevel}">${c.avatarText}</div>
              <div class="im-contact-info">
                <div class="im-contact-name">${c.name}</div>
                <div class="im-contact-msg">${c.chats[c.chats.length-1].text.replace(/<[^>]+>/g,'').substring(0,32)}</div>
              </div>
              ${c.unread?`<div class="im-contact-badge">${c.unread}</div>`:''}
            </div>
          `).join('')}
        </div>
      </div>
      <div class="im-right-panel">
        <div class="im-chat-title">
          <span>🔐 ${active.name} &nbsp;·&nbsp; <span style="font-weight:normal;opacity:.8">${data.lowperm?'单向日志':'加密会话'}</span></span>
          <span class="sec">${rightSecLabel}</span>
        </div>
        <div class="im-chat-area" id="im-chat-area">
          ${active.chats.map(m => {
            if(m.divider) return `<div class="im-day-divider">${m.text}</div>`;
            const cls = m.me ? 'me' : 'other';
            const avatarHtml = `<div class="im-msg-avatar ${m.me?(data.self.avatarClass||''):active.avatarLevel}">${m.me?data.self.avatarText:active.avatarText}</div>`;
            const timeHtml = m.time ? `<div class="im-msg-time">${m.time}</div>` : '';
            return `${timeHtml}<div class="im-msg ${cls}">${avatarHtml}<div class="im-msg-bubble">${m.text}</div></div>`;
          }).join('')}
        </div>
        <div class="im-input-area">
          <textarea class="im-input-box" placeholder="${inputPlaceholder}" readonly></textarea>
        </div>
        <div class="im-tip-bar">
          <span>${tipBarLeft}</span>
          ${tipBarRight}
        </div>
      </div>
    </div>`;

  // 更新窗口标题（区分高权限/低权限）
  const titleEl = document.getElementById('im-title');
  if(titleEl){
    titleEl.textContent = data.lowperm
      ? `🔒 启明专线(只读) · ${data.self.name} · ${data.level||'C级通道'}`
      : `🔒 启明内网通 · ${data.self.name} · 已登录`;
  }

  // 任务栏按钮文字也区分（如果当前正在显示）
  const taskBtn = document.getElementById('taskbtn-im');
  if(taskBtn){
    taskBtn.textContent = data.lowperm ? '🔒 启明专线' : '🔒 启明内网通';
  }

  // 滚动到底
  const ca = document.getElementById('im-chat-area');
  if(ca) ca.scrollTop = ca.scrollHeight;
}

function switchIMContact(idx){
  const data = getInternalIMByUser(currentUser);
  if(!data) return;
  if(idx < 0 || idx >= data.list.length) idx = 0;
  currentIMContact = idx;
  renderInternalIM();
}

