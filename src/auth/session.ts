// 登录后由应用层写入的角色会话（仅驻内存，不落本地缓存）。
// 页面不得从 URL query 读取角色，避免 query 参数绕过鉴权。
export interface Session { role: string | null; }
let current: Session = { role: null };
export function setSessionRole(role: string | null): void { current = { role }; }
export function getSessionRole(): string | null { return current.role; }
export function resetSession(): void { current = { role: null }; }
