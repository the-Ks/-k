import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { domainProfile } from "../config/domainProfile.js";
import { conversations, customerProfiles, messages, qualityResults } from "../data/mockData.js";
import { buildSystemPrompt, buildUserPrompt, getPromptProfile } from "../prompts/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "../..");

loadLocalEnv();

function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    const envPath = path.join(backendRoot, filename);
    if (!existsSync(envPath)) continue;

    const content = readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const index = trimmed.indexOf("=");
      if (index === -1) continue;

      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !globalThis.process?.env?.[key]) {
        globalThis.process.env[key] = value;
      }
    }
  }
}

export async function runAiQualityEvaluation(payload = {}) {
  const env = globalThis.process?.env || {};
  const apiKey = env.DEEPSEEK_API_KEY;
  const model = env.DEEPSEEK_MODEL || "deepseek-v4-pro";
  const baseUrl = normalizeBaseUrl(env.DEEPSEEK_BASE_URL || "https://api.deepseek.com");
  const timeoutMs = normalizeTimeoutMs(env.DEEPSEEK_TIMEOUT_MS, 15000);
  const conversationId = payload.conversation_id || payload.conversationId || "conv_001";
  const viewerRole = normalizeViewerRole(payload.viewer_role || payload.viewerRole || payload.role);
  const promptProfile = getPromptProfile(viewerRole);
  const conversationInput = payload.conversation_json || payload.conversation || buildConversationInput(conversationId);

  if (!apiKey) {
    return {
      ok: false,
      aiConnected: false,
      status: "missing_api_key",
      message: "DeepSeek API key is not configured. Set DEEPSEEK_API_KEY in backend/.env.local or environment variables.",
      model,
      conversationId,
      viewerRole,
      analysisProfile: promptProfile.key,
      analysisProfileLabel: promptProfile.label,
      promptDocument: promptProfile.promptDocument,
      timeoutMs
    };
  }

  const requestBody = {
    model,
    messages: [
      { role: "system", content: buildSystemPrompt(promptProfile) },
      { role: "user", content: buildUserPrompt(conversationInput, promptProfile) }
    ],
    temperature: 0.2,
    max_tokens: promptProfile.maxTokens,
    response_format: { type: "json_object" }
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        aiConnected: true,
        status: "deepseek_error",
        message: "DeepSeek request failed.",
        model,
        conversationId,
        viewerRole,
        analysisProfile: promptProfile.key,
        analysisProfileLabel: promptProfile.label,
        promptDocument: promptProfile.promptDocument,
        timeoutMs,
        statusCode: response.status,
        detail: safeJson(raw) || raw
      };
    }

    const data = safeJson(raw);
    const content = data?.choices?.[0]?.message?.content || "{}";
    const result = safeJson(content) || { raw_content: content };

    return {
      ok: true,
      aiConnected: true,
      status: "completed",
      provider: "deepseek",
      model,
      conversationId,
      viewerRole,
      analysisProfile: promptProfile.key,
      analysisProfileLabel: promptProfile.label,
      promptDocument: promptProfile.promptDocument,
      timeoutMs,
      result,
      usage: data?.usage || null
    };
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return {
      ok: false,
      aiConnected: false,
      status: timedOut ? "request_timeout" : "request_failed",
      message: timedOut ? `DeepSeek request timed out after ${timeoutMs}ms.` : error instanceof Error ? error.message : String(error),
      model,
      conversationId,
      viewerRole,
      analysisProfile: promptProfile.key,
      analysisProfileLabel: promptProfile.label,
      promptDocument: promptProfile.promptDocument,
      timeoutMs
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeViewerRole(value) {
  const role = String(value || "quality_user").trim();
  if (role === "super_admin") return "super_admin";
  if (role === "service_user") return "service_user";
  return "quality_user";
}

function normalizeBaseUrl(value) {
  return String(value).replace(/\/+$/, "");
}

function normalizeTimeoutMs(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(3000, Math.min(60000, Math.round(number)));
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildConversationInput(conversationId) {
  const conversation = conversations.find((item) => item.id === conversationId) || conversations[0];
  const quality = qualityResults.find((item) => item.conversationId === conversation?.id) || qualityResults[0];
  const customer = customerProfiles.find((item) => item.id === conversation?.customerId) || customerProfiles[0];
  const objectiveMetrics = {
    first_response_seconds: quality?.responseTime?.firstResponseSeconds ?? null,
    longest_wait_seconds: quality?.responseTime?.longestWaitSeconds ?? null,
    timeout_count: 0,
    reply_coverage_rate: null,
    effective_reply_rate: null,
    customer_question_count: null,
    proactive_followup_count: null,
    current_total_score: quality?.totalScore ?? null,
    process_check: ["identity_link_required", "wechat_group_handoff_required"]
  };

  return {
    conversation_id: conversation?.id || conversationId,
    customer_profile: {
      customer_id: customer?.id || "unknown",
      customer_name: customer?.name || "unknown",
      source: "taobao_to_wechat",
      identity_status: conversation?.status === "identity_review" ? "pending_review" : "confirmed"
    },
    business_context: domainProfile,
    messages: messages.map((item) => ({
      message_id: item.id,
      time: item.sentAt,
      role: item.normalizedRole,
      speaker: item.senderName,
      source: item.platform,
      message_type: item.messageType || "text",
      content: item.content || "",
      analysis_text: buildMessageAnalysisText(item),
      media: {
        media_url: item.mediaUrl || "",
        media_path: item.mediaPath || "",
        mime_type: item.mediaMimeType || "",
        duration_seconds: item.durationSeconds ?? null,
        file_name: item.fileName || "",
        thumbnail_url: item.thumbnailUrl || "",
        link_url: item.linkUrl || "",
        link_title: item.linkTitle || "",
        attachments: item.attachments || []
      },
      parsed_content: {
        transcript_text: item.transcriptText || "",
        ocr_text: item.ocrText || "",
        media_description: item.mediaDescription || item.imageDescription || "",
        structured_content: item.structuredContent || {}
      }
    })),
    objective_metrics: objectiveMetrics,
    rule_result: objectiveMetrics
  };
}

function buildMessageAnalysisText(item = {}) {
  return [
    item.content,
    item.transcriptText,
    item.ocrText,
    item.mediaDescription,
    item.imageDescription,
    item.linkTitle,
    item.linkUrl
  ]
    .filter(Boolean)
    .join(" / ");
}
