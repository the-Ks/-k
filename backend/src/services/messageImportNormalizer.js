const VALID_SOURCE_SYSTEMS = new Set(["taobao", "wechat"]);
const VALID_ROLES = new Set(["customer", "service", "sales", "after_sales", "bot", "system", "unknown"]);

export function normalizeImportPayload(payload = {}) {
  const sourceSystem = normalizeSourceSystem(payload.source_system || payload.sourceSystem);
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const batchMetadata = {
    company_domain: payload.company_domain || payload.companyDomain || "flower_gardening",
    source_name: payload.source_name || payload.sourceName || "",
    imported_by: payload.imported_by || payload.importedBy || "",
    note: payload.note || ""
  };

  if (!sourceSystem) {
    return buildPayloadError("", payload, batchMetadata, "source_system must be taobao or wechat");
  }

  if (!messages.length) {
    return buildPayloadError(sourceSystem, payload, batchMetadata, "messages must be a non-empty array");
  }

  const normalizedMessages = messages.map((message, index) => normalizeMessage(sourceSystem, message, index));

  return {
    ok: normalizedMessages.every((item) => item.valid),
    sourceSystem,
    mode: payload.mode || "incremental",
    fileName: payload.file_name || payload.fileName || null,
    batchMetadata,
    messages: normalizedMessages,
    payloadErrors: []
  };
}

export function normalizeSourceSystem(value) {
  const source = String(value || "").trim().toLowerCase();
  if (VALID_SOURCE_SYSTEMS.has(source)) return source;
  return "";
}

export function normalizeMessageRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (VALID_ROLES.has(role)) return role;

  if (includesAny(role, ["customer", "buyer", "client", "用户", "客户", "买家", "顾客"])) return "customer";
  if (includesAny(role, ["after_sales", "aftersales", "售后"])) return "after_sales";
  if (includesAny(role, ["sales", "销售", "导购"])) return "sales";
  if (includesAny(role, ["service", "staff", "客服", "服务", "老师", "接待"])) return "service";
  if (includesAny(role, ["bot", "机器人", "自动回复"])) return "bot";
  if (includesAny(role, ["system", "系统"])) return "system";

  return "unknown";
}

function buildPayloadError(sourceSystem, payload, batchMetadata, error) {
  return {
    ok: false,
    sourceSystem,
    mode: payload.mode || "incremental",
    fileName: payload.file_name || payload.fileName || null,
    batchMetadata,
    messages: [],
    payloadErrors: [error]
  };
}

