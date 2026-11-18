// 微信小程序运行时全局函数声明（仅本工程用到的部分）
interface MiniProgramPageInstance {
  data: Record<string, unknown>;
  setData(patch: Record<string, unknown>): void;
}

declare function Page(options: Record<string, unknown> & Partial<MiniProgramPageInstance>): void;
declare function App(options: Record<string, unknown>): void;
declare function getCurrentPages(): Array<{ route: string; options: Record<string, string> }>;
