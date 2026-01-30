# ll-today-bot

## 概要
LL-Fansのラブライブ！カレンダーをもとに、毎日今日のラブライブ！の予定をBlueSkyに投稿するGoogle Apps Scriptプロジェクトです。

## 構成ファイル
- [`calendar_process.gs`](calendar_process.gs)
  LL-Fansのカレンダー定義から今日の予定を取得し、1つの投稿にまとめてBlueSkyに送信するメイン処理を行います。
- [`post_bluesky.gs`](post_bluesky.gs)
  BlueSky APIを利用して、テキストと外部リンク情報をBlueSkyに投稿します。ハッシュタグのFacet生成やサムネイル画像のアップロードに対応しています。
- [`appsscript.json`](appsscript.json)
  GASプロジェクトの設定ファイル。
- [`utils.gs`](utils.gs)
  指数バックオフ付きの`fetchWithRetry`など、GASプロジェクト全体で使用するユーティリティ関数を提供します。

## 主な機能

### カレンダー予定の取得と投稿
[`main_process`](calendar_process.gs)  
LL-Fansのカレンダー定義から該当するカレンダーのID情報を取得し、今日の全イベントを取得。取得したイベント情報をBlueSkyに投稿します。

### BlueSkyへの投稿
[`postToBlueSky`](post_bluesky.gs)  
BlueSky APIにログインし、テキスト、外部リンク、サムネイル画像を含む投稿をBlueSkyに送信します。ハッシュタグの検出と自動Facet生成にも対応しています。

### 通信の安定化
[`fetchWithRetry`](utils.gs)  
指数バックオフを用いた再試行ロジックを実装し、サーバーエラー時の自動リトライにより通信の安定性を向上させます。

## 動作環境
Google Apps Script

## 実際に動かしているbot紹介
準備中

## 参考記事
- [GASでBlueskyのBotをつくった備忘録](https://note.com/keiga/n/n527865bcf0d5)
- [GASでRSSフィードを取得してDiscordに投稿する](https://note.com/taatn0te/n/nacada2f4dfd2)
- [GASのコードをGitHubで管理する](https://sayjoyblog.com/gas_github_connection/)
- [GASをVSCodeで開発する](https://qiita.com/BONZINE/items/f6000de23ffd3c344881)
- (おまけ)Gemini
