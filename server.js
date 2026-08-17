const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// ============ 全局统计：在线人数 + 总访问人数 ============
// 在线人数（基于活跃会话）
const onlineSessions = new Map(); // sid -> lastActiveTime
const ONLINE_TIMEOUT = 5 * 60 * 1000; // 5分钟无活动视为离线

// 总访问人数（持久化到 visits.json）
const VISITS_FILE = path.join(__dirname, 'visits.json');
let totalVisits = 0;
try {
  if (fs.existsSync(VISITS_FILE)) {
    const data = JSON.parse(fs.readFileSync(VISITS_FILE, 'utf8'));
    totalVisits = data.totalVisits || 0;
  }
} catch (e) {
  console.warn('读取 visits.json 失败，将使用 0:', e.message);
}
function persistVisits() {
  try {
    fs.writeFileSync(VISITS_FILE, JSON.stringify({ totalVisits }, null, 2));
  } catch (e) {
    console.warn('写入 visits.json 失败:', e.message);
  }
}

// 定时清理过期会话
setInterval(() => {
  const now = Date.now();
  for (const [sid, t] of onlineSessions) {
    if (now - t > ONLINE_TIMEOUT) onlineSessions.delete(sid);
  }
}, 60 * 1000);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'daylight-missing-secret-2026',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 86400000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// 游戏状态初始化中间件
app.use((req, res, next) => {
  if (!req.session.gameState) {
    req.session.gameState = {
      intranetLoggedIn: false,
      currentUser: null,
      cluesFound: [],
      documentsAccessed: [],
      qx18Unlocked: false,
      enterpriseUnlocked: false,
      timelineReconstructed: false,
      endingReached: false
    };
    // 新会话：总访问人数 +1
    totalVisits++;
    persistVisits();
  }
  // 活跃会话标记（用于在线人数统计）
  if (req.session.id) {
    onlineSessions.set(req.session.id, Date.now());
  }
  next();
});

// ============ 在线人数 / 总访问人数 API ============
app.get('/api/stats', (req, res) => {
  // 实时清理过期会话
  const now = Date.now();
  for (const [sid, t] of onlineSessions) {
    if (now - t > ONLINE_TIMEOUT) onlineSessions.delete(sid);
  }
  res.json({
    online: onlineSessions.size,
    totalVisits: totalVisits
  });
});

// ============ 游戏状态 API ============
app.get('/api/state', (req, res) => {
  res.json(req.session.gameState);
});

app.post('/api/clue', (req, res) => {
  const { clueId } = req.body;
  if (clueId && !req.session.gameState.cluesFound.includes(clueId)) {
    req.session.gameState.cluesFound.push(clueId);
  }
  res.json({ success: true, clues: req.session.gameState.cluesFound });
});

// ============ 校园内网登录 ============
// 正确账号密码线索藏在故事里：
// 用户名: xuyan (许妍拼音) / admin / sub0617
// 密码: 20180614_B317 (日期+房间号) 或 QX18_SUB0617
const VALID_CREDENTIALS = [
  { username: 'xuyan', password: '20180614_B317' },
  { username: 'admin', password: 'QX18_A03' },
  { username: 'sub0617', password: '1841_1911' },
  { username: '许妍', password: 'B317_QX18' }
];

app.post('/api/intranet/login', (req, res) => {
  const { username, password } = req.body;
  const isValid = VALID_CREDENTIALS.some(
    cred => cred.username === username && cred.password === password
  );
  if (isValid) {
    req.session.gameState.intranetLoggedIn = true;
    req.session.gameState.currentUser = username;
    res.json({ success: true });
  } else {
    res.json({ success: false, message: '用户名或密码错误' });
  }
});

app.post('/api/intranet/logout', (req, res) => {
  req.session.gameState.intranetLoggedIn = false;
  req.session.gameState.currentUser = null;
  res.json({ success: true });
});

