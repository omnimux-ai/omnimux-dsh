    const React = require("react");
    const h = React.createElement;
    const { useCallback, useEffect, useLayoutEffect, useRef, useState } = React;
    const { Button, FilterBar, IconButton, InputField, SearchField } = require("dsh-ui-kit");
    const { IconCloseOutline16 } = require("@deepseek-ai/dsh-client-ui-primitives");
    // 单一货架规则真源：esbuild 将 ./skill-picker-logic.js 内联进本 factory 闭包。
    // 只允许这一个命名空间绑定，严禁顶层解构（与后续 fragment 的 const 冲突）。
    const SkillShelf = require("./skill-picker-logic.js");

