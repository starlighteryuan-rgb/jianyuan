# 见渊 v0.2.0-alpha.1 · Early Preview Hotfix

This is a post-release hotfix for v0.2.0-alpha.

The original `v0.2.0-alpha` release is preserved unchanged as the pre-deadline
submission snapshot. All current fixes are published under this new version.

## 修复

- 恢复记录 / 觉察 / 理解 / 探索 / 设置的页面分离
  - 每个 space 只显示对应的主内容区，导航不再只是改变标题。
- 修复 Windows 启动额外 Console 窗口
  - Release executable now launches as a GUI app.
  - Bundled Node sidecar spawns with `CREATE_NO_WINDOW`.
- 完成 release privacy / secret verification
  - Tracked files, renderer bundle, and build artifacts scanned: clean.

## 变更来源

- Hotfix commits: `d5d6757` (navigation + console), `33a7ba7` (report), `5ba86cb` (version bump)
- Full technical detail: `docs/V0_2_0_ALPHA_NAVIGATION_HOTFIX_REPORT.md`

## 下载

- `见渊_0.2.0-alpha.1_x64-setup.exe`（Windows x64）
- SHA256: `1407370A92A5B8A4D50E8C3FC367D9E940DEE7C67314393C2BB753952B3CD32A`

## 状态

- Product: 见渊 Early Preview / Alpha
- Platform: Windows Desktop (x64)
- v0.2.0-alpha 原始 release 保持不变。
