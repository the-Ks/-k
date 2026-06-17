export const users = [
  {
    id: "u_admin",
    username: "admin",
    passwordHash: "pbkdf2_sha256$210000$XVYLS0NRfyZVTajKaLEThg$QgZeGzz7pm2Myx0xBFYkPbf23yP1m6SbkvNplKJ8Nn0",
    name: "超级管理员",
    role: "super_admin",
    department: "管理中心",
    dataScope: "all",
    permissions: ["*"]
  },
  {
    id: "u_qc_01",
    username: "qc",
    passwordHash: "pbkdf2_sha256$210000$cBGUGpjt2rz2GkO4Ts4b3g$xQOjr1G2Rdf06adxAc_nPYqhQP5WlCOzUcGueHsc_F8",
    name: "质检员A",
    role: "quality_user",
    department: "质检组",
    dataScope: "department",
    permissions: ["message:view", "identity:review", "quality:review", "customer:view", "bi:view"]
  },
  {
    id: "u_service_01",
    username: "service",
    passwordHash: "pbkdf2_sha256$210000$I_myQG3ny0jQiMcRXsR56A$hFLJpTV46ccZCjUWOFtAMIzidRJfsmrchETzH0x4-gM",
    name: "客服小林",
    role: "service_user",
    department: "客服一组",
    dataScope: "self",
    permissions: ["message:view", "quality:self", "customer:self"]
  }
];

export const syncStatus = {
  mode: "mock",
  databaseApi: "pending",
  lastFullSyncAt: "待接入",
  lastIncrementalSyncAt: "待接入",
  sourceSystems: [
    { name: "淘宝聊天记录", status: "placeholder", expectedFields: ["time", "role", "content", "taobao_id"] },
    { name: "微信聊天记录", status: "placeholder", expectedFields: ["time", "role", "content", "group_id", "member_id"] },
    { name: "淘宝-微信关联记录", status: "placeholder", expectedFields: ["taobao_id", "wechat_id", "evidence_message_id"] }
  ],
  syncChecks: [
    "原始数据完整保留",
    "按来源去重",
    "失败重试",
    "同步日志",
    "字段标准化"
  ]
};

export const messages = [
  {
    id: "msg_001",
    platform: "taobao",
    sourceChatId: "tb_chat_1001",
    sourceSenderId: "tb_customer_7788",
    senderName: "清风",
    normalizedRole: "customer",
    personId: "c_001",
    sentAt: "2026-06-15 09:12:20",
    content: "这个产品一般多久能看到效果？",
    messageType: "text"
  },
  {
    id: "msg_002",
    platform: "taobao",
    sourceChatId: "tb_chat_1001",
    sourceSenderId: "tb_staff_008",
    senderName: "淘宝客服小林",
    normalizedRole: "service",
    personId: "s_001",
    sentAt: "2026-06-15 09:13:02",
    content: "您好，一般需要结合使用周期看，我先了解一下您的具体情况。",
    messageType: "text"
  },
  {
    id: "msg_003",
    platform: "wechat",
    sourceChatId: "wx_group_9001",
    sourceSenderId: "wx_staff_009",
    senderName: "服务老师-林",
    normalizedRole: "service",
    personId: "s_001",
    sentAt: "2026-06-15 10:04:11",
    content: "麻烦您发一下淘宝ID，我们帮您做一下信息匹配。",
    messageType: "text"
  },
  {
    id: "msg_004",
    platform: "wechat",
    sourceChatId: "wx_group_9001",
    sourceSenderId: "wx_user_a19",
    senderName: "张先生",
    normalizedRole: "customer",
    personId: "c_001",
    sentAt: "2026-06-15 10:04:39",
    content: "淘宝ID是 清风7788。",
    messageType: "text"
  },
  {
    id: "msg_005",
    platform: "wechat",
    sourceChatId: "wx_group_9001",
    sourceSenderId: "wx_user_a19",
    senderName: "张先生",
    normalizedRole: "customer",
    personId: "c_001",
    sentAt: "2026-06-15 10:06:02",
    content: "我主要担心效果和售后，如果没效果怎么办？",
    messageType: "text"
  },
  {
    id: "msg_006",
    platform: "wechat",
    sourceChatId: "wx_group_9001",
    sourceSenderId: "wx_staff_015",
    senderName: "售后老师-周",
    normalizedRole: "after_sales",
    personId: "s_003",
    sentAt: "2026-06-15 10:07:08",
    content: "您这个问题我们可以按照使用阶段跟进，售后老师会定期回访并记录反馈。",
    messageType: "text"
  },
  {
    id: "msg_007",
    platform: "wechat",
    sourceChatId: "wx_group_9001",
    sourceSenderId: "wx_user_a19",
    senderName: "张先生",
    normalizedRole: "customer",
    personId: "c_001",
    sentAt: "2026-06-15 10:07:40",
    content: "",
    messageType: "image",
    mediaPath: "wechat://wx_group_9001/wx_msg_007.jpg",
    mediaMimeType: "image/jpeg",
    mediaDescription: "客户上传植物叶片照片：叶片边缘轻微发黄，盆土表面偏湿。",
    attachments: [{ type: "image", media_path: "wechat://wx_group_9001/wx_msg_007.jpg", description: "售后状态判断图片" }]
  },
  {
    id: "msg_008",
    platform: "wechat",
    sourceChatId: "wx_group_9001",
    sourceSenderId: "wx_gardener_alan",
    senderName: "园艺顾问阿岚",
    normalizedRole: "service",
    personId: "s_004",
    sentAt: "2026-06-15 10:09:12",
    content: "",
    messageType: "video",
    mediaPath: "wechat://wx_group_9001/wx_msg_008.mp4",
    mediaMimeType: "video/mp4",
    durationSeconds: 36,
    transcriptText: "这段视频里我给您看一下怎么判断盆土干湿。先摸表层两厘米，如果还是湿的，今天不要再浇水；黄叶先剪掉老叶，放到通风散射光位置缓两天。",
    mediaDescription: "服务老师发送养护讲解视频，内容包含盆土干湿判断、黄叶处理和缓苗位置建议。",
    attachments: [{ type: "video", media_path: "wechat://wx_group_9001/wx_msg_008.mp4", duration_seconds: 36 }]
  },
  {
    id: "msg_009",
    platform: "wechat",
    sourceChatId: "wx_group_9001",
    sourceSenderId: "wx_user_a19",
    senderName: "张先生",
    normalizedRole: "customer",
    personId: "c_001",
    sentAt: "2026-06-15 10:10:04",
    content: "",
    messageType: "voice",
    mediaPath: "wechat://wx_group_9001/wx_msg_009.amr",
    mediaMimeType: "audio/amr",
    durationSeconds: 8,
    transcriptText: "那我今天先不浇水，放阳台里面通风的位置可以吗？",
    attachments: [{ type: "voice", media_path: "wechat://wx_group_9001/wx_msg_009.amr", duration_seconds: 8 }]
  }
];

