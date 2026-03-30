# 反模式

## 用 `(optional ?? '') !== (existing ?? '')` 比较"是否变更"时容易误判

**时间：** 2026-03-15  **来源：** SPEC-OB-04 authToken needsRestart bug

场景：前端可能不传某个字段（保留原值），后端用 `(incoming ?? '') !== (current ?? '')` 来判断是否变更。

**陷阱**：当前端不传（`undefined`）时，`undefined ?? ''` 得到 `''`，但 `current.authToken` 可能是 `'abc-token'`，结果 `'' !== 'abc-token'`，误判为"变更了"。

**正确做法**：先把「未传 = 保留原值」这个语义显式化：
```ts
const resolvedAuthToken = incoming.authToken ?? current.authToken ?? '';
// 然后比较：resolvedAuthToken !== (current.authToken ?? '')
```
这样 `undefined` 就正确地被解释为"保留原值"而不是"清空"。

**适用范围**：所有"可选字段，未传时保留"的 PATCH 语义场景。

**状态：** 待提炼

---

## 变量命名不跟着语义改是埋雷

**时间：** 2026-03-15  **来源：** SPEC-OB-04 portChanged → needsRestart 重构

把 `portChanged` 扩展为覆盖更多字段的 `needsRestart` 后，本地变量仍命名 `didPortChange`，读代码的人（或未来的 AI）会误以为这里只关心端口变化。

**规律**：重构语义时，局部变量名必须同步改。即使变量只用一次，名字错了会让 code review 更难、让 AI 续写时产生错误假设。

**状态：** 待提炼

---

## 首次 onboard 需要显式 guard，否则默认值对比会误触发

**时间：** 2026-03-15  **来源：** SPEC-OB-04 isFirstTime bug

首次 onboard 时，`current.mindRoot` 是 `''`（config 默认值），`resolvedRoot` 是用户刚输入的完整路径，二者必然不等，会让 `needsRestart=true`。

**规律**：任何「变更检测」逻辑都需要先问：这是第一次设置还是变更已有配置？两种状态的处理逻辑完全不同，需要显式区分，不能依赖「默认值和新值相等」的巧合。

```ts
const isFirstTime = current.setupPending === true || !current.mindRoot;
const needsRestart = !isFirstTime && (...);
```

**状态：** 待提炼