// ============ 门禁记录查询 ============
// 需要内网登录才能查
app.get('/api/access-logs', (req, res) => {
  if (!req.session.gameState.intranetLoggedIn) {
    return res.status(403).json({ error: '未授权访问' });
  }
  // 关键：门禁系统时间比真实时间快7分钟
  // 玩家需要自己发现这个时间差
  const logs = [
    { time: '2018-06-14 18:41:00', door: 'B-301', user: '林某某', status: '正常' },
    { time: '2018-06-14 18:52:00', door: 'B-305', user: '陈某某', status: '正常' },
    { time: '2018-06-14 18:57:00', door: 'B-316', user: '苏某某', status: '正常' },
    { time: '2018-06-14 19:03:00', door: 'B-317', user: '许妍', status: '异常' },
    { time: '2018-06-14 19:08:00', door: 'B-310', user: '周某某', status: '正常' },
    { time: '2018-06-14 19:11:00', door: 'B-317', user: '未知', status: '异常' },
    { time: '2018-06-14 19:18:00', door: 'B-317', user: '系统', status: '数据复制完成' },
    { time: '2018-06-14 19:24:00', door: 'B楼总控', user: '管理员', status: '异常处理' },
    { time: '2018-06-14 19:32:00', door: '校门', user: '校外人员-Q03', status: '临时放行' },
    { time: '2018-06-14 19:47:00', door: 'B楼总控', user: '系统', status: '断电' }
  ];
  res.json(logs);
});

// ============ 建筑平面图查询 ============
app.get('/api/floorplan/:year', (req, res) => {
  if (!req.session.gameState.intranetLoggedIn) {
    return res.status(403).json({ error: '未授权访问' });
  }
  const year = req.params.year;
  if (year === '2017') {
    // 2017年有B-317
    res.json({
      building: 'B楼',
      floor: '三层',
      rooms: ['B-301','B-302','B-303','B-304','B-305','B-306','B-307','B-308',
              'B-309','B-310','B-311','B-312','B-313','B-314','B-315','B-316','B-317'],
      lastRoom: 'B-317',
      purpose: '学生综合研究室'
    });
  } else if (year === '2019') {
    // 2019年B-317消失了
    res.json({
      building: 'B楼',
      floor: '三层',
      rooms: ['B-301','B-302','B-303','B-304','B-305','B-306','B-307','B-308',
              'B-309','B-310','B-311','B-312','B-313','B-314','B-315','B-316'],
      lastRoom: 'B-316',
      note: '之后为楼梯通道'
    });
  } else {
    res.json({ error: '未找到该年度存档' });
  }
});

// ============ 学生档案查询 ============
app.get('/api/student/:name', (req, res) => {
  if (!req.session.gameState.intranetLoggedIn) {
    return res.status(403).json({ error: '未授权访问' });
  }
  const name = req.params.name;
  if (name === '许妍' || name === 'xuyan') {
    res.json({
      status: '档案不存在',
      note: '数据库中无此学生记录',
      // 隐藏线索：返回一个base64字符串，放在header里或者这里
      hiddenData: 'VEhFIE9SSUdJTkFMIElTIE5PVCBIRVJF',
      classRank: null,
      enrollDate: null
    });
  } else if (name === '林嘉') {
    res.json({ name: '林嘉', studentId: 'SUB-0618', class: '高三(3)班', status: '在读' });
  } else if (name === '陈放') {
    res.json({ name: '陈放', studentId: 'SUB-0621', class: '高三(3)班', status: '在读' });
  } else if (name === '苏雨') {
    res.json({ name: '苏雨', studentId: 'SUB-0624', class: '高三(3)班', status: '在读' });
  } else if (name === '周航') {
    res.json({ name: '周航', studentId: 'SUB-0627', class: '高三(3)班', status: '在读' });
  } else {
    res.json({ error: '未找到匹配记录' });
  }
});