function normalizeMessage(sourceSystem, message = {}, index) {
  const errors = [];
  const sourceMessageId = firstText(message, ["source_message_id", "sourceMessageId", "message_id", "messageId", "id"]);
  const sourceChatId = firstText(message, ["source_chat_id", "sourceChatId", "chat_id", "chatId", "group_id", "groupId", "session_id", "sessionId"]);
  const sourceSenderId = firstText(message, ["source_sender_id", "sourceSenderId", "sender_id", "senderId", "member_id", "memberId", "user_id", "userId"]);
  const senderName = firstText(message, ["sender_name", "senderName", "speaker", "nickname", "display_name", "displayName", "name"]);
  const roleRaw = firstText(message, ["role_raw", "roleRaw", "role", "sender_role", "senderRole"]);
  const normalizedRole = normalizeMessageRole(firstText(message, ["normalized_role", "normalizedRole"]) || roleRaw);
  const sentAtRaw = firstText(message, ["sent_at", "sentAt", "send_time", "sendTime", "time", "created_at", "createdAt"]);
  const sentAt = normalizeDateTime(sentAtRaw);
  const content = firstText(message, ["content", "text", "message", "body"]);
  const messageTypeRaw = firstText(message, ["message_type", "messageType", "type"]);
  let messageType = normalizeMessageType(messageTypeRaw);
  const mediaUrl = firstText(message, ["media_url", "mediaUrl", "image_url", "imageUrl", "file_url", "fileUrl", "url"]);
  const mediaPath = firstText(message, ["media_path", "mediaPath", "local_path", "localPath", "path"]);
  const mediaMimeType = firstText(message, ["media_mime_type", "mediaMimeType", "mime_type", "mimeType", "content_type", "contentType"]);
  const mediaSizeBytes = firstNumber(message, ["media_size_bytes", "mediaSizeBytes", "size_bytes", "sizeBytes", "size"]);
  const mediaWidth = firstNumber(message, ["media_width", "mediaWidth", "width"]);
  const mediaHeight = firstNumber(message, ["media_height", "mediaHeight", "height"]);
  const durationSeconds = firstNumber(message, ["duration_seconds", "durationSeconds", "duration", "audio_duration", "audioDuration", "video_duration", "videoDuration"]);
  const fileName = firstText(message, ["file_name", "fileName", "filename", "name"]);
  const thumbnailUrl = firstText(message, ["thumbnail_url", "thumbnailUrl", "thumb_url", "thumbUrl"]);
  const ocrText = firstText(message, ["ocr_text", "ocrText", "ocr", "recognized_text", "recognizedText"]);
  const transcriptText = firstText(message, ["transcript_text", "transcriptText", "transcript", "voice_text", "voiceText", "audio_text", "audioText", "video_text", "videoText", "speech_text", "speechText"]);
  const mediaDescription = firstText(message, ["media_description", "mediaDescription", "image_description", "imageDescription", "video_description", "videoDescription", "file_summary", "fileSummary", "caption", "description", "summary"]);
  const imageDescription = firstText(message, ["image_description", "imageDescription", "image_caption", "imageCaption", "caption"]);
  const linkUrl = firstText(message, ["link_url", "linkUrl", "url", "page_url", "pageUrl"]);
  const linkTitle = firstText(message, ["link_title", "linkTitle", "title"]);
  const structuredContent = normalizeStructuredContent(message);
  const attachments = normalizeAttachments(message);
  if (!messageTypeRaw) {
    messageType = inferMessageType({ content, mediaMimeType, mediaUrl, mediaPath, linkUrl, attachments, structuredContent });
  }
  const hasMediaEvidence = Boolean(
    mediaUrl ||
      mediaPath ||
      thumbnailUrl ||
      ocrText ||
      transcriptText ||
      mediaDescription ||
      imageDescription ||
      linkUrl ||
      linkTitle ||
      attachments.length ||
      Object.keys(structuredContent).length
  );

  if (!sourceMessageId) errors.push("source_message_id is required");
  if (!sourceChatId) errors.push("source_chat_id is required");
  if (!sourceSenderId) errors.push("source_sender_id is required");
  if (!sentAt) errors.push("valid sent_at/time is required");
  if (messageType === "text" && !content) errors.push("content is required for text messages");
  if (messageType !== "text" && !content && !hasMediaEvidence) {
    errors.push("non-text messages require content, media_url, media_path, attachment, transcript_text, ocr_text, media_description, or structured_content");
  }

  return {
    valid: errors.length === 0,
    index,
    errors,
    value: {
      sourceSystem,
      sourceMessageId,
      sourceChatId,
      sourceSenderId,
      senderName,
      sentAt,
      roleRaw,
      normalizedRole,
      content,
      messageType,
      mediaUrl,
      mediaPath,
      mediaMimeType,
      mediaSizeBytes,
      mediaWidth,
      mediaHeight,
      durationSeconds,
      fileName,
      thumbnailUrl,
      ocrText,
      transcriptText,
      mediaDescription,
      imageDescription,
      linkUrl,
      linkTitle,
      attachments,
      structuredContent,
      mediaMetadata: buildMediaMetadata(message, attachments),
      rawPayload: message
    }
  };
}

