const STAFF_ROLES = new Set(["service", "sales", "after_sales"]);
const CUSTOMER_ROLE = "customer";
const DEFAULT_TIMEOUT_SECONDS = 180;

export function computeConversationObjectiveMetrics(messages = [], options = {}) {
  const timeoutSeconds = Number(options.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS);
  const sortedMessages = [...messages].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  const customerMessages = sortedMessages.filter((item) => item.role === CUSTOMER_ROLE);
  const staffMessages = sortedMessages.filter((item) => STAFF_ROLES.has(item.role));
  const customerQuestions = customerMessages.filter((item) => isCustomerQuestion(messageText(item)));
  const responsePairs = customerQuestions.map((message) => ({
    customerMessage: message,
    staffResponse: findNextStaffMessage(sortedMessages, message)
  }));
  const answeredPairs = responsePairs.filter((item) => item.staffResponse);
  const responseSeconds = answeredPairs
    .map((item) => secondsBetween(item.customerMessage.sentAt, item.staffResponse.sentAt))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const timeoutCount = responseSeconds.filter((value) => value > timeoutSeconds).length;
  const replyCoverageRate = customerQuestions.length ? round2(answeredPairs.length / customerQuestions.length) : 1;
  const averageResponseSeconds = responseSeconds.length ? Math.round(responseSeconds.reduce((sum, value) => sum + value, 0) / responseSeconds.length) : null;
  const firstResponseSeconds = responseSeconds.length ? responseSeconds[0] : null;
  const longestWaitSeconds = responseSeconds.length ? Math.max(...responseSeconds) : null;
  const proactiveFollowupCount = staffMessages.filter((item) => isProactiveFollowup(messageText(item))).length;
  const identityClueCount = customerMessages.filter((item) => hasIdentityClue(messageText(item))).length;
  const responseScore = scoreResponseSpeed(averageResponseSeconds, timeoutCount, timeoutSeconds);
  const coverageScore = Math.round(replyCoverageRate * 10);
  const processScore = scoreProcessExecution({ identityClueCount, proactiveFollowupCount, staffMessages });
  const objectiveScore = Math.max(0, Math.min(40, responseScore + coverageScore + processScore));

  return {
    first_response_seconds: firstResponseSeconds,
    average_response_seconds: averageResponseSeconds,
    longest_wait_seconds: longestWaitSeconds,
    timeout_count: timeoutCount,
    timeout_threshold_seconds: timeoutSeconds,
    reply_coverage_rate: replyCoverageRate,
    effective_reply_rate: replyCoverageRate,
    customer_question_count: customerQuestions.length,
    service_reply_count: staffMessages.length,
    proactive_followup_count: proactiveFollowupCount,
    identity_clue_count: identityClueCount,
    response_score: responseScore,
    coverage_score: coverageScore,
    process_score: processScore,
    objective_score: objectiveScore,
    response_pairs: answeredPairs.map((item) => ({
      customer_message_id: item.customerMessage.id,
      staff_message_id: item.staffResponse.id,
      response_seconds: secondsBetween(item.customerMessage.sentAt, item.staffResponse.sentAt)
    }))
  };
}

export function buildObjectiveDimensions(metrics = {}) {
  return [
    {
      name: "响应速度",
      score: Number(metrics.response_score || 0),
      max: 20,
      reason: `平均响应 ${formatMetric(metrics.average_response_seconds)} 秒，首次响应 ${formatMetric(metrics.first_response_seconds)} 秒，超时 ${Number(metrics.timeout_count || 0)} 次。`
    },
    {
      name: "回复覆盖率",
      score: Number(metrics.coverage_score || 0),
      max: 10,
      reason: `客户有效提问 ${Number(metrics.customer_question_count || 0)} 次，回复覆盖率 ${Math.round(Number(metrics.reply_coverage_rate ?? 0) * 100)}%。`
    },
    {
      name: "流程执行",
      score: Number(metrics.process_score || 0),
      max: 10,
      reason: `身份线索 ${Number(metrics.identity_clue_count || 0)} 条，主动承接/跟进 ${Number(metrics.proactive_followup_count || 0)} 次。`
    }
  ];
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

function findNextStaffMessage(sortedMessages, customerMessage) {
  const customerTime = new Date(customerMessage.sentAt).getTime();
  return sortedMessages.find((message) => {
    if (!STAFF_ROLES.has(message.role)) return false;
    return new Date(message.sentAt).getTime() > customerTime;
  });
}

function secondsBetween(start, end) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
}

function isCustomerQuestion(content = "") {
  return /[?？]|吗|么|怎么|如何|会不会|能不能|有没有|如果|多久|多少|几|要不要|怎么办|怎么处理/.test(content);
}

function isProactiveFollowup(content = "") {
  return /麻烦|请|我先|我帮|帮您|建议|可以给|方便|回访|跟进|确认|整理/.test(content);
}

function hasIdentityClue(content = "") {
  return /淘宝\s*(ID|id|账号|号)?\s*(是|叫|就是|:|：)|订单|手机号|微信号/.test(content);
}

function scoreResponseSpeed(averageResponseSeconds, timeoutCount, timeoutSeconds) {
  if (averageResponseSeconds === null || averageResponseSeconds === undefined) return 0;
  let score = 20;
  if (averageResponseSeconds > 60) score -= 2;
  if (averageResponseSeconds > 120) score -= 3;
  if (averageResponseSeconds > timeoutSeconds) score -= 5;
  score -= timeoutCount * 4;
  return Math.max(0, score);
}

function scoreProcessExecution({ identityClueCount, proactiveFollowupCount, staffMessages }) {
  let score = 0;
  if (identityClueCount > 0) score += 4;
  if (proactiveFollowupCount > 0) score += 3;
  if (staffMessages.length > 0) score += 3;
  return Math.min(10, score);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function formatMetric(value) {
  return value === null || value === undefined ? "-" : String(value);
}