export const identityReviewTasks = [
  {
    id: "ir_001",
    status: "pending",
    confidence: 0.92,
    recommendedPersonId: "c_001",
    recommendedName: "清风 / 张先生",
    evidence: [
      "客服在微信群要求客户发送淘宝ID",
      "客户回复：淘宝ID是 清风7788",
      "淘宝侧存在同名账号近期咨询记录"
    ],
    taobaoAccount: "清风7788",
    wechatAccount: "wx_user_a19",
    sourceMessageId: "msg_004"
  },
  {
    id: "ir_002",
    status: "needs_review",
    confidence: 0.61,
    recommendedPersonId: "c_002",
    recommendedName: "小鱼 / 王女士",
    evidence: [
      "客户自称刚才在淘宝咨询过价格",
      "微信昵称与淘宝昵称相似",
      "缺少明确淘宝ID或订单号"
    ],
    taobaoAccount: "小鱼2024",
    wechatAccount: "wx_user_b88",
    sourceMessageId: "msg_pending_018"
  }
];

export const conversations = [
  {
    id: "conv_001",
    customerId: "c_001",
    customerName: "张先生",
    owner: "客服小林",
    status: "quality_ready",
    stage: "群内答疑",
    startedAt: "2026-06-15 09:12:20",
    lastMessageAt: "2026-06-15 10:07:08",
    participants: ["张先生", "客服小林", "售后老师-周"],
    timeline: [
      "淘宝咨询产品效果",
      "客服引导加入微信群",
      "微信群内发送淘宝ID完成匹配",
      "售后老师回答效果与售后问题"
    ]
  },
  {
    id: "conv_002",
    customerId: "c_002",
    customerName: "王女士",
    owner: "客服小陈",
    status: "identity_review",
    stage: "身份待复核",
    startedAt: "2026-06-15 11:18:00",
    lastMessageAt: "2026-06-15 11:33:24",
    participants: ["王女士", "客服小陈"],
    timeline: ["微信入群", "客户自称淘宝咨询过", "缺少明确淘宝ID"]
  }
];

export const qualityResults = [
  {
    id: "qa_001",
    conversationId: "conv_001",
    customerName: "张先生",
    owner: "客服小林",
    objectiveScore: 37,
    aiScore: 51,
    finalScore: 88,
    totalScore: 88,
    status: "ai_scored",
    responseTime: {
      firstResponseSeconds: 42,
      longestWaitSeconds: 66,
      score: 19
    },
    dimensions: [
      { name: "响应速度", score: 19, max: 20, reason: "客户首次提问后 42 秒内回复" },
      { name: "回答专业度", score: 25, max: 30, reason: "回答方向正确，但缺少更完整的效果说明" },
      { name: "服务态度", score: 18, max: 20, reason: "语气礼貌，能继续追问需求" },
      { name: "流程合规", score: 18, max: 20, reason: "完成淘宝ID确认与群内承接" },
      { name: "风险扣分", score: 8, max: 10, reason: "未发现明显过度承诺" }
    ],
    risks: ["售后保障说明略泛，需要补充标准话术"]
  }
];

