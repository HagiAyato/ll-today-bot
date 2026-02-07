/**
 * bluesky_defineシートからアカウント設定情報を取得
 * 1:種類, 2:UIDキー, 3:PASSキー, 4:詳細URL, 5:リンクテキスト, 6:ハッシュタグ, 7以降:カレンダー名
 * @returns {Array<Object>} アカウント設定オブジェクトの配列
 */
function _getAccountConfigs() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('bluesky_define');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  // 2行目から最終行まで取得
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  return values.map(row => {
    // G列(インデックス6)以降で、空文字でないカレンダー名のみを抽出
    const targetCalendars = row.slice(6).filter(name => name !== "");
    return {
      type: row[0],         // 種類
      userId: row[1],       // 送信先アカウントUID（プロパティキー）
      password: row[2],     // 送信先アカウントPASS（プロパティキー）
      detailUrl: row[3],    // 詳細URL
      linkText: row[4],     // リンクテキスト
      hashtag: row[5],      // ハッシュタグ
      calendars: targetCalendars
    };
  });
}

/**
 * カレンダー定義を取得
 * 参考：https://note.com/taatn0te/n/nacada2f4dfd2
 * @returns {Object} カレンダー名をキー、CIDを値とするオブジェクト
 */
function _getCalendarMap() {
  // カレンダー定義シートのA1:B最終行を取得する
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('カレンダー定義');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  
  // Map形式で保持
  const calendarMap = {};
  values.forEach(row => {
    calendarMap[row[0]] = row[1];
  });
  return calendarMap;
}

/**
 * メイン処理
 * 全カレンダーの予定をすべて取得し、アカウントごとに1つの投稿にまとめてBlueskyに送信します。
 * @returns {void}
 */
function main_process() {
  // 設定情報とカレンダー定義を読み込み
  const accountConfigs = _getAccountConfigs();
  const calendarMap = _getCalendarMap();
  // 全プロパティを取得
  const allProps = PropertiesService.getScriptProperties().getProperties();

  // アカウント（設定行）ごとに処理を実行
  accountConfigs.forEach(config => {
    Logger.log(`--- アカウント処理開始: ${config.type} ---`);
    _processAccount(config, calendarMap, allProps);
  });
}

/**
 * 個別のアカウントに対する予定取得と投稿処理
 * @param {Object} config アカウント設定
 * @param {Object} calendarMap カレンダー名とプロパティキーの対応
 * @param {Object} allProps ScriptPropertiesの全データ
 */
function _processAccount(config, calendarMap, allProps) {
  // 文字数上限の定数
  const MAX_CHAR_COUNT = 200;
  
  // 取得対象日の設定（今日の日付を取得）
  const targetDate = new Date();
  const dateLabel = Utilities.formatDate(targetDate, 'Asia/Tokyo', 'yyyy/MM/dd');

  // 全イベントのタイトル・時刻を含めた文字列を格納するリスト
  const eventStrings = [];
  // 重複判定用（複数のカレンダーに同じ予定がある場合を考慮）
  const processedEventIds = new Set();

  // config.calendars に含まれる対象カレンダーごとに処理
  config.calendars.forEach(calName => {
    const propKey = calendarMap[calName];
    if (!propKey) {
      Logger.log(`警告: ${calName} の定義がカレンダー定義シートに見つかりません。`);
      return;
    }

    try {
      Logger.log(`予定取得中: ${calName}`);
      const cid = allProps[propKey];
      if (!cid) {
        Logger.log(`警告: ${calName} (キー: ${propKey}) のカレンダーIDがプロパティに見つかりません。`);
        return;
      }

      const myCalendar = CalendarApp.getCalendarById(cid);
      if (!myCalendar) {
        Logger.log(`警告: カレンダーが見つかりません (ID: ${cid})`);
        return;
      }

      // 指定日のイベントを配列として取得
      const events = myCalendar.getEventsForDay(targetDate);

      // 時刻順にソート（開始時刻が早い順）
      events.sort((a, b) => a.getStartTime() - b.getStartTime());

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
      Logger.log(`${calName} の処理中にエラーが発生しました：${e.message}`);
    }
  });

  // 予定が1つ以上ある場合のみ投稿
  if (eventStrings.length > 0) {
    // 投稿文面の作成
    // 【yyyy/mm/dd　種類名】
    // 予定タイトル1
    // 予定タイトル2...
    //
    // 詳細はこちら
    // (カレンダーURL)
    let header = `【${dateLabel}　${config.type}】\n`;
    let footer = `\n詳細はリンクを参照\n${config.hashtag}`;
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
    let postText = header + body + (isTruncated ? "等\n" : "") + footer;

    // 投稿用のアカウント情報（ScriptPropertiesから実体を取得）
    const bskyUser = allProps[config.userId];
    const bskyPass = allProps[config.password];

    if (bskyUser && bskyPass) {
      try {
        // Blueskyに投稿
        postToBlueSky(postText, bskyUser, bskyPass, config.linkText, config.detailUrl, null, null);
        Logger.log(`投稿文: ${postText}`);
        Logger.log(`一括投稿完了 [${config.type}]: ${eventStrings.length}件の予定を投稿しました。`);
      } catch (e) {
        Logger.log(`Blueskyへの投稿に失敗しました [${config.type}]：${e.message}`);
      }
    } else {
      Logger.log(`エラー: 投稿用のアカウント情報（${config.userId}）が見つかりません。`);
    }
  } else {
    Logger.log(`[${config.type}] 本日の予定はありませんでした。`);
  }
}