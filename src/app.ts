// 小程序入口：本项目只有一个页面，入口只做启动日志，不承载业务逻辑
App({
  onLaunch() {
    // 角色会话由登录流程写入 src/auth/session.ts，页面不得从 URL query 取角色
  }
});