// ============ 启明星计划文件访问 ============
const QX18_FILES = {
  'QX18_A03_SUB0617': {
    id: 'SUB-0617',
    name: '许妍',
    records: [
      { type: '反应时间', date: '2018-03-15', value: '0.42s' },
      { type: '记忆测试', date: '2018-04-02', value: '92%' },
      { type: '重复描述', date: '2018-05-18', value: '一致性: 高' },
      { type: '事件回忆', date: '2018-06-10', value: '存在偏差' }
    ],
    finalNote: 'SUB-0617：拒绝继续参与。'
  },
  'QX18_A03_SUB0630': {
    id: 'SUB-0630',
    name: '[数据缺失]',
    birthYear: '2000',
    school: '东川市第一中学',
    class: '高三(3)班',
    experimentDate: '2018-06-14',
    records: [
      { type: '记忆植入', status: '成功' },
      { type: '记忆覆盖', status: '部分成功' },
      { type: '最后一日记录', status: '完全缺失' }
    ],
    finalNote: 'SUB-0630：记忆恢复失败。'
  }
};

app.post('/api/qx18/file', (req, res) => {
  // 需要内网登录，或者通过启明星网站输入正确的文件编号
  const { fileCode } = req.body;
  if (!req.session.gameState.intranetLoggedIn && !req.session.gameState.qx18Unlocked) {
    return res.status(403).json({ error: '访问受限' });
  }
  const file = QX18_FILES[fileCode];
  if (file) {
    res.json({ success: true, data: file });
  } else {
    res.json({ success: false, message: '文件编号无效' });
  }
});

app.post('/api/qx18/unlock', (req, res) => {
  // 启明星计划网站的解密入口
  const { accessCode } = req.body;
  // 正确的accessCode：QX-18 或从base64解码来
  if (accessCode === 'QX-18' || accessCode === 'THE_ORIGINAL_IS_NOT_HERE') {
    req.session.gameState.qx18Unlocked = true;
    res.json({ success: true });
  } else {
    res.json({ success: false, message: '授权码错误' });
  }
});

// ============ 企业网站内部文档 ============
const ENTERPRISE_DOCS = {
  'INT_2018_0615': {
    title: '关于6月14日异常事件的内部处理报告',
    content: [
      '时间：2018年6月14日 20:13',
      '地点：东川一中B楼317室',
      '事件描述：实验对象SUB-0617擅自进入实验场地，发现数据复制过程。',
      '处理措施：',
      '  1. 启动记忆干预程序（对象：SUB-0630等）',
      '  2. 移除SUB-0617所有公开记录',
      '  3. 转移实验设备至新场地',
      '  4. B-317房间从建筑平面图中移除',
      '备注：SUB-0617拒绝继续参与项目，移交至[已编辑]处理。'
    ]
  }
};

app.post('/api/enterprise/doc', (req, res) => {
  const { docId, password } = req.body;
  if (!req.session.gameState.enterpriseUnlocked && password !== 'QX18_2018') {
    return res.json({ success: false, message: '密码错误' });
  }
  req.session.gameState.enterpriseUnlocked = true;
  const doc = ENTERPRISE_DOCS[docId];
  if (doc) {
    res.json({ success: true, data: doc });
  } else {
    res.json({ success: false, message: '文档不存在' });
  }
});

// ============ 聊天记录查询（同学证词矛盾） ============
app.get('/api/chatlogs', (req, res) => {
  if (!req.session.gameState.intranetLoggedIn) {
    return res.status(403).json({ error: '未授权访问' });
  }
  res.json([
    { witness: '林嘉 (SUB-0618)', statement: '她18点以前就走了，我亲眼看见的。' },
    { witness: '陈放 (SUB-0621)', statement: '不对啊，18点40分我还在教室看见她了。' },
    { witness: '苏雨 (SUB-0624)', statement: '她那天根本没去B楼，我一直在走廊。' },
    { witness: '周航 (SUB-0627)', statement: '我看见她进去了。[19:03]。没错。' }
  ]);
});