export const customerProfiles = [
  {
    id: "c_001",
    name: "张先生",
    taobaoId: "清风7788",
    wechatId: "wx_user_a19",
    intentLevel: "高意向",
    satisfaction: "一般偏满意",
    owner: "客服小林",
    tags: ["效果关注", "售后关注", "高意向", "待跟进"],
    needs: ["产品效果", "售后保障", "使用周期"],
    lastActiveAt: "2026-06-15 10:07:08"
  },
  {
    id: "c_002",
    name: "王女士",
    taobaoId: "待确认",
    wechatId: "wx_user_b88",
    intentLevel: "中意向",
    satisfaction: "未知",
    owner: "客服小陈",
    tags: ["身份待复核", "价格敏感"],
    needs: ["价格优惠", "对比产品"],
    lastActiveAt: "2026-06-15 11:33:24"
  }
];

export const overview = {
  superAdmin: {
    roleName: "超级管理员",
    metrics: [
      { label: "今日新增消息", value: 1286, trend: "+12%" },
      { label: "待身份复核", value: 24, trend: "-3" },
      { label: "待质检会话", value: 57, trend: "+9" },
      { label: "平均质检分", value: 86.4, trend: "+1.8" },
      { label: "高意向客户", value: 39, trend: "+7" },
      { label: "异常会话", value: 8, trend: "-2" }
    ],
    workflow: ["数据接入", "消息标准化", "身份归一", "会话链路", "质检评分", "客户画像", "BI看板"]
  },
  qualityUser: {
    roleName: "普通质检用户",
    metrics: [
      { label: "我的待复核", value: 11, trend: "+2" },
      { label: "我的待质检", value: 18, trend: "+4" },
      { label: "今日完成", value: 9, trend: "+3" },
      { label: "异常提醒", value: 3, trend: "持平" }
    ],
    workflow: ["授权消息", "身份复核", "质检评分", "人工备注", "提交结果"]
  },
  serviceUser: {
    roleName: "客服工作台",
    metrics: [
      { label: "今日跟进", value: 14, trend: "+5" },
      { label: "待处理客户", value: 8, trend: "+1" },
      { label: "当前会话", value: 3, trend: "进行中" },
      { label: "客户满意提醒", value: 2, trend: "需关注" }
    ],
    workflow: ["客户接入", "问题识别", "回复承接", "转接协同", "跟进闭环"]
  }
};

export const permissionModel = {
  roles: [
    { key: "super_admin", name: "超级管理员", dataScope: "全部数据", userCount: 1 },
    { key: "quality_manager", name: "质检主管", dataScope: "部门数据", userCount: 2 },
    { key: "quality_user", name: "质检员", dataScope: "授权数据", userCount: 8 },
    { key: "service_user", name: "客服", dataScope: "本人客户", userCount: 36 }
  ],
  permissions: [
    "message:view",
    "identity:review",
    "quality:review",
    "quality:edit",
    "customer:view",
    "account:create",
    "permission:grant",
    "rule:config",
    "bi:view",
    "data:export"
  ],
  accounts: getAccountRows()
};

function getAccountRows() {
  return users.map(({ passwordHash, ...user }) => user);
}

export const ruleConfig = {
  responseTimeoutSeconds: 180,
  manualReviewThreshold: 0.75,
  weights: [
    { key: "response_time", name: "响应速度", weight: 20 },
    { key: "professional", name: "回答专业度", weight: 30 },
    { key: "attitude", name: "服务态度", weight: 20 },
    { key: "process", name: "流程合规", weight: 20 },
    { key: "risk", name: "风险扣分", weight: 10 }
  ],
  cluePriority: [
    "淘宝ID精确匹配",
    "订单号精确匹配",
    "手机号精确匹配",
    "微信号精确匹配",
    "客户自报信息",
    "昵称相似匹配",
    "时间线推断"
  ],
  riskKeywords: ["投诉", "没人回复", "退款", "骗人", "没效果", "不满意"],
  intentKeywords: ["多少钱", "怎么下单", "优惠", "能不能今天发", "付款", "套餐"]
};

export const biDashboard = {
  scoreTrend: [
    { label: "周一", value: 82 },
    { label: "周二", value: 84 },
    { label: "周三", value: 86 },
    { label: "周四", value: 85 },
    { label: "周五", value: 88 }
  ],
  responseTrend: [
    { label: "0-1分钟", value: 64 },
    { label: "1-3分钟", value: 23 },
    { label: "3-10分钟", value: 9 },
    { label: "10分钟以上", value: 4 }
  ],
  questionTypes: [
    { label: "产品成活率", value: 31 },
    { label: "缓苗黄叶", value: 20 },
    { label: "光照环境", value: 16 },
    { label: "品种搭配", value: 12 },
    { label: "养护方法", value: 9 },
    { label: "售后处理", value: 7 },
    { label: "价格套餐", value: 5 }
  ],
  staffRanking: [
    { name: "客服小林", score: 91, conversations: 42 },
    { name: "客服小陈", score: 88, conversations: 36 },
    { name: "客服小周", score: 84, conversations: 33 }
  ]
};