function firstText(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function firstNumber(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value === undefined || value === null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeAttachments(message = {}) {
  const rawAttachments = Array.isArray(message.attachments)
    ? message.attachments
    : Array.isArray(message.media)
      ? message.media
      : [];

  return rawAttachments
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      type: normalizeMessageType(firstText(item, ["message_type", "messageType", "type"]) || firstText(message, ["message_type", "messageType", "type"])),
      media_url: firstText(item, ["media_url", "mediaUrl", "image_url", "imageUrl", "file_url", "fileUrl", "url"]),
      media_path: firstText(item, ["media_path", "mediaPath", "local_path", "localPath", "path"]),
      mime_type: firstText(item, ["media_mime_type", "mediaMimeType", "mime_type", "mimeType", "content_type", "contentType"]),
      size_bytes: firstNumber(item, ["media_size_bytes", "mediaSizeBytes", "size_bytes", "sizeBytes", "size"]),
      width: firstNumber(item, ["media_width", "mediaWidth", "width"]),
      height: firstNumber(item, ["media_height", "mediaHeight", "height"]),
      duration_seconds: firstNumber(item, ["duration_seconds", "durationSeconds", "duration", "audio_duration", "audioDuration", "video_duration", "videoDuration"]),
      file_name: firstText(item, ["file_name", "fileName", "filename", "name"]),
      thumbnail_url: firstText(item, ["thumbnail_url", "thumbnailUrl", "thumb_url", "thumbUrl"]),
      ocr_text: firstText(item, ["ocr_text", "ocrText", "ocr", "recognized_text", "recognizedText"]),
      transcript_text: firstText(item, ["transcript_text", "transcriptText", "transcript", "voice_text", "voiceText", "audio_text", "audioText", "video_text", "videoText", "speech_text", "speechText"]),
      description: firstText(item, ["media_description", "mediaDescription", "image_description", "imageDescription", "video_description", "videoDescription", "file_summary", "fileSummary", "caption", "description", "summary"]),
      link_url: firstText(item, ["link_url", "linkUrl", "url", "page_url", "pageUrl"]),
      link_title: firstText(item, ["link_title", "linkTitle", "title"])
    }));
}

function normalizeStructuredContent(message = {}) {
  const structured = message.structured_content || message.structuredContent || message.card || message.mini_program || message.miniProgram || message.location || message.product_card || message.productCard;
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) return {};
  return structured;
}

function buildMediaMetadata(message = {}, attachments = []) {
  return {
    has_media: Boolean(attachments.length || firstText(message, ["media_url", "mediaUrl", "media_path", "mediaPath", "image_url", "imageUrl", "file_url", "fileUrl", "url"])),
    original_type: firstText(message, ["message_type", "messageType", "type"]),
    parse_status: firstText(message, ["parse_status", "parseStatus"]) || "",
    external_media_id: firstText(message, ["media_id", "mediaId", "file_id", "fileId"]),
    analysis_text_source: firstText(message, ["analysis_text_source", "analysisTextSource"]) || ""
  };
}

function normalizeDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const candidates = [];
  const isoLike = raw.includes("T") ? raw : raw.replace(" ", "T");
  candidates.push(isoLike);
  candidates.push(isoLike.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  candidates.push(isoLike.replace(/([+-]\d{2})$/, "$1:00"));
  candidates.push(raw);

  for (const candidate of candidates) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return candidate;
    }
  }

  return "";
}

function normalizeMessageType(value) {
  const type = String(value || "text").trim().toLowerCase();
  const aliases = {
    audio: "voice",
    short_video: "video",
    miniprogram: "mini_program",
    miniapp: "mini_program",
    product: "product_card",
    card: "product_card"
  };
  const normalized = aliases[type] || type;
  if (["text", "image", "voice", "video", "file", "link", "mini_program", "product_card", "emoji", "location", "mixed", "system", "auto_reply", "unknown"].includes(normalized)) return normalized;
  return "text";
}

function inferMessageType({ content, mediaMimeType, mediaUrl, mediaPath, linkUrl, attachments, structuredContent }) {
  if (content) return "text";
  const mime = String(mediaMimeType || "").toLowerCase();
  const mediaLocator = String(mediaUrl || mediaPath || "").toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(mediaLocator)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|mov|avi|m4v|webm)$/i.test(mediaLocator)) return "video";
  if (mime.startsWith("audio/") || /\.(amr|mp3|wav|m4a|aac|ogg)$/i.test(mediaLocator)) return "voice";
  if (linkUrl) return "link";
  if (Object.keys(structuredContent || {}).length) return "mixed";
  if (attachments?.length === 1) return normalizeMessageType(attachments[0].type);
  if (attachments?.length > 1) return "mixed";
  return "text";
}

function includesAny(value, keywords) {
  return keywords.some((keyword) => value.includes(keyword.toLowerCase()));
}
