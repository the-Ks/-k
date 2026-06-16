export const gardeningQuestionCategories = [
  {
    type: "产品成活率",
    keywords: ["成活", "养死", "活不了", "死苗", "不活", "状态不好", "蔫", "萎蔫", "缓不过来"]
  },
  {
    type: "缓苗黄叶",
    keywords: ["缓苗", "黄叶", "掉叶", "老叶", "叶子黄", "叶片", "蔫了"]
  },
  {
    type: "光照环境",
    keywords: ["光照", "半日照", "直射光", "暴晒", "遮阴", "遮阳", "南向", "露台", "阳台", "通风"]
  },
  {
    type: "养护方法",
    keywords: ["浇水", "施肥", "换盆", "盆土", "见干见湿", "养护", "新手", "怎么养"]
  },
  {
    type: "品种搭配",
    keywords: ["月季", "绣球", "铁线莲", "栀子", "茉莉", "品种", "搭配", "组合", "花期", "复花"]
  },
  {
    type: "售后处理",
    keywords: ["售后", "退", "补", "赔", "处理", "反馈", "拍照", "签收", "标准"]
  },
  {
    type: "价格套餐",
    keywords: ["价格", "套餐", "预算", "优惠", "组合价", "多少钱", "下单"]
  },
  {
    type: "物流损伤",
    keywords: ["物流", "发货", "运输", "外箱", "折断", "脱盆", "快递", "到货"]
  }
];

export function classifyQuestionTypes(messages = []) {
  const counts = gardeningQuestionCategories.map((category) => ({
    type: category.type,
    count: 0,
    percentage: 0
  }));

  for (const message of messages) {
    const content = messageText(message).toLowerCase();
    if (!content) continue;

    gardeningQuestionCategories.forEach((category, index) => {
      const matched = category.keywords.some((keyword) => content.includes(keyword.toLowerCase()));
      if (matched) counts[index].count += 1;
    });
  }

  const totalHits = counts.reduce((sum, item) => sum + item.count, 0);
  return counts
    .filter((item) => item.count > 0)
    .map((item) => ({
      ...item,
      percentage: totalHits ? Math.round((item.count / totalHits) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);
}

function messageText(message = {}) {
  return [
    message.content,
    message.transcriptText,
    message.transcript_text,
    message.ocrText,
    message.ocr_text,
    message.mediaDescription,
    message.media_description,
    message.imageDescription,
    message.image_description,
    message.linkTitle,
    message.link_title,
    message.linkUrl,
    message.link_url
  ]
    .filter(Boolean)
    .join(" / ");
}

export function fallbackQuestionTypes() {
  return [
    { type: "产品成活率", count: 31, percentage: 31 },
    { type: "缓苗黄叶", count: 20, percentage: 20 },
    { type: "光照环境", count: 16, percentage: 16 },
    { type: "品种搭配", count: 12, percentage: 12 },
    { type: "养护方法", count: 9, percentage: 9 },
    { type: "售后处理", count: 7, percentage: 7 },
    { type: "价格套餐", count: 5, percentage: 5 }
  ];
}
