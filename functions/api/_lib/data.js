// 游戏静态数据（与原 server.js 完全一致）

// 校园内网登录凭证
export const VALID_CREDENTIALS = [
  { username: 'xuyan', password: '20180614_B317' },
  { username: 'admin', password: 'QX18_A03' },
  { username: 'sub0617', password: '1841_1911' },
  { username: '许妍', password: 'B317_QX18' },
];

// 门禁记录（关键：门禁系统时间比真实时间快7分钟）
export const ACCESS_LOGS = [
  { time: '2018-06-14 18:41:00', door: 'B-301', user: '林某某', status: '正常' },
  { time: '2018-06-14 18:52:00', door: 'B-305', user: '陈某某', status: '正常' },
  { time: '2018-06-14 18:57:00', door: 'B-316', user: '苏某某', status: '正常' },
  { time: '2018-06-14 19:03:00', door: 'B-317', user: '许妍', status: '异常' },
  { time: '2018-06-14 19:08:00', door: 'B-310', user: '周某某', status: '正常' },
  { time: '2018-06-14 19:11:00', door: 'B-317', user: '未知', status: '异常' },
  { time: '2018-06-14 19:18:00', door: 'B-317', user: '系统', status: '数据复制完成' },
  { time: '2018-06-14 19:24:00', door: 'B楼总控', user: '管理员', status: '异常处理' },
  { time: '2018-06-14 19:32:00', door: '校门', user: '校外人员-Q03', status: '临时放行' },
  { time: '2018-06-14 19:47:00', door: 'B楼总控', user: '系统', status: '断电' },
];

// 楼层平面图（2017 有 B-317，2019 之后消失）
export const FLOORPLANS = {
  '2017': {
    building: 'B楼',
    floor: '三层',
    rooms: ['B-301','B-302','B-303','B-304','B-305','B-306','B-307','B-308',
            'B-309','B-310','B-311','B-312','B-313','B-314','B-315','B-316','B-317'],
    lastRoom: 'B-317',
    purpose: '学生综合研究室',
  },
  '2019': {
    building: 'B楼',
    floor: '三层',
    rooms: ['B-301','B-302','B-303','B-304','B-305','B-306','B-307','B-308',
            'B-309','B-310','B-311','B-312','B-313','B-314','B-315','B-316'],
    lastRoom: 'B-316',
    note: '之后为楼梯通道',
  },
};

// 学生档案
export const STUDENT_RECORDS = {
  '许妍': {
    status: '档案不存在',
    note: '数据库中无此学生记录',
    hiddenData: 'VEhFIE9SSUdJTkFMIElTIE5PVCBIRVJF',
    classRank: null,
    enrollDate: null,
  },
  'xuyan': {
    status: '档案不存在',
    note: '数据库中无此学生记录',
    hiddenData: 'VEhFIE9SSUdJTkFMIElTIE5PVCBIRVJF',
    classRank: null,
    enrollDate: null,
  },
  '林嘉': { name: '林嘉', studentId: 'SUB-0618', class: '高三(3)班', status: '在读' },
  '陈放': { name: '陈放', studentId: 'SUB-0621', class: '高三(3)班', status: '在读' },
  '苏雨': { name: '苏雨', studentId: 'SUB-0624', class: '高三(3)班', status: '在读' },
  '周航': { name: '周航', studentId: 'SUB-0627', class: '高三(3)班', status: '在读' },
};

// 启明星计划文件
export const QX18_FILES = {
  'QX18_A03_SUB0617': {
    id: 'SUB-0617',
    name: '许妍',
    records: [
      { type: '反应时间', date: '2018-03-15', value: '0.42s' },
      { type: '记忆测试', date: '2018-04-02', value: '92%' },
      { type: '重复描述', date: '2018-05-18', value: '一致性: 高' },
      { type: '事件回忆', date: '2018-06-10', value: '存在偏差' },
    ],
    finalNote: 'SUB-0617：拒绝继续参与。',
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
      { type: '最后一日记录', status: '完全缺失' },
    ],
    finalNote: 'SUB-0630：记忆恢复失败。',
  },
};

// 启明星计划解锁码
export const QX18_UNLOCK_CODES = ['QX-18', 'THE_ORIGINAL_IS_NOT_HERE'];

// 企业内部文档
export const ENTERPRISE_DOCS = {
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
      '备注：SUB-0617拒绝继续参与项目，移交至[已编辑]处理。',
    ],
  },
};

// 企业文档解锁密码
export const ENTERPRISE_PASSWORD = 'QX18_2018';

// 同学证词
export const CHAT_LOGS = [
  { witness: '林嘉 (SUB-0618)', statement: '她18点以前就走了，我亲眼看见的。' },
  { witness: '陈放 (SUB-0621)', statement: '不对啊，18点40分我还在教室看见她了。' },
  { witness: '苏雨 (SUB-0624)', statement: '她那天根本没去B楼，我一直在走廊。' },
  { witness: '周航 (SUB-0627)', statement: '我看见她进去了。[19:03]。没错。' },
];

// 正确的时间线顺序
export const CORRECT_TIMELINE = [
  'msg', 'photo', 'enter1', 'copy', 'enter2',
  'done', 'school', 'company', 'power', 'stop',
];

// 多系统时间偏移（毫秒）
export const TIME_OFFSETS = {
  access: 7 * 60 * 1000,    // 门禁快 7 分钟
  server: 0,
  monitor: -2 * 60 * 1000,  // 监控慢 2 分钟
  photo: 5 * 60 * 1000,
};

// 结局文案
export const ENDINGS = {
  anchor: {
    type: 'hidden',
    text: [
      '我没有去B楼。',
      '我回到了这台旧电脑前。',
      '',
      '张志强备忘录里写过，校长办公室保险柜密码是"ZhangZQ_2010_DCYZ"。',
      '那串字符后面还有一行小字——',
      '"如果有人从未来看到这个，请在18:42按下快门。"',
      '',
      '我低头，手里不知什么时候多了一部手机。',
      '系统时间显示：2026年8月17日。',
      '',
      '但取景框里，是八年前的B楼走廊。',
      '许妍站在走廊尽头，回头看向我。',
      '',
      '她笑了一下。',
      '她说："你终于来了。"',
      '',
      '我按下了快门。',
      '',
      'EXIF 时间戳自动跳转为——2018/06/14 18:42。',
    ],
    photoTimestamp: '2018年6月14日 18:42  ·  由2026年的拍摄者拍摄',
    finalNote: '这一次，记得带她出来。',
    truth: 'QX18-A03的最后一次注入被改写了：锚定对象不是许妍，而是来自2026年的我。',
  },
  normal: {
    type: 'normal',
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
      '更不记得……照片里为什么会有2026年的我。',
    ],
    photoTimestamp: '2018年6月14日 18:42',
    finalNote: '照片里为什么会有2026年的我？',
    truth: '2018年6月14日，学校里消失的，不只有许妍。还有一部分：属于我的记忆。',
  },
};
