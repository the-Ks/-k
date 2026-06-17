import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { domainProfile } from "../config/domainProfile.js";
import { conversations, customerProfiles, messages, qualityResults } from "../data/mockData.js";
import { buildSystemPrompt, buildUserPrompt, getPromptProfile } from "../prompts/index.js";
import { validateAiQualityResult } from "./aiResultValidation.js";
import { isPostgresConfigured, query } from "./postgresClient.js";

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
  const conversationId = payload.conversation_id || payload.conversationId || "conv_001";
  const viewerRole = normalizeViewerRole(payload.viewer_role || payload.viewerRole || payload.role);
  const promptProfile = getPromptProfile(viewerRole);
  const providerConfig = resolveAiProviderConfig(env, promptProfile);
  const { provider, apiKey, model, baseUrl, timeoutMs, maxTokens, thinkingMode, includeThinking } = providerConfig;
  const suppliedConversationInput = payload.conversation_json || payload.conversation;
  const inputSource = suppliedConversationInput ? "payload" : isPostgresConfigured() ? "database" : "mock";
  const conversationInput = suppliedConversationInput || await buildConversationInput(conversationId, payload);

  if (!conversationInput) {
    return {
      ok: false,
      aiConnected: false,
      status: "conversation_context_not_found",
      message: "Conversation was not found or is outside the current user's data scope.",
      provider,
      model,
      conversationId,
      viewerRole,
      analysisProfile: promptProfile.key,
      analysisProfileLabel: promptProfile.label,
      promptDocument: promptProfile.promptDocument,
      timeoutMs,
      maxTokens,
      thinkingMode
    };
  }

  if (!apiKey) {
    return {
      ok: false,
      aiConnected: false,
      status: "missing_api_key",
      message: "AI provider API key is not configured. Set AI_API_KEY, or DEEPSEEK_API_KEY for the current DeepSeek test provider.",
      provider,
      model,
      conversationId,
      viewerRole,
      analysisProfile: promptProfile.key,
      analysisProfileLabel: promptProfile.label,
      promptDocument: promptProfile.promptDocument,
      timeoutMs,
      maxTokens,
      thinkingMode
    };
  }

  if (!model || !baseUrl) {
    return {
      ok: false,
      aiConnected: false,
      status: "missing_ai_provider_config",
      message: "AI provider model or base URL is not configured. Set AI_MODEL and AI_BASE_URL for non-default providers.",
      provider,
      model,
      conversationId,
      viewerRole,
      analysisProfile: promptProfile.key,
      analysisProfileLabel: promptProfile.label,
      promptDocument: promptProfile.promptDocument,
      timeoutMs,
      maxTokens,
      thinkingMode
    };
  }

  const requestBody = {
    model,
    messages: [
      { role: "system", content: buildSystemPrompt(promptProfile) },
      { role: "user", content: buildUserPrompt(conversationInput, promptProfile) }
    ],
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: "json_object" }
  };
  if (includeThinking) {
    requestBody.thinking = { type: thinkingMode };
  }

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
      const detail = safeJson(raw) || raw;
      const persistence = await persistAiQualityAudit({
        conversationId,
        inputSource,
        conversationInput,
        promptProfile,
        providerConfig,
        status: "provider_error",
        result: { error: detail },
        usage: null,
        validation: null,
        errorMessage: "AI provider request failed.",
        createdBy: payload.viewer_user_id || payload.viewerUserId || ""
      });
      return {
        ok: false,
        aiConnected: true,
        status: "ai_provider_error",
        message: "AI provider request failed.",
        provider,
        model,
        conversationId,
        viewerRole,
        analysisProfile: promptProfile.key,
        analysisProfileLabel: promptProfile.label,
        promptDocument: promptProfile.promptDocument,
        timeoutMs,
        maxTokens,
        thinkingMode,
        statusCode: response.status,
        detail,
        persistence
      };
    }

    const data = safeJson(raw);
    const content = data?.choices?.[0]?.message?.content || "{}";
    const result = safeJson(content) || { raw_content: content };
    const validation = validateAiQualityResult(result, promptProfile);
    const persistence = await persistAiQualityAudit({
      conversationId,
      inputSource,
      conversationInput,
      promptProfile,
      providerConfig,
      status: validation.ok ? "completed" : "schema_invalid",
      result,
      usage: data?.usage || null,
      validation,
      errorMessage: validation.ok ? "" : validation.errors.join("; "),
      createdBy: payload.viewer_user_id || payload.viewerUserId || ""
    });
    const scoreUpdate = validation.ok
      ? await applyAiScoreToQualityScore({
        conversationId,
        inputSource,
        conversationInput,
        promptProfile,
        aiResultId: persistence?.id || "",
        result,
        createdBy: payload.viewer_user_id || payload.viewerUserId || ""
      })
      : { ok: false, skipped: true, reason: "invalid_ai_result" };

    return {
      ok: validation.ok,
      aiConnected: true,
      status: validation.ok ? "completed" : "invalid_ai_result",
      message: validation.ok ? undefined : "AI provider returned JSON that does not match the required quality schema.",
      provider,
      model,
      conversationId,
      viewerRole,
      analysisProfile: promptProfile.key,
      analysisProfileLabel: promptProfile.label,
      promptDocument: promptProfile.promptDocument,
      timeoutMs,
      maxTokens,
      thinkingMode,
      validation,
      persistence,
      scoreUpdate,
      result,
      usage: data?.usage || null
    };
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    const message = timedOut ? `AI provider request timed out after ${timeoutMs}ms.` : error instanceof Error ? error.message : String(error);
    const persistence = await persistAiQualityAudit({
      conversationId,
      inputSource,
      conversationInput,
      promptProfile,
      providerConfig,
      status: timedOut ? "request_timeout" : "request_failed",
      result: { error: message },
      usage: null,
      validation: null,
      errorMessage: message,
      createdBy: payload.viewer_user_id || payload.viewerUserId || ""
    });
    return {
      ok: false,
      aiConnected: false,
      status: timedOut ? "request_timeout" : "request_failed",
      message,
      provider,
      model,
      conversationId,
      viewerRole,
      analysisProfile: promptProfile.key,
      analysisProfileLabel: promptProfile.label,
      promptDocument: promptProfile.promptDocument,
      timeoutMs,
      maxTokens,
      thinkingMode,
      persistence
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function applyAiScoreToQualityScore({
  conversationId,
  inputSource,
  conversationInput,
  promptProfile,
  aiResultId,
  result,
  createdBy
}) {
  if (!isPostgresConfigured()) {
    return { ok: false, skipped: true, reason: "postgres_not_configured" };
  }

  if (inputSource !== "database") {
    return { ok: false, skipped: true, reason: "payload_input_not_applied" };
  }

  if (promptProfile.key === "service_coaching") {
    return { ok: false, skipped: true, reason: "service_coaching_does_not_update_quality_score" };
  }

  const aiScore = extractAiScore(result, promptProfile);
  if (aiScore === null) {
    return { ok: false, skipped: true, reason: "ai_score_not_found" };
  }

  try {
    const latest = await query(
      `
        select id, objective_score
        from quality_score
        where conversation_id = $1
        order by created_at desc
        limit 1
      `,
      [conversationId]
    );
    const dimensions = buildAiScoreDimensions(result, promptProfile);
    const risks = buildAiRiskSummaries(result);

    if (latest.rows[0]) {
      const objectiveScore = normalizeScore(latest.rows[0].objective_score, 40);
      const finalScore = Math.min(100, Math.round((objectiveScore + aiScore) * 10) / 10);
      const updated = await query(
        `
          update quality_score
          set ai_score = $2,
              final_score = $3,
              status = 'ai_scored',
              dimensions = $4::jsonb,
              risks = $5::jsonb,
              ai_result_id = nullif($6, ''),
              scorer_user_id = nullif($7, ''),
              updated_at = now()
          where id = $1
          returning id, ai_score, final_score, status
        `,
        [
          latest.rows[0].id,
          aiScore,
          finalScore,
          JSON.stringify(dimensions),
          JSON.stringify(risks),
          aiResultId || "",
          createdBy || ""
        ]
      );
      return { ok: true, action: "updated", ...updated.rows[0] };
    }

    const objectiveScore = normalizeScore(conversationInput?.objective_metrics?.objective_score, 40);
    const finalScore = Math.min(100, Math.round((objectiveScore + aiScore) * 10) / 10);
    const inserted = await query(
      `
        insert into quality_score (
          conversation_id,
          objective_score,
          ai_score,
          final_score,
          status,
          objective_metrics,
          dimensions,
          risks,
          ai_result_id,
          scorer_user_id
        )
        values ($1, $2, $3, $4, 'ai_scored', $5::jsonb, $6::jsonb, $7::jsonb, nullif($8, ''), nullif($9, ''))
        returning id, ai_score, final_score, status
      `,
      [
        conversationId,
        objectiveScore,
        aiScore,
        finalScore,
        JSON.stringify(conversationInput?.objective_metrics || {}),
        JSON.stringify(dimensions),
        JSON.stringify(risks),
        aiResultId || "",
        createdBy || ""
      ]
    );
    return { ok: true, action: "inserted", ...inserted.rows[0] };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: "quality_score_update_failed",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function persistAiQualityAudit({
  conversationId,
  inputSource,
  conversationInput,
  promptProfile,
  providerConfig,
  status,
  result,
  usage,
  validation,
  errorMessage,
  createdBy
}) {
  if (!isPostgresConfigured()) {
    return { ok: false, skipped: true, reason: "postgres_not_configured" };
  }

  if (inputSource !== "database") {
    return { ok: false, skipped: true, reason: "payload_input_not_persisted" };
  }

  try {
    const insertResult = await query(
      `
        insert into ai_quality_result (
          conversation_id,
          provider,
          model,
          prompt_profile,
          prompt_document,
          prompt_version,
          status,
          input_json,
          result_json,
          usage_json,
          validation_status,
          validation_errors,
          error_message,
          created_by,
          completed_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12::jsonb, $13, nullif($14, ''), now())
        returning id, status, validation_status, created_at
      `,
      [
        conversationId,
        providerConfig.provider,
        providerConfig.model,
        promptProfile.key,
        promptProfile.promptDocument,
        providerConfig.promptVersion,
        status,
        JSON.stringify({
          source: inputSource,
          conversation: conversationInput
        }),
        JSON.stringify(result || {}),
        JSON.stringify(usage || {}),
        validation ? validation.status : "not_checked",
        JSON.stringify(validation?.errors || []),
        errorMessage || null,
        createdBy || ""
      ]
    );
    return { ok: true, ...insertResult.rows[0] };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: "insert_failed",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

function resolveAiProviderConfig(env, promptProfile) {
  const provider = normalizeProviderName(env.AI_PROVIDER || "deepseek");
  const model = env.AI_MODEL || (provider === "deepseek" ? env.DEEPSEEK_MODEL : "") || defaultModelForProvider(provider);
  const baseUrl = normalizeBaseUrl(env.AI_BASE_URL || (provider === "deepseek" ? env.DEEPSEEK_BASE_URL : "") || defaultBaseUrlForProvider(provider));
  const timeoutMs = normalizeTimeoutMs(env.AI_TIMEOUT_MS || env.DEEPSEEK_TIMEOUT_MS, 15000);
  const maxTokens = Math.max(
    promptProfile.maxTokens,
    normalizeMaxTokens(env.AI_MAX_TOKENS || env.DEEPSEEK_MAX_TOKENS, promptProfile.maxTokens)
  );
  const thinkingMode = normalizeThinkingMode(env.AI_THINKING || env.DEEPSEEK_THINKING, "disabled");
  const includeThinking = provider === "deepseek" || Boolean(env.AI_THINKING || env.DEEPSEEK_THINKING);

  return {
    provider,
    apiKey: env.AI_API_KEY || (provider === "deepseek" ? env.DEEPSEEK_API_KEY : ""),
    model,
    baseUrl,
    timeoutMs,
    maxTokens,
    thinkingMode,
    includeThinking,
    promptVersion: env.AI_PROMPT_VERSION || "v1"
  };
}

function extractAiScore(result, promptProfile) {
  const rawScore = promptProfile.key === "executive_full"
    ? result?.ai_semantic_score?.total_score
    : result?.review_score?.total_score;
  const number = Number(rawScore);
  if (!Number.isFinite(number)) return null;
  return normalizeScore(number, 60);
}

function buildAiScoreDimensions(result, promptProfile) {
  const scoreObject = promptProfile.key === "executive_full" ? result?.ai_semantic_score : result?.review_score;
  if (!scoreObject || typeof scoreObject !== "object") return [];

  return Object.entries(scoreObject)
    .filter(([key, value]) => key !== "total_score" && Number.isFinite(Number(value)))
    .map(([key, value]) => ({
      name: key,
      score: normalizeScore(value, 60),
      max: 60,
      reason: "AI score dimension"
    }));
}

function buildAiRiskSummaries(result) {
  const risks = Array.isArray(result?.compliance_risks)
    ? result.compliance_risks
    : Array.isArray(result?.risk_reminders)
      ? result.risk_reminders
      : [];

  return risks
    .map((item) => {
      if (typeof item === "string") return item;
      return [item.risk_type, item.risk_level, item.evidence, item.reason].filter(Boolean).join(" / ");
    })
    .filter(Boolean);
}

function normalizeScore(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, Math.round(number * 10) / 10));
}

function normalizeProviderName(value) {
  const provider = String(value || "deepseek").trim().toLowerCase();
  return provider || "deepseek";
}

function defaultModelForProvider(provider) {
  return provider === "deepseek" ? "deepseek-v4-flash" : "";
}

function defaultBaseUrlForProvider(provider) {
  return provider === "deepseek" ? "https://api.deepseek.com" : "";
}

function normalizeViewerRole(value) {
  const role = String(value || "quality_user").trim();
  if (role === "super_admin") return "super_admin";
  if (role === "service_user") return "service_user";
  return "quality_user";
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeTimeoutMs(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(3000, Math.min(180000, Math.round(number)));
}

function normalizeMaxTokens(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(512, Math.min(8000, Math.round(number)));
}

function normalizeThinkingMode(value, fallback) {
  const mode = String(value || fallback).trim().toLowerCase();
  return mode === "enabled" ? "enabled" : "disabled";
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function buildConversationInput(conversationId, payload = {}) {
  if (isPostgresConfigured()) {
    return buildConversationInputFromPostgres(conversationId, payload);
  }
  return buildConversationInputFromMock(conversationId);
}

async function buildConversationInputFromPostgres(conversationId, payload = {}) {
  const params = [conversationId];
  const where = ["c.id = $1"];
  if (isSelfScopedPayload(payload)) {
    params.push(payload.viewer_user_id || payload.viewerUserId);
    where.push(`c.owner_user_id = $${params.length}`);
  }

  const conversationResult = await query(
    `
      select
        c.id,
        c.customer_person_id,
        coalesce(p.display_name, c.customer_person_id) as customer_name,
        coalesce(u.name, '') as owner,
        c.status,
        c.stage,
        c.timeline,
        cp.taobao_id,
        cp.wechat_id,
        cp.intent_level,
        cp.satisfaction,
        cp.tags,
        cp.needs,
        qs.objective_score,
        qs.ai_score,
        qs.final_score,
        qs.objective_metrics,
        qs.dimensions,
        qs.risks
      from conversation c
      left join person p on p.id = c.customer_person_id
      left join app_user u on u.id = c.owner_user_id
      left join customer_profile cp on cp.person_id = c.customer_person_id
      left join lateral (
        select *
        from quality_score qs
        where qs.conversation_id = c.id
        order by qs.created_at desc
        limit 1
      ) qs on true
      where ${where.join(" and ")}
      limit 1
    `,
    params
  );
  const conversation = conversationResult.rows[0];
  if (!conversation) return null;

  const messagesResult = await query(
    `
      select
        rm.id,
        rm.source_system,
        rm.sender_name,
        rm.normalized_role,
        rm.sent_at,
        rm.content,
        rm.message_type,
        rm.media_url,
        rm.media_path,
        rm.media_mime_type,
        rm.duration_seconds,
        rm.file_name,
        rm.thumbnail_url,
        rm.ocr_text,
        rm.transcript_text,
        rm.media_description,
        rm.image_description,
        rm.link_url,
        rm.link_title,
        rm.attachments,
        rm.structured_content,
        rm.media_metadata
      from conversation_message cm
      join raw_message rm on rm.id = cm.message_id
      where cm.conversation_id = $1
      order by cm.sequence_no asc
    `,
    [conversation.id]
  );

  const objectiveMetrics = conversation.objective_metrics || {
    objective_score: numberOrNull(conversation.objective_score),
    current_total_score: numberOrNull(conversation.final_score)
  };

  return {
    conversation_id: conversation.id,
    customer_profile: {
      customer_id: conversation.customer_person_id || "unknown",
      customer_name: conversation.customer_name || "unknown",
      owner: conversation.owner || "",
      source: "database_conversation",
      identity_status: conversation.status === "identity_review" ? "pending_review" : "confirmed",
      intent_level: conversation.intent_level || "",
      satisfaction: conversation.satisfaction || "",
      tags: Array.isArray(conversation.tags) ? conversation.tags : [],
      needs: Array.isArray(conversation.needs) ? conversation.needs : [],
      taobao_id: conversation.taobao_id || "",
      wechat_id: conversation.wechat_id || ""
    },
    business_context: domainProfile,
    conversation_status: conversation.status,
    conversation_stage: conversation.stage || "",
    timeline: Array.isArray(conversation.timeline) ? conversation.timeline : [],
    messages: messagesResult.rows.map(toPromptMessage),
    objective_metrics: objectiveMetrics,
    rule_result: objectiveMetrics,
    stored_quality: {
      objective_score: numberOrNull(conversation.objective_score),
      ai_score: numberOrNull(conversation.ai_score),
      final_score: numberOrNull(conversation.final_score),
      dimensions: Array.isArray(conversation.dimensions) ? conversation.dimensions : [],
      risks: Array.isArray(conversation.risks) ? conversation.risks : []
    }
  };
}

function buildConversationInputFromMock(conversationId) {
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
    messages: messages.map(toPromptMessage),
    objective_metrics: objectiveMetrics,
    rule_result: objectiveMetrics
  };
}

function toPromptMessage(item = {}) {
  const mediaMetadata = item.media_metadata || item.mediaMetadata || {};
  return {
    message_id: item.id,
    time: formatDateTime(item.sent_at || item.sentAt),
    role: item.normalized_role || item.normalizedRole,
    speaker: item.sender_name || item.senderName,
    source: item.source_system || item.platform,
    message_type: item.message_type || item.messageType || "text",
    content: item.content || "",
    analysis_text: buildMessageAnalysisText(item),
    media: {
      media_url: item.media_url || item.mediaUrl || "",
      media_path: item.media_path || item.mediaPath || "",
      mime_type: item.media_mime_type || item.mediaMimeType || "",
      duration_seconds: item.duration_seconds ?? item.durationSeconds ?? null,
      file_name: item.file_name || item.fileName || "",
      thumbnail_url: item.thumbnail_url || item.thumbnailUrl || "",
      link_url: item.link_url || item.linkUrl || "",
      link_title: item.link_title || item.linkTitle || "",
      attachments: item.attachments || []
    },
    parsed_content: {
      transcript_text: item.transcript_text || item.transcriptText || "",
      ocr_text: item.ocr_text || item.ocrText || "",
      media_description: item.media_description || item.mediaDescription || "",
      image_description: item.image_description || item.imageDescription || "",
      structured_content: item.structured_content || item.structuredContent || {}
    },
    evidence_audit: {
      parse_status: mediaMetadata.parse_status || "",
      analysis_text_source: mediaMetadata.analysis_text_source || "",
      processor: mediaMetadata.processor || "",
      evidence_updated_by: mediaMetadata.evidence_updated_by || "",
      evidence_updated_at: mediaMetadata.evidence_updated_at || ""
    }
  };
}

function buildMessageAnalysisText(item = {}) {
  return [
    item.content,
    item.transcript_text,
    item.transcriptText,
    item.ocr_text,
    item.ocrText,
    item.media_description,
    item.mediaDescription,
    item.image_description,
    item.imageDescription,
    item.link_title,
    item.linkTitle,
    item.link_url,
    item.linkUrl
  ]
    .filter(Boolean)
    .join(" / ");
}

function isSelfScopedPayload(payload = {}) {
  const role = payload.viewer_role || payload.viewerRole || payload.role;
  const scope = payload.viewer_data_scope || payload.viewerDataScope || payload.dataScope;
  return Boolean(payload.viewer_user_id || payload.viewerUserId) && (role === "service_user" || scope === "self");
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}
