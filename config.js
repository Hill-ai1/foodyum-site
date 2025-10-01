window.__APP_CONFIG__ = {
  pageVersion: "v1.0.0",
  minReadMs: 5000,                        // 弹窗至少阅读 5 秒
  requireScrollToBottom: true,            // 必须滚到最底部
  sink: "download",                       // 先用 download 自测；收集数据时改成 "webhook"
  webhookURL: "https://YOUR_WEBHOOK_URL", // 部署完 Google Apps Script 后，替换为其 URL
  assignmentMode: "perSession"            // "perSession"（每次会话随机）或 "perParticipant"（同一人固定）
};