// ============ 服务器时间查询（关键线索：时间差） ============
app.get('/api/server-time', (req, res) => {
  // 不同服务器返回不同"时间"，玩家需要对比发现7分钟偏差
  const { source } = req.query;
  const base = new Date('2018-06-14T19:03:00');
  let offset = 0;
  if (source === 'access') offset = 7 * 60 * 1000; // 门禁快7分钟
  else if (source === 'server') offset = 0;
  else if (source === 'monitor') offset = -2 * 60 * 1000; // 监控慢2分钟
  else if (source === 'photo') offset = 5 * 60 * 1000;
  res.json({
    source,
    displayTime: new Date(base.getTime() + offset).toISOString().replace('T', ' ').substr(0, 19),
    note: source === 'access' ? '注意：门禁时钟为独立计时设备' : '系统标准时间'
  });
});

// ============ 最终提交：重构时间线 ============
app.post('/api/submit-timeline', (req, res) => {
  const { timeline } = req.body;
  // 正确的重构时间线
  const correctOrder = [
    '18:41', // 许妍发消息
    '18:42', // 拍下B楼照片
    '18:56', // 有人进入B-317（门禁快7分钟，实际是门禁显示19:03）
    '19:03', // QX-18数据开始复制
    '19:11', // 许妍进入B-317
    '19:18', // 数据复制完成
    '19:24', // 学校内部异常处理
    '19:32', // 企业人员进入
    '19:47', // B楼断电
    '20:13'  // 公开记录停止
  ];
  const isCorrect = JSON.stringify(timeline) === JSON.stringify(correctOrder);
  if (isCorrect) {
    req.session.gameState.timelineReconstructed = true;
    res.json({ success: true, message: '时间线校准完成。七分钟的偏差，终于对上了。' });
  } else {
    res.json({ success: false, message: '时间线不匹配，系统时钟之间存在偏差。' });
  }
});

// ============ 最终结局 ============
app.post('/api/ending', (req, res) => {
  const { finalChoice } = req.body;
  if (req.session.gameState.timelineReconstructed && 
      req.session.gameState.qx18Unlocked && 
      req.session.gameState.enterpriseUnlocked) {
    req.session.gameState.endingReached = true;
    res.json({
      success: true,
      ending: {
        text: [
          '我终于想起来了。2018年6月14日，我其实去了B楼。',
          '我站在B-317门口，看见许妍。她对我说："你不应该来的。"',
          '然后她把那本数学本交给我。她说："如果以后你忘了，就从时间开始查。"',
          '',
          '我忘了。整整八年。',
          '',
          '现在我明白了——她留下的不是寻找她的线索。',
          '是一份让我重新找回自己记忆的路线图。',
          '',
          '班级照片里，六个人都在。许妍站在最边上。她没有看镜头。',
          '她在看我。',
          '',
          '照片背面有一行字：',
          '"你终于想起来了。"',
          '',
          '我盯着那句话，很久没有动。',
          '因为我突然发现——我根本不记得自己是什么时候拿到这张照片的。',
          '更不记得……照片里为什么会有2026年的我。'
        ],
        photoTimestamp: '2018年6月14日 18:42',
        finalNote: '照片里为什么会有2026年的我？',
        truth: '2018年6月14日，学校里消失的，不只有许妍。还有一部分：属于我的记忆。'
      }
    });
  } else {
    res.json({ success: false, message: '你还没有拼齐所有的碎片。' });
  }
});

app.listen(PORT, () => {
  console.log('========================================');
  console.log('  白昼失踪 - 网页解密游戏 已启动');
  console.log('  访问地址: http://localhost:' + PORT + ' （云部署时改为 Render 提供的域名）');
  console.log('========================================');
  console.log('');
  console.log('提示：游戏开始于一个模拟的"旧电脑桌面"，');
  console.log('      你需要从日记开始，逐步访问各个网站...');
  console.log('');
});
