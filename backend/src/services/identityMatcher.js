const TAOBAO_ID_PATTERNS = [
  /淘宝\s*(?:ID|id|账号|号)?\s*(?:是|叫|就是|:|：)?\s*([A-Za-z0-9_\-\u4e00-\u9fa5]{2,30})/gi,
  /淘宝(?:昵称|名字)\s*(?:是|叫|:|：)?\s*([A-Za-z0-9_\-\u4e00-\u9fa5]{2,30})/gi
];

const STOP_WORDS = new Set(["刚才", "主要", "还没下单", "咨询", "记录", "问", "是", "叫", "就是"]);

export function buildIdentityReviewTasksFromMessages(storedTasks = [], messages = []) {
  const existingEvidenceIds = new Set(storedTasks.map((item) => item.sourceMessageId).filter(Boolean));
  const taobaoCustomerMessages = messages.filter((item) => item.platform === "taobao" && item.normalizedRole === "customer");
  const wechatCustomerMessages = messages.filter((item) => item.platform === "wechat" && item.normalizedRole === "customer");

  const generatedTasks = wechatCustomerMessages
    .map((message) => buildCandidateTask(message, taobaoCustomerMessages))
    .filter(Boolean)
    .filter((task) => !existingEvidenceIds.has(task.sourceMessageId));

  return [...storedTasks, ...dedupeGeneratedTasks(generatedTasks)].sort((a, b) => {
    const statusOrder = statusRank(a.status) - statusRank(b.status);
    if (statusOrder !== 0) return statusOrder;
    return Number(b.confidence || 0) - Number(a.confidence || 0);
  });
}

export function extractTaobaoIds(content = "") {
  const ids = [];
  for (const pattern of TAOBAO_ID_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content))) {
      const value = normalizeExtractedId(match[1]);
      if (value && !ids.includes(value)) ids.push(value);
    }
  }
  return ids;
}

function buildCandidateTask(wechatMessage, taobaoMessages) {
  const wechatText = messageText(wechatMessage);
  const extractedIds = extractTaobaoIds(wechatText);
  if (!extractedIds.length) return null;

  const bestMatch = findBestTaobaoMatch(extractedIds, wechatMessage, taobaoMessages);
  const providedTaobaoId = extractedIds[0];
  const confidence = bestMatch ? bestMatch.confidence : 0.62;
  const status = confidence >= 0.9 ? "pending" : "needs_review";
  const matchReason = bestMatch?.reason || "客户在微信群提供了淘宝身份，但淘宝侧缺少强一致命中，需要人工复核。";
  const taobaoAccount = bestMatch?.message?.senderName || providedTaobaoId;

  return {
    id: `auto_identity_${wechatMessage.id}`,
    status,
    confidence,
    recommendedPersonId: "",
    recommendedName: bestMatch ? `${taobaoAccount} / ${wechatMessage.senderName}` : `${providedTaobaoId} / ${wechatMessage.senderName}`,
    evidence: [
      `微信群客户自报淘宝身份：${wechatText}`,
      bestMatch
        ? `淘宝侧候选客户：${taobaoAccount}，会话 ${bestMatch.message.sourceChatId}`
        : "暂未找到强匹配淘宝客户，需要人工确认",
      matchReason
    ],
    taobaoAccount: providedTaobaoId,
    wechatAccount: wechatMessage.sourceSenderId || wechatMessage.senderName,
    sourceMessageId: wechatMessage.id,
    matchMethod: bestMatch?.method || "wechat_self_reported_taobao_id"
  };
}

function findBestTaobaoMatch(extractedIds, wechatMessage, taobaoMessages) {
  const scored = [];

  for (const message of taobaoMessages) {
    for (const extractedId of extractedIds) {
      const score = scoreTaobaoMatch(extractedId, wechatMessage, message);
      if (score.confidence > 0) {
        scored.push({
          ...score,
          message
        });
      }
    }
  }

  return scored.sort((a, b) => b.confidence - a.confidence)[0] || null;
}

function scoreTaobaoMatch(extractedId, wechatMessage, taobaoMessage) {
  const normalizedId = normalizeToken(extractedId);
  const senderId = normalizeToken(taobaoMessage.sourceSenderId);
  const senderName = normalizeToken(taobaoMessage.senderName);
  const chatId = normalizeToken(taobaoMessage.sourceChatId);

  if (senderName && normalizedId === senderName) {
    return {
      confidence: 0.94,
      method: "taobao_sender_name_exact",
      reason: "微信自报淘宝身份与淘宝侧客户昵称完全一致。"
    };
  }

  if (senderId && (senderId.includes(normalizedId) || normalizedId.includes(senderId))) {
    return {
      confidence: 0.92,
      method: "taobao_source_sender_id_contains",
      reason: "微信自报淘宝 ID 与淘宝来源发送人 ID 命中。"
    };
  }

  if (chatId && chatId.includes(normalizedId)) {
    return {
      confidence: 0.88,
      method: "taobao_chat_id_contains",
      reason: "微信自报淘宝身份与淘宝会话 ID 存在一致线索。"
    };
  }

  const topicScore = sharedTopicScore(messageText(wechatMessage), messageText(taobaoMessage));
  if (topicScore >= 2) {
    return {
      confidence: 0.72,
      method: "topic_overlap_after_self_report",
      reason: "微信自报淘宝身份后，与淘宝侧咨询内容存在多个园艺主题重合。"
    };
  }

  return {
    confidence: 0,
    method: "",
    reason: ""
  };
}

function sharedTopicScore(left = "", right = "") {
  const keywords = ["月季", "绣球", "铁线莲", "栀子", "阳台", "露台", "黄叶", "缓苗", "光照", "套餐", "售后", "价格", "预算", "复花"];
  return keywords.reduce((total, keyword) => total + (left.includes(keyword) && right.includes(keyword) ? 1 : 0), 0);
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

function normalizeExtractedId(value = "") {
  const cleaned = String(value)
    .trim()
    .replace(/[，。,.；;！!？?\s].*$/u, "")
    .replace(/^是|^叫|^就是/u, "")
    .trim();
  if (!cleaned || STOP_WORDS.has(cleaned)) return "";
  return cleaned;
}

function normalizeToken(value = "") {
  return String(value).trim().toLowerCase().replace(/\s+/g, "");
}

function dedupeGeneratedTasks(tasks) {
  const seen = new Set();
  return tasks.filter((task) => {
    const key = `${task.taobaoAccount}|${task.wechatAccount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function statusRank(status) {
  const rank = {
    pending: 0,
    needs_review: 1,
    confirmed: 2,
    resolved: 3,
    rejected: 4
  };
  return rank[status] ?? 9;
}
