// Lets tests import TypeScript files that use extensionless relative imports ("./catalog").
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try { return next(specifier + ".ts", context); } catch { /* fall through */ }
    }
    return next(specifier, context);
  },
});
