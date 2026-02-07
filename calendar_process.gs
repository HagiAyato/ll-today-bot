/**
 * カレンダー定義を取得
 * 参考：https://note.com/taatn0te/n/nacada2f4dfd2
 * * @returns {Array<Object>} カレンダー情報オブジェクトの配列。各オブジェクトは以下のプロパティを持ちます：
 * @returns {number} return.rss_number RSSフィードに割り当てられた番号
 * @returns {string} return.name フィード名（Blueskyアカウント認証情報検索に使用）
 * @returns {string} return.link RSSフィードのURL
 */
function _getCalenderDef() {
  // feedsシートのA1:B最終行を取得する
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('カレンダー定義');
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();

  // mapを使用してオブジェクトの配列を生成
  return values.map(value => ({
    name: value[0],
    cid: value[1]
  }));
}

/**
 * メイン処理
 * 全カレンダーの予定をすべて取得し、1つの投稿にまとめてBlueskyに送信します。
 * * @returns {void}
 */
function main_process() {
  // 文字数上限の定数
  const MAX_CHAR_COUNT = 200;
  // カレンダー定義を取得
  const list_calendar = _getCalenderDef();
  // 全プロパティを取得
  const allProps = PropertiesService.getScriptProperties().getProperties();

  // 取得対象日の設定（今日の日付を取得）
  const targetDate = new Date();
  const dateLabel = Utilities.formatDate(targetDate, 'Asia/Tokyo', 'yyyy/MM/dd');

  // 全イベントのタイトル・時刻を含めた文字列を格納するリスト
  const eventStrings = [];
  // 重複判定用（複数のカレンダーに同じ予定がある場合を考慮）
  const processedEventIds = new Set();

  // カレンダーごとに処理
  for (const calendar of list_calendar) {
    try {
      Logger.log(`予定取得中: ${calendar.name}`);

      const cid = allProps[calendar.cid];
      if (!cid) {
        Logger.log(`警告: ${calendar.name} のカレンダーIDが見つかりません。`);
        continue;
      }

      const myCalendar = CalendarApp.getCalendarById(cid);
      if (!myCalendar) {
        Logger.log(`警告: カレンダーが見つかりません (ID: ${cid})`);
        continue;
      }

      // 指定日のイベントを配列として取得
      const events = myCalendar.getEventsForDay(targetDate);

      for (const event of events) {
        const eventId = event.getId();
        // 重複チェック（複数カレンダー共有予定など）
        if (processedEventIds.has(eventId)) continue;

        let displayTitle = "";

        if (event.isAllDayEvent()) {
          // 終日の場合はタイトルのみ
          displayTitle = event.getTitle();
        } else {
          // 終日でない場合は「HH:mm〜 タイトル」の形式
          const startTime = Utilities.formatDate(event.getStartTime(), 'Asia/Tokyo', 'HH:mm');
          displayTitle = `${startTime}〜 ${event.getTitle()}`;
        }

        eventStrings.push(displayTitle);
        processedEventIds.add(eventId);
      }
    } catch (e) {
      Logger.log(`${calendar.name} の処理中にエラーが発生しました：${e.message}`);
    }
  }

  // 予定が1つ以上ある場合のみ投稿
  if (eventStrings.length > 0) {
    // 投稿文面の作成
    // 【yyyy/mm/dd　今日のラブライブ】
    // 予定タイトル1
    // 予定タイトル2...
    //
    // 詳細はこちら
    // https://ll-fans.jp/articles/calendar
    let header = `【${dateLabel}　今日のラブライブ！】\n`;
    let footer = `\n詳細はリンクを参照\n#lovelive`;
    let body = "";
    let isTruncated = false;

    for (let i = 0; i < eventStrings.length; i++) {
      const titleLine = `${eventStrings[i]}\n`;

      // 次のタイトルを追加した場合の合計文字数をシミュレーション
      // (ヘッダー + 現在のボディ + 次の行 + 「等\n」 + フッター)
      const potentialLength = (header + body + titleLine + "等\n" + footer).length;

      if (potentialLength > MAX_CHAR_COUNT) {
        isTruncated = true;
        break;
      }
      body += titleLine;
    }

    // 最終的な投稿文面の組み立て
    let postText = header + body;
    if (isTruncated) {
      postText += "等\n";
    }
    postText += footer;

    // 投稿用のアカウント情報
    var userId = PropertiesService.getScriptProperties().getProperty('bsky_uid');
    var password = PropertiesService.getScriptProperties().getProperty('bsky_pass');

    if (userId && password) {
      try {
        const linkUrl = "https://ll-fans.jp/articles/calendar";
        const linkText = "ラブライブ！カレンダー | LL-Fans";

        // Blueskyに投稿
        postToBlueSky(postText, userId, password, linkText, linkUrl, null, null);
        Logger.log(`投稿文: ${postText}`);
        Logger.log(`一括投稿完了: ${eventStrings.length}件の予定を投稿しました。`);
      } catch (e) {
        Logger.log(`Blueskyへの投稿に失敗しました：${e.message}`);
      }
    } else {
      Logger.log("エラー: 投稿用のアカウント情報（userId/password）が見つかりません。");
    }
  } else {
    Logger.log("本日の予定はありませんでした。");
  }
}