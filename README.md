# Pomodoro Timer

集中時間と休憩時間を選べる、GitHub Pages 向けのシンプルなポモドーロタイマーです。デフォルトは `50 分集中 / 15 分休憩` で、集中完了時には大きく労う演出が入ります。

## Features

- 集中時間と休憩時間の選択
- `localStorage` による状態復元
- `Screen Wake Lock API` による画面スリープ抑止の試行
- スマホでも使いやすいレスポンシブ UI
- GitHub Pages 用の Actions workflow 同梱

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages

1. このリポジトリを GitHub に push します。
2. GitHub の `Settings > Pages` で `Build and deployment` を `GitHub Actions` にします。
3. `main` ブランチへ push すると、`.github/workflows/deploy.yml` から自動デプロイされます。

`vite.config.ts` では GitHub Actions 上の `GITHUB_REPOSITORY` からリポジトリ名を読んで `base` を切り替えるため、`<user>.github.io/<repo>/` 形式でもそのまま動きます。
