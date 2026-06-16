import { buildDomainPromptContext } from "./domainPromptContext.js";
import { buildExecutiveSystemPrompt } from "./executiveFullPrompt.js";
import { buildQualityUserSystemPrompt } from "./qualityUserPrompt.js";
import { buildServiceUserSystemPrompt } from "./serviceUserPrompt.js";

export function getPromptProfile(viewerRole) {
  if (viewerRole === "super_admin") {
    return {
      key: "executive_full",
      label: "超级管理员版本 Prompt",
      promptDocument: "backend/src/prompts/executiveFullPrompt.js",
      maxTokens: 6000
    };
  }

  if (viewerRole === "service_user") {
    return {
      key: "service_coaching",
      label: "客服本人复盘",
      promptDocument: "backend/src/prompts/serviceUserPrompt.js",
      maxTokens: 3500
    };
  }

  return {
    key: "review_limited",
    label: "质检员复核分析",
    promptDocument: "backend/src/prompts/qualityUserPrompt.js",
    maxTokens: 4000
  };
}

export function buildSystemPrompt(promptProfile) {
  const basePrompt = promptProfile.key === "executive_full"
    ? buildExecutiveSystemPrompt()
    : promptProfile.key === "service_coaching"
      ? buildServiceUserSystemPrompt()
      : buildQualityUserSystemPrompt();

  return `${basePrompt}\n\n${buildDomainPromptContext()}`;
}

export function buildUserPrompt(conversationInput, promptProfile) {
  if (promptProfile.key === "executive_full") {
    return `现在开始分析以下输入：\n${JSON.stringify(conversationInput, null, 2)}`;
  }

  return `请基于当前账号视角分析以下输入，只输出符合 system prompt 要求的 JSON。\n${JSON.stringify(conversationInput, null, 2)}`;
}
