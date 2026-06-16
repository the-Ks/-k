import { domainProfile } from "../config/domainProfile.js";

export function buildDomainPromptContext() {
  return `
业务领域上下文：
- 公司：${domainProfile.companyName}
- 行业：${domainProfile.industry}
- 服务场景：${domainProfile.serviceScenario}
- 服务角色：${joinProfileItems(domainProfile.serviceRoles)}
- 会话类型：${joinProfileItems(domainProfile.conversationTypes)}
- 常见商品：${domainProfile.productCategories.join("、")}
- 养护判断维度：${joinProfileItems(domainProfile.plantCareDimensions)}
- 常见客户关注点：${domainProfile.commonCustomerConcerns.join("；")}
- 质检关注点：${joinProfileItems(domainProfile.qualityInspectionFocus)}
- 证据要求：${joinProfileItems(domainProfile.evidenceRequirements)}
- 证据不足规则：${joinProfileItems(domainProfile.insufficientEvidenceRules)}
- 销售边界：${joinProfileItems(domainProfile.salesBoundaries)}
- 售后边界：${joinProfileItems(domainProfile.afterSalesBoundaries)}
- 合规边界：${domainProfile.complianceBoundaries.join("；")}
- 风险关键词：${joinProfileItems(domainProfile.riskKeywords)}
- 意向关键词：${joinProfileItems(domainProfile.intentKeywords)}

领域约束：
1. 可以结合园艺服务场景判断回答是否覆盖光照、浇水、缓苗、物流、售后等客户明确提出的问题。
2. 不得凭空判断某个植物品种一定适合客户环境，除非聊天记录里有光照、通风、空间、预算等证据。
3. 不得把园艺经验建议当成绝对承诺；涉及成活、开花、复花、黄叶、售后处理时必须保留证据边界。
`.trim();
}

function joinProfileItems(items = []) {
  return Array.isArray(items) && items.length ? items.join("；") : "未配置";
}
